import { randomUUID, sign, verify } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { signatureEnvelopeSchema, verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { defaultOpsPolicy, initOpsPolicy, initOpsPolicyAsync, loadOpsPolicy, opsPolicyPath, opsPolicySigPath, signOpsPolicy, signOpsPolicyAsync,
  verifyOpsPolicySignature, verifyOpsPolicyBytes, OpsPolicyPublicationError } from "../../src/ops/policy.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { setMode } from "../../src/mode/mode.js";
import { handleComplianceRoute } from "../../src/api/complianceRouter.js";
import { runBootstrap } from "../../src/bootstrap/bootstrap.js";
import { runStudioForeground } from "../../src/studio/studioSupervisor.js";
import { activeUserRecord, createSession, initUsersConfig, revokeSessionByToken, verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, failRenameTo: "", renameCause: new Error("owned sidecar IO failure") }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
// An owned second-rename fault only; the first body rename and all normal I/O are real.
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: (from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]) => {
    if (String(to) === boundary.failRenameTo) throw boundary.renameCause; return actual.renameSync(from, to);
  } };
});
const PASS = "owned-ops-policy-passphrase", roots: Array<{ root: string; workspace: string }> = [], servers: Server[] = [];
afterEach(async () => {
  boundary.failRenameTo = "";
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  boundary.call = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-ops-pair-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const { owner } = initUsersConfig({ workspace, username: "ops-owner", password: "owned-ops-password" }), session = createSession({ workspace, user: owner });
  return { root, workspace, session, body: opsPolicyPath(workspace), signature: opsPolicySigPath(workspace), provider: loadKeyProvider(workspace, "file") };
}
type Fixture = ReturnType<typeof fixture>;
const pair = (f: Fixture) => ({ body: readFileSync(f.body), signature: readFileSync(f.signature) });
function restore(f: Fixture, before: ReturnType<typeof pair>) { writeFileSync(f.body, before.body); writeFileSync(f.signature, before.signature); }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: Fixture) { const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider);
  vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = await original(ref, bytes); entered.resolve(); await release.promise; return signature; }); return { entered, release }; }
async function atPause(p: { entered: ReturnType<typeof deferred> }, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([p.entered.promise, pending.then(() => { throw new Error("ops settled before real Sign pause"); }, error => { throw error; }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ops never reached actual Sign")), 5_000); })]); } finally { clearTimeout(timer); }
}
function math(f: Fixture, pem = getSigningPublicKeyPem(f.workspace, "config-signature")) {
  const bytes = pair(f), record = JSON.parse(bytes.signature.toString()), digest = sha256Hex(bytes.body);
  expect(record.digestSha256).toBe(digest); expect(record.signature).toBe(record.envelope.sigB64);
  expect(verifySignatureEnvelope(digest, record.envelope, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(true);
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true); return record;
}
function saveTrust(f: Fixture, config: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(config)); writeFileSync(trustConfigPath(f.workspace), bytes);
  writeFileSync(trustConfigSigPath(f.workspace), JSON.stringify(signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) }), null, 2));
  expect(verifyTrustConfigSignature(f.workspace).valid).toBe(true);
}
async function positive(f: Fixture) { await initOpsPolicyAsync(f.workspace); return math(f); }
async function bind(f: Fixture) {
  const id = AWS_ARN("owned-ops-" + randomUUID()), key = fakeKey("p256"), other = fakeKey("p256"), fake = awsFake({ [id]: key });
  const control: { afterSign?: () => Promise<void>; fail?: "unavailable" | "bad-signature" } = {};
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.fail === "unavailable") throw Object.assign(new Error("secret https://private.invalid PIN=never"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") { if (control.fail === "bad-signature") answer.Signature = sign("sha256", input.Message as Uint8Array, other.privateKey); await control.afterSign?.(); }
    return answer;
  };
  const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
  config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  await transitionConfigSignatureProvider(f.workspace, Buffer.from(YAML.stringify(config)), { passphrase: PASS });
  const pause = () => { const entered = deferred(), release = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await release.promise; }; return { entered, release }; };
  return { ...f, id, key, fake, control, pause, pem: publicPem(key) };
}
async function http(f: Fixture, trusted: boolean) {
  const server = createServer((req, res) => {
    const token = String(req.headers["x-owned-session"] ?? ""), authority = () => {
      const checked = verifyTrackedSessionToken({ workspace: f.workspace, token }), user = checked.payload ? activeUserRecord(f.workspace, checked.payload.userId) : null;
      return checked.ok && user !== null && user.roles.includes("OWNER");
    };
    void (async () => { for await (const _chunk of req) { /* drain request bytes; no body field supplies authority */ }
      if (!authority()) { res.writeHead(401); res.end("owned auth refused"); return; }
      await handleComplianceRoute("/api/v1/policy/ops/init", req.method ?? "POST", req, res, f.workspace, trusted ? authority : undefined);
    })().catch(() => { if (!res.headersSent) { res.writeHead(500); res.end("owned route failed"); } });
  });
  servers.push(server); await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address();
  if (!address || typeof address === "string") throw new Error("owned server has no port");
  return { post: async () => { const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/policy/ops/init`, { method: "POST", headers: {
    "content-type": "application/json", "x-owned-session": f.session.token }, body: JSON.stringify({ revalidateAuthority: false, beforePublish: "untrusted request" }) });
    return { status: response.status, body: await response.json() as { error?: string } }; } };
}

describe("actual async OPS_POLICY config-purpose pair publication", () => {
  test("fresh synchronous workspace bootstrap and async initialization preserve independent default YAML and envelope bytes", async () => {
    const f = fixture(), now = Date.now(), privateKey = getSigningKey(f.workspace, "config-signature"), pem = getSigningPublicKeyPem(f.workspace, "config-signature");
    vi.spyOn(Date, "now").mockReturnValue(now); const expectedBody = YAML.stringify(defaultOpsPolicy()); initOpsPolicy(f.workspace); const legacy = pair(f);
    const spy = vi.spyOn(f.provider, "sign"); await initOpsPolicyAsync(f.workspace); expect(pair(f)).toEqual(legacy); expect(legacy.body.toString()).toBe(expectedBody);
    const digest = sha256Hex(legacy.body), signature = sign(null, Buffer.from(digest, "hex"), privateKey).toString("base64");
    const envelope = { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(pem), sigB64: signature, signedTs: now,
      signer: { type: "VAULT", attestationLevel: "SOFTWARE" } };
    expect(legacy.signature.toString()).toBe(JSON.stringify({ digestSha256: digest, signature, signedTs: now, signer: "auditor", envelope }, null, 2));
    expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64"))).toBe(true); math(f);
    expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "config-signature" }); expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(digest, "hex"));
  });
  test("the actual owner-bound P256 config provider signs the policy and the public verifier admits its exact purpose", async () => {
    const f = await bind(fixture()), before = f.fake.requests.length; await initOpsPolicyAsync(f.workspace); const record = math(f, f.pem);
    expect(record.envelope.alg).toBe("ecdsa-p256-sha256"); expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(record.digestSha256, "hex"), f.pem, Buffer.from(record.signature, "base64"))).toBe(true);
    const requests = f.fake.requests.slice(before).filter(row => row.operation === "Sign"); expect(requests).toHaveLength(1);
    expect(requests[0]!.input.MessageType).toBe("RAW"); expect(Buffer.from(requests[0]!.input.Message as Uint8Array)).toEqual(Buffer.from(record.digestSha256, "hex"));
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).toContain(f.pem);
  });
  test("awaits actual Sign with no pair lock or publication and retains the old pair", async () => {
    const f = fixture(), before = pair(f), p = pause(f), pending = initOpsPolicyAsync(f.workspace);
    try { await atPause(p, pending); expect(pair(f)).toEqual(before); expect(existsSync(join(f.workspace, ".amc", ".ops-policy-pair.lock"))).toBe(false); p.release.resolve(); await pending; math(f); }
    finally { p.release.resolve(); await Promise.allSettled([pending]); }
  });
  test.each(["body", "signature"] as const)("refuses exact %s drift during Sign and preserves the competing pair", async member => {
    const f = fixture(), before = pair(f), p = pause(f), pending = signOpsPolicyAsync(f.workspace), outcome = pending.then(() => null, error => error);
    try { await atPause(p, pending); if (member === "body") { writeFileSync(f.body, before.body.toString() + "\n# independently edited policy\n"); signOpsPolicy(f.workspace); }
      else writeFileSync(f.signature, before.signature.toString() + "\n ");
      expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true); const competing = pair(f); p.release.resolve(); expect(await outcome).toMatchObject({ message: expect.stringContaining("ops policy or signature changed") }); expect(pair(f)).toEqual(competing);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    await signOpsPolicyAsync(f.workspace); math(f);
  });
  test("two real initializers of an absent pair cannot overwrite the first committed pair", async () => {
    const f = fixture(); unlinkSync(f.body); unlinkSync(f.signature); const p = pause(f), pending = initOpsPolicyAsync(f.workspace, { onlyIfMissing: true }), outcome = pending.then(() => null, error => error);
    try { await atPause(p, pending); initOpsPolicy(f.workspace); writeFileSync(f.body, readFileSync(f.body, "utf8") + "\n# competing initializer\n"); signOpsPolicy(f.workspace);
      const competing = pair(f); math(f); p.release.resolve(); expect(await outcome).toMatchObject({ message: expect.stringContaining("changed while signing") }); expect(pair(f)).toEqual(competing);
    } finally { p.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });
  test("final producer gate refuses an unrelated full-generation change after the checked signer returns", async () => {
    const f = fixture(), before = pair(f); let callbacks = 0;
    await expect(initOpsPolicyAsync(f.workspace, { beforePublish: () => { if (++callbacks === 2) rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS }); } })).rejects.toThrow("committed purpose authority changed");
    expect(callbacks).toBe(2); expect(pair(f)).toEqual(before); await positive(f);
  });
  test("final producer gate compares the complete authenticated policy after the checked signer returns", async () => {
    const f = fixture(), before = pair(f), original = loadTrustConfig(f.workspace); let callbacks = 0;
    try { await expect(initOpsPolicyAsync(f.workspace, { beforePublish: () => { if (++callbacks === 2) { const next = structuredClone(original); next.trust.enforcement.notaryMaxClockSkewSeconds += 1; saveTrust(f, next); } } })).rejects.toThrow("signing policy changed");
      expect(callbacks).toBe(2); expect(pair(f)).toEqual(before);
    } finally { saveTrust(f, original); } await positive(f);
  });
  test("final producer gate refuses a real vault lock after the checked signer returns", async () => {
    const f = fixture(), before = pair(f); let callbacks = 0;
    try { await expect(initOpsPolicyAsync(f.workspace, { beforePublish: () => { if (++callbacks === 2) { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); } } })).rejects.toThrow(/Vault locked|Vault is locked|vault is locked/); expect(pair(f)).toEqual(before); }
    finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });
  test.each(["entry", "final"] as const)("uses the actual ops init owner-mode key at %s", async phase => {
    const f = fixture(), before = pair(f), spy = vi.spyOn(f.provider, "sign"); let callbacks = 0;
    if (phase === "entry") setMode(f.workspace, "agent");
    try { await expect(initOpsPolicyAsync(f.workspace, { beforePublish: () => { if (++callbacks === 2 && phase === "final") setMode(f.workspace, "agent"); } })).rejects.toThrow(/ops init.*owner|owner.*ops init|blocked.*agent/i); expect(pair(f)).toEqual(before); if (phase === "entry") expect(spy).not.toHaveBeenCalled(); }
    finally { setMode(f.workspace, "owner"); }
    await positive(f);
  });
  test("initial and post-Sign no-sign refuse without replacing the owned pair", async () => {
    const f = fixture(), before = pair(f), spy = vi.spyOn(f.provider, "sign"); vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(initOpsPolicyAsync(f.workspace)).rejects.toThrow("no-sign mode"); expect(spy).not.toHaveBeenCalled(); expect(pair(f)).toEqual(before); vi.stubEnv("AMC_NO_SIGN", "0");
    let callbacks = 0; try { await expect(initOpsPolicyAsync(f.workspace, { beforePublish: () => { if (++callbacks === 2) vi.stubEnv("AMC_NO_SIGN", "1"); } })).rejects.toThrow("no-sign mode"); expect(pair(f)).toEqual(before); }
    finally { vi.stubEnv("AMC_NO_SIGN", "0"); } await positive(f);
  });
  test("a real second-rename failure reports partial publication and retains its nonpublic cause", async () => {
    const f = fixture(); writeFileSync(f.body, readFileSync(f.body, "utf8") + "\n# previously edited\n"); signOpsPolicy(f.workspace); const before = pair(f);
    boundary.failRenameTo = f.signature; boundary.renameCause = new Error("owned secret sidecar failure " + f.signature);
    try { const error = await initOpsPolicyAsync(f.workspace).then(() => null, error => error);
      expect(error).toBeInstanceOf(OpsPolicyPublicationError); expect(error).toMatchObject({ code: "OPS_POLICY_PARTIAL", publishedPaths: [".amc/ops-policy.yaml"], cause: boundary.renameCause });
      expect(error.message).not.toContain(f.workspace); expect(readFileSync(f.body, "utf8")).toBe(YAML.stringify(defaultOpsPolicy())); expect(readFileSync(f.signature)).toEqual(before.signature); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false);
    } finally { boundary.failRenameTo = ""; restore(f, before); } await positive(f);
  });
  test("retained synchronous initialization refuses a held config key before touching either member", async () => {
    const f = await bind(fixture()), before = pair(f); expect(() => initOpsPolicy(f.workspace)).toThrow("KEY_PROVIDER_HELD"); expect(pair(f)).toEqual(before);
    await initOpsPolicyAsync(f.workspace); math(f, f.pem);
  });
  test("captured pair verification reads only its received bytes and the current exact authority", async () => {
    const f = await bind(fixture()); await initOpsPolicyAsync(f.workspace); const captured = pair(f); math(f, f.pem);
    writeFileSync(f.body, captured.body.toString() + "\n# later source edit\n");
    try { expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); expect(verifyOpsPolicyBytes(f.workspace, captured.body, captured.signature).valid).toBe(true); }
    finally { restore(f, captured); } math(f, f.pem);
  });
  test("mature bootstrap validates its existing passphrase gate before a missing-pair provider request", async () => {
    const f = await bind(fixture()); unlinkSync(f.body); unlinkSync(f.signature); lockVault(f.workspace);
    const before = f.fake.requests.filter(row => row.operation === "Sign").length;
    const error = await runBootstrap({ workspace: f.workspace, vaultPassphrase: "owned-wrong-passphrase", ownerUsername: null, ownerPassword: null,
      lanMode: false, bind: "127.0.0.1", studioPort: 0, allowedCidrs: [], enableNotary: false, notaryBaseUrl: "http://127.0.0.1:1", notaryRequiredAttestation: "SOFTWARE", notaryAuthSecret: null }).then(() => null, error => error);
    expect(error).toBeInstanceOf(Error); expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before); expect(existsSync(f.body)).toBe(false); expect(existsSync(f.signature)).toBe(false);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); await initOpsPolicyAsync(f.workspace); math(f, f.pem);
  });
  test("mature supervisor validates its existing unlock gate before a missing-pair provider request", async () => {
    const f = await bind(fixture()); unlinkSync(f.body); unlinkSync(f.signature); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    const before = f.fake.requests.filter(row => row.operation === "Sign").length;
    let runtime: Awaited<ReturnType<typeof runStudioForeground>> | undefined;
    try { const error = await runStudioForeground({ workspace: f.workspace, apiPort: 0, gatewayPort: 0, proxyPort: 0, dashboardPort: 0, metricsPort: 0 }).then(value => { runtime = value; return null; }, error => error);
      expect(error).toMatchObject({ message: expect.stringMatching(/Vault locked|Vault is locked|vault is locked/) });
      expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before); expect(existsSync(f.body)).toBe(false); expect(existsSync(f.signature)).toBe(false);
    } finally { await runtime?.stop(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); } await initOpsPolicyAsync(f.workspace); math(f, f.pem);
  });
  test("signAsync preserves caller-edited YAML bytes including comments", async () => {
    const f = fixture(), bytes = Buffer.from(readFileSync(f.body, "utf8") + "\n# preserved caller input\n"); writeFileSync(f.body, bytes);
    await signOpsPolicyAsync(f.workspace); expect(readFileSync(f.body)).toEqual(bytes); math(f); expect(loadOpsPolicy(f.workspace)).toEqual(defaultOpsPolicy());
  });
});

describe("actual ops-policy purpose and maintained HTTP boundaries", () => {
  test("refuses a distinct artifact-purpose signature without broad auditor-history fallback", async () => {
    const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS }); await positive(f); const before = pair(f);
    const pem = getSigningPublicKeyPem(f.workspace, "artifact-seal"); expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(pem);
    const signed = signDigestWithVault({ workspace: f.workspace, kind: "BOM", digestHex: sha256Hex(before.body) });
    expect(verifySignatureEnvelope(signed.digestSha256, signed.envelope!, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(true);
    try { writeFileSync(f.signature, JSON.stringify(signed, null, 2)); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); } finally { restore(f, before); }
    math(f);
  });
  test("preserves explicit authenticated unbound legacy import while locked", () => {
    const f = fixture(), key = fakeKey("ed25519"), pem = publicPem(key), before = pair(f); addPublicKeyToHistory(f.workspace, "auditor", pem, "imported");
    const digest = sha256Hex(before.body), signature = sign(null, Buffer.from(digest, "hex"), key.privateKey).toString("base64");
    writeFileSync(f.signature, JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" }, null, 2));
    try { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64"))).toBe(true); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true); }
    finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); restore(f, before); }
    math(f);
  });
  test.each(["missing", "corrupt"] as const)("default mathematically valid ops signature still refuses a %s legacy alias", mode => {
    const f = fixture(), alias = join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), bytes = readFileSync(alias), record = math(f);
    if (mode === "missing") unlinkSync(alias); else writeFileSync(alias, publicPem(fakeKey("ed25519")));
    try { expect(verify(null, Buffer.from(record.digestSha256, "hex"), bytes.toString(), Buffer.from(record.signature, "base64"))).toBe(true); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); }
    finally { writeFileSync(alias, bytes); } math(f);
  });
  test("carried NOTARY relabeling cannot authorize the existing vault signature", () => {
    const f = fixture(), before = pair(f), signed = JSON.parse(before.signature.toString()); signed.envelope.signer.type = "NOTARY"; signed.envelope.signer.notaryFingerprint = signed.envelope.fingerprint;
    signatureEnvelopeSchema.parse(signed.envelope); expect(verifySignatureEnvelope(signed.digestSha256, signed.envelope, { trustedPublicKeys: [getSigningPublicKeyPem(f.workspace, "config-signature")], requireTrustedKey: true })).toBe(true);
    try { writeFileSync(f.signature, JSON.stringify(signed, null, 2)); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); } finally { restore(f, before); } math(f);
  });
  test("actual trusted local HTTP awaits real config-provider signing; absent callback remains synchronous and cannot trust body fields", async () => {
    const f = await bind(fixture()), trusted = await http(f, true); expect((await trusted.post()).status).toBe(201); math(f, f.pem);
    const absent = await http(f, false), before = pair(f), response = await absent.post(); expect(response.status).toBe(409); expect(response.body.error).toContain("KEY_PROVIDER_HELD"); expect(pair(f)).toEqual(before);
  });
  test("actual trusted HTTP refuses a tracked session revoked during Sign before pair publication", async () => {
    const f = await bind(fixture()), server = await http(f, true), before = pair(f), p = f.pause(), pending = server.post();
    try { await atPause(p, pending); revokeSessionByToken({ workspace: f.workspace, token: f.session.token }); p.release.resolve(); expect((await pending).status).toBe(403); expect(pair(f)).toEqual(before); }
    finally { p.release.resolve(); await Promise.allSettled([pending]); } await initOpsPolicyAsync(f.workspace); math(f, f.pem);
  });
  test.each([["unavailable", 503], ["bad-signature", 409]] as const)("actual HTTP maps %s without provider secrets or pair changes", async (failure, status) => {
    const f = await bind(fixture()), server = await http(f, true), before = pair(f); f.control.fail = failure;
    const result = await server.post(); expect(result.status).toBe(status); expect(JSON.stringify(result.body)).not.toContain("private.invalid"); expect(JSON.stringify(result.body)).not.toContain(f.root); expect(pair(f)).toEqual(before);
    f.control.fail = undefined; expect((await server.post()).status).toBe(201); math(f, f.pem);
  });
});
