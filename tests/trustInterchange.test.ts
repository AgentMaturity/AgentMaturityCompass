/**
 * tests/trustInterchange.test.ts
 * Unit tests for src/passport/trustInterchange.ts
 */

import { describe, it, expect, test } from "vitest";
import {
  createVerificationRequest,
  DEMO_TOKEN_NOTICE,
  DEMO_TOKEN_SECRET,
  issueDemoTrustToken,
  processVerificationRequest,
  TRANSLATION_NOTICE,
  issueTrustToken,
  verifyTrustToken,
  translateTrustScores,
  TRUST_TRANSLATIONS,
  type TrustClaim,
} from "../src/passport/trustInterchange.js";

function makeTestClaims(): TrustClaim[] {
  return [
    {
      dimension: "security",
      score: 75,
      level: "L3",
      evidenceCount: 10,
      observedShare: 0.7,
      lastAssessedAt: Date.now(),
    },
    {
      dimension: "governance",
      score: 80,
      level: "L4",
      evidenceCount: 8,
      observedShare: 0.8,
      lastAssessedAt: Date.now(),
    },
  ];
}

const TEST_SECRET = "test-secret-key-123";
const TEST_WORKSPACE = "test-workspace";
const TEST_PUBKEY = "abc123pubkey";
const TEST_AGENT = "agent-test-001";

describe("TRUST_TRANSLATIONS", () => {
  it("should be an array with at least 2 entries", () => {
    expect(Array.isArray(TRUST_TRANSLATIONS)).toBe(true);
    expect(TRUST_TRANSLATIONS.length).toBeGreaterThanOrEqual(2);
  });

  it("each translation should have sourceSystem, targetSystem, mappings", () => {
    for (const t of TRUST_TRANSLATIONS) {
      expect(t.sourceSystem).toBeTruthy();
      expect(t.targetSystem).toBeTruthy();
      expect(Array.isArray(t.mappings)).toBe(true);
    }
  });

  it("should include amc→nist_ai_rmf translation", () => {
    const found = TRUST_TRANSLATIONS.find(
      t => t.sourceSystem === "amc" && t.targetSystem === "nist_ai_rmf"
    );
    expect(found).toBeDefined();
  });

  it("each mapping should have conversionFactor and confidence", () => {
    for (const t of TRUST_TRANSLATIONS) {
      for (const m of t.mappings) {
        expect(typeof m.conversionFactor).toBe("number");
        expect(typeof m.confidence).toBe("number");
        expect(m.confidence).toBeGreaterThan(0);
        expect(m.confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("issueTrustToken", () => {
  it("should return a token with required fields", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    expect(token).toHaveProperty("tokenId");
    expect(token).toHaveProperty("version");
    expect(token).toHaveProperty("issuer");
    expect(token).toHaveProperty("subject");
    expect(token).toHaveProperty("claims");
    expect(token).toHaveProperty("signature");
    expect(token).toHaveProperty("issuedAt");
    expect(token).toHaveProperty("expiresAt");
  });

  it("should set the correct agentId in subject", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    expect(token.subject.agentId).toBe(TEST_AGENT);
  });

  it("should set the correct workspaceId in issuer", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    expect(token.issuer.workspaceId).toBe(TEST_WORKSPACE);
  });

  it("should expire in 24h by default", () => {
    const before = Date.now();
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    const expectedExpiry = before + 24 * 3600000;
    // Allow 1 second tolerance
    expect(token.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(token.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
  });

  it("should respect custom ttlHours", () => {
    const before = Date.now();
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET, { ttlHours: 48 });
    const expectedExpiry = before + 48 * 3600000;
    expect(token.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
  });

  it("should include displayName when provided", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET, { displayName: "My Agent" });
    expect(token.subject.displayName).toBe("My Agent");
  });
});

describe("verifyTrustToken", () => {
  it("should verify a freshly issued token as valid", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    const result = verifyTrustToken(token, TEST_SECRET);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("should fail verification with wrong secret", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    const result = verifyTrustToken(token, "wrong-secret");
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("should detect tampered signature", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    const tampered = { ...token, signature: "deadbeef" };
    const result = verifyTrustToken(tampered, TEST_SECRET);
    expect(result.valid).toBe(false);
  });

  it("should detect expired token", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET, { ttlHours: 0 });
    // Force expiry
    const expired = { ...token, expiresAt: Date.now() - 1000 };
    const result = verifyTrustToken(expired, TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.reasons.some(r => r.includes("expired"))).toBe(true);
  });
});

describe("translateTrustScores", () => {
  it("should return an empty object for unknown system pair", () => {
    const result = translateTrustScores({ security: 75 }, "unknown", "also-unknown");
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should translate known amc → nist_ai_rmf scores", () => {
    const result = translateTrustScores({ security: 75, governance: 80 }, "amc", "nist_ai_rmf");
    // Should have some translated dimensions
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it("translated scores should have score, level, confidence", () => {
    const result = translateTrustScores({ security: 70 }, "amc", "nist_ai_rmf");
    for (const v of Object.values(result)) {
      expect(v).toHaveProperty("score");
      expect(v).toHaveProperty("level");
      expect(v).toHaveProperty("confidence");
    }
  });

  it("translated scores should be in valid range", () => {
    const result = translateTrustScores({ security: 60, governance: 70 }, "amc", "nist_ai_rmf");
    for (const v of Object.values(result)) {
      expect(v.score).toBeGreaterThanOrEqual(0);
      expect(v.confidence).toBeGreaterThan(0);
      expect(v.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("demo tokens and the shared-secret HMAC (vault lane, 2026-11-16)", () => {
  test("a demo token says it is a demo and never verifies, even with its HMAC intact", () => {
    const token = issueDemoTrustToken("agent-1", makeTestClaims());
    expect(token).toMatchObject({ demo: true, notice: DEMO_TOKEN_NOTICE });
    expect(verifyTrustToken(token, DEMO_TOKEN_SECRET)).toMatchObject({ valid: false, hmacMatches: true, demo: true });
    const forged = issueTrustToken("x", "y", "agent-1", makeTestClaims(), DEMO_TOKEN_SECRET);
    expect(verifyTrustToken(forged, DEMO_TOKEN_SECRET).valid).toBe(false);
  });

  test("the HMAC covers the claims: changing a nested score breaks it", () => {
    const token = issueTrustToken(TEST_WORKSPACE, TEST_PUBKEY, TEST_AGENT, makeTestClaims(), TEST_SECRET);
    expect(verifyTrustToken(token, TEST_SECRET).valid).toBe(true);
    const raised = { ...token, claims: token.claims.map(claim => ({ ...claim, score: 100 })) };
    expect(verifyTrustToken(raised, TEST_SECRET)).toMatchObject({ valid: false, hmacMatches: false });
  });

  test("a federated check verifies no claim inside a token that does not verify", () => {
    const token = issueDemoTrustToken("agent-1", makeTestClaims());
    const response = processVerificationRequest(createVerificationRequest("r", token.tokenId, [token.claims[0]!.dimension]), token, "v", DEMO_TOKEN_SECRET);
    expect(response.verified).toBe(false);
  });

  test("score translations are labelled made-up examples", () => {
    expect(TRANSLATION_NOTICE).toMatch(/Example only.*no numeric score/);
  });
});
