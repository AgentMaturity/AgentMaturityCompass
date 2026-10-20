// Proposed destination: tests/keys/asyncNotaryRuntime.test.ts. Real production server/log/CLI flows, owned SDK transport only.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initFileSealedNotaryKey, loadNotarySigner, loadNotarySignerAsync } from "../../src/notary/notarySigner.js";
import { defaultNotaryConfig, notaryLogPath, notarySealPath, notarySealSigPath, saveNotaryConfig } from "../../src/notary/notaryConfigStore.js";
import { startNotaryServer } from "../../src/notary/notaryServer.js";
import { appendNotaryLogEntry, appendNotaryLogEntryAsync, initNotaryLog, initNotaryLogAsync, tailNotaryLog, verifyNotaryLog } from "../../src/notary/notaryLog.js";
import { verifyNotaryAttestResponse, verifyNotarySignResponse } from "../../src/notary/notaryVerify.js";
import { verifyNotaryAttestationBundle } from "../../src/notary/notaryAttestation.js";
import { notarySignCliAsync } from "../../src/notary/notaryCli.js";
import { generateTrustCertificateAsync, verifyTrustCertificateEnvelope } from "../../src/cert/trustCertificate.js";
import { enableNotaryTrust } from "../../src/trust/trustConfig.js";
import { handleCryptoRoute } from "../../src/api/cryptoRouter.js";
import { handleExportRoute } from "../../src/api/exportRouter.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { awsKmsProvider, type KmsCall } from "../../src/keys/providers/awsKms.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const boundary = vi.hoisted(() => ({ call: null as KmsCall | null, syncCalls: 0 }));
vi.mock("../../src/keys/providerBridge.js", async original => ({ ...await original<typeof import("../../src/keys/providerBridge.js")>(),
  callProviderSync: () => { boundary.syncCalls++; throw new Error("owned runtime test forbids the synchronous provider child"); } }));
vi.mock("../../src/keys/providers/awsKms.js", async original => {
  const real = await original<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...real, awsKmsProvider: (call?: KmsCall) => real.awsKmsProvider(call ?? (async (...args) => {
    if (!boundary.call) throw new Error("owned runtime SDK transport unset"); return boundary.call(...args);
  })) };
});
const roots: string[] = [], closers: Array<() => Promise<void>> = [], workspaces: string[] = [];
const PASS = "p208-owned-notary-runtime-passphrase";
afterEach(async () => {
  vi.restoreAllMocks(); const errors: unknown[] = [];
  for (const close of closers.splice(0)) { try { await close(); } catch (error) { errors.push(error); } }
  for (const root of workspaces.splice(0)) { try { lockVault(root); } catch (error) { errors.push(error); } }
  for (const root of roots.splice(0)) { try { rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); } }
  boundary.call = null; boundary.syncCalls = 0; vi.unstubAllEnvs();
  if (errors.length) throw new AggregateError(errors, "owned notary fixture cleanup failed");
});
function fresh() { const root = mkdtempSync(join(tmpdir(), "amc-notary-runtime-")); roots.push(root); return root; }
async function prepared() {
  const root = fresh(), key = fakeKey("p256"), id = AWS_ARN(root.split("/").at(-1)!), fake = awsFake({ [id]: key }); boundary.call = fake.call;
  const ref = { provider: "aws-kms" as const, id }, provider = awsKmsProvider(fake.call), description = await provider.describe(ref);
  const config = defaultNotaryConfig(); config.notary.backend = { type: "KEY_PROVIDER", ref }; config.notary.unixSocketPath = join(root, "server.sock");
  config.notary.auth.enabled = false; saveNotaryConfig(root, config);
  return { root, fake, ref, provider, description, config, key };
}
function call(socket: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  return new Promise((done, reject) => {
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = request({ socketPath: socket, path, method: bytes ? "POST" : "GET", headers: bytes ? { "content-type": "application/json", "content-length": String(bytes.length) } : {} }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => { try { done({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch (error) { reject(error); } });
    }); req.on("error", reject); req.setTimeout(5_000, () => req.destroy(new Error("owned notary request timed out"))); req.end(bytes);
  });
}
async function api(path: string, body: unknown, root: string, exported = false) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage; req.headers = { "content-type": "application/json" }; req.method = "POST";
  let status = 0, text = ""; const res = { writeHead(code: number) { status = code; return this; }, end(value: string) { text = value; } } as unknown as ServerResponse;
  expect(await (exported ? handleExportRoute : handleCryptoRoute)(path, "POST", req, res, root)).toBe(true); return { status, body: JSON.parse(text) };
}

test("owned sync bridge denial is effective before a real SDK could load; async production signer never invokes it", async () => {
  const f = await prepared(); expect(() => loadNotarySigner({ notaryDir: f.root, backend: f.config.notary.backend })).toThrow("owned runtime test forbids");
  expect(boundary.syncCalls).toBe(1); boundary.syncCalls = 0;
  const signer = await loadNotarySignerAsync({ notaryDir: f.root, backend: f.config.notary.backend });
  const bytes = Buffer.from("owned async signature"), signed = await signer.sign("BUNDLE", bytes);
  expect(verifyNotarySignResponse({ v: 1, kind: "BUNDLE", payloadSha256: sha256Hex(bytes), ...signed }, bytes).ok).toBe(true);
  expect(signed).toMatchObject({ backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata" }); // AWS_KMS is the adapter's metadata claim, never verified attestation.
  expect(boundary.syncCalls).toBe(0);
});

test.each(["another-ref", "exportable"] as const)("async notary rejects %s description before Sign", async mismatch => {
  const f = await prepared(), before = f.fake.requests.filter(row => row.operation === "Sign").length;
  const provider = { ...f.provider, describe: async () => ({ ...f.description,
    ...(mismatch === "another-ref" ? { ref: { ...f.ref, id: AWS_ARN("wrong-ref") } } : { exportable: true }) }) };
  await expect(loadNotarySignerAsync({ notaryDir: f.root, backend: f.config.notary.backend, provider })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before);
});

test("default FILE_SEALED asynchronous initialization and append retain exact legacy log/seal/signature bytes", async () => {
  vi.stubEnv("AMC_NOTARY_PASSPHRASE", PASS); const a = fresh(), b = fresh(); initFileSealedNotaryKey({ notaryDir: a, passphrase: PASS });
  cpSync(join(a, "keys"), join(b, "keys"), { recursive: true });
  const backend = defaultNotaryConfig().notary.backend, sync = loadNotarySigner({ notaryDir: a, backend });
  const asynchronous = await loadNotarySignerAsync({ notaryDir: b, backend });
  vi.spyOn(Date, "now").mockReturnValue(1_792_440_000_000); initNotaryLog(a, sync); await initNotaryLogAsync(b, asynchronous);
  const row = { requestId: "owned-byte-parity", kind: "BUNDLE", payloadSha256: sha256Hex("owned-default-log") };
  appendNotaryLogEntry({ ...row, notaryDir: a, signer: sync }); await appendNotaryLogEntryAsync({ ...row, notaryDir: b, signer: asynchronous });
  for (const path of [notaryLogPath, notarySealPath, notarySealSigPath]) expect(readFileSync(path(b))).toEqual(readFileSync(path(a)));
  expect(verifyNotaryLog(b)).toMatchObject({ ok: true, count: 1 });
});

test.each([1, 2])("actual production notary stays responsive during awaited provider operation %i (payload, then mandatory log seal)", async phase => {
  const f = await prepared(), server = await startNotaryServer({ notaryDir: f.root }); closers.push(server.close); expect(server.state.ok).toBe(true);
  let enter!: () => void, resume!: () => void, signs = 0;
  const entered = new Promise<void>(done => { enter = done; }), released = new Promise<void>(done => { resume = done; });
  boundary.call = async (...args) => { if (args[0] === "Sign" && ++signs === phase) { enter(); await released; } return f.fake.call(...args); };
  const bytes = Buffer.from("owned production artifact"), before = [notaryLogPath(f.root), notarySealPath(f.root), notarySealSigPath(f.root)].map(path => readFileSync(path));
  const pending = call(f.config.notary.unixSocketPath!, "/sign", { kind: "BUNDLE", payloadB64: bytes.toString("base64"), payloadSha256: sha256Hex(bytes) }); pending.catch(() => {});
  try { await Promise.race([entered, pending.then(() => { throw new Error("real server did not await owned provider"); })]);
    expect(await call(f.config.notary.unixSocketPath!, "/healthz")).toEqual({ status: 200, body: { ok: true } });
    expect(existsSync(join(f.root, "logs", ".notary-log.lock"))).toBe(false);
    expect([notaryLogPath(f.root), notarySealPath(f.root), notarySealSigPath(f.root)].map(path => readFileSync(path))).toEqual(before);
    resume(); const result = await pending; expect(result.status).toBe(200); expect(result.body.pubkeyFingerprint).toBe(f.description.keyId); expect(verifyNotarySignResponse(result.body, bytes).ok).toBe(true);
    expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 1 }); expect(boundary.syncCalls).toBe(0); expect(signs).toBe(2);
  } finally { resume(); await pending.catch(() => {}); }
});

test("the actual server, asynchronous policy client, certificate producer and verifier form one provider-backed runtime flow", async () => {
  const f = await prepared(), server = await startNotaryServer({ notaryDir: f.root }); closers.push(server.close);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_HOME", fresh()); vi.stubEnv("AMC_NO_SIGN", "0");
  const root = fresh(); workspaces.push(root); initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const pin = join(root, "notary.pub"); writeFileSync(pin, f.description.publicKeyPem);
  await enableNotaryTrust({ workspace: root, baseUrl: "http://127.0.0.1:1", unixSocketPath: f.config.notary.unixSocketPath, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  const made = await generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "actual.json" });
  const trust = withPins(workspaceKeyTrust(root), [{ keyId: f.description.keyId, purposes: ["artifact-seal"], origin: "independent owned operator pin" }]);
  expect(verifyTrustCertificateEnvelope(made.envelope, trust).ok).toBe(true); expect(verifyTrustCertificateEnvelope(made.envelope, { ...trust, explicitPins: [] }).ok).toBe(false);
  expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 1 }); expect(boundary.syncCalls).toBe(0);
});

test("actual attestation and admin API producers await the provider and publish verifiable native outputs", async () => {
  const f = await prepared(), server = await startNotaryServer({ notaryDir: f.root }); closers.push(server.close);
  const attest = await call(f.config.notary.unixSocketPath!, "/attest/current"); expect(attest.status).toBe(200); expect(verifyNotaryAttestResponse(attest.body).ok).toBe(true);
  const input = join(f.root, "input.bin"), output = join(f.root, "api.sig.json"), bytes = Buffer.from("actual admin route owned input"); writeFileSync(input, bytes);
  expect((await api("/api/v1/crypto/notary/sign", { notaryDir: f.root, kind: "BUNDLE", inFile: input, outFile: output }, f.root)).status).toBe(201);
  expect(verifyNotarySignResponse(JSON.parse(readFileSync(output, "utf8")), bytes).ok).toBe(true);
  expect((await api("/api/v1/crypto/notary/attest", { notaryDir: f.root, outFile: join(f.root, "crypto.amcattest") }, f.root)).status).toBe(201);
  expect((await api("/api/v1/attest/notary", { notaryDir: f.root, outFile: join(f.root, "export.amcattest") }, f.root, true)).status).toBe(200);
  const trust = withPins(loadTrustContext({ amcHome: join(f.root, "owned-empty-operator"), env: {} }),
    [{ keyId: f.description.keyId, purposes: ["notary"], origin: "independent owned notary operator" }]);
  for (const file of ["crypto.amcattest", "export.amcattest"]) {
    expect(verifyNotaryAttestationBundle(join(f.root, file), trust).ok).toBe(true);
    expect(verifyNotaryAttestationBundle(join(f.root, file), { ...trust, explicitPins: [] }).ok).toBe(false);
  }
  expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 1 }); expect(boundary.syncCalls).toBe(0);
});

test("a concurrent native append cannot overwrite a newer seal or discard a successfully logged request", async () => {
  const f = await prepared(), signer = await loadNotarySignerAsync({ notaryDir: f.root, backend: f.config.notary.backend }); await initNotaryLogAsync(f.root, signer);
  const server = await startNotaryServer({ notaryDir: f.root }); closers.push(server.close);
  let reached = 0, release!: () => void, ready!: () => void; const both = new Promise<void>(done => { ready = done; }), resume = new Promise<void>(done => { release = done; });
  // Each /sign first signs its arbitrary bytes. Only its 32-byte mandatory seal waits at this barrier.
  boundary.call = async (...args) => { if (args[0] === "Sign" && (args[1].Message as Uint8Array).length === 32 && reached++ < 2) { if (reached === 2) ready(); await resume; } return f.fake.call(...args); };
  const bodies = ["first-owned-payload", "second-owned-payload"].map(text => Buffer.from(text));
  const requests = bodies.map(bytes => call(f.config.notary.unixSocketPath!, "/sign", { kind: "BUNDLE", payloadB64: bytes.toString("base64"), payloadSha256: sha256Hex(bytes) }));
  const done = Promise.all(requests); done.catch(() => {});
  try { await Promise.race([both, done.then(() => { throw new Error("both actual appends did not reach owned seal barrier"); })]);
    expect(tailNotaryLog(f.root)).toHaveLength(0); release(); const results = await done;
    results.forEach((result, index) => { expect(result.status).toBe(200); expect(verifyNotarySignResponse(result.body, bodies[index]!).ok).toBe(true); });
    expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 2 }); expect(new Set(tailNotaryLog(f.root).map(row => row.payloadSha256))).toEqual(new Set(bodies.map(sha256Hex)));
    expect(boundary.syncCalls).toBe(0);
  } finally { release(); await done.catch(() => {}); }
});

test("a real notary config change during admin signing refuses publication, and a failed mandatory seal returns no successful signature response", async () => {
  const f = await prepared(), input = join(f.root, "input"), out = join(f.root, "must-not-publish.json"); writeFileSync(input, "owned admin payload");
  let changed = false;
  boundary.call = async (...args) => { const result = await f.fake.call(...args); if (args[0] === "Sign" && !changed) { changed = true; const changedConfig = structuredClone(f.config); changedConfig.notary.rateLimitPerMinute++; saveNotaryConfig(f.root, changedConfig); } return result; };
  await expect(notarySignCliAsync({ notaryDir: f.root, kind: "BUNDLE", inFile: input, outFile: out })).rejects.toThrow("notary config changed while signing");
  expect(existsSync(out)).toBe(false);
  boundary.call = f.fake.call; saveNotaryConfig(f.root, f.config);
  const server = await startNotaryServer({ notaryDir: f.root }); closers.push(server.close); let signs = 0;
  boundary.call = async (...args) => { if (args[0] === "Sign" && ++signs === 2) throw new Error("owned secret provider endpoint/PIN"); return f.fake.call(...args); };
  const bytes = Buffer.from("owned seal-failure payload"), response = await call(f.config.notary.unixSocketPath!, "/sign", { kind: "BUNDLE", payloadB64: bytes.toString("base64") });
  expect(response.status).toBe(500); expect(response.body).toEqual({ error: "Internal server error" }); expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 0 });
  expect(boundary.syncCalls).toBe(0);
});

test("the actual compiled admin CLI uses the asynchronous factory and mandatory log rather than a provider child", async () => {
  const f = await prepared(), signer = await loadNotarySignerAsync({ notaryDir: f.root, backend: f.config.notary.backend }); await initNotaryLogAsync(f.root, signer);
  const keyPath = join(f.root, "owned-private.pem"), factory = join(f.root, "owned-factory.mjs"), loader = join(f.root, "owned-loader.mjs"), marker = join(f.root, "requests.jsonl"), blocked = join(f.root, "blocked.txt"), bridgeGuard = join(f.root, "forbid-sync-bridge.mjs");
  writeFileSync(keyPath, f.key.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(factory, `import { createPublicKey, sign } from "node:crypto"; import { appendFileSync, readFileSync } from "node:fs";
import { awsKmsProvider } from ${JSON.stringify(pathToFileURL(resolve("dist/keys/providers/awsKms.js")).href)};
const key=readFileSync(process.env.P208_NOTARY_KEY,"utf8"), publicKey=createPublicKey(key);
export function loadKeyProvider(_workspace,id) { if(id!=="aws-kms") throw new Error("owned factory only"); return awsKmsProvider(async(operation,input)=>{
 appendFileSync(process.env.P208_NOTARY_REQUESTS, JSON.stringify({operation,messageHex:input.Message?Buffer.from(input.Message).toString("hex"):null})+"\\n");
 if(operation==="GetPublicKey") return {KeyId:input.KeyId,PublicKey:publicKey.export({format:"der",type:"spki"}),KeyUsage:"SIGN_VERIFY",KeySpec:"ECC_NIST_P256",SigningAlgorithms:["ECDSA_SHA_256"]};
 if(operation==="DescribeKey") return {KeyMetadata:{KeyId:input.KeyId,KeyState:"Enabled",Origin:"AWS_KMS"}};
 if(operation==="Sign") return {Signature:sign("sha256",input.Message,key)}; throw new Error("owned operation unsupported"); }); }
`);
  writeFileSync(bridgeGuard, `import { appendFileSync } from "node:fs";
export function callProviderSync() { appendFileSync(process.env.P208_NOTARY_BLOCKED,"sync provider child attempted\\n"); throw new Error("owned notary test forbids sync provider child"); }`);
  writeFileSync(loader, `import { appendFileSync } from "node:fs";
export async function resolve(specifier,context,next) {
 if(["@aws-sdk/","@google-cloud/","@azure/","pkcs11js","agent-maturity-compass-key-provider-pkcs11"].some(prefix=>specifier.startsWith(prefix))) { appendFileSync(process.env.P208_NOTARY_BLOCKED,specifier+"\\n"); throw new Error("owned notary forbids cloud/native imports"); }
 const found=await next(specifier,context);
 if(context.parentURL===${JSON.stringify(pathToFileURL(resolve("dist/notary/notarySigner.js")).href)} && found.url===${JSON.stringify(pathToFileURL(resolve("dist/keys/providerBridge.js")).href)}) return {url:${JSON.stringify(pathToFileURL(bridgeGuard).href)},shortCircuit:true};
 if(context.parentURL===${JSON.stringify(pathToFileURL(resolve("dist/notary/notarySigner.js")).href)} && found.url===${JSON.stringify(pathToFileURL(resolve("dist/keys/purposeProviders.js")).href)}) return {url:${JSON.stringify(pathToFileURL(factory).href)},shortCircuit:true};
 return found;
}`);
  const input = join(f.root, "cli-input"), output = join(f.root, "cli-output.json"), bytes = Buffer.from("owned actual CLI async notary payload"); writeFileSync(input, bytes);
  const child = spawnOwnedNode(["--experimental-loader", loader, resolve("dist/cli.js"), "notary", "sign", "--notary-dir", f.root, "--kind", "BUNDLE", "--in", input, "--out", output],
    { env: { ...process.env, P208_NOTARY_KEY: keyPath, P208_NOTARY_REQUESTS: marker, P208_NOTARY_BLOCKED: blocked } }); closers.unshift(child.stop);
  try { const result = await child.wait(); expect(result.code, result.stderr).toBe(0);
    expect(existsSync(blocked)).toBe(false); expect(verifyNotarySignResponse(JSON.parse(readFileSync(output, "utf8")), bytes).ok).toBe(true);
    const requests = readFileSync(marker, "utf8").trim().split("\n").map(row => JSON.parse(row)); expect(requests.filter(row => row.operation === "Sign")).toHaveLength(2);
    expect(requests.find(row => row.operation === "Sign").messageHex).toBe(bytes.toString("hex")); expect(verifyNotaryLog(f.root)).toMatchObject({ ok: true, count: 1 });
  } finally { await child.stop(); }
}, 20_000);
