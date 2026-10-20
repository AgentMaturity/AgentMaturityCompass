import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPublicKeyToHistory, ensureSigningKeys, verifyHexDigestAny } from "../src/crypto/keys.js";
import { verifySignedDigest } from "../src/crypto/signing/signer.js";
import type { SignedDigest } from "../src/crypto/signing/signerTypes.js";
import { lowS, signingKeyId, type SigningAlgorithm } from "../src/keys/algorithmPolicy.js";
import { verifySignedFileWithAuditor } from "../src/org/orgSigner.js";
import { initOpsPolicy, opsPolicyPath, opsPolicySigPath, verifyOpsPolicySignature } from "../src/ops/policy.js";
import { initComplianceMaps, verifyComplianceMapsSignature } from "../src/compliance/complianceEngine.js";
import { initTransparencyLog, transparencySealPath, transparencySealSigPath, verifyTransparencyLog } from "../src/transparency/logChain.js";
import { rebuildTransparencyMerkle, verifyTransparencyMerkle } from "../src/transparency/merkleIndexStore.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath } from "../src/transparency/merklePaths.js";
import { verifyPassportDigestSignature } from "../src/passport/passportSigner.js";
import { verifyArtifactBytesSignature, type ArtifactSignature } from "../src/lifecycle/artifactSignature.js";
import { maturityBomSchema } from "../src/bom/bomSchema.js";
import { verifyBomSignature } from "../src/bom/bomVerifier.js";
import { checkDigestSignature } from "../src/trust/signatureCheck.js";
import type { TrustContext } from "../src/trust/trustContext.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";

interface TestKey { privateKey: KeyObject; pem: string; algorithm: SigningAlgorithm }
function key(algorithm: SigningAlgorithm): TestKey {
  const pair = algorithm === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey: pair.privateKey, pem: pair.publicKey.export({ format: "pem", type: "spki" }).toString(), algorithm };
}
const ed = key("ed25519");
const p256 = key("ecdsa-p256-sha256");
const time = Date.now();
const dirs: string[] = [];
const dir = () => { const value = mkdtempSync(join(tmpdir(), "amc-envelope-refusal-")); dirs.push(value); return value; };
afterAll(() => { for (const value of dirs) { lockVault(value); rmSync(value, { recursive: true, force: true }); } });
function seal(digest: string, owner: TestKey, type: "VAULT" | "NOTARY" = "NOTARY"): SignedDigest {
  const message = Buffer.from(digest, "hex");
  const signature = (owner.algorithm === "ed25519" ? sign(null, message, owner.privateKey)
    : lowS(sign("sha256", message, { key: owner.privateKey, dsaEncoding: "ieee-p1363" }))).toString("base64");
  return { digestSha256: digest, signature, signedTs: time, signer: "auditor", envelope: { v: 1, alg: owner.algorithm,
    pubkeyB64: Buffer.from(owner.pem).toString("base64"), fingerprint: signingKeyId(owner.pem)!, sigB64: signature, signedTs: time,
    signer: { type, attestationLevel: "SOFTWARE", attestationBasis: "provider-metadata", ...(type === "NOTARY" ? { notaryFingerprint: signingKeyId(owner.pem)! } : {}) } } };
}
function pinned(owner: TestKey): TrustContext {
  return { mode: "pinned", asOf: new Date(time), lists: [], distrust: [], allowUnpinned: false, allowUnanchored: false,
    explicitPins: [{ keyId: signingKeyId(owner.pem)!, purposes: ["artifact-seal"], origin: "synthetic operator pin" }] };
}
function badEnvelopes(good: SignedDigest, owner: TestKey): unknown[] {
  const envelope = good.envelope!;
  const wrong = key(owner.algorithm);
  return [
    { ...envelope, fingerprint: "0".repeat(64) },
    { ...envelope, alg: "rsa-sha256" },
    { ...envelope, alg: owner.algorithm === "ed25519" ? "ecdsa-p256-sha256" : "ed25519" },
    { ...envelope, pubkeyB64: Buffer.from(wrong.pem).toString("base64"), fingerprint: signingKeyId(wrong.pem)!,
      signer: { ...envelope.signer, notaryFingerprint: signingKeyId(wrong.pem)! } },
    { ...envelope, sigB64: Buffer.alloc(64, 1).toString("base64") }, null, false, "", 1
  ];
}

let workspace: string;
beforeAll(() => {
  workspace = dir(); ensureSigningKeys(workspace);
  // Existing owner-authorized history API, not a forged keyset, mocked verifier, or provider-credential path.
  addPublicKeyToHistory(workspace, "auditor", ed.pem, "imported", { logRevision: false });
  addPublicKeyToHistory(workspace, "auditor", p256.pem, "imported", { logRevision: false });
  initTransparencyLog(workspace); rebuildTransparencyMerkle(workspace);
});

it("core permits the legacy raw form only when envelope is absent, including a real lifecycle artifact", () => {
  const digest = sha256Hex("core exact bytes");
  for (const owner of [ed, p256]) {
    const good = seal(digest, owner);
    expect(verifyHexDigestAny(digest, good.signature, [owner.pem])).toBe(true); // Independently pin the raw-fallback precondition.
    expect(verifySignedDigest({ workspace, digestHex: digest, signed: good })).toBe(true);
    const { envelope: _absent, ...raw } = good;
    expect(verifySignedDigest({ workspace, digestHex: digest, signed: raw })).toBe(true);
    for (const envelope of badEnvelopes(good, owner)) {
      expect(verifySignedDigest({ workspace, digestHex: digest, signed: { ...good, envelope } })).toBe(false);
    }
    const bytes = Buffer.from("real artifact snapshot bytes\n");
    const artifactKind = "lifecycle-artifact" as const;
    const artifactSha256 = sha256Hex(bytes);
    const artifactDigest = sha256Hex(Buffer.from(`AMC_ARTIFACT_SIGNATURE_V2\0${artifactKind}\0${artifactSha256}`));
    const signature: ArtifactSignature = { schemaVersion: "2026-07-10", artifactKind, artifactSha256,
      ...seal(artifactDigest, owner) };
    expect(verifyArtifactBytesSignature({ workspace, artifactKind, bytes, signature })).toBe(true);
    expect(verifyArtifactBytesSignature({ workspace, artifactKind, bytes, signature: { ...signature, envelope: null } })).toBe(false);
    expect(verifyArtifactBytesSignature({ workspace, artifactKind, bytes: Buffer.from("changed"), signature })).toBe(false);
  }
});

const localTargets = ["org signed file", "ops policy", "compliance maps", "transparency log seal", "merkle root"] as const;
it.each(localTargets)("%s does not undo envelope refusal with a raw retry", target => {
  let path: string; let sigPath: string; let verifies: () => boolean;
  if (target === "org signed file") {
    path = join(workspace, "owner-artifact.json"); writeFileSync(path, "{\"synthetic\":true}\n"); sigPath = `${path}.sig`;
    verifies = () => verifySignedFileWithAuditor(workspace, path).valid;
  } else if (target === "ops policy") {
    initOpsPolicy(workspace); path = opsPolicyPath(workspace); sigPath = opsPolicySigPath(workspace);
    verifies = () => verifyOpsPolicySignature(workspace).valid;
  } else if (target === "compliance maps") {
    ({ path, sigPath } = initComplianceMaps(workspace)); verifies = () => verifyComplianceMapsSignature(workspace).valid;
  } else if (target === "transparency log seal") {
    path = transparencySealPath(workspace); sigPath = transparencySealSigPath(workspace); verifies = () => verifyTransparencyLog(workspace).ok;
  } else {
    rebuildTransparencyMerkle(workspace); path = merkleCurrentRootPath(workspace); sigPath = merkleCurrentRootSigPath(workspace);
    verifies = () => verifyTransparencyMerkle(workspace).ok;
  }
  const digest = sha256Hex(readFileSync(path));
  const original = (() => { try { return readFileSync(sigPath); } catch { return null; } })();
  try {
    for (const owner of [ed, p256]) {
      const good = seal(digest, owner, target === "org signed file" ? "NOTARY" : "VAULT");
      const publish = (value: unknown) => writeFileSync(sigPath, JSON.stringify(value));
      // Imported ordinary history does not confer authenticated NOTARY provenance.
      if (target !== "org signed file") { publish(seal(digest, owner)); expect(verifies()).toBe(false); }
      publish(good); expect(verifies()).toBe(true);
      expect(verifyHexDigestAny(digest, good.signature, [owner.pem])).toBe(true);
      // Real RED on the Ed25519 baseline: its valid raw signature cannot rescue a false envelope fingerprint.
      for (const envelope of badEnvelopes(good, owner)) { publish({ ...good, envelope }); expect(verifies()).toBe(false); }
      const { envelope: _absent, ...raw } = good; publish(raw); expect(verifies()).toBe(true);
    }
  } finally { if (original !== null) writeFileSync(sigPath, original); }
});

it("passport's public digest verifier returns envelope refusal directly", () => {
  const digest = sha256Hex("passport exact bytes");
  for (const owner of [ed, p256]) {
    const good = seal(digest, owner);
    const verifies = (value: unknown) => verifyPassportDigestSignature({ digestHex: digest, signature: value as never, publicKeyPem: owner.pem });
    expect(verifies(good)).toBe(true);
    for (const envelope of badEnvelopes(good, owner)) expect(verifies({ ...good, envelope })).toBe(false);
    const { envelope: _absent, ...raw } = good; expect(verifies(raw)).toBe(true);
  }
});

it("the shared portable digest check verifies a supplied envelope against the same candidate key it admits", () => {
  const digest = sha256Hex("portable exact bytes");
  for (const owner of [ed, p256]) {
    const good = seal(digest, owner);
    const check = (envelope?: unknown) => checkDigestSignature({ signature: "fixture.sig", purpose: "artifact-seal", digestHex: digest,
      signatureB64: good.signature, envelope, candidates: [owner.pem], context: pinned(owner), claimedSignedAt: time });
    expect(check(good.envelope)).toMatchObject({ verified: true, admission: { status: "admitted", keyId: signingKeyId(owner.pem) } });
    for (const envelope of badEnvelopes(good, owner)) expect(check(envelope).verified).toBe(false);
    expect(check()).toMatchObject({ verified: true, admission: { status: "admitted" } });
    // A carried valid key does not authorize itself merely by being an envelope candidate.
    expect(checkDigestSignature({ signature: "fixture.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: good.signature,
      envelope: good.envelope, candidates: [owner.pem], context: { ...pinned(owner), explicitPins: [] } }).admission.status).not.toBe("admitted");
  }
});

it("BOM's private signature parser is exercised through its public artifact verifier, retaining P-256 basis", () => {
  const root = dir(); const inputFile = join(root, "bom.json"); const sigFile = `${inputFile}.sig`; const pubkeyPemFile = join(root, "auditor.pub");
  const bom = maturityBomSchema.parse({ v: 1, generatedTs: time, agentId: "synthetic", agentName: "synthetic", role: "test", domain: "test",
    riskTier: "test", runId: "run-test", reportSha256: "0".repeat(64), integrityIndex: 1, trustLabel: "test", overall: 0,
    layerScores: [], assurancePackScores: {}, indices: {}, activeFreezeActionClasses: [], git: { commit: null, branch: null }, references: { bundleId: null, certId: null } });
  writeFileSync(inputFile, JSON.stringify(bom)); const digest = sha256Hex(readFileSync(inputFile));
  for (const owner of [ed, p256]) {
    writeFileSync(pubkeyPemFile, owner.pem); const good = seal(digest, owner);
    const publish = (envelope: unknown, include = true) => writeFileSync(sigFile, JSON.stringify({ v: 1, bomSha256: digest,
      signature: good.signature, signedTs: time, signer: "auditor", ...(include ? { envelope } : {}) }));
    const verifies = () => verifyBomSignature({ workspace: root, inputFile, sigFile, pubkeyPemFile, trust: pinned(owner) });
    publish(good.envelope); const valid = verifies(); expect(valid.ok).toBe(true);
    expect(valid.signature?.envelope?.signer.attestationBasis).toBe("provider-metadata");
    for (const envelope of badEnvelopes(good, owner)) { publish(envelope); expect(verifies().ok).toBe(false); }
    publish(undefined, false); expect(verifies().ok).toBe(true);
    if (owner.algorithm === "ecdsa-p256-sha256") {
      const der = sign("sha256", Buffer.from(digest, "hex"), { key: owner.privateKey, dsaEncoding: "der" }).toString("base64");
      writeFileSync(sigFile, JSON.stringify({ v: 1, bomSha256: digest, signature: der, signedTs: time, signer: "auditor", envelope: { ...good.envelope, sigB64: der } }));
      expect(verifies().ok).toBe(false);
    }
  }
});
