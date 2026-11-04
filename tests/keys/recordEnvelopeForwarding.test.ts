import { createECDH, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { addPublicKeyToHistory, getPublicKeyHistory } from "../../src/crypto/keys.js";
import { verifySignedDigest } from "../../src/crypto/signing/signer.js";
import type { SignedDigest } from "../../src/crypto/signing/signerTypes.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { buildIndustryPackAudit, signIndustryPackAudit, verifyIndustryPackAuditChecksum, verifyIndustryPackAuditSignature } from "../../src/domains/industryPackAudit.js";
import { getPackById } from "../../src/domains/industryPacks.js";
import { readSignedControlResults, writeSignedControlResults } from "../../src/catalog/evidence/signedResults.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { workspaceKeyPem, workspaceKeyTrust } from "../helpers/trustContext.js";

const roots: string[] = [];
const fresh = () => { const root = mkdtempSync(join(tmpdir(), "amc-record-envelope-")); roots.push(root); return root; };
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

test("industry audit's public verifier honors envelope semantics while its outer checksum and raw signature remain valid", () => {
  const workspace = fresh(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const publicKeyPem = workspaceKeyPem(workspace, "auditor"); const trust = workspaceKeyTrust(workspace);
  const pack = getPackById("clinical-trials"); expect(pack).not.toBeNull(); if (!pack) throw new Error("owned clinical-trials fixture is required");
  const unsigned = buildIndustryPackAudit({ pack, now: Date.now(), responses: Object.fromEntries(pack.questions.map(question => [question.id, 3])) });
  const signed = signIndustryPackAudit(workspace, unsigned); expect(signed.signature?.envelope).toBeDefined();
  expect(verifyIndustryPackAuditSignature(signed, { trust }).ok).toBe(true);
  expect(verify(null, Buffer.from(signed.signature!.digestSha256, "hex"), publicKeyPem, Buffer.from(signed.signature!.signature, "base64"))).toBe(true);
  const bad = { ...signed, signature: { ...signed.signature!, envelope: { ...signed.signature!.envelope!, fingerprint: "0".repeat(64) } } };
  expect(verifyIndustryPackAuditChecksum(bad)).toBe(true); // Envelope metadata is outside this checksum and its signed preimage.
  const denied = verifyIndustryPackAuditSignature(bad, { trust });
  expect(denied.ok).toBe(false); expect(denied.signatureOk).toBe(false); expect(denied.report.integrity.status).toBe("fail");
  expect(denied.errors.some(error => error.code === "SIGNATURE_INVALID")).toBe(true);
  const { envelope: _absent, ...legacy } = signed.signature!;
  expect(verifyIndustryPackAuditSignature({ ...signed, signature: legacy }, { trust, publicKeyPem }).ok).toBe(true);
});

const ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const mod = (value: bigint) => (value % ORDER + ORDER) % ORDER;
function inverse(value: bigint): bigint {
  let a = mod(value), b = ORDER, x = 1n, y = 0n;
  while (b !== 0n) { const quotient = a / b; [a, b] = [b, a - quotient * b]; [x, y] = [y, x - quotient * y]; }
  if (a !== 1n) throw new Error("test scalar has no inverse");
  return mod(x);
}
const scalarBytes = (value: bigint) => Buffer.from(value.toString(16).padStart(64, "0"), "hex");

/**
 * Fixture-only ECDSA key ambiguity, proved independently with OpenSSL below, not a production crypto implementation.
 * For a signature (r,s) by scalar d over z = SHA256(message), d' = -d - 2*z/r mod n verifies the same signature with
 * nonce point -R. Node's standard ECDH derives d'G; Node verify proves both distinct keys accept these exact bytes.
 */
function ambiguousSignature(message: Buffer) {
  const primary = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const primaryPem = primary.publicKey.export({ format: "pem", type: "spki" }).toString();
  const signature = lowS(sign("sha256", message, { key: primary.privateKey, dsaEncoding: "ieee-p1363" }));
  const jwk = primary.privateKey.export({ format: "jwk" }); if (!jwk.d) throw new Error("owned fixture scalar missing");
  const d = BigInt(`0x${Buffer.from(jwk.d, "base64url").toString("hex")}`);
  const r = BigInt(`0x${signature.subarray(0, 32).toString("hex")}`); const z = BigInt(`0x${sha256Hex(message)}`);
  const alternateScalar = mod(-d - 2n * z * inverse(r)); expect(alternateScalar).toBeGreaterThan(0n);
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(scalarBytes(alternateScalar));
  // Standard id-ecPublicKey / prime256v1 SPKI followed by the uncompressed point derived by Node.
  const alternatePem = createPublicKey({ key: Buffer.concat([Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"), ecdh.getPublicKey()]),
    format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
  expect(signingKeyId(alternatePem)).not.toBe(signingKeyId(primaryPem));
  for (const pem of [primaryPem, alternatePem]) expect(verify("sha256", message, { key: pem, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
  return { primaryPem, alternatePem, signature: signature.toString("base64") };
}

test("catalog admission identifies the envelope signer after core verification, not another raw-verifying candidate", () => {
  const workspace = fresh(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const auditorPem = workspaceKeyPem(workspace, "auditor");
  const expectedBytes = Buffer.from("[]\n"); const digest = sha256Hex(expectedBytes);
  // Both owned keys, the message, signature, and operator trust are fixed BEFORE creating/reading the public artifact.
  const pair = ambiguousSignature(Buffer.from(digest, "hex"));
  const primaryId = signingKeyId(pair.primaryPem)!, alternateId = signingKeyId(pair.alternatePem)!;
  addPublicKeyToHistory(workspace, "auditor", pair.alternatePem, "imported", { logRevision: false });
  addPublicKeyToHistory(workspace, "auditor", pair.primaryPem, "imported", { logRevision: false });
  const history = getPublicKeyHistory(workspace, "auditor"); expect(history.indexOf(pair.alternatePem)).toBeLessThan(history.indexOf(pair.primaryPem));
  const home = fresh(); mkdirSync(join(home, "trust")); vi.stubEnv("AMC_HOME", home);
  const root = generateKeyPairSync("ed25519"); const rootPem = root.publicKey.export({ format: "pem", type: "spki" }).toString();
  const now = Date.now();
  const entries = [{ pem: auditorPem, algorithm: "ed25519" as const }, { pem: pair.alternatePem, algorithm: "ecdsa-p256-sha256" as const }]
    .map(owner => ({ keyId: signingKeyId(owner.pem)!, algorithm: owner.algorithm, publicKeyPem: owner.pem, purposes: ["artifact-seal" as const],
      subject: "owned test signer", validFrom: new Date(now - 60_000).toISOString(), validTo: null, source: "operator" }));
  const list = signTrustList({ type: "amc.trust-list", version: 1, listId: "owned-catalog-envelope", sequence: 1,
    issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString(), entries,
    distrust: [{ keyId: primaryId, distrustedFrom: null, reason: "key-compromise", note: "synthetic refused envelope signer", source: "test operator" }] },
  root.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  writeFileSync(join(home, "trust", "amc-trust-list.json"), JSON.stringify(list));
  writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [signingKeyId(rootPem)!] }));
  expect(loadTrustContext().distrust.some(row => row.keyId === primaryId)).toBe(true);
  const created = writeSignedControlResults(workspace, "results.json", []);
  expect(readFileSync(created.path)).toEqual(expectedBytes); expect(created.digestSha256).toBe(digest);
  expect(readSignedControlResults(workspace, "results.json").admission.keyId).toBe(signingKeyId(auditorPem));
  const signed: SignedDigest = { digestSha256: digest, signature: pair.signature, signedTs: now, signer: "auditor", envelope: {
    v: 1, alg: "ecdsa-p256-sha256", pubkeyB64: Buffer.from(pair.primaryPem).toString("base64"), fingerprint: primaryId, sigB64: pair.signature, signedTs: now,
    signer: { type: "NOTARY", attestationLevel: "SOFTWARE", attestationBasis: "configured", notaryFingerprint: primaryId } } };
  // Core correctly verifies A's real envelope against local history. Independent distrust is the reader's admission job.
  expect(verifySignedDigest({ workspace, digestHex: digest, signed })).toBe(true);
  writeFileSync(created.sigPath, JSON.stringify(signed));
  expect(() => readSignedControlResults(workspace, "results.json")).toThrow(/signer is not trusted \(distrusted/);
  // Mutation target: remove only signedResults.ts's checkDigestSignature `envelope` argument. Core still verifies A,
  // but raw search chooses earlier B, admits B and falsely returns the results. The assertion above must become RED.
  const { envelope: _absent, ...legacy } = signed; writeFileSync(created.sigPath, JSON.stringify(legacy));
  expect(readSignedControlResults(workspace, "results.json")).toMatchObject({ value: [], digestSha256: digest, admission: { keyId: alternateId, status: "admitted" } });
});
