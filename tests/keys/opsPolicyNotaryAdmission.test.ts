import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initOpsPolicyAsync, opsPolicyPath, opsPolicySigPath, verifyOpsPolicyBytes, verifyOpsPolicySignature } from "../../src/ops/policy.js";
import { addPublicKeyToHistory, getPublicKeyPem } from "../../src/crypto/keys.js";
import { readHistory } from "../../src/keys/signingKeys.js";
import { describePolicySigner } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const PASS = "ops-notary-history-passphrase", roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks(); for (const close of closers.splice(0)) await close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs();
});
function localFixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-ops-notary-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); return { root, workspace, path: opsPolicyPath(workspace) };
}
function savePolicy(workspace: string, policy: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(policy))), signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigPath(workspace), bytes); writeFileSync(trustConfigSigPath(workspace), JSON.stringify(signed, null, 2));
  expect(verifyTrustConfigSignature(workspace).valid).toBe(true);
}
async function notaryFixture(alreadyLocal = false) {
  const f = localFixture(), id = AWS_ARN(f.root.split(/[/\\]/).at(-1)!), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  if (alreadyLocal) addPublicKeyToHistory(f.workspace, "auditor", description.publicKeyPem, "local", { logRevision: false });
  const requests: Array<{ kind: string; payload: Buffer; lockHeld: boolean }> = [], dispatches: Promise<void>[] = [];
  const server = createServer((req, res) => { const dispatch = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks), config = loadTrustConfig(f.workspace);
    const auth = verifyNotaryRequestAuth({ req, bodyBytes: bytes, secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef),
      headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.writeHead(401); res.end(); return; }
    const parsed = JSON.parse(bytes.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64");
    requests.push({ kind: parsed.kind, payload, lockHeld: existsSync(join(f.workspace, ".amc", ".ops-policy-pair.lock")) });
    const signature = await signChecked(provider, description, payload);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER",
      attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  })(); dispatches.push(dispatch); void dispatch.catch(error => res.destroy(error instanceof Error ? error : undefined)); });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  closers.push(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); await Promise.allSettled(dispatches); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("owned ops notary address unavailable");
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "HARDWARE" });
  const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = ["OPS_POLICY"]; policy.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, policy);
  return { ...f, description, requests };
}

test("actual OPS_POLICY source=notary P256 history remains valid after its signed route selects VAULT", async () => {
  const f = await notaryFixture(); await initOpsPolicyAsync(f.workspace);
  const body = readFileSync(f.path), sidecar = readFileSync(opsPolicySigPath(f.workspace)), signed = JSON.parse(sidecar.toString()), digest = sha256Hex(body);
  expect(f.requests).toEqual([{ kind: "OPS_POLICY", payload: Buffer.from(digest, "hex"), lockHeld: false }]);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), f.description.publicKeyPem, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(signed.envelope.signer.attestationBasis).toEqual(f.description.protectionBasis);
  expect(readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"))?.entries.find(entry => entry.publicKeyPem === f.description.publicKeyPem)?.source).toBe("notary");
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
  const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = []; savePolicy(f.workspace, policy);
  expect(describePolicySigner(f.workspace, "OPS_POLICY").mode).toBe("VAULT"); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
  expect(verifyOpsPolicyBytes(f.workspace, body, sidecar).valid).toBe(true); expect(readFileSync(f.path)).toEqual(body); expect(readFileSync(opsPolicySigPath(f.workspace))).toEqual(sidecar);
  await initOpsPolicyAsync(f.workspace); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true); expect(f.requests).toHaveLength(1);
});

test("an already-local OPS_POLICY notary key is admitted only by its actual current pin and refuses after disabling NOTARY", async () => {
  const f = await notaryFixture(true); await initOpsPolicyAsync(f.workspace);
  expect(readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"))?.entries.find(entry => entry.publicKeyPem === f.description.publicKeyPem)?.source).toBe("local");
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
  const body = readFileSync(trustConfigPath(f.workspace)), sidecar = readFileSync(trustConfigSigPath(f.workspace)), policy = loadTrustConfig(f.workspace);
  try { policy.trust.mode = "LOCAL_VAULT"; savePolicy(f.workspace, policy); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(trustConfigPath(f.workspace), body); writeFileSync(trustConfigSigPath(f.workspace), sidecar); }
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
});

test("a current pin selected only for COMPLIANCE_MAPS cannot admit ambiguous OPS_POLICY NOTARY history", async () => {
  const f = await notaryFixture(true); await initOpsPolicyAsync(f.workspace);
  const signed = JSON.parse(readFileSync(opsPolicySigPath(f.workspace), "utf8")), digest = sha256Hex(readFileSync(f.path));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), f.description.publicKeyPem, Buffer.from(signed.signature, "base64"))).toBe(true);
  const body = readFileSync(trustConfigPath(f.workspace)), sidecar = readFileSync(trustConfigSigPath(f.workspace)), policy = loadTrustConfig(f.workspace);
  try {
    policy.trust.enforcement.requireNotaryFor = ["COMPLIANCE_MAPS"]; savePolicy(f.workspace, policy);
    expect(describePolicySigner(f.workspace, "COMPLIANCE_MAPS").mode).toBe("NOTARY"); expect(describePolicySigner(f.workspace, "OPS_POLICY").mode).toBe("VAULT");
    expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false);
  } finally { writeFileSync(trustConfigPath(f.workspace), body); writeFileSync(trustConfigSigPath(f.workspace), sidecar); }
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
});

test("raw-valid ordinary config bytes relabelled NOTARY cannot use the different actual OPS_POLICY notary pin", async () => {
  const f = await notaryFixture(); await initOpsPolicyAsync(f.workspace); const original = readFileSync(opsPolicySigPath(f.workspace)), digest = sha256Hex(readFileSync(f.path));
  const wrong = signDigestWithVault({ workspace: f.workspace, kind: "OPS_POLICY", digestHex: digest });
  expect(wrong.envelope!.fingerprint).not.toBe(f.description.keyId);
  expect(verifyCanonical("ed25519", Buffer.from(digest, "hex"), Buffer.from(wrong.envelope!.pubkeyB64, "base64").toString("utf8"), Buffer.from(wrong.signature, "base64"))).toBe(true);
  wrong.envelope!.signer = { ...wrong.envelope!.signer, type: "NOTARY", notaryFingerprint: wrong.envelope!.fingerprint };
  try { writeFileSync(opsPolicySigPath(f.workspace), JSON.stringify(wrong)); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(opsPolicySigPath(f.workspace), original); }
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true); expect(f.requests).toHaveLength(1);
});

test("OPS_POLICY byte verification retains missing digest invalid diagnostics and never reopens the captured body", async () => {
  const f = localFixture(); await initOpsPolicyAsync(f.workspace);
  const body = readFileSync(f.path), sidecar = readFileSync(opsPolicySigPath(f.workspace)), base = { path: f.path, sigPath: opsPolicySigPath(f.workspace) };
  expect(verifyOpsPolicyBytes(f.workspace, null, sidecar)).toEqual({ ...base, valid: false, signatureExists: false, reason: "ops policy missing" });
  expect(verifyOpsPolicyBytes(f.workspace, body, null)).toEqual({ ...base, valid: false, signatureExists: false, reason: "ops policy signature missing" });
  expect(verifyOpsPolicyBytes(f.workspace, Buffer.concat([body, Buffer.from("\n")]), sidecar)).toEqual({ ...base, valid: false, signatureExists: true, reason: "digest mismatch" });
  expect(verifyOpsPolicyBytes(f.workspace, body, Buffer.from("{malformed JSON"))).toEqual({ ...base, valid: false, signatureExists: true, reason: "invalid ops policy signature" });
  writeFileSync(f.path, Buffer.concat([body, Buffer.from("\n")]));
  try { expect(verifyOpsPolicyBytes(f.workspace, body, sidecar)).toEqual({ ...base, valid: true, signatureExists: true, reason: null }); expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(f.path, body); }
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
});
