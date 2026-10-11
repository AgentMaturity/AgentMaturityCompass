import { describe, expect, it } from "vitest";
import { createAgentClaim, createSignedAgentClaim, verifyAgentClaim, verifySignedAgentClaim, type TrustPolicyRule } from "../../src/score/crossAgentTrust.js";
import { context, testKey } from "../trust/trustFixtures.js";

// P1-08 (G6-10): a shared HMAC secret lets every verifier forge, so it never lifts a claim above SELF_REPORTED; an
// Ed25519 claim by a session key that issuer admission admits for `session` can reach ATTESTED.
const policy: TrustPolicyRule = { requirePassport: false, requireFreshness: true };
const SECRET = "a-shared-secret-every-verifier-holds";

describe("cross-agent trust integrity (P1-08)", () => {
  it("an HMAC-verified claim never exceeds SELF_REPORTED, even at full score", () => {
    const result = verifyAgentClaim(createAgentClaim("agent-a", "pubhash", "ws-1", SECRET, { amcScore: 99, amcLevel: "L5", amcPassportId: "p-1" }), policy, SECRET);
    expect(result).toMatchObject({ trusted: true, trustLevel: "full", integrity: "shared-secret", trustTier: "SELF_REPORTED" });
    expect(verifyAgentClaim(createAgentClaim("agent-a", "pubhash", "ws-1", SECRET), policy, "other")).toMatchObject({ integrity: "none", trustTier: "UNVERIFIED" });
  });

  it("an Ed25519 claim from an admitted session key is ATTESTED; from an unpinned key only SELF_REPORTED", () => {
    const session = testKey();
    const claim = createSignedAgentClaim("agent-a", session.privateKeyPem, "ws-1", { amcScore: 80 });
    const pinned = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["session"], origin: "test" }] });
    expect(verifySignedAgentClaim(claim, policy, { publicKeyPem: session.publicKeyPem, context: pinned })).toMatchObject({ integrity: "ed25519", trustTier: "ATTESTED", trusted: true });
    expect(verifySignedAgentClaim(claim, policy, { publicKeyPem: session.publicKeyPem, context: context({ asOf: new Date() }) }))
      .toMatchObject({ integrity: "ed25519", trustTier: "SELF_REPORTED" });
    // Pinned for another purpose: not admitted for session.
    const wrong = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["artifact-seal"], origin: "test" }] });
    expect(verifySignedAgentClaim(claim, policy, { publicKeyPem: session.publicKeyPem, context: wrong }).trustTier).toBe("SELF_REPORTED");
  });

  it("a tampered score, or a key other than the one publicKeyHash names, does not verify", () => {
    const session = testKey();
    const pinned = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["session"], origin: "test" }] });
    const claim = createSignedAgentClaim("agent-a", session.privateKeyPem, "ws-1", { amcScore: 40 });
    expect(verifySignedAgentClaim({ ...claim, amcScore: 95 }, policy, { publicKeyPem: session.publicKeyPem, context: pinned }))
      .toMatchObject({ integrity: "none", trustTier: "UNVERIFIED", trusted: false });
    const other = testKey();
    expect(verifySignedAgentClaim(claim, policy, { publicKeyPem: other.publicKeyPem, context: pinned })).toMatchObject({ trustTier: "UNVERIFIED" });
  });
});
