import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { describe, expect, test } from "vitest";
import { ClaimReplayCache, createSignedAgentClaim, verifySignedAgentClaim, type AgentIdentityClaim, type ClaimExpectation, type TrustPolicyRule } from "../../src/score/crossAgentTrust.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { context } from "../trust/trustFixtures.js";

const policy: TrustPolicyRule = { requirePassport: false, requireFreshness: true };
const pemOf = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
// Independent wire contract: session claims sign the complete, tagged v2 bound statement itself.
function claimBytes(claim: AgentIdentityClaim): Buffer {
  return Buffer.from("AMC_AGENT_CLAIM_V2\0" + canonicalize({
    v: 2, keyPurpose: claim.keyPurpose ?? null, keyId: claim.keyId ?? null, agentId: claim.agentId, audience: claim.audience ?? null,
    issuingWorkspace: claim.issuingWorkspace, publicKeyHash: claim.publicKeyHash, issuedAt: claim.issuedAt.toISOString(),
    expiresAt: claim.expiresAt?.toISOString() ?? null, nonce: claim.nonce ?? null, amcScore: claim.amcScore ?? null,
    amcLevel: claim.amcLevel ?? null, amcPassportId: claim.amcPassportId ?? null
  }), "utf8");
}
const expectation = (keyId: string, patch: Partial<ClaimExpectation> = {}): ClaimExpectation => ({
  audience: "agent-b", issuer: "agent-a", requestedScope: "read", grants: { "agent-a": ["read"] },
  issuerKeyIds: { "agent-a": [keyId] }, replay: new ClaimReplayCache(), ...patch
});
function highS(signature: Buffer): Buffer {
  const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((n - BigInt(`0x${signature.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
}

function fixture() {
  // The existing private issuer stays Ed25519; the verifier must also accept an independently held canonical P-256 key.
  const ed = generateKeyPairSync("ed25519"), edPem = pemOf(ed.publicKey);
  const legacy = createSignedAgentClaim("agent-a", ed.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "fixture-workspace",
    { audience: "agent-b", amcScore: 80, amcLevel: "L4" });
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey), keyId = sha256Hex(Buffer.from(pem, "utf8"));
  const unsigned = { ...legacy, keyId, publicKeyHash: keyId, signature: "" };
  const bytes = claimBytes(unsigned), signature = lowS(sign("sha256", bytes, { key: keys.privateKey, dsaEncoding: "ieee-p1363" }));
  const claim: AgentIdentityClaim = { ...unsigned, signature: signature.toString("base64") };
  const at = new Date(Date.now() + 1000);
  const pinned = context({ asOf: at, explicitPins: [{ keyId, purposes: ["session"], origin: "fixture peer operator" }] });
  return { ed, edPem, legacy, keys, pem, keyId, bytes, signature, claim, at, pinned };
}

describe("cross-agent canonical session claims retain identity, purpose, admission and replay checks", () => {
  test("canonical P-256 reports its actual integrity algorithm and grants only the independently admitted session scope", () => {
    const f = fixture();
    expect(verify("sha256", f.bytes, { key: f.keys.publicKey, dsaEncoding: "ieee-p1363" }, f.signature)).toBe(true);
    const expected = expectation(f.keyId);
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: f.pinned }, expected)).toMatchObject({
      trusted: true, trustTier: "ATTESTED", integrity: "ecdsa-p256-sha256", grantedScopes: ["read"], admission: { status: "admitted", purpose: "session", keyId: f.keyId }
    });
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: f.pinned }, expected).reasons.join(" ")).toMatch(/replay/);
    const wrongPurpose = context({ asOf: f.at, explicitPins: [{ keyId: f.keyId, purposes: ["artifact-seal"], origin: "fixture artifact operator" }] });
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: wrongPurpose }, expectation(f.keyId)))
      .toMatchObject({ trusted: false, trustTier: "SELF_REPORTED", integrity: "ecdsa-p256-sha256", grantedScopes: [] });
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: context({ asOf: f.at }) }, expectation(f.keyId)))
      .toMatchObject({ trusted: false, trustTier: "SELF_REPORTED", integrity: "ecdsa-p256-sha256", grantedScopes: [] });
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: f.pinned }, expectation(f.keyId, { issuerKeyIds: { "another-agent": [f.keyId] } })))
      .toMatchObject({ trusted: false, trustTier: "UNVERIFIED", integrity: "ecdsa-p256-sha256", admission: null });
  });

  test("DER, high S, another curve, changed signed identity and missing expectations refuse", () => {
    const f = fixture();
    const high = highS(f.signature), der = sign("sha256", f.bytes, f.keys.privateKey);
    expect(verify("sha256", f.bytes, { key: f.keys.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
    expect(verify("sha256", f.bytes, f.keys.publicKey, der)).toBe(true);
    for (const bytes of [high, der]) {
      expect(verifySignedAgentClaim({ ...f.claim, signature: bytes.toString("base64") }, policy, { publicKeyPem: f.pem, context: f.pinned }, expectation(f.keyId)))
        .toMatchObject({ trusted: false, trustTier: "UNVERIFIED", integrity: "none", admission: null });
    }
    for (const patch of [{ publicKeyHash: "0".repeat(64) }, { keyId: "0".repeat(64) }, { keyPurpose: "agent-claim-hmac" as const }, { agentId: "impostor" }, { audience: "another-peer" }]) {
      expect(verifySignedAgentClaim({ ...f.claim, ...patch }, policy, { publicKeyPem: f.pem, context: f.pinned }, expectation(f.keyId))).toMatchObject({ trusted: false, admission: null });
    }
    expect(verifySignedAgentClaim(f.claim, policy, { publicKeyPem: f.pem, context: f.pinned })).toMatchObject({ trusted: false, admission: null });
    const unsupported = generateKeyPairSync("ec", { namedCurve: "secp384r1" }), pem = pemOf(unsupported.publicKey), keyId = sha256Hex(Buffer.from(pem, "utf8"));
    const unsigned = { ...f.claim, keyId, publicKeyHash: keyId, signature: "" }, bytes = claimBytes(unsigned);
    const sig = sign("sha256", bytes, { key: unsupported.privateKey, dsaEncoding: "ieee-p1363" });
    expect(verify("sha256", bytes, { key: unsupported.publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    const pinned = context({ asOf: f.at, explicitPins: [{ keyId, purposes: ["session"], origin: "unsupported fixture key" }] });
    expect(verifySignedAgentClaim({ ...unsigned, signature: sig.toString("base64") }, policy, { publicKeyPem: pem, context: pinned }, expectation(keyId)))
      .toMatchObject({ trusted: false, integrity: "none", trustTier: "UNVERIFIED", admission: null });
  });

  test("the legacy Ed25519 private issuer preserves its complete signed bytes and integrity label", () => {
    const f = fixture(), bytes = claimBytes(f.legacy), keyId = sha256Hex(Buffer.from(f.edPem, "utf8"));
    expect(f.legacy.signature).toBe(sign(null, bytes, f.ed.privateKey).toString("base64"));
    const pinned = context({ asOf: f.at, explicitPins: [{ keyId, purposes: ["session"], origin: "legacy fixture peer" }] });
    expect(verifySignedAgentClaim(f.legacy, policy, { publicKeyPem: f.edPem, context: pinned }, expectation(keyId)))
      .toMatchObject({ trusted: true, integrity: "ed25519", trustTier: "ATTESTED", grantedScopes: ["read"] });
  });
});
