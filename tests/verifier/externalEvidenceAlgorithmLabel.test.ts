import { generateKeyPairSync, sign, verify } from "node:crypto";
import { expect, it } from "vitest";
import { validateRecord, verifyArtifact } from "../../packages/verifier/src/index.js";
import { lowS, signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { externalEvidenceNormalizedDigest, externalEvidenceSigningBytes, verifyExternalEvidence,
  type ExternalEvidenceProfile } from "../../src/standard/externalEvidenceProfile.js";
import { canonicalize } from "../../src/utils/json.js";
import { loadCase } from "./fixtures.js";

it("preserves the existing valid Ed25519 corpus artifact", () => {
  const fixture = loadCase("valid-external-evidence-attested");
  expect(verifyArtifact(fixture.bytes, fixture.options).integrity.status).toBe("pass");
});

it.each(["ed25519", "ecdsa-p256-sha256"] as const)("external-evidence verifies admitted %s only under its matching algorithm and canonical encoding", algorithm => {
  const fixture = loadCase("valid-external-evidence-attested");
  const profile = JSON.parse(fixture.bytes.toString("utf8")) as ExternalEvidenceProfile;
  const pair = algorithm === "ed25519" ? generateKeyPairSync("ed25519") : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString(); const keyId = signingKeyId(pem)!;
  const root = generateKeyPairSync("ed25519"); const rootPem = root.publicKey.export({ format: "pem", type: "spki" }).toString();
  const baseline = fixture.options.trustLists[0] as { list: { entries: Array<{ purposes: string[]; authority?: unknown; [key: string]: unknown }>; [key: string]: unknown } };
  const authority = baseline.list.entries.find(entry => entry.purposes.includes("evidence-authority"))!;
  expect(authority).toBeDefined();
  // Keep the producer/capture scope, tier, purpose, dates and original evidence bytes. Only the admitted key changes.
  const list = { ...baseline.list, entries: [{ ...authority, keyId, algorithm, publicKeyPem: pem }] };
  const listBytes = Buffer.concat([Buffer.from("AMC_TRUST_LIST_V1\0", "ascii"), Buffer.from(canonicalize(list))]);
  const options = { ...fixture.options, trustRoots: [signingKeyId(rootPem)!], trustLists: [{ list,
    signatures: [{ keyId: signingKeyId(rootPem)!, publicKeyPem: rootPem, signature: sign(null, listBytes, root.privateKey).toString("base64") }] }] };
  const mainOptions = { authorities: [{ id: keyId, publicKeyPem: pem, maxTrustTier: "ATTESTED" as const,
    captureMethods: ["producer-callback" as const], producers: [profile.source.producer] }] };
  profile.provenance.authorityId = keyId;
  profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
  const message = externalEvidenceSigningBytes(profile);
  const signature = algorithm === "ed25519" ? sign(null, message, pair.privateKey)
    : lowS(sign("sha256", message, { key: pair.privateKey, dsaEncoding: "ieee-p1363" }));
  expect(verifyCanonical(algorithm, message, pem, signature)).toBe(true); // Correct crypto and independently root-signed admission.
  profile.signature = { algorithm, authorityId: keyId, value: signature.toString("base64") };
  expect(validateRecord("external-evidence", profile)).toEqual({ ok: true });
  expect(verifyExternalEvidence(profile, mainOptions)).toMatchObject({ ok: true, signatureVerified: true, trustTier: "ATTESTED" });
  const valid = verifyArtifact(Buffer.from(canonicalize(profile)), options);
  expect(valid.integrity.status).toBe("pass"); expect(valid.issuerAdmission.status).toBe("pass");

  // signature is excluded from the preimage: changing just its label cannot change the valid mathematical signature.
  const mislabeled = { ...profile, signature: { ...profile.signature, algorithm: algorithm === "ed25519" ? "ecdsa-p256-sha256" : "ed25519" } };
  expect(validateRecord("external-evidence", mislabeled)).toEqual({ ok: true }); // Shape validation is not key/algorithm admission.
  expect(verifyExternalEvidence(mislabeled, mainOptions)).toMatchObject({ ok: false, signatureVerified: false, trustTier: "SELF_REPORTED" });
  const rejected = verifyArtifact(Buffer.from(canonicalize(mislabeled)), options);
  expect(rejected.integrity.status).toBe("fail"); expect(rejected.reasonCodes.integrity).toContain("SIGNATURE_INVALID");
  const unknown = { ...profile, signature: { ...profile.signature, algorithm: "rsa-sha256" } };
  expect(validateRecord("external-evidence", unknown).ok).toBe(false);
  expect(verifyExternalEvidence(unknown, mainOptions).ok).toBe(false);

  if (algorithm === "ecdsa-p256-sha256") {
    const der = sign("sha256", message, { key: pair.privateKey, dsaEncoding: "der" });
    const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
    const high = Buffer.concat([signature.subarray(0, 32), Buffer.from((order - BigInt(`0x${signature.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
    expect(verify("sha256", message, { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
    for (const encoded of [der, high]) {
      const invalid = { ...profile, signature: { ...profile.signature, value: encoded.toString("base64") } };
      expect(verifyExternalEvidence(invalid, mainOptions).ok).toBe(false);
      expect(verifyArtifact(Buffer.from(canonicalize(invalid)), options).integrity.status).toBe("fail");
    }
  }
  // Removing operator admission still refuses either algorithm; algorithm support does not create authority.
  expect(verifyExternalEvidence(profile).ok).toBe(false);
  expect(verifyArtifact(Buffer.from(canonicalize(profile)), { ...options, trustLists: [], trustRoots: [] }).issuerAdmission.status).toBe("fail");
});
