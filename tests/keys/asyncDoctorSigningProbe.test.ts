// Proposed tests/keys/asyncDoctorSigningProbe.test.ts. Actual diagnostic + native owned notary + real crypto.
import { verify } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import YAML from "yaml";
import { initWorkspace } from "../../src/workspace.js";
import { runDoctorCli } from "../../src/doctor/doctorCli.js";
import { signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { signNotaryAttestationAsync } from "../../src/notary/notaryAttestation.js";
import { notarySignResponse, type AsyncNotarySigner } from "../../src/notary/notarySigner.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const syncRoute = vi.hoisted(() => ({ armed: false, attempts: 0 }));
// Exact old caller route only; the new async policy signer, its crypto/current gates and native transport stay real.
vi.mock("../../src/crypto/signing/signer.js", async original => {
  const actual = await original<typeof import("../../src/crypto/signing/signer.js")>();
  return { ...actual, signDigestWithPolicy: (...args: Parameters<typeof actual.signDigestWithPolicy>) => {
    if (syncRoute.armed) { syncRoute.attempts++; throw new Error("owned doctor refuses synchronous signing route"); }
    return actual.signDigestWithPolicy(...args);
  } };
});
// No external adapter binaries are part of these signing oracles; initialization and policy verifiers remain actual.
vi.mock("../../src/adapters/adapterCli.js", async original => ({
  ...await original<typeof import("../../src/adapters/adapterCli.js")>(), adaptersDetectCli: () => []
}));
const PASS = "owned-doctor-probe-passphrase", PRIVATE = "PRIVATE-owned-doctor-auth-PIN1234";
const roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  syncRoute.armed = false; syncRoute.attempts = 0; vi.restoreAllMocks();
  const errors: unknown[] = [];
  for (const close of closers.splice(0)) { try { await close(); } catch (error) { errors.push(error); } }
  for (const f of roots.splice(0)) {
    try { lockVault(f.workspace); } catch (error) { errors.push(error); }
    try { rmSync(f.root, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  }
  vi.unstubAllEnvs(); if (errors.length) throw new AggregateError(errors, "owned doctor probe cleanup failed");
});
function saveTrust(workspace: string, candidate: TrustConfig): void {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(candidate)), "utf8");
  const signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigPath(workspace), bytes);
  writeFileSync(trustConfigSigPath(workspace), JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
  expect(verifyTrustConfigSignature(workspace)).toMatchObject({ valid: true, signatureExists: true });
}
function gate() { let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(done => { enter = done; }), held = new Promise<void>(done => { release = done; });
  return { entered, release, wait: async () => { enter(); await held; } };
}
async function reached(entered: Promise<void>, pending: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([entered.then(() => "entered"), pending.then(() => "returned", () => "refused"),
    new Promise<string>(done => { timer = setTimeout(() => done("no-owned-sign"), 5_000); })])).toBe("entered"); }
  finally { clearTimeout(timer); }
}
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-doctor-async-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const arn = AWS_ARN("owned-doctor-probe"), faults: { fail?: string } = {}, fake = awsFake({ [arn]: fakeKey("p256") }, faults);
  const provider = awsKmsProvider(fake.call), description = await provider.describe({ provider: "aws-kms", id: arn });
  const signer: AsyncNotarySigner = {
    pubkeyPem: () => description.publicKeyPem, pubkeyFingerprint: () => description.keyId,
    backendType: () => "KEY_PROVIDER", attestationLevel: () => "HARDWARE", attestationBasis: () => description.protectionBasis,
    claims: () => ({ provider: "aws-kms", fixture: "owned cryptographic fake; no hardware claim" }),
    sign: async (_kind, payload) => ({ signatureB64: (await signChecked(provider, description, payload)).toString("base64"),
      pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER", attestationLevel: "HARDWARE",
      attestationBasis: description.protectionBasis, claims: {}, signedTs: Date.now() })
  };
  const attestation = await signNotaryAttestationAsync({ signer }); // real signature over actual attestation bytes
  const requests: Array<{ kind: string; payload: Buffer; signature: Buffer }> = [], gets: string[] = [], handlerErrors: unknown[] = [];
  let beforeReply: (() => Promise<void>) | undefined, mode: "valid" | "status" | "bad-crypto" | "wrong-kind" = "valid", ready = true, brokenAttestation = false;
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") {
      gets.push(req.url ?? "");
      if (req.url === "/readyz") { res.statusCode = ready ? 200 : 503; res.end("{}"); return; }
      if (req.url === "/pubkey") { res.end(JSON.stringify({ pubkeyPem: description.publicKeyPem, fingerprint: description.keyId })); return; }
      if (req.url === "/attest/current") { res.end(brokenAttestation ? PRIVATE : JSON.stringify(attestation)); return; }
    }
    if (req.method !== "POST" || req.url !== "/sign") { res.statusCode = 404; res.end("{}"); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    const config = loadTrustConfig(workspace), authenticated = verifyNotaryRequestAuth({ req, bodyBytes: body,
      secret: resolveNotaryAuthSecret(workspace, config.trust.notary.auth.secretRef), headerName: config.trust.notary.auth.headerName,
      tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!authenticated.ok) { res.statusCode = 401; res.end(PRIVATE); return; }
    if (mode === "status") { res.statusCode = 503; res.end(PRIVATE); return; }
    const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64");
    expect(parsed.payloadSha256).toBe(sha256Hex(payload));
    let signature: Buffer;
    try { signature = await signChecked(provider, description, payload); }
    catch { res.statusCode = 503; res.end(PRIVATE); return; }
    requests.push({ kind: parsed.kind, payload, signature }); if (beforeReply) await beforeReply();
    res.end(JSON.stringify(notarySignResponse(mode === "wrong-kind" ? "BOM" : parsed.kind, sha256Hex(payload), {
      signatureB64: (mode === "bad-crypto" ? Buffer.alloc(64) : signature).toString("base64"), pubkeyPem: description.publicKeyPem,
      pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis,
      claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  }
  const dispatches: Promise<void>[] = [];
  const server = createServer((req, res) => { const pending = handle(req, res).catch(error => { handlerErrors.push(error); res.statusCode = 500; res.end(PRIVATE); }); dispatches.push(pending); });
  closers.push(async () => { server.closeAllConnections();
    if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
    await Promise.allSettled(dispatches);
    if (handlerErrors.length) throw new AggregateError(handlerErrors, "owned doctor server handler failed"); });
  await new Promise<void>((done, reject) => { server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); }); const address = server.address();
  if (!address || typeof address === "string") throw new Error("owned doctor TCP address unavailable");
  const pin = join(root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  await enableNotaryTrust({ workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  syncRoute.armed = true;
  expect(() => signDigestWithPolicy({ workspace, kind: "MERKLE_ROOT", digestHex: "a".repeat(64) })).toThrow("owned doctor refuses synchronous signing route");
  syncRoute.attempts = 0; fake.requests.length = 0;
  return { root, workspace, requests, gets, fake, description, faults,
    setReply(value: typeof beforeReply) { beforeReply = value; }, setMode(value: typeof mode) { mode = value; }, setReady(value: boolean) { ready = value; }, setBrokenAttestation(value: boolean) { brokenAttestation = value; } };
}
const smoke = (report: Awaited<ReturnType<typeof runDoctorCli>>) => report.checks.find(row => row.id === "notary-sign-smoke");
function refused(report: Awaited<ReturnType<typeof runDoctorCli>>, workspace: string): void {
  expect(smoke(report)).toMatchObject({ status: "FAIL", message: "Notary signing smoke test failed" });
  expect(report.ok).toBe(false); expect(JSON.stringify(report)).not.toContain(PRIVATE); expect(JSON.stringify(report)).not.toContain(workspace);
}

test("actual doctor caller awaits native P256 MERKLE_ROOT crypto and stays responsive before reporting PASS", async () => {
  const f = await fixture(), paused = gate(); f.setReply(paused.wait);
  let settled = false; const pending = runDoctorCli(f.workspace, { liveProbes: true }); void pending.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(paused.entered, pending); await new Promise<void>(done => setImmediate(done)); expect(settled).toBe(false);
    expect(f.requests).toHaveLength(1); const row = f.requests[0]!; expect(row.kind).toBe("MERKLE_ROOT"); expect(row.payload).toHaveLength(32);
    expect(verifyWithKey(row.payload, f.description.publicKeyPem, row.signature)).toBe(true);
    paused.release(); const result = await pending; expect(smoke(result)).toMatchObject({ status: "PASS" });
    expect(result.checks.find(row => row.id === "notary-health")?.status).toBe("PASS"); expect(syncRoute.attempts).toBe(0);
    expect(f.fake.requests.find(row => row.operation === "Sign")?.input).toMatchObject({ MessageType: "RAW", Message: row.payload });
  } finally { paused.release(); await pending.catch(() => {}); }
});

test("default and strict doctor do not sign or contact the configured notary without live consent", async () => {
  const f = await fixture(); for (const strict of [false, true]) {
    const result = await runDoctorCli(f.workspace, { strict }); expect(smoke(result)).toBeUndefined();
    expect(result.checks.find(row => row.id === "notary-live-probes")?.status).toBe("INFO");
  }
  expect(f.requests).toHaveLength(0); expect(f.gets).toHaveLength(0); expect(syncRoute.attempts).toBe(0);
  const config = loadTrustConfig(f.workspace); config.trust.mode = "LOCAL_VAULT"; saveTrust(f.workspace, config);
  expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))).toBeUndefined(); expect(f.requests).toHaveLength(0); expect(f.gets).toHaveLength(0);
});

test.each(["status", "bad-crypto", "wrong-kind", "provider-unavailable"] as const)("actual doctor keeps %s signing refusal distinct from healthy native notary", async mode => {
  const f = await fixture(); if (mode === "provider-unavailable") f.faults.fail = "DisabledException"; else f.setMode(mode);
  const result = await runDoctorCli(f.workspace, { liveProbes: true }); refused(result, f.workspace);
  expect(result.checks.find(row => row.id === "notary-health")?.status).toBe("PASS"); expect(syncRoute.attempts).toBe(0);
  f.faults.fail = undefined; f.setMode("valid"); expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))?.status).toBe("PASS");
});

test("a real missing notary auth secret never renders its private configured ref and restores to a fresh PASS", async () => {
  const f = await fixture(), original = loadTrustConfig(f.workspace), broken = structuredClone(original);
  broken.trust.notary.auth.secretRef = `vault:${f.workspace}/${PRIVATE}`; saveTrust(f.workspace, broken);
  refused(await runDoctorCli(f.workspace, { liveProbes: true }), f.workspace); expect(f.requests).toHaveLength(0);
  saveTrust(f.workspace, original); expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))?.status).toBe("PASS");
});

test.each(["no-sign", "locked"] as const)("actual %s state refuses the signing probe without provider requests and restores", async state => {
  const f = await fixture(); if (state === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
  else { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
  try { refused(await runDoctorCli(f.workspace, { liveProbes: true }), f.workspace); expect(f.requests).toHaveLength(0); }
  finally { vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))?.status).toBe("PASS");
});

test.each(["signed-policy", "no-sign"] as const)("actual %s change during native signing await cannot report a stale PASS", async change => {
  const f = await fixture(), paused = gate(); f.setReply(paused.wait); const original = loadTrustConfig(f.workspace), pending = runDoctorCli(f.workspace, { liveProbes: true });
  try { await reached(paused.entered, pending);
    if (change === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
    else { const candidate = structuredClone(original); candidate.trust.enforcement.notaryMaxClockSkewSeconds++; saveTrust(f.workspace, candidate); }
    paused.release(); refused(await pending, f.workspace);
  } finally { paused.release(); await pending.catch(() => {}); vi.stubEnv("AMC_NO_SIGN", "0"); f.setReply(undefined); saveTrust(f.workspace, original); }
  expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))?.status).toBe("PASS");
});

test("a configured local policy exception uses actual checked file crypto and refuses a vault lock after Sign", async () => {
  const f = await fixture(), config = loadTrustConfig(f.workspace); config.trust.enforcement.requireNotaryFor = [];
  config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; saveTrust(f.workspace, config);
  const provider = loadKeyProvider(f.workspace, "file"), original = provider.sign.bind(provider), paused = gate(), rows: Array<{ bytes: Buffer; signature: Buffer }> = [];
  const spy = vi.spyOn(provider, "sign").mockImplementation(async (ref, bytes) => { const signature = Buffer.from(await original(ref, bytes));
    expect(ref).toEqual({ provider: "file", id: "artifact-seal" }); rows.push({ bytes: Buffer.from(bytes), signature }); await paused.wait(); return signature; });
  const pending = runDoctorCli(f.workspace, { liveProbes: true });
  try { await reached(paused.entered, pending); expect(rows).toHaveLength(1); expect(rows[0]!.bytes).toHaveLength(32);
    expect(verify(null, rows[0]!.bytes, getSigningPublicKeyPem(f.workspace, "artifact-seal"), rows[0]!.signature)).toBe(true);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); paused.release(); refused(await pending, f.workspace); expect(f.requests).toHaveLength(0);
  } finally { paused.release(); await pending.catch(() => {}); spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  expect(smoke(await runDoctorCli(f.workspace, { liveProbes: true }))?.status).toBe("PASS"); expect(f.requests).toHaveLength(0);
});

test("doctor preserves separate failed health and successful checked signing observations", async () => {
  const f = await fixture(); f.setReady(false); const result = await runDoctorCli(f.workspace, { liveProbes: true });
  expect(result.checks.find(row => row.id === "notary-health")?.status).toBe("FAIL"); expect(smoke(result)?.status).toBe("PASS"); expect(result.ok).toBe(false);
});


test("an actual native malformed health response has a fixed safe failure and never becomes a passed health check", async () => {
  const f = await fixture(); f.setBrokenAttestation(true); const result = await runDoctorCli(f.workspace, { liveProbes: true });
  expect(result.checks.find(row => row.id === "notary-health")).toMatchObject({ status: "FAIL", message: "Notary trust checks failed: NOTARY_HEALTH_CHECK_FAILED" });
  expect(smoke(result)?.status).toBe("PASS"); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(PRIVATE);
  f.setBrokenAttestation(false); expect((await runDoctorCli(f.workspace, { liveProbes: true })).checks.find(row => row.id === "notary-health")?.status).toBe("PASS");
});
