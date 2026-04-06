/**
 * Tests for Round 3 gap implementations — R3-01 to R3-05
 */
import { describe, expect, test } from "vitest";

// R3-01: Enterprise IAM
import {
  createSsoSession, isSessionValid, refreshSession, checkAccess,
  DEFAULT_ROLE_DEFINITIONS, getRoleDefinition, resolvePermissions, hasPermission,
  AuditLog, ssoProviderSchema, saveSsoConfig, loadSsoConfig,
  BUILT_IN_ROLES,
} from "../src/auth/enterpriseIam.js";

// R3-02 + R3-03: Enhanced anti-gaming + variance stabilization
import {
  analyzeSessionFingerprints, stabilizeScores,
  type SessionFingerprint,
} from "../src/score/antiGaming.js";

// R3-05: Adapter standardization
import {
  ADAPTER_PROFILES, getAdapterProfile, getAdaptersByTier,
  meetsMinimumSpec, getAdapterScoreAdjustment, getAdapterComparisonMatrix,
} from "../src/adapters/adapterStandardization.js";

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── R3-01: Enterprise IAM ──────────────────────────

describe("R3-01 Enterprise IAM — SSO", () => {
  test("creates valid session", () => {
    const session = createSsoSession("user-1", "sid@example.com", "saml2", ["admin"]);
    expect(session.sessionId).toBeTruthy();
    expect(session.email).toBe("sid@example.com");
    expect(session.roles).toEqual(["admin"]);
    expect(isSessionValid(session)).toBe(true);
  });

  test("expired session is invalid", () => {
    const session = createSsoSession("user-1", "test@test.com", "oidc", ["viewer"], 0);
    expect(isSessionValid(session)).toBe(false);
  });

  test("refresh extends session", () => {
    const session = createSsoSession("user-1", "test@test.com", "oidc", ["viewer"], 1000);
    const refreshed = refreshSession(session, 3600000);
    expect(refreshed.expiresAt).toBeGreaterThan(session.expiresAt);
  });

  test("SSO provider schema validates", () => {
    const provider = ssoProviderSchema.parse({
      providerId: "okta-1",
      type: "oidc",
      issuer: "https://company.okta.com",
      clientId: "abc123",
      allowedDomains: ["company.com"],
    });
    expect(provider.autoProvision).toBe(true);
    expect(provider.defaultRole).toBe("viewer");
  });

  test("saves and loads SSO config", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-iam-"));
    try {
      const providers = [ssoProviderSchema.parse({ providerId: "p1", type: "saml2", issuer: "https://idp.example.com", clientId: "c1" })];
      saveSsoConfig(ws, providers);
      const loaded = loadSsoConfig(ws);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]!.providerId).toBe("p1");
    } finally { rmSync(ws, { recursive: true }); }
  });
});

describe("R3-01 Enterprise IAM — RBAC", () => {
  test("6 built-in roles defined", () => { expect(BUILT_IN_ROLES.length).toBe(6); });
  test("all role definitions exist", () => { for (const r of BUILT_IN_ROLES) expect(getRoleDefinition(r)).toBeDefined(); });
  test("owner has wildcard permissions", () => {
    expect(hasPermission(["owner"], "anything", "anything")).toBe(true);
  });
  test("viewer can read but not write agents", () => {
    expect(hasPermission(["viewer"], "agents", "read")).toBe(true);
    expect(hasPermission(["viewer"], "agents", "write")).toBe(false);
    expect(hasPermission(["viewer"], "agents", "delete")).toBe(false);
  });
  test("auditor can read audit-logs", () => {
    expect(hasPermission(["auditor"], "audit-logs", "read")).toBe(true);
    expect(hasPermission(["auditor"], "audit-logs", "export")).toBe(true);
  });
  test("editor cannot read audit-logs", () => {
    expect(hasPermission(["editor"], "audit-logs", "read")).toBe(false);
  });
  test("security-reviewer can freeze agents", () => {
    expect(hasPermission(["security-reviewer"], "agents", "freeze")).toBe(true);
    expect(hasPermission(["security-reviewer"], "redteam", "execute")).toBe(true);
  });
  test("checkAccess validates session + permissions", () => {
    const session = createSsoSession("u1", "admin@test.com", "oidc", ["admin"]);
    expect(checkAccess(session, "agents", "write").allowed).toBe(true);
    expect(checkAccess(session, "audit-logs", "read").allowed).toBe(true);
  });
  test("checkAccess denies expired session", () => {
    const session = createSsoSession("u1", "admin@test.com", "oidc", ["admin"], 0);
    expect(checkAccess(session, "agents", "read").allowed).toBe(false);
    expect(checkAccess(session, "agents", "read").reason).toContain("expired");
  });
  test("multiple roles combine permissions", () => {
    expect(hasPermission(["viewer", "security-reviewer"], "redteam", "execute")).toBe(true);
    expect(hasPermission(["viewer", "security-reviewer"], "agents", "read")).toBe(true);
  });
});

describe("R3-01 Enterprise IAM — Audit Log", () => {
  test("records entries with hash chain", () => {
    const log = new AuditLog();
    log.record("u1", "s1", "evaluate", "agents", "success");
    log.record("u2", "s2", "delete", "agents", "denied");
    expect(log.size()).toBe(2);
  });

  test("hash chain is valid after multiple entries", () => {
    const log = new AuditLog();
    for (let i = 0; i < 10; i++) log.record(`u${i}`, `s${i}`, "read", "reports", "success");
    expect(log.verifyChainIntegrity().valid).toBe(true);
    expect(log.verifyChainIntegrity().totalEntries).toBe(10);
  });

  test("filters by userId", () => {
    const log = new AuditLog();
    log.record("alice", "s1", "read", "agents", "success");
    log.record("bob", "s2", "write", "agents", "success");
    log.record("alice", "s3", "delete", "agents", "denied");
    expect(log.getEntries({ userId: "alice" })).toHaveLength(2);
    expect(log.getEntries({ userId: "bob" })).toHaveLength(1);
  });

  test("filters by outcome", () => {
    const log = new AuditLog();
    log.record("u1", "s1", "write", "agents", "success");
    log.record("u1", "s1", "delete", "agents", "denied");
    expect(log.getEntries({ outcome: "denied" })).toHaveLength(1);
  });

  test("exportForAudit includes integrity check", () => {
    const log = new AuditLog();
    log.record("u1", "s1", "read", "reports", "success");
    const exported = log.exportForAudit();
    expect(exported.chainIntegrity).toBe(true);
    expect(exported.exportHash).toBeTruthy();
    expect(exported.entries).toHaveLength(1);
  });
});

// ─── R3-02: Enhanced Anti-Gaming ────────────────────

describe("R3-02 Enhanced Anti-Gaming — Cross-Session", () => {
  test("clean sessions return clean verdict", () => {
    const fps: SessionFingerprint[] = [
      { sessionId: "s1", ts: 1000, agentId: "a1", scoreDistribution: [3.5], evidencePatterns: ["ev1", "ev2"], responseLatencyMs: [200, 300, 250, 280, 220], questionOrder: ["q1"] },
      { sessionId: "s2", ts: 2000, agentId: "a1", scoreDistribution: [3.6], evidencePatterns: ["ev3", "ev4"], responseLatencyMs: [190, 310, 260, 270, 230], questionOrder: ["q2"] },
    ];
    const result = analyzeSessionFingerprints(fps);
    expect(result.overallVerdict).toBe("clean");
  });

  test("detects score convergence toward perfect", () => {
    const fps: SessionFingerprint[] = Array.from({ length: 5 }, (_, i) => ({
      sessionId: `s${i}`, ts: i * 1000, agentId: "a1",
      scoreDistribution: [2.0 + i * 0.7], evidencePatterns: [`ev${i}`],
      responseLatencyMs: [200], questionOrder: [`q${i}`],
    }));
    const result = analyzeSessionFingerprints(fps);
    expect(result.suspiciousPatterns.some(p => p.type === "score-convergence")).toBe(true);
  });

  test("detects timing anomaly", () => {
    const fps: SessionFingerprint[] = [{
      sessionId: "s1", ts: 1000, agentId: "a1",
      scoreDistribution: [3.5],
      evidencePatterns: ["ev1"],
      responseLatencyMs: [100, 101, 100, 99, 100, 101, 100, 99, 100, 101], // unnaturally consistent
      questionOrder: ["q1"],
    }, {
      sessionId: "s2", ts: 2000, agentId: "a1",
      scoreDistribution: [3.5], evidencePatterns: ["ev2"],
      responseLatencyMs: [100, 101, 100, 99, 100, 101, 100, 99, 100, 101],
      questionOrder: ["q2"],
    }];
    const result = analyzeSessionFingerprints(fps);
    expect(result.suspiciousPatterns.some(p => p.type === "timing-anomaly")).toBe(true);
  });

  test("detects cross-agent collusion", () => {
    const shared = Array.from({ length: 10 }, (_, i) => `shared-ev-${i}`);
    const fps: SessionFingerprint[] = [
      { sessionId: "s1", ts: 1000, agentId: "agent-A", scoreDistribution: [4.0], evidencePatterns: shared, responseLatencyMs: [200, 300], questionOrder: [] },
      { sessionId: "s2", ts: 2000, agentId: "agent-B", scoreDistribution: [4.0], evidencePatterns: shared, responseLatencyMs: [200, 300], questionOrder: [] },
    ];
    const result = analyzeSessionFingerprints(fps);
    expect(result.collusionIndicators.length).toBeGreaterThan(0);
  });

  test("single session returns clean", () => {
    const result = analyzeSessionFingerprints([{
      sessionId: "s1", ts: 1000, agentId: "a1",
      scoreDistribution: [3.5], evidencePatterns: [],
      responseLatencyMs: [], questionOrder: [],
    }]);
    expect(result.overallVerdict).toBe("clean");
  });
});

// ─── R3-03: Quickscore Variance Stabilization ──────

describe("R3-03 Quickscore Variance Stabilization", () => {
  test("single score returns with moderate stability", () => {
    const result = stabilizeScores([3.5]);
    expect(result.stabilizedScore).toBe(3.5);
    expect(result.stability).toBe("moderate");
  });

  test("consistent scores are stable", () => {
    const result = stabilizeScores([3.5, 3.4, 3.6, 3.5, 3.5]);
    expect(result.stability).toBe("stable");
    expect(result.variance).toBeLessThan(0.01);
    expect(result.confidenceInterval.upper - result.confidenceInterval.lower).toBeLessThan(0.5);
  });

  test("volatile scores are unstable", () => {
    const result = stabilizeScores([1.0, 4.5, 2.0, 4.0, 1.5]);
    expect(result.stability).toBe("unstable");
    expect(result.variance).toBeGreaterThan(0.5);
  });

  test("trimmed mean removes outliers", () => {
    const result = stabilizeScores([3.5, 3.4, 3.6, 3.5, 0.5, 3.5, 5.0]); // 0.5 and 5.0 are outliers
    expect(result.stabilizedScore).toBeGreaterThan(3.0);
    expect(result.stabilizedScore).toBeLessThan(4.0);
  });

  test("confidence-weighted aggregation works", () => {
    const scores = [3.0, 4.0];
    const confidences = [0.9, 0.1]; // heavily weight first score
    const result = stabilizeScores(scores, confidences);
    expect(result.stabilizedScore).toBeLessThan(3.5); // closer to 3.0
  });

  test("empty scores handled", () => {
    const result = stabilizeScores([]);
    expect(result.stabilizedScore).toBe(0);
    expect(result.stability).toBe("unstable");
  });

  test("bounds stay within 0-5", () => {
    const result = stabilizeScores([0.1, 0.2, 0.1]);
    expect(result.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
    const result2 = stabilizeScores([4.9, 5.0, 4.9]);
    expect(result2.confidenceInterval.upper).toBeLessThanOrEqual(5);
  });

  test("runsRequired suggests more runs when unstable", () => {
    const stable = stabilizeScores([3.5, 3.4, 3.6, 3.5, 3.5]);
    const unstable = stabilizeScores([1.0, 4.5]);
    expect(unstable.runsRequired).toBeGreaterThan(stable.runsRequired);
  });
});

// ─── R3-05: Adapter Standardization ─────────────────

describe("R3-05 Adapter Standardization", () => {
  test("14 adapter profiles defined", () => { expect(ADAPTER_PROFILES.length).toBe(14); });

  test("all adapters have required fields", () => {
    for (const p of ADAPTER_PROFILES) {
      expect(p.adapterId).toBeTruthy();
      expect(p.framework).toBeTruthy();
      expect(["native", "bridge", "cli"]).toContain(p.tier);
      expect(p.coverageScore).toBeGreaterThanOrEqual(0);
      expect(p.coverageScore).toBeLessThanOrEqual(100);
    }
  });

  test("native adapters have highest coverage", () => {
    const natives = getAdaptersByTier("native");
    expect(natives.length).toBeGreaterThanOrEqual(3);
    for (const n of natives) expect(n.coverageScore).toBeGreaterThanOrEqual(85);
  });

  test("CLI adapters have lower coverage", () => {
    const clis = getAdaptersByTier("cli");
    expect(clis.length).toBeGreaterThanOrEqual(5);
    for (const c of clis) expect(c.coverageScore).toBeLessThanOrEqual(70);
  });

  test("native adapters meet minimum spec", () => {
    for (const p of getAdaptersByTier("native")) {
      expect(meetsMinimumSpec(p).meets).toBe(true);
    }
  });

  test("score adjustment doesn't penalize CLI", () => {
    const adj = getAdapterScoreAdjustment("claudeCli");
    expect(adj.factor).toBe(1.0); // no score penalty
    expect(adj.confidenceImpact).toBeLessThan(0); // but lower confidence
  });

  test("comparison matrix has correct dimensions", () => {
    const matrix = getAdapterComparisonMatrix();
    expect(matrix.adapters.length).toBe(14);
    expect(matrix.matrix.length).toBe(14);
    expect(matrix.capabilities.length).toBe(10);
  });

  test("getAdapterProfile returns correct profile", () => {
    const p = getAdapterProfile("langchainNode");
    expect(p).toBeDefined();
    expect(p!.tier).toBe("native");
    expect(p!.framework).toContain("LangChain");
  });

  test("unknown adapter returns undefined", () => {
    expect(getAdapterProfile("nonexistent")).toBeUndefined();
  });
});
