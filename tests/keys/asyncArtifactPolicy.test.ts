// Proposed destination: tests/keys/asyncArtifactPolicy.test.ts. No transport mocks and no real SDK/cloud calls.
import { sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as nativeRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { afterEach, expect, test, vi } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { generateTrustCertificateAsync, verifyTrustCertificateEnvelope } from "../../src/cert/trustCertificate.js";
import { signDigestWithPolicyAsync } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { getSigningKey } from "../../src/crypto/keys.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { withPins } from "../../src/trust/trustContext.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { handleCryptoRoute } from "../../src/api/cryptoRouter.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { initDestinationRegistry } from "../../src/residency/destinationRegistry.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { testKey, trustList, distrustEntry } from "../trust/trustFixtures.js";
import { keyRevocationLocation } from "../../src/keys/keyRevocations.js";
import { encodeSignedRevocationList, nextRevocationList, readAnchoredRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { writeContained } from "../../src/utils/containedFs.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { writeFileAtomic } from "../../src/utils/fs.js";
import { writeSealedReport } from "../helpers/sealedRun.js";
import { getAgentPaths } from "../../src/fleet/paths.js";

const roots: string[] = [], closers: Array<() => Promise<void>> = [];
const ownedDns = vi.hoisted(() => ({ resolve: null as null | (() => Promise<Array<{ address: string; family: number }>>), transportAttempts: 0 }));
vi.mock("node:dns/promises", async original => {
  const real = await original<typeof import("node:dns/promises")>();
  return { ...real, lookup: ((...args: Parameters<typeof real.lookup>) => {
    if (args[0] === "deadline.owned.test" && ownedDns.resolve) return ownedDns.resolve();
    return Reflect.apply(real.lookup, real, args);
  }) as typeof real.lookup };
});
vi.mock("node:http", async original => {
  const real = await original<typeof import("node:http")>();
  return { ...real, request: ((...args: unknown[]) => {
    if ((args[0] as { hostname?: string } | undefined)?.hostname === "deadline.owned.test") {
      ownedDns.transportAttempts++; throw new Error("owned deadline test forbids expired socket creation");
    }
    return Reflect.apply(real.request, real, args);
  }) as typeof real.request };
});
const PASS = "p208-owned-async-artifact-passphrase", SECRET = "do-not-echo-owned-secret-PIN1234";
afterEach(async () => {
  vi.useRealTimers(); ownedDns.resolve = null; ownedDns.transportAttempts = 0; vi.restoreAllMocks();
  const errors: unknown[] = [];
  for (const close of closers.splice(0)) { try { await close(); } catch (error) { errors.push(error); } }
  for (const root of roots.splice(0)) {
    try { lockVault(root); } catch (error) { errors.push(error); }
    try { rmSync(root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  vi.unstubAllEnvs(); if (errors.length) throw new AggregateError(errors, "owned artifact fixture cleanup failed");
});
function fresh() { const root = mkdtempSync(join(tmpdir(), "amc-async-artifact-")); roots.push(root); return root; }
function workspace() { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_HOME", fresh()); vi.stubEnv("AMC_NO_SIGN", "0");
  const root = fresh(); initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return seedSealedRun(root); }
/** Since WP37 a trust certificate is signed only from a sealed run; seed one sealed with the workspace's own key. */
const seedSealedRun = (root: string) => { writeSealedReport(root, getAgentPaths(root, "default").runsDir, "seed-run", { runId: "seed-run", ts: 1, integrityIndex: 0.5 }); return root; };
/** The real owner-held vault key and exact existing trust sidecar wire format; no private production helper export. */
function saveOwnedSignedTrustConfig(root: string, candidate: TrustConfig): void {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(candidate)), "utf8");
  writeFileAtomic(trustConfigPath(root), bytes, 0o644);
  const signed = signDigestWithVault({ workspace: root, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileAtomic(trustConfigSigPath(root), JSON.stringify({ digestSha256: signed.digestSha256,
    signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2), 0o644);
  expect(verifyTrustConfigSignature(root)).toMatchObject({ valid: true, signatureExists: true });
}
async function ownedNotary(root: string, unix = false) {
  const id = AWS_ARN("owned-async-artifact"), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(root, "owned-notary.pub"); writeFileSync(pin, description.publicKeyPem);
  const requests: Array<{ kind: string; payload: Buffer }> = [];
  let beforeReply: (() => void | Promise<void>) | undefined, mode: "sign" | "status" | "malformed" | "oversize" | "wrong-kind" = "sign";
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    const config = loadTrustConfig(root), auth = verifyNotaryRequestAuth({ req, bodyBytes: body,
      secret: resolveNotaryAuthSecret(root, config.trust.notary.auth.secretRef), headerName: config.trust.notary.auth.headerName,
      tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.statusCode = 401; res.end(SECRET); return; }
    const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64"); requests.push({ kind: parsed.kind, payload });
    if (mode === "status") { res.statusCode = 500; res.end(SECRET); return; }
    if (mode === "malformed") { res.end(`{"secret":"${SECRET}"}`); return; }
    if (mode === "oversize") { res.end(SECRET.repeat(100_000)); return; }
    const signature = await signChecked(provider, description, payload); if (beforeReply) await beforeReply();
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(notarySignResponse(mode === "wrong-kind" ? "BOM" : parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId,
      backend: "KEY_PROVIDER", attestationLevel: description.protection === "hsm" ? "HARDWARE" : "SOFTWARE",
      attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  });
  const socket = unix ? join(root, "owned-notary.sock") : null;
  await new Promise<void>(done => socket ? server.listen(socket, done) : server.listen(0, "127.0.0.1", done));
  closers.push(() => new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : done()); }));
  const address = server.address(), url = typeof address === "object" && address ? `http://127.0.0.1:${address.port}` : "http://127.0.0.1:1";
  await enableNotaryTrust({ workspace: root, baseUrl: url, unixSocketPath: socket, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  return { fake, description, requests, trust: withPins(workspaceKeyTrust(root), [{ keyId: description.keyId, purposes: ["artifact-seal"], origin: "independent owned artifact operator" }]),
    setMode(value: typeof mode) { mode = value; }, setBeforeReply(value: typeof beforeReply) { beforeReply = value; } };
}
async function api(root: string, outputPath: string) {
  const req = Readable.from([Buffer.from(JSON.stringify({ agentId: "default", outputPath }))]) as IncomingMessage;
  req.headers = { "content-type": "application/json" }; req.method = "POST";
  let status = 0, text = ""; const res = { writeHead(code: number) { status = code; return this; }, end(value: string) { text = value; } } as unknown as ServerResponse;
  expect(await handleCryptoRoute("/api/v1/crypto/cert/generate", "POST", req, res, root)).toBe(true); return { status, body: JSON.parse(text) };
}
async function boundedOwnedOracle<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_done, reject) => { timer = setTimeout(() => reject(new Error("owned sync bridge cleanup did not complete")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

test("async local certificates preserve the exact existing Ed25519 v1 serialization", async () => {
  const root = workspace(), out = await generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "async.json" });
  const payload = out.envelope.payload, digest = sha256Hex(canonicalize(payload));
  const legacy = { type: "amc-trust-certificate", signatureAlgorithm: "ed25519", signatureStatus: "SIGNED", payloadSha256: digest,
    signature: sign(null, Buffer.from(digest, "hex"), getSigningKey(root, "artifact-seal")).toString("base64"), claimBoundary: undefined, payload };
  expect(readFileSync(out.outputPath)).toEqual(Buffer.from(JSON.stringify(legacy, null, 2) + "\n"));
  expect(verifyTrustCertificateEnvelope(out.envelope, workspaceKeyTrust(root)).ok).toBe(true);
});

test.each([false, true])("actual API artifact production traverses native TCP/Unix transport, async provider, and independent verification (unix=%s)", async unix => {
  const root = workspace(), notary = await ownedNotary(root, unix), result = await api(root, "api.json");
  expect(result.status).toBe(201); const envelope = JSON.parse(readFileSync(join(root, "api.json"), "utf8"));
  expect(envelope).toMatchObject({ signatureAlgorithm: "ecdsa-p256-sha256", payload: { signingKey: { fingerprint: notary.description.keyId } } });
  expect(verifyTrustCertificateEnvelope(envelope, notary.trust).ok).toBe(true);
  expect(verifyTrustCertificateEnvelope(envelope, { ...notary.trust, explicitPins: [] }).ok).toBe(false);
  expect(notary.requests).toHaveLength(1); expect(notary.requests[0]).toEqual({ kind: "CERT", payload: Buffer.from(envelope.payloadSha256, "hex") });
  expect(notary.fake.requests.find(row => row.operation === "Sign")?.input).toMatchObject({ Message: Buffer.from(envelope.payloadSha256, "hex"), MessageType: "RAW" });
});

test("the asynchronous artifact wait leaves the local event loop responsive and refuses a changed signed enforcement policy", async () => {
  const root = workspace(), notary = await ownedNotary(root); let entered!: () => void, resume!: () => void;
  const waiting = new Promise<void>(done => { entered = done; }), release = new Promise<void>(done => { resume = done; });
  notary.setBeforeReply(async () => { entered(); await release; });
  const pending = generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "stale.json" });
  pending.catch(() => {});
  try {
    await Promise.race([waiting, pending.then(() => { throw new Error("artifact did not wait for owned notary"); })]);
    let heartbeat = false; await new Promise<void>(done => setTimeout(() => { heartbeat = true; done(); }, 0)); expect(heartbeat).toBe(true);
    expect(existsSync(join(root, "stale.json"))).toBe(false);
    const config = loadTrustConfig(root); config.trust.enforcement.notaryMaxClockSkewSeconds += 1; saveOwnedSignedTrustConfig(root, config);
    resume(); await expect(pending).rejects.toThrow("policy signing state changed while signing");
    expect(existsSync(join(root, "stale.json"))).toBe(false);
  } finally { resume(); await pending.catch(() => {}); }
});

test.each(["status", "malformed", "oversize", "wrong-kind"] as const)("native async artifact transport rejects %s without remote text or publication", async mode => {
  const root = workspace(), notary = await ownedNotary(root); notary.setMode(mode);
  const result = await api(root, "refused.json"); expect(result.status).toBe(500);
  expect(JSON.stringify(result.body)).not.toContain(SECRET); expect(JSON.stringify(result.body)).not.toContain(root);
  expect(existsSync(join(root, "refused.json"))).toBe(false);
});

test("the actual compiled cert generate CLI reaches native asynchronous HTTP without SDK/native imports", async () => {
  const root = workspace(), notary = await ownedNotary(root), loader = join(root, "forbid-cloud-loader.mjs"), blocked = join(root, "blocked.txt");
  writeFileSync(loader, `import { appendFileSync } from "node:fs";
export async function resolve(specifier, context, next) {
 if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) {
  appendFileSync(process.env.P208_BLOCKED, specifier + "\\n"); throw new Error("owned artifact test forbids cloud/native imports"); }
 return next(specifier, context);
}`);
  const child = spawnOwnedNode(["--experimental-loader", loader, resolve("dist/cli.js"), "cert", "generate", "--agent", "default", "--output", "cli.json"],
    { cwd: root, env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS, P208_BLOCKED: blocked } });
  closers.unshift(child.stop);
  try { const result = await child.wait();
    expect(result.code, result.stderr).toBe(0); expect(existsSync(blocked)).toBe(false); expect(notary.requests).toHaveLength(1);
    expect(verifyTrustCertificateEnvelope(JSON.parse(readFileSync(join(root, "cli.json"), "utf8")), notary.trust).ok).toBe(true);
  } finally { await child.stop(); }
}, 20_000);

test("the maintained synchronous SDK certificate path still signs through its real HTTP child", async () => {
  // A compiled consumer child keeps this process's owned listener responsive while exercising spawnSync inside the SDK.
  const root = workspace(), notary = await ownedNotary(root), driver = join(root, "sync-driver.mjs"), module = resolve("dist/cert/trustCertificate.js");
  writeFileSync(driver, `import { generateTrustCertificate } from ${JSON.stringify(new URL(`file://${module}`).href)};
generateTrustCertificate({ workspace: process.cwd(), agentId: "default", outputPath: "sync.json" });`);
  const child = spawnOwnedNode([driver], { cwd: root, env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS } }); closers.unshift(child.stop);
  try { const result = await child.wait(); expect(result.code, result.stderr).toBe(0);
    expect(verifyTrustCertificateEnvelope(JSON.parse(readFileSync(join(root, "sync.json"), "utf8")), notary.trust).ok).toBe(true);
    expect(notary.requests).toHaveLength(1);
  } finally { await child.stop(); }
}, 20_000);

test("the async policy API rejects an expected signer mismatch before invoking the owned notary", async () => {
  const root = workspace(), notary = await ownedNotary(root);
  await expect(signDigestWithPolicyAsync({ workspace: root, kind: "CERT", digestHex: sha256Hex("owned"), expectedSigner: {
    kind: "BOM", mode: "NOTARY", algorithm: "ecdsa-p256-sha256", publicKeyPem: notary.description.publicKeyPem, fingerprint: notary.description.keyId
  } })).rejects.toThrow("policy signing response does not match");
  expect(notary.requests).toHaveLength(0);
});

test.skipIf(process.platform === "win32")("cleanup of a stalled real synchronous certificate SDK call also terminates its HTTP bridge grandchild", async () => {
  const root = workspace(), notary = await ownedNotary(root), driver = join(root, "stalled-sync-driver.mjs"), preload = join(root, "record-owned-pids.mjs"), pids = join(root, "owned-pids.jsonl");
  writeFileSync(driver, `import { generateTrustCertificate } from ${JSON.stringify(pathToFileURL(resolve("dist/cert/trustCertificate.js")).href)};
generateTrustCertificate({workspace:process.cwd(),agentId:"default",outputPath:"must-not-publish-after-cleanup.json"});`);
  writeFileSync(preload, `import { appendFileSync } from "node:fs";
appendFileSync(process.env.P208_OWNED_PIDS,JSON.stringify({pid:process.pid,parent:process.ppid})+"\\n");`);
  let entered!: () => void, resume!: () => void;
  const waiting = new Promise<void>(done => { entered = done; }), release = new Promise<void>(done => { resume = done; });
  notary.setBeforeReply(async () => { entered(); await release; });
  const child = spawnOwnedNode([driver], { cwd: root, env: { ...process.env, AMC_VAULT_PASSPHRASE: PASS, P208_OWNED_PIDS: pids,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import", pathToFileURL(preload).href].filter(Boolean).join(" ") } }); closers.unshift(child.stop);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const handshakeDeadline = new Promise<never>((_done, reject) => { watchdog = setTimeout(() => reject(new Error("owned synchronous SDK did not reach its real HTTP bridge")), 5_000); });
  try {
    await Promise.race([waiting, handshakeDeadline, child.closed.then(() => { throw new Error("owned SDK child closed before its actual HTTP bridge handshake"); })]);
    clearTimeout(watchdog);
    const recorded = readFileSync(pids, "utf8").trim().split("\n").map(line => JSON.parse(line) as { pid: number; parent: number });
    const bridge = recorded.find(row => row.parent === child.child.pid); expect(bridge).toBeDefined();
    expect(Number.isInteger(bridge!.pid) && bridge!.pid > 0).toBe(true);
    await boundedOwnedOracle(child.stop(), 4_000); await boundedOwnedOracle(child.closed, 2_000);
    expect(() => process.kill(bridge!.pid, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
    expect(() => process.kill(-child.child.pid!, 0)).toThrowError(expect.objectContaining({ code: "ESRCH" }));
    expect(existsSync(join(root, "must-not-publish-after-cleanup.json"))).toBe(false);
  } finally {
    clearTimeout(watchdog); resume();
    if (child.child.pid !== undefined) {
      try { process.kill(-child.child.pid, "SIGKILL"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    await boundedOwnedOracle(child.closed, 2_000); await boundedOwnedOracle(child.stop(), 4_000);
  }
}, 15_000);

test("actual native notary TCP is refused by the signed residency destination policy before any HTTP/sign request", async () => {
  const root = workspace(), notary = await ownedNotary(root);
  initDestinationRegistry(root, { schemaVersion: "amc.residency-destinations/v1", profile: null,
    destinations: [{ destinationId: "some-other-owned-destination", match: { hosts: ["192.0.2.1"] }, channels: ["bridge"],
      region: { jurisdiction: "US", code: "owned-us" }, transferBasis: null }],
    rules: [{ ruleId: "owned-restrictive-route", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  const before = notary.fake.requests.length;
  await expect(signDigestWithPolicyAsync({ workspace: root, kind: "CERT", digestHex: sha256Hex("owned denied destination") })).rejects.toBeInstanceOf(EgressBlocked);
  expect(notary.requests).toHaveLength(0); expect(notary.fake.requests).toHaveLength(before); expect(existsSync(join(root, "denied.json"))).toBe(false);
});

test("a local Unix notary socket uses IPC without pretending its unused base URL is network egress", async () => {
  const root = workspace(), notary = await ownedNotary(root, true);
  initDestinationRegistry(root, { schemaVersion: "amc.residency-destinations/v1", profile: null, destinations: [],
    rules: [{ ruleId: "deny-all-network", controlId: "L0-DAT-04", appliesTo: { dataClasses: ["customer_financial"], jurisdictions: ["US"] },
      allowedJurisdictions: ["US"], acceptsTransferBasis: false }] });
  const out = await generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "ipc.json" });
  expect(notary.requests).toHaveLength(1); expect(verifyTrustCertificateEnvelope(out.envelope, notary.trust).ok).toBe(true);
});

test.each(["operator-distrust", "authenticated-pending-key-revocation"] as const)("a real %s arriving during notary await refuses publication without broadening key authority", async change => {
  const root = workspace(), notary = await ownedNotary(root);
  notary.setBeforeReply(() => {
    if (change === "operator-distrust") {
      const owner = testKey(), directory = join(process.env.AMC_HOME!, "trust"); mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, rootSetId: "owned-artifact-root", roots: [owner.keyId], threshold: 1 }));
      writeFileSync(join(directory, "amc-trust-list.json"), JSON.stringify(signTrustList(trustList([], { distrust: [distrustEntry(notary.description.keyId)] }), owner.privateKeyPem)));
    } else {
      // The actual owner-held revocation-list key signs the staged next list. Production readKeyRevocations already
      // enforces authenticated pending rows before the owner's transparency publication completes.
      const location = keyRevocationLocation(root), current = readAnchoredRevocationList(location)!;
      const list = nextRevocationList(location.listId, { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
        [...current.list.revoked, { id: notary.description.keyId, kind: "key", revokedAt: new Date().toISOString(), reason: "key-compromise: owned transport notary" }], 0);
      writeContained(root, `${location.rel}.pending`, encodeSignedRevocationList(signRevocationList(list, getSigningKey(root, "revocation-list"))), 0o644);
    }
  });
  await expect(generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "newly-refused.json" }))
    .rejects.toThrow(change === "operator-distrust" ? "policy signer current distrust state refused" : "was revoked");
  expect(notary.requests).toHaveLength(1); expect(existsSync(join(root, "newly-refused.json"))).toBe(false);
});

test.each(["resolve", "reject"] as const)("the total notary deadline covers pending native DNS and handles its late %s without creating a socket", async late => {
  const root = workspace(), notary = await ownedNotary(root), config = loadTrustConfig(root), destination = new URL(config.trust.notary.baseUrl);
  destination.hostname = "deadline.owned.test"; config.trust.notary.baseUrl = destination.href; saveOwnedSignedTrustConfig(root, config);
  // Prove the safety guard intercepts this exact native request entry before testing that production never reaches it.
  expect(() => nativeRequest({ hostname: "deadline.owned.test" })).toThrow("owned deadline test forbids expired socket creation");
  expect(ownedDns.transportAttempts).toBe(1); ownedDns.transportAttempts = 0;
  let entered!: () => void, resolveLate!: (value: Array<{ address: string; family: number }>) => void, rejectLate!: (error: Error) => void;
  const waiting = new Promise<void>(done => { entered = done; });
  ownedDns.resolve = () => { entered(); return new Promise((resolvePromise, reject) => { resolveLate = resolvePromise; rejectLate = reject; }); };
  const before = notary.fake.requests.length;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pending = generateTrustCertificateAsync({ workspace: root, agentId: "default", outputPath: "dns-expired.json" });
  let failure: unknown; pending.catch(error => { failure = error; });
  try {
    await Promise.race([waiting, pending.then(() => { throw new Error("actual transport did not reach owned DNS boundary"); })]);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toBe("notary transport deadline exceeded");
    expect(notary.requests).toHaveLength(0); expect(notary.fake.requests).toHaveLength(before); expect(existsSync(join(root, "dns-expired.json"))).toBe(false);
    // A public address passes decideEgress; an expired continuation must still never reach native request. The guard
    // above prevents any real external connection even if the production no-socket condition is deliberately mutated.
    if (late === "resolve") resolveLate([{ address: "93.184.216.34", family: 4 }]); else rejectLate(new Error("do-not-echo-native-DNS-secret"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(notary.requests).toHaveLength(0); expect(notary.fake.requests).toHaveLength(before);
    expect(ownedDns.transportAttempts).toBe(0);
    await expect(pending).rejects.toThrow("notary transport deadline exceeded");
  } finally {
    resolveLate?.([{ address: "93.184.216.34", family: 4 }]); vi.useRealTimers(); await pending.catch(() => {}); ownedDns.resolve = null;
  }
});
