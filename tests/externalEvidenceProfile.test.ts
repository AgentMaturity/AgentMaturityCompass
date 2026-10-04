import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createImportedExternalEvidence, externalEvidenceNormalizedDigest, externalEvidenceSigningBytes,
  validateExternalEvidenceProfile, verifyExternalEvidence, type ExternalEvidenceProfile, type ExternalEvidenceAuthority } from "../src/standard/externalEvidenceProfile.js";

const original = Buffer.from("synthetic evidence source\n");
function fixture(): ExternalEvidenceProfile {
  return createImportedExternalEvidence({
    source: { producer: "synthetic-pi", version: "3", originalSha256: createHash("sha256").update(original).digest("hex"), mediaType: "application/x-ndjson" },
    session: { id: "child", parentSessionId: "parent" }, normalizer: "fixture/1", ingestedAt: "2026-09-08T00:00:00.000Z",
    losses: ["Synthetic fixture; external parent is not included."], events: [
      { id: "input", parentId: null, toolCallId: null, kind: "input", outcome: null, sourceTime: null, durationNs: null, cost: null, attributes: {} },
      { id: "call", parentId: "input", toolCallId: "call-1", kind: "tool-call", outcome: null, sourceTime: null, durationNs: null, cost: null, attributes: {} },
      { id: "result", parentId: "call", toolCallId: "call-1", kind: "tool-result", outcome: "failure", sourceTime: null, durationNs: null, cost: null, attributes: {} }
    ]
  });
}
function seal(profile: ExternalEvidenceProfile, capture: "import" | "producer-callback" | "governed-capture", tier: "SELF_REPORTED" | "ATTESTED" | "OBSERVED") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const authority: ExternalEvidenceAuthority = { id: "operator", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    maxTrustTier: "OBSERVED", captureMethods: ["producer-callback", "governed-capture"], producers: [profile.source.producer] };
  profile.provenance = { trustTier: tier, captureMethod: capture, authorityId: authority.id };
  profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
  profile.signature = { algorithm: "ed25519", authorityId: authority.id, value: sign(null, externalEvidenceSigningBytes(profile), privateKey).toString("base64") };
  return authority;
}
describe("external evidence profile", () => {
  test("an internally valid unsigned import remains self-reported with unknown timing and unverified parent", () => {
    const profile = fixture();
    expect(verifyExternalEvidence(profile, { originalBytes: original })).toMatchObject({ ok: true, trustTier: "SELF_REPORTED", signatureVerified: false, originalDigest: "verified", parentSession: "declared-not-verified" });
    expect(profile.events[2]).toMatchObject({ outcome: "failure", sourceTime: null, durationNs: null, cost: null });
    expect(verifyExternalEvidence(profile).originalDigest).toBe("declared-not-checked");
  });
  test("semantic identity survives a different receipt time but signatures bind the receipt time", () => {
    const profile = fixture(), digest = profile.normalization.normalizedSha256;
    const authority = seal(profile, "producer-callback", "ATTESTED");
    profile.normalization.ingestedAt = "2026-09-09T00:00:00.000Z";
    expect(externalEvidenceNormalizedDigest(fixture())).toBe(digest);
    expect(externalEvidenceNormalizedDigest(profile)).toBe(profile.normalization.normalizedSha256);
    expect(verifyExternalEvidence(profile, { authorities: [authority] }).ok).toBe(false);
  });
  test.each(["id", "parent", "tool", "duration", "calendar", "digest", "unicode"])("rejects corrupt %s without accepting a trust claim", (mutation) => {
    const profile = fixture();
    if (mutation === "id") profile.events[2]!.id = "input";
    if (mutation === "parent") profile.events[0]!.parentId = "result";
    if (mutation === "tool") profile.events[2]!.toolCallId = "foreign";
    if (mutation === "duration") profile.events[2]!.durationNs = -1;
    if (mutation === "calendar") profile.events[2]!.sourceTime = "2026-02-30T00:00:00.000Z";
    if (mutation === "unicode") profile.events[2]!.attributes.long = `${"a".repeat(5000)}\uD800`;
    if (mutation !== "digest") profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
    else profile.events[2]!.outcome = "success";
    expect(verifyExternalEvidence(profile)).toMatchObject({ ok: false, trustTier: "SELF_REPORTED" });
  });
  test("a signing key cannot promote imports or self-admit", () => {
    const profile = fixture(), authority = seal(profile, "import", "OBSERVED");
    expect(verifyExternalEvidence(profile, { authorities: [authority] })).toMatchObject({ ok: false, signatureVerified: true, trustTier: "SELF_REPORTED" });
    expect(verifyExternalEvidence(profile)).toMatchObject({ ok: false, signatureVerified: false });
  });
  test("independent authority is scoped to producer and capture method", () => {
    const profile = fixture(), authority = seal(profile, "producer-callback", "ATTESTED");
    expect(verifyExternalEvidence(profile, { authorities: [authority] })).toMatchObject({ ok: true, trustTier: "ATTESTED" });
    expect(verifyExternalEvidence(profile, { authorities: [{ ...authority, producers: ["another"] }] }).ok).toBe(false);
    expect(verifyExternalEvidence(profile, { authorities: [{ ...authority, captureMethods: ["governed-capture"] }] }).ok).toBe(false);
    expect(verifyExternalEvidence(profile, { authorities: [authority, authority] }).ok).toBe(false);
  });
  test("governed observation requires the admitted signature and original/digest mismatches refuse", () => {
    const profile = fixture(), authority = seal(profile, "governed-capture", "OBSERVED");
    expect(verifyExternalEvidence(profile, { authorities: [authority] })).toMatchObject({ ok: true, trustTier: "OBSERVED" });
    expect(verifyExternalEvidence(profile, { authorities: [authority], originalBytes: Buffer.from("changed") })).toMatchObject({ ok: false, trustTier: "SELF_REPORTED", originalDigest: "mismatch" });
    expect(verifyExternalEvidence(profile, { authorities: [authority], expectedNormalizedDigest: "0".repeat(64) }).ok).toBe(false);
  });
  test("an authority that a direct JS caller admits for imports still cannot promote an import", () => {
    // The type and externalEvidenceFiles exclude "import"; this isolates the verifier's own gate.
    const profile = fixture(), authority = seal(profile, "import", "ATTESTED");
    const permissive = { ...authority, captureMethods: ["import"] } as unknown as ExternalEvidenceAuthority;
    expect(verifyExternalEvidence(profile, { authorities: [permissive] })).toMatchObject({ ok: false, signatureVerified: true, trustTier: "SELF_REPORTED",
      errors: ["provenance: declared trust exceeds admitted capture authority"] });
  });
  test("the verifier never raises a producer's own lower declaration", () => {
    const profile = fixture(), authority = seal(profile, "governed-capture", "ATTESTED");
    expect(verifyExternalEvidence(profile, { authorities: [authority] })).toMatchObject({ ok: true, signatureVerified: true, trustTier: "ATTESTED" });
    const selfReported = fixture(), sealed = seal(selfReported, "producer-callback", "SELF_REPORTED");
    expect(verifyExternalEvidence(selfReported, { authorities: [sealed] })).toMatchObject({ ok: true, signatureVerified: true, trustTier: "SELF_REPORTED" });
  });
  test("future fields/versions and duplicate tool settlements refuse", () => {
    expect(validateExternalEvidenceProfile({ ...fixture(), version: 2 })).not.toEqual([]);
    expect(validateExternalEvidenceProfile({ ...fixture(), unreviewed: true })).not.toEqual([]);
    const profile = fixture();
    profile.events.push({ ...profile.events[2]!, id: "duplicate-settlement" });
    profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
    expect(validateExternalEvidenceProfile(profile)).toContain("events[3]: unmatched or duplicate tool result");
  });
});
