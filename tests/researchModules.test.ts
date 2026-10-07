import { describe, it, expect } from "vitest";
import {
  scoreCalibrationGap,
  scanCalibrationInfrastructure,
} from "../src/score/calibrationGap.js";
import {
  scoreEvidenceConflict,
  scanEvidenceConflicts,
} from "../src/score/evidenceConflict.js";
import { scoreSleeperDetection } from "../src/score/sleeperDetection.js";
import { scoreAuditDepth } from "../src/score/auditDepth.js";
import {
  scorePolicyConsistency,
  scanPolicyConsistency,
} from "../src/score/policyConsistency.js";
import {
  scoreTransitionQuality,
  scoreLevelTransitions,
  scanLevelTransitionInfra,
} from "../src/score/levelTransition.js";
import { scoreGamingResistance } from "../src/score/gamingResistance.js";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── Calibration Gap ───

describe("calibrationGap", () => {
  it("perfect calibration scores 100", () => {
    const result = scoreCalibrationGap({
      selfReported: { reliability: 0.8, security: 0.6, observability: 0.7 },
      observed: { reliability: 0.8, security: 0.6, observability: 0.7 },
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe(5);
    expect(result.meanCalibrationError).toBe(0);
  });

  it("overconfident agent scores lower", () => {
    const result = scoreCalibrationGap({
      selfReported: { reliability: 0.9, security: 0.9, observability: 0.9 },
      observed: { reliability: 0.3, security: 0.2, observability: 0.4 },
    });
    expect(result.score).toBeLessThan(50);
    expect(result.overconfidenceRatio).toBeGreaterThan(0.5);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it("underconfident agent still has calibration error", () => {
    const result = scoreCalibrationGap({
      selfReported: { reliability: 0.2, security: 0.1 },
      observed: { reliability: 0.8, security: 0.9 },
    });
    expect(result.underconfidenceRatio).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(50);
  });

  it("scan detects infrastructure", () => {
    const result = scanCalibrationInfrastructure(ROOT);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.level).toBeGreaterThanOrEqual(0);
  });
});

// ─── Evidence Conflict ───

describe("evidenceConflict", () => {
  it("consistent evidence has no conflicts", () => {
    const result = scoreEvidenceConflict([
      { dimension: "reliability", score: 4 },
      { dimension: "reliability", score: 4.2 },
      { dimension: "security", score: 3 },
      { dimension: "security", score: 3.1 },
    ]);
    expect(result.conflictCount).toBe(0);
    expect(result.score).toBeGreaterThan(90);
  });

  it("contradictory evidence has high conflict", () => {
    const result = scoreEvidenceConflict([
      { dimension: "reliability", score: 5 },
      { dimension: "reliability", score: 1 },
      { dimension: "security", score: 4.5 },
      { dimension: "security", score: 0.5 },
    ]);
    expect(result.conflictCount).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(50);
  });

  it("empty evidence returns baseline", () => {
    const result = scoreEvidenceConflict([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
  });

  it("detects temporal instability", () => {
    const result = scoreEvidenceConflict([
      { dimension: "reliability", score: 5, timestamp: "2026-01-01" },
      { dimension: "reliability", score: 1, timestamp: "2026-01-02" },
    ]);
    expect(result.patterns.some((p) => p.includes("Temporal instability"))).toBe(true);
  });

  it("detects context-dependent behavior", () => {
    const result = scoreEvidenceConflict([
      { dimension: "security", questionId: "AMC-3.1", score: 5, context: "eval" },
      { dimension: "security", questionId: "AMC-3.1", score: 1, context: "deploy" },
    ]);
    expect(result.patterns.some((p) => p.includes("Context-dependent") || p.includes("sleeper"))).toBe(true);
  });

  it("scan detects infrastructure", () => {
    const result = scanEvidenceConflicts(ROOT);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── Sleeper Detection ───

describe("sleeperDetection", () => {
  it("scans AMC repo for detection infrastructure", () => {
    const result = scoreSleeperDetection(ROOT);
    expect(result.score).toBeGreaterThan(0);
    expect(result.passK.length).toBe(5);
    expect(result.passK[0].k).toBe(1);
  });

  it("returns gaps for missing infrastructure", () => {
    const result = scoreSleeperDetection("/tmp/empty-repo-" + Date.now());
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});

// ─── Audit Depth ───

describe("auditDepth", () => {
  it("scores AMC repo audit depth", () => {
    const result = scoreAuditDepth(ROOT);
    expect(result.score).toBeGreaterThan(0);
    expect(result.blackBox.available).toBe(true);
    expect(result.blackBox.capabilities.length).toBeGreaterThan(0);
  });

  it("empty repo has no audit depth", () => {
    const result = scoreAuditDepth("/tmp/empty-repo-" + Date.now());
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
  });
});

// ─── Policy Consistency ───

describe("policyConsistency", () => {
  it("perfect consistency scores 100", () => {
    const trials = Array.from({ length: 20 }, (_, i) => ({
      policyId: "no-pii-leak",
      trial: i,
      passed: true,
    }));
    const result = scorePolicyConsistency(trials);
    expect(result.passRate).toBe(1);
    expect(result.score).toBe(100);
    expect(result.level).toBe(5);
  });

  it("50% pass rate has low pass^8", () => {
    const trials = Array.from({ length: 20 }, (_, i) => ({
      policyId: "no-pii-leak",
      trial: i,
      passed: i % 2 === 0,
    }));
    const result = scorePolicyConsistency(trials);
    expect(result.passRate).toBe(0.5);
    const pass8 = result.passK.find((p) => p.k === 8);
    expect(pass8).toBeDefined();
    expect(pass8!.rate).toBeLessThan(0.01); // 0.5^8 = 0.0039
  });

  it("empty trials return zero", () => {
    const result = scorePolicyConsistency([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
  });

  it("scan detects infrastructure", () => {
    const result = scanPolicyConsistency(ROOT);
    expect(result.score).toBeGreaterThan(0);
  });
});

// ─── Level Transition ───

describe("levelTransition", () => {
  it("scores transition quality", () => {
    const transition = scoreTransitionQuality({
      agentId: "test-agent",
      dimension: "reliability",
      fromLevel: 3,
      toLevel: 4,
      direction: "promotion",
      timestamp: "2026-02-24T00:00:00Z",
      evidenceCount: 60,
      sustainedDays: 35,
      adversarialTested: true,
    });
    expect(transition.quality).toBeGreaterThan(80);
    expect(transition.confidence).toBeGreaterThan(0.8);
  });

  it("insufficient evidence lowers quality", () => {
    const transition = scoreTransitionQuality({
      agentId: "test-agent",
      dimension: "security",
      fromLevel: 3,
      toLevel: 4,
      direction: "promotion",
      timestamp: "2026-02-24T00:00:00Z",
      evidenceCount: 5, // Need 50 for L4
      sustainedDays: 2, // Need 30 for L4
      adversarialTested: false, // Required for L4
    });
    expect(transition.quality).toBeLessThan(40);
  });

  it("empty transitions return zero", () => {
    const result = scoreLevelTransitions([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe(0);
  });

  it("scan detects infrastructure", () => {
    const result = scanLevelTransitionInfra(ROOT);
    expect(result.score).toBeGreaterThan(0);
  });
});

// ─── Gaming Resistance ───

describe("gamingResistance", () => {
  it("inventories AMC source controls without claiming measured gaming resistance", () => {
    const result = scoreGamingResistance(ROOT);
    expect(result.assessmentStatus).toBe("not_measured");
    expect(result.score).toBeNull();
    expect(result.level).toBeNull();
    expect(result.controlInventory.applicable).toBe(true);
    expect(result.controlInventory).not.toHaveProperty("score");
    expect(result.controlInventory.flooding.presentPaths).toContain("src/evidence");
  });

  it("does not confuse an empty inventory with observed vulnerability", () => {
    const result = scoreGamingResistance("/tmp/empty-repo-" + Date.now());
    expect(result.score).toBeNull();
    expect(result.level).toBeNull();
    expect(result.controlInventory.applicable).toBe(false);
    expect(result.controlInventory.flooding.presentPaths).toEqual([]);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
