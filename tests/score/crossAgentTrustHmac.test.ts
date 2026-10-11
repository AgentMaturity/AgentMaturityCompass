import { describe, expect, it } from "vitest";
import {
  ClaimReplayCache, claimHmacKeyId, createAgentClaim, createSignedAgentClaim, verifyAgentClaim, verifySignedAgentClaim,
  type AgentIdentityClaim, type ClaimExpectation, type TrustPolicyRule
} from "../../src/score/crossAgentTrust.js";
import { context, testKey } from "../trust/trustFixtures.js";

// P1-08 (G6-10) and the security review of crossAgentTrust: a shared HMAC secret lets every verifier forge, so it never
// lifts a claim above SELF_REPORTED; every claim binds issuer, audience, key purpose and id, times and a nonce; the
// verifier's policy must grant the issuer the requested scope; and anything unknown or unreadable refuses.
const policy: TrustPolicyRule = { requirePassport: false, requireFreshness: true };
const SECRET = "a-shared-secret-every-verifier-holds";
const claimFor = (opts: Record<string, unknown> = {}) =>
  createAgentClaim("agent-a", "pubhash", "ws-1", SECRET, { audience: "agent-b", amcScore: 99, amcLevel: "L5", amcPassportId: "p-1", ...opts });
const expect_ = (overrides: Partial<ClaimExpectation> = {}): ClaimExpectation => ({
  audience: "agent-b", issuer: "agent-a", requestedScope: "read", grants: { "agent-a": ["read", "write"] }, replay: new ClaimReplayCache(), ...overrides
});

describe("cross-agent claim integrity tier (P1-08)", () => {
  it("an HMAC-verified claim never exceeds SELF_REPORTED, even at full score", () => {
    const result = verifyAgentClaim(claimFor(), policy, SECRET, expect_());
    expect(result).toMatchObject({ trusted: true, trustLevel: "full", integrity: "shared-secret", trustTier: "SELF_REPORTED" });
    expect(result.grantedScopes).toEqual(["read", "write"]); // only what the policy grants this issuer
    expect(verifyAgentClaim(claimFor(), policy, "another-secret-of-enough-length", expect_())).toMatchObject({ integrity: "none", trustTier: "UNVERIFIED", trusted: false });
  });

  it("an Ed25519 claim from an admitted session key is ATTESTED; from an unpinned key only SELF_REPORTED", () => {
    const session = testKey();
    const signed = () => createSignedAgentClaim("agent-a", session.privateKeyPem, "ws-1", { audience: "agent-b", amcScore: 80 });
    const pinned = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["session"], origin: "test" }] });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: pinned }, expect_())).toMatchObject({ integrity: "ed25519", trustTier: "ATTESTED", trusted: true });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: context({ asOf: new Date() }) }, expect_()))
      .toMatchObject({ integrity: "ed25519", trustTier: "SELF_REPORTED" });
    const wrong = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["artifact-seal"], origin: "test" }] });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: wrong }, expect_()).trustTier).toBe("SELF_REPORTED");
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: testKey().publicKeyPem, context: pinned }, expect_())).toMatchObject({ trustTier: "UNVERIFIED" });
  });
});

describe("identity binding (security review)", () => {
  it("a claim minted for agent A or audience X fails for B or Y, and identity comes only from the verified payload", () => {
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ issuer: "agent-c", grants: { "agent-c": ["read"] } })).trusted).toBe(false);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ audience: "agent-z" })).trusted).toBe(false);
    // Relabelling the claim to another issuer or audience breaks its MAC.
    expect(verifyAgentClaim({ ...claimFor(), agentId: "agent-c" }, policy, SECRET, expect_({ issuer: "agent-c", grants: { "agent-c": ["read"] } }))).toMatchObject({ trusted: false, integrity: "none" });
    expect(verifyAgentClaim({ ...claimFor(), audience: "agent-z" }, policy, SECRET, expect_({ audience: "agent-z" }))).toMatchObject({ trusted: false, integrity: "none" });
  });

  it.each([
    ["score", { amcScore: 1 }], ["level", { amcLevel: "L1" }], ["passport", { amcPassportId: "p-2" }], ["nonce", { nonce: "f".repeat(32) }],
    ["expiry", { expiresAt: new Date(Date.now() + 2 * 3600_000) }], ["issue time", { issuedAt: new Date(Date.now() - 1000) }],
    ["key id", { keyId: "0".repeat(64) }], ["key purpose", { keyPurpose: "session" }], ["workspace", { issuingWorkspace: "ws-2" }]
  ] as Array<[string, Partial<AgentIdentityClaim>]>)("the MAC binds the %s", (_field, patch) => {
    expect(verifyAgentClaim({ ...claimFor(), ...patch }, policy, SECRET, expect_())).toMatchObject({ trusted: false, integrity: "none" });
  });
});

describe("authorization (security review)", () => {
  it("refuses an unknown issuer, an ungranted scope and a missing expectation", () => {
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ grants: {} })).reasons.join(" ")).toMatch(/no grant/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ requestedScope: "delegate" })).reasons.join(" ")).toMatch(/not granted delegate/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET)).toMatchObject({ trusted: false, grantedScopes: [], score: 0 });
  });
});

describe("fail-closed state (security review)", () => {
  it("refuses a missing, short or signing-key secret, a revoked key and a claim naming another key", () => {
    for (const secret of ["", "short", "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"]) {
      expect(verifyAgentClaim(claimFor(), policy, secret, expect_())).toMatchObject({ trusted: false, score: 0, trustTier: "UNVERIFIED" });
    }
    expect(() => createAgentClaim("agent-a", "h", "ws", "short", { audience: "agent-b" })).toThrow(/at least 16 bytes/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ revokedKeyIds: [claimHmacKeyId(SECRET)] })).reasons.join(" ")).toMatch(/revoked/);
  });

  it("enforces expiry with bounded clock skew and refuses a claim issued in the future", () => {
    const claim = claimFor();
    const expires = claim.expiresAt!.getTime();
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ now: new Date(expires + 30_000) })).trusted).toBe(true);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ now: new Date(expires + 120_000) })).reasons.join(" ")).toMatch(/expired/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ now: new Date(Date.now() - 300_000) })).reasons.join(" ")).toMatch(/future/);
    expect(() => claimFor({ ttlHours: 25 })).toThrow(/at most 24/);
    expect(() => createAgentClaim("agent-a", "h", "ws", SECRET)).toThrow(/audience/);
  });

  it("refuses a replayed claim, a full cache and a key past its use cap", () => {
    const claim = claimFor();
    const replay = new ClaimReplayCache();
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ replay })).trusted).toBe(true);
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ replay })).reasons.join(" ")).toMatch(/replay/);
    const tiny = new ClaimReplayCache(1, 10);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: tiny })).trusted).toBe(true);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: tiny })).reasons.join(" ")).toMatch(/full/);
    const capped = new ClaimReplayCache(100, 1);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: capped })).trusted).toBe(true);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: capped })).reasons.join(" ")).toMatch(/key-exhausted/);
  });

  it("refuses a 1.x claim without binding fields and a malformed signature without throwing", () => {
    const legacy = { agentId: "agent-a", publicKeyHash: "pubhash", issuingWorkspace: "ws-1", issuedAt: new Date(), signature: "00".repeat(32) } as AgentIdentityClaim;
    expect(verifyAgentClaim(legacy, policy, SECRET, expect_())).toMatchObject({ trusted: false });
    expect(verifyAgentClaim({ ...claimFor(), signature: "zz" }, policy, SECRET, expect_())).toMatchObject({ trusted: false, integrity: "none" });
    expect(verifyAgentClaim({ ...claimFor(), issuedAt: new Date("garbage") }, policy, SECRET, expect_())).toMatchObject({ trusted: false });
  });
});
