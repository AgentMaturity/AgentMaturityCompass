import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initComplianceMapsAsync, verifyComplianceMapsSignature } from "../../src/compliance/complianceEngine.js";
import { addPublicKeyToHistory, getPublicKeyPem } from "../../src/crypto/keys.js";
import { readHistory } from "../../src/keys/signingKeys.js";
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

const PASS = "maps-notary-purpose-passphrase", roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks(); for (const close of closers.splice(0)) await close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs();
});
function savePolicy(workspace: string, policy: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(policy))), signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigPath(workspace), bytes); writeFileSync(trustConfigSigPath(workspace), JSON.stringify(signed, null, 2));
  expect(verifyTrustConfigSignature(workspace).valid).toBe(true);
}
async function fixture(alreadyLocal = false) {
  const root = mkdtempSync(join(tmpdir(), "amc-maps-notary-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const id = AWS_ARN(root.split(/[/\\]/).at(-1)!), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  if (alreadyLocal) addPublicKeyToHistory(workspace, "auditor", description.publicKeyPem, "local", { logRevision: false });
  const requests: Array<{ kind: string; payload: Buffer; lockHeld: boolean }> = [], pending: Promise<void>[] = [];
  const server = createServer((req, res) => { const dispatch = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks), config = loadTrustConfig(workspace);
    const auth = verifyNotaryRequestAuth({ req, bodyBytes: bytes, secret: resolveNotaryAuthSecret(workspace, config.trust.notary.auth.secretRef),
      headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.writeHead(401); res.end(); return; }
    const parsed = JSON.parse(bytes.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64");
    requests.push({ kind: parsed.kind, payload, lockHeld: existsSync(join(workspace, ".amc", ".compliance-maps-pair.lock")) });
    const signature = await signChecked(provider, description, payload);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER",
      attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  })(); pending.push(dispatch); void dispatch.catch(error => res.destroy(error instanceof Error ? error : undefined)); });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  closers.push(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); await Promise.allSettled(pending); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("owned maps notary address unavailable");
  await enableNotaryTrust({ workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "HARDWARE" });
  const policy = loadTrustConfig(workspace); policy.trust.enforcement.requireNotaryFor = ["COMPLIANCE_MAPS"]; policy.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(workspace, policy);
  return { root, workspace, path: join(workspace, ".amc", "compliance-maps.yaml"), description, requests };
}

test("actual authenticated P256 notary maps retain source=notary historical admission after the signed policy selects VAULT", async () => {
  const f = await fixture(); await initComplianceMapsAsync(f.workspace);
  const body = readFileSync(f.path), sidecar = readFileSync(f.path + ".sig"), signed = JSON.parse(sidecar.toString()), digest = sha256Hex(body);
  expect(f.requests).toEqual([{ kind: "COMPLIANCE_MAPS", payload: Buffer.from(digest, "hex"), lockHeld: false }]);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), f.description.publicKeyPem, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(signed.envelope.signer.attestationBasis).toEqual(f.description.protectionBasis);
  expect(readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"))?.entries.find(entry => entry.publicKeyPem === f.description.publicKeyPem)?.source).toBe("notary");
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
  const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = []; savePolicy(f.workspace, policy);
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true); expect(readFileSync(f.path)).toEqual(body); expect(readFileSync(f.path + ".sig")).toEqual(sidecar);
  await initComplianceMapsAsync(f.workspace); expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true); expect(f.requests).toHaveLength(1);
});

test("current maps kind pin admits an already-local notary key but disabling it refuses the ambiguous historical label", async () => {
  const f = await fixture(true); await initComplianceMapsAsync(f.workspace);
  expect(readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"))?.entries.find(entry => entry.publicKeyPem === f.description.publicKeyPem)?.source).toBe("local");
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
  const body = readFileSync(trustConfigPath(f.workspace)), sidecar = readFileSync(trustConfigSigPath(f.workspace)), policy = loadTrustConfig(f.workspace);
  try {
    policy.trust.enforcement.requireNotaryFor = ["BUNDLE"]; savePolicy(f.workspace, policy);
    expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(false);
  } finally { writeFileSync(trustConfigPath(f.workspace), body); writeFileSync(trustConfigSigPath(f.workspace), sidecar); }
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
});

test("a real ordinary config signature relabelled NOTARY is refused while an actual different notary is selected for maps", async () => {
  const f = await fixture(); await initComplianceMapsAsync(f.workspace); const original = readFileSync(f.path + ".sig"), digest = sha256Hex(readFileSync(f.path));
  const wrong = signDigestWithVault({ workspace: f.workspace, kind: "COMPLIANCE_MAPS", digestHex: digest });
  expect(verifyCanonical("ed25519", Buffer.from(digest, "hex"), Buffer.from(wrong.envelope!.pubkeyB64, "base64").toString("utf8"), Buffer.from(wrong.signature, "base64"))).toBe(true);
  wrong.envelope!.signer = { ...wrong.envelope!.signer, type: "NOTARY", notaryFingerprint: wrong.envelope!.fingerprint };
  try { writeFileSync(f.path + ".sig", JSON.stringify(wrong)); expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(f.path + ".sig", original); }
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
});

test("a pin selected only for another kind does not admit an ambiguous local-history maps NOTARY label", async () => {
  const f = await fixture(true); await initComplianceMapsAsync(f.workspace);
  const signed = JSON.parse(readFileSync(f.path + ".sig", "utf8")), digest = sha256Hex(readFileSync(f.path));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), f.description.publicKeyPem, Buffer.from(signed.signature, "base64"))).toBe(true);
  const body = readFileSync(trustConfigPath(f.workspace)), sidecar = readFileSync(trustConfigSigPath(f.workspace)), policy = loadTrustConfig(f.workspace);
  try { policy.trust.enforcement.requireNotaryFor = ["BUNDLE"]; savePolicy(f.workspace, policy); expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(false); }
  finally { writeFileSync(trustConfigPath(f.workspace), body); writeFileSync(trustConfigSigPath(f.workspace), sidecar); }
  expect(verifyComplianceMapsSignature(f.workspace).valid).toBe(true);
});
