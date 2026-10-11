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
  audience: "agent-b", issuer: "agent-a", requestedScope: "read", grants: { "agent-a": ["read", "write"] },
  issuerKeyIds: { "agent-a": [claimHmacKeyId(SECRET)], "agent-c": [claimHmacKeyId(SECRET)] }, replay: new ClaimReplayCache(), ...overrides
});

describe("cross-agent claim integrity tier (P1-08)", () => {
  it("an HMAC-verified claim never exceeds SELF_REPORTED, even at full score: never trusted, at most limited, no scope (review low)", () => {
    const result = verifyAgentClaim(claimFor(), policy, SECRET, expect_());
    expect(result).toMatchObject({ trusted: false, trustLevel: "limited", integrity: "shared-secret", trustTier: "SELF_REPORTED", grantedScopes: [] });
    expect(verifyAgentClaim(claimFor(), policy, "another-secret-of-enough-length", expect_())).toMatchObject({ integrity: "none", trustTier: "UNVERIFIED", trusted: false });
  });

  it("an Ed25519 claim from an admitted session key is ATTESTED; from an unpinned key only SELF_REPORTED", () => {
    const session = testKey();
    const signed = () => createSignedAgentClaim("agent-a", session.privateKeyPem, "ws-1", { audience: "agent-b", amcScore: 80 });
    const bound = (overrides: Partial<ClaimExpectation> = {}) => expect_({ issuerKeyIds: { "agent-a": [session.keyId] }, ...overrides });
    const pinned = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["session"], origin: "test" }] });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: pinned }, bound())).toMatchObject({ integrity: "ed25519", trustTier: "ATTESTED", trusted: true });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: context({ asOf: new Date() }) }, bound()))
      .toMatchObject({ integrity: "ed25519", trustTier: "SELF_REPORTED" });
    const wrong = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["artifact-seal"], origin: "test" }] });
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: session.publicKeyPem, context: wrong }, bound()).trustTier).toBe("SELF_REPORTED");
    expect(verifySignedAgentClaim(signed(), policy, { publicKeyPem: testKey().publicKeyPem, context: pinned }, bound())).toMatchObject({ trustTier: "UNVERIFIED" });
  });
});

describe("identity binding (security review)", () => {
  it("a claim minted for agent A or audience X fails for B or Y, and identity comes only from the verified payload", () => {
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ issuer: "agent-c", grants: { "agent-c": ["read"] } })).trustTier).toBe("UNVERIFIED");
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ audience: "agent-z" })).trustTier).toBe("UNVERIFIED");
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

describe("key-to-issuer binding (review M2)", () => {
  it("a session key bound to agent A cannot speak for agent B, even when B is granted and the key is admitted", () => {
    const session = testKey();
    const pinned = context({ asOf: new Date(Date.now() + 1000), explicitPins: [{ keyId: session.keyId, purposes: ["session"], origin: "peer agent-a" }] });
    const asB = createSignedAgentClaim("agent-b-impostor", session.privateKeyPem, "ws-1", { audience: "agent-b" });
    const expectation = expect_({ issuer: "agent-b-impostor", grants: { "agent-b-impostor": ["read"] }, issuerKeyIds: { "agent-a": [session.keyId] } });
    const result = verifySignedAgentClaim(asB, policy, { publicKeyPem: session.publicKeyPem, context: pinned }, expectation);
    expect(result).toMatchObject({ trusted: false, trustTier: "UNVERIFIED", grantedScopes: [] });
    expect(result.reasons.join(" ")).toMatch(/not bound to issuer agent-b-impostor/);
  });

  it("a shared secret counts only for the issuers the verifier bound it to", () => {
    const other = "a-different-secret-for-agent-a-only";
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ issuerKeyIds: { "agent-a": [claimHmacKeyId(other)] } })).reasons.join(" ")).toMatch(/not bound to issuer agent-a/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ issuerKeyIds: {} })).trustTier).toBe("UNVERIFIED");
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
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ now: new Date(expires + 30_000) })).trustTier).toBe("SELF_REPORTED");
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ now: new Date(expires + 120_000) })).reasons.join(" ")).toMatch(/expired/);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ now: new Date(Date.now() - 300_000) })).reasons.join(" ")).toMatch(/future/);
    expect(() => claimFor({ ttlHours: 25 })).toThrow(/at most 24/);
    expect(() => createAgentClaim("agent-a", "h", "ws", SECRET)).toThrow(/audience/);
  });

  it("refuses a replayed claim, a full cache and a key past its use cap", () => {
    const claim = claimFor();
    const replay = new ClaimReplayCache();
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ replay })).trustTier).toBe("SELF_REPORTED");
    expect(verifyAgentClaim(claim, policy, SECRET, expect_({ replay })).reasons.join(" ")).toMatch(/replay/);
    const tiny = new ClaimReplayCache(1, 10);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: tiny })).trustTier).toBe("SELF_REPORTED");
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: tiny })).reasons.join(" ")).toMatch(/full/);
    const capped = new ClaimReplayCache(100, 1);
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: capped })).trustTier).toBe("SELF_REPORTED");
    expect(verifyAgentClaim(claimFor(), policy, SECRET, expect_({ replay: capped })).reasons.join(" ")).toMatch(/key-exhausted/);
  });

  it("refuses a 1.x claim without binding fields and a malformed signature without throwing", () => {
    const legacy = { agentId: "agent-a", publicKeyHash: "pubhash", issuingWorkspace: "ws-1", issuedAt: new Date(), signature: "00".repeat(32) } as AgentIdentityClaim;
    expect(verifyAgentClaim(legacy, policy, SECRET, expect_())).toMatchObject({ trusted: false });
    expect(verifyAgentClaim({ ...claimFor(), signature: "zz" }, policy, SECRET, expect_())).toMatchObject({ trusted: false, integrity: "none" });
    expect(verifyAgentClaim({ ...claimFor(), issuedAt: new Date("garbage") }, policy, SECRET, expect_())).toMatchObject({ trusted: false });
  });
});
