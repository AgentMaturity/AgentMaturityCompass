import { sign } from "node:crypto";
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as receipts from "../../src/passport/adapterCapabilityReceipt.js";
import * as adapterCli from "../../src/adapters/adapterCli.js";
import { listBuiltInAdapters } from "../../src/adapters/registry.js";
import { handleAdaptersRoute } from "../../src/api/adaptersRouter.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { initWorkspace } from "../../src/workspace.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret } from "../../src/trust/trustConfig.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

// Only the inherited synchronous HTTP child bridge is denied. Runtime probes still use the real installed operation.
vi.mock("node:child_process", async original => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, spawnSync: ((...args: unknown[]) => {
    const argv = args[1];
    if (Array.isArray(argv) && argv[0] === "-e" && typeof argv[1] === "string"
      && argv[1].includes('const http = require("node:http")') && argv[1].includes("const params = JSON.parse(process.argv[1])")) {
      throw new Error("owned adapter receipt fixture denies the synchronous notary HTTP bridge");
    }
    return Reflect.apply(real.spawnSync, real, args);
  }) as typeof real.spawnSync };
});
const PASS = "p208-owned-async-adapter-receipt", roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  const errors: unknown[] = [];
  for (const close of closers.splice(0).reverse()) { try { await close(); } catch (error) { errors.push(error); } }
  for (const f of roots.splice(0)) {
    try { lockVault(f.workspace); } catch (error) { errors.push(error); }
    try { rmSync(f.root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  vi.unstubAllEnvs();
  if (errors.length) throw new AggregateError(errors, "owned adapter receipt cleanup failed");
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-adapter-receipt-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "sh"), "#!" + process.execPath + "\nprocess.stdout.write('owned sh 1.2.3\\n');\n", { mode: 0o755 });
  vi.stubEnv("PATH", bin);
  adapterCli.adaptersInitCli(workspace);
  adapterCli.adaptersConfigureCli({ workspace, agentId: "default", adapterId: "generic-cli", route: "/openai", model: "owned", mode: "SUPERVISE" });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
function input(f: ReturnType<typeof fixture>): receipts.BuildAdapterCapabilityReceiptInput {
  return { workspace: f.workspace, agentId: "default", definition: listBuiltInAdapters().find(row => row.id === "generic-cli")!,
    source: "builtin", issuedAt: "2026-10-21T00:00:00.000Z", inspection: {
      runtime: { status: "detected", command: "sh", version: "1.2.3" }, configuration: { status: "signed_selected" },
      hook: { status: "not_applicable", provider: null, mode: null } } };
}
async function build(value: receipts.BuildAdapterCapabilityReceiptInput): Promise<receipts.AdapterCapabilityReceipt> {
  const fn = Reflect.get(receipts, "buildAdapterCapabilityReceiptAsync") as undefined | ((value: receipts.BuildAdapterCapabilityReceiptInput) => Promise<receipts.AdapterCapabilityReceipt>);
  expect(fn, "the real maintained asynchronous builder must exist").toBeTypeOf("function"); return fn!(value);
}
async function issue(f: ReturnType<typeof fixture>): Promise<receipts.AdapterCapabilityReceipt> {
  const fn = Reflect.get(adapterCli, "adaptersCapabilitiesCliAsync") as undefined | ((value: { workspace: string; agentId: string; adapterId: string }) => Promise<receipts.AdapterCapabilityReceipt>);
  expect(fn, "the maintained asynchronous issuer caller must exist").toBeTypeOf("function");
  return fn!({ workspace: f.workspace, agentId: "default", adapterId: "generic-cli" });
}
function verifyReceipt(receipt: receipts.AdapterCapabilityReceipt, publicKey: string) {
  expect(receipts.verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys: [publicKey] })).toEqual({ valid: true, reasons: [] });
  expect(receipts.verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys: [] })).toEqual({ valid: false, reasons: ["signature:untrusted"] });
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, message) => { const result = await original(ref, message); entered.resolve(); await release.promise; return result; });
  return { entered, release };
}
async function entered(paused: ReturnType<typeof pause>, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([paused.entered.promise, operation.then(() => { throw new Error("adapter producer settled before its actual signing pause"); }, error => { throw error; }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("adapter producer did not enter actual signing")), 5_000); })]); }
  finally { clearTimeout(timer); }
}
async function notary(f: ReturnType<typeof fixture>) {
  const id = AWS_ARN("owned-adapter-receipt"), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  const requests: Array<{ kind: string; payload: Buffer }> = [];
  const server = createServer((req, res) => { void (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    const config = loadTrustConfig(f.workspace), auth = verifyNotaryRequestAuth({ req, bodyBytes: body, path: "/sign",
      secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef), headerName: config.trust.notary.auth.headerName,
      tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30 });
    if (!auth.ok) { res.statusCode = 401; res.end("owned notary authentication refused"); return; }
    const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64"); requests.push({ kind: parsed.kind, payload });
    const signature = await signChecked(provider, description, payload);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId,
      backend: "KEY_PROVIDER", attestationLevel: "SOFTWARE", attestationBasis: "provider-metadata", claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  })().catch(() => { res.statusCode = 500; res.end("owned notary response refused"); }); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  closers.push(() => new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : done()); }));
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("owned notary did not listen");
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: "http://127.0.0.1:" + address.port, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  return { description, requests, fake };
}
async function api(f: ReturnType<typeof fixture>, revalidate?: () => boolean, callbackResponds: boolean | "throw-after-response" = false) {
  const handler = handleAdaptersRoute as (path: string, method: string, req: IncomingMessage, res: ServerResponse, workspace: string, revalidate?: () => boolean) => Promise<boolean>;
  const failures: unknown[] = [], tasks: Promise<unknown>[] = [];
  const server = createServer((req, res) => {
    res.on("error", error => failures.push(error));
    const check = callbackResponds ? () => { res.statusCode = 403; res.end(JSON.stringify({ error: "owned trusted callback already refused" }));
      if (callbackResponds === "throw-after-response") throw new Error("owned callback threw after its actual response"); return false; } : revalidate;
    tasks.push(handler("/api/v1/adapters/capability-receipts", "POST", req, res, f.workspace, check)
      .catch(error => { failures.push(error); if (!res.headersSent) { res.statusCode = 500; res.end("owned route failed"); } })); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  closers.push(async () => { await new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : done()); }); await Promise.allSettled(tasks); });
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("owned API did not listen");
  const run = () => new Promise<{ status: number; body: Record<string, unknown> & { data?: { receipt?: receipts.AdapterCapabilityReceipt } } }>((done, reject) => {
    const data = JSON.stringify({ agentId: "default", adapterId: "generic-cli" });
    const req = request({ method: "POST", hostname: "127.0.0.1", port: address.port, path: "/api/v1/adapters/capability-receipts",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), connection: "close" } }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.on("error", reject); res.on("aborted", () => reject(new Error("owned response aborted")));
      res.on("end", () => { try { done({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch (error) { reject(error); } });
    });
    req.on("error", reject); req.setTimeout(10_000, () => req.destroy(new Error("owned API request deadline"))); req.end(data);
  });
  return Object.assign(run, { failures });
}

describe("maintained asynchronous adapter capability receipt signing", () => {
  test("retains exact v1 Ed25519 bytes and independently specified envelope fields through the actual file provider", async () => {
    const f = fixture(), value = input(f), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const legacy = receipts.buildAdapterCapabilityReceipt(value), spy = vi.spyOn(f.provider, "sign"), actual = await build(value);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(legacy)); expect(spy).toHaveBeenCalledTimes(1);
    const { receiptHash, signature, ...base } = actual, digest = sha256Hex(canonicalize(base));
    expect(receiptHash).toBe(digest);
    expect(signature).toEqual({ digestSha256: digest, signature: sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64"),
      signedTs: now, signer: "auditor", envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(f.publicKey).toString("base64"),
        fingerprint: sha256Hex(Buffer.from(f.publicKey)), sigB64: signature.signature, signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } });
    verifyReceipt(actual, f.publicKey);
  });

  test("owns the caller's parsed definition and inspection before awaiting actual signing", async () => {
    const f = fixture(), value = input(f), before = structuredClone(value), paused = pause(f), pending = build(value), outcome = pending.then(value => value, error => error);
    try {
      await entered(paused, pending); value.definition.displayName = "caller changed"; value.inspection.runtime.version = "99.0";
      paused.release.resolve(); const receipt = await outcome;
      expect(receipt.adapter.displayName).toBe(before.definition.displayName); expect(receipt.inspection.runtime.version).toBe(before.inspection.runtime.version);
      verifyReceipt(receipt, f.publicKey);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("rechecks actual file authority after the selected signer returns and receipt schema parsing completes", async () => {
    const f = fixture(), parse = receipts.adapterCapabilityReceiptSchema.parse.bind(receipts.adapterCapabilityReceiptSchema);
    const spy = vi.spyOn(receipts.adapterCapabilityReceiptSchema, "parse").mockImplementationOnce(value => {
      const receipt = parse(value); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); return receipt;
    });
    try { await expect(build(input(f))).rejects.toThrow(/vault (is )?locked/i); expect(spy).toHaveBeenCalledTimes(1); }
    finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    verifyReceipt(await build(input(f)), f.publicKey);
  });

  test("the maintained issuer refuses exact config-pair drift during the real signing wait", async () => {
    const f = fixture(), path = join(f.workspace, ".amc", "adapters.yaml"), before = readFileSync(path), paused = pause(f), pending = issue(f), outcome = pending.then(() => null, error => error);
    try {
      await entered(paused, pending); writeFileSync(path, Buffer.concat([before, Buffer.from("\n# owned concurrent change\n")])); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "adapter capability receipt inputs changed while signing" });
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(path, before); }
    verifyReceipt(await issue(f), f.publicKey);
  });

  test("uses real P-256 provider-backed notary TCP signing for both builder and maintained issuer without local fallback", async () => {
    const f = fixture();
    expect(Reflect.get(receipts, "buildAdapterCapabilityReceiptAsync")).toBeTypeOf("function");
    expect(Reflect.get(adapterCli, "adaptersCapabilitiesCliAsync")).toBeTypeOf("function");
    const remote = await notary(f), first = await build(input(f)), second = await issue(f);
    for (const receipt of [first, second]) {
      expect(receipt.signature.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", signer: { type: "NOTARY", attestationBasis: "provider-metadata" } });
      verifyReceipt(receipt, remote.description.publicKeyPem);
      expect(receipts.verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys: [f.publicKey] }).valid).toBe(false);
    }
    expect(remote.requests).toEqual([first, second].map(receipt => ({ kind: "BUNDLE", payload: Buffer.from(receipt.receiptHash, "hex") })));
    expect(second.inspection.runtime).toEqual({ status: "detected", command: "sh", version: "1.2.3" });
  });

  test("retains synchronous unlocked no-sign compatibility while async policy signing refuses that flag", async () => {
    const f = fixture(); vi.stubEnv("AMC_NO_SIGN", "1");
    verifyReceipt(receipts.buildAdapterCapabilityReceipt(input(f)), f.publicKey);
    await expect(build(input(f))).rejects.toThrow("no-sign mode does not authorize policy signing");
    vi.stubEnv("AMC_NO_SIGN", "0"); verifyReceipt(await build(input(f)), f.publicKey);
  });

  test("current HTTP callers without a trusted callback retain synchronous vault signing and provider-held refusal", async () => {
    const f = fixture(), run = await api(f), spy = vi.spyOn(f.provider, "sign"), response = await run();
    expect(response.status).toBe(201); verifyReceipt(response.body.data?.receipt as receipts.AdapterCapabilityReceipt, f.publicKey); expect(spy).not.toHaveBeenCalled();
    const path = join(f.workspace, ".amc", "amc.config.yaml"), before = readFileSync(path);
    try {
      // Unsigned editable config may refuse only. No binding or new signing authority is fabricated.
      const config = YAML.parse(before.toString("utf8")) as Record<string, unknown>;
      config.keys = { refs: { "artifact-seal": { provider: "aws-kms", id: "owned-refused-ref" } } };
      writeFileSync(path, YAML.stringify(config));
      const refused = await run(); expect(refused.status).toBe(409); expect(JSON.stringify(refused.body)).toContain("KEY_PROVIDER_HELD"); expect(spy).not.toHaveBeenCalled();
    } finally { writeFileSync(path, before); }
    expect((await run()).status).toBe(201);
  });

  test("an explicitly supplied trusted HTTP callback refuses at entry before provider work", async () => {
    const f = fixture(), run = await api(f, () => false), spy = vi.spyOn(f.provider, "sign"), response = await run();
    expect(response.status).toBe(403); expect(response.body.data?.receipt).toBeUndefined(); expect(spy).not.toHaveBeenCalled();
  });

  test("an explicitly supplied trusted callback may send its own refusal without a second response write", async () => {
    const f = fixture(), run = await api(f, undefined, true), spy = vi.spyOn(f.provider, "sign"), response = await run();
    expect(response).toEqual({ status: 403, body: { error: "owned trusted callback already refused" } }); expect(spy).not.toHaveBeenCalled();
  });

  test("a trusted callback's real response followed by a throw does not attempt another response or escape the route", async () => {
    const f = fixture(), run = await api(f, undefined, "throw-after-response"), spy = vi.spyOn(f.provider, "sign"), response = await run();
    expect(response).toEqual({ status: 403, body: { error: "owned trusted callback already refused" } });
    expect(run.failures).toEqual([]); expect(spy).not.toHaveBeenCalled(); verifyReceipt(await issue(f), f.publicKey);
  });

  test("an explicitly supplied trusted HTTP callback is revalidated after real signing before returning any receipt", async () => {
    const f = fixture(); let authorized = true, calls = 0;
    const run = await api(f, () => { calls++; return authorized; }), paused = pause(f), pending = run(), outcome = pending.then(value => value, error => error);
    try {
      await entered(paused, pending); authorized = false; paused.release.resolve(); const response = await outcome;
      expect(response.status).toBe(403); expect(response.body.data?.receipt).toBeUndefined(); expect(calls).toBeGreaterThanOrEqual(2);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); authorized = true; }
    const fresh = await run(); expect(fresh.status).toBe(201); verifyReceipt(fresh.body.data?.receipt as receipts.AdapterCapabilityReceipt, f.publicKey);
  });

  test("provided-callback HTTP traverses actual native TCP and P-256 provider-backed notary signing", async () => {
    const f = fixture(); expect(Reflect.get(adapterCli, "adaptersCapabilitiesCliAsync")).toBeTypeOf("function");
    const remote = await notary(f), run = await api(f, () => true), response = await run(), receipt = response.body.data?.receipt as receipts.AdapterCapabilityReceipt;
    expect(response.status).toBe(201); verifyReceipt(receipt, remote.description.publicKeyPem);
    expect(remote.requests).toEqual([{ kind: "BUNDLE", payload: Buffer.from(receipt.receiptHash, "hex") }]);
  });
});

