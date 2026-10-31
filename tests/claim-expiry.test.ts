import { describe, it, expect } from "vitest";
import { checkClaimExpiry, CLAIM_TTL, type ClaimExpiryProfile } from "../src/score/claimExpiry.js";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

function makeClaim(overrides: Partial<ClaimExpiryProfile> & { claimId: string; claimType: string; ttlDays: number; createdAt: string }): ClaimExpiryProfile {
  return {
    expiresAt: "",
    isExpired: false,
    isStale: false,
    renewalRequired: false,
    ...overrides,
  };
}

describe("CLAIM_TTL", () => {
  it("is an object with TTL values", () => {
    expect(typeof CLAIM_TTL).toBe("object");
    expect(CLAIM_TTL).not.toBeNull();
  });

  it("all TTL values are positive numbers", () => {
    for (const [, v] of Object.entries(CLAIM_TTL)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("checkClaimExpiry", () => {
  it("empty array leaves certification unevaluated", () => {
    const result = checkClaimExpiry([]);
    expect(result.expired).toHaveLength(0);
    expect(result.stale).toHaveLength(0);
    expect(result.fresh).toHaveLength(0);
    expect(result.certificationBlocked).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });

  it("expired claims correctly identified", () => {
    const claim = makeClaim({
      claimId: "c1",
      claimType: "security-audit",
      createdAt: new Date(now - 400 * DAY).toISOString(),
      ttlDays: 365,
    });
    const result = checkClaimExpiry([claim]);
    expect(result.expired.length).toBe(1);
    expect(result.fresh.length).toBe(0);
  });

  it("fresh claims correctly identified", () => {
    const claim = makeClaim({
      claimId: "c2",
      claimType: "security-audit",
      createdAt: new Date(now - 10 * DAY).toISOString(),
      ttlDays: 365,
    });
    const result = checkClaimExpiry([claim]);
    expect(result.fresh.length).toBe(1);
    expect(result.expired.length).toBe(0);
  });

  it("stale claims (>80% consumed) flagged", () => {
    const claim = makeClaim({
      claimId: "c3",
      claimType: "drift-check",
      createdAt: new Date(now - 85 * DAY).toISOString(),
      ttlDays: 100,
    });
    const result = checkClaimExpiry([claim]);
    expect(result.stale.length).toBe(1);
    expect(result.expired.length).toBe(0);
  });

  it("certificationBlocked when critical expired claim exists", () => {
    const claim = makeClaim({
      claimId: "c4",
      claimType: "security-audit", // critical type
      createdAt: new Date(now - 400 * DAY).toISOString(),
      ttlDays: 365,
    });
    const result = checkClaimExpiry([claim]);
    expect(result.certificationBlocked).toBe(true);
  });

  it("certificationBlocked false for non-critical expired type", () => {
    const claim = makeClaim({
      claimId: "c5",
      claimType: "drift-check", // not critical
      createdAt: new Date(now - 400 * DAY).toISOString(),
      ttlDays: 30,
    });
    const result = checkClaimExpiry([claim]);
    expect(result.certificationBlocked).toBe(false);
  });

  it("mixed claims categorized correctly", () => {
    const claims = [
      makeClaim({ claimId: "f1", claimType: "security-audit", createdAt: new Date(now - 10 * DAY).toISOString(), ttlDays: 365 }),
      makeClaim({ claimId: "e1", claimType: "security-audit", createdAt: new Date(now - 400 * DAY).toISOString(), ttlDays: 365 }),
      makeClaim({ claimId: "s1", claimType: "drift-check", createdAt: new Date(now - 25 * DAY).toISOString(), ttlDays: 30 }),
    ];
    const result = checkClaimExpiry(claims);
    expect(result.fresh.length).toBeGreaterThanOrEqual(1);
    expect(result.expired.length).toBeGreaterThanOrEqual(1);
    expect(result.stale.length).toBeGreaterThanOrEqual(1);
  });
});
