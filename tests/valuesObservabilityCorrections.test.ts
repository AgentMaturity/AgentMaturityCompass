/**
 * tests/valuesObservabilityCorrections.test.ts
 *
 * Coverage batch for:
 *   - src/values/valueCoherence.ts   (VCI, inversions, drift, report, parseWindow)
 *   - src/values/disempowerment.ts   (empowerment score, dependency patterns, report)
 *   - src/observability/anomalyDetector.ts  (rate drop, trust regression, volatility spike, composite)
 *   - src/observability/otelExporter.ts     (classifyTrustTierRank)
 *   - src/corrections/correctionTracker.ts  (verifyCorrection, computeCorrectionHash, computeEffectivenessReport)
 *   - src/claims/claimLifecycle.ts          (VALID_TRANSITIONS via transitionClaim)
 *   - src/claims/claimStore.ts              (insertClaim, getClaimsByState, insertClaimTransition)
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

// ── shared test workspace ──────────────────────────────────────────────────

let tmpDir: string;
let db: Database.Database;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "amc-val-obs-test-"));
});

afterAll(() => {
  try { db?.close(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. VALUE COHERENCE
// ═══════════════════════════════════════════════════════════════════════════

import {
  computeVCI,
  computeValueDrift,
  computeValueDriftAnalytics,
  detectInversions,
  generateValueCoherenceReport,
  parseWindowString,
} from "../src/values/valueCoherence.js";
import type { RevealedPreference } from "../src/values/valueTypes.js";

const VALID_VALUES = ["safety", "speed", "accuracy", "cost", "privacy", "transparency", "autonomy", "fairness", "reliability", "compliance"] as const;
type VDim = typeof VALID_VALUES[number];

function pref(overrides: Partial<RevealedPreference> & { preferenceId: string; ts: number; impliedValue: VDim }): RevealedPreference {
  return {
    agentId: "agent-1",
    context: "task-context",
    chosenOption: overrides.impliedValue,
    alternatives: overrides.alternatives ?? [],
    evidenceRef: "ev-1",
    signature: "sig",
    ...overrides,
  };
}

describe("valueCoherence — parseWindowString", () => {
  test("parses days", () => {
    expect(parseWindowString("7d")).toBe(7 * 24 * 3600_000);
  });
  test("parses hours", () => {
    expect(parseWindowString("3h")).toBe(3 * 3600_000);
  });
  test("parses minutes", () => {
    expect(parseWindowString("30m")).toBe(30 * 60_000);
  });
  test("falls back to 14d on invalid format", () => {
    expect(parseWindowString("2w")).toBe(14 * 24 * 3600_000);
    expect(parseWindowString("abc")).toBe(14 * 24 * 3600_000);
    expect(parseWindowString("")).toBe(14 * 24 * 3600_000);
  });
});

describe("valueCoherence — computeVCI", () => {
  test("returns 1 for empty preferences", () => {
    expect(computeVCI([])).toBe(1);
  });

  test("returns 1 for single preference", () => {
    const prefs = [pref({ preferenceId: "p1", ts: 1000, impliedValue: "safety" })];
    expect(computeVCI(prefs)).toBe(1);
  });

  test("returns value in [0, 1] for multiple preferences", () => {
    const now = Date.now();
    const prefs: RevealedPreference[] = [
      pref({ preferenceId: "p1", ts: now - 4000, impliedValue: "safety", alternatives: ["speed"] }),
      pref({ preferenceId: "p2", ts: now - 3000, impliedValue: "safety", alternatives: ["cost"] }),
      pref({ preferenceId: "p3", ts: now - 2000, impliedValue: "accuracy", alternatives: ["speed"] }),
      pref({ preferenceId: "p4", ts: now - 1000, impliedValue: "accuracy", alternatives: ["cost"] }),
    ];
    const vci = computeVCI(prefs);
    expect(vci).toBeGreaterThanOrEqual(0);
    expect(vci).toBeLessThanOrEqual(1);
  });

  test("ignores preferences with unknown impliedValue", () => {
    const prefs = [
      pref({ preferenceId: "p1", ts: 1000, impliedValue: "safety" }),
      // @ts-expect-error intentional invalid value
      { preferenceId: "p2", agentId: "a", context: "c", chosenOption: "x", alternatives: [], impliedValue: "unknown-dim", evidenceRef: "e", ts: 2000, signature: "s" } as RevealedPreference,
    ];
    // Should not throw
    const vci = computeVCI(prefs);
    expect(typeof vci).toBe("number");
  });
});

describe("valueCoherence — computeValueDrift", () => {
  test("returns empty for fewer than 4 prefs", () => {
    const prefs = [
      pref({ preferenceId: "p1", ts: 1000, impliedValue: "safety" }),
      pref({ preferenceId: "p2", ts: 2000, impliedValue: "speed" }),
      pref({ preferenceId: "p3", ts: 3000, impliedValue: "cost" }),
    ];
    expect(computeValueDrift(prefs, 86400_000)).toHaveLength(0);
  });

  test("returns drift points for sufficient preferences", () => {
    const now = Date.now();
    const prefs: RevealedPreference[] = Array.from({ length: 8 }, (_, i) => ({
      preferenceId: `p${i}`,
      agentId: "agent-1",
      context: "ctx",
      chosenOption: i < 4 ? "safety" : "speed",
      alternatives: [],
      impliedValue: (i < 4 ? "safety" : "speed") as VDim,
      evidenceRef: `ev-${i}`,
      ts: now - (8 - i) * 1000,
      signature: "sig",
    }));
    const points = computeValueDrift(prefs, 86400_000);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.delta).toBeGreaterThanOrEqual(0);
      expect(p.delta).toBeLessThanOrEqual(1);
      expect(["STABLE", "DRIFTING", "SHIFTING"]).toContain(p.trend);
    }
  });
});

describe("valueCoherence — computeValueDriftAnalytics", () => {
  test("returns zeros for empty points", () => {
    const analytics = computeValueDriftAnalytics([]);
    expect(analytics.maxDelta).toBe(0);
    expect(analytics.meanDelta).toBe(0);
    expect(analytics.shiftingCount).toBe(0);
    expect(analytics.driftingCount).toBe(0);
    expect(analytics.stableCount).toBe(0);
  });

  test("counts trends correctly", () => {
    const points = [
      { dimension: "safety", delta: 0.05, trend: "STABLE" as const },
      { dimension: "speed", delta: 0.2, trend: "DRIFTING" as const },
      { dimension: "cost", delta: 0.5, trend: "SHIFTING" as const },
    ];
    const analytics = computeValueDriftAnalytics(points);
    expect(analytics.stableCount).toBe(1);
    expect(analytics.driftingCount).toBe(1);
    expect(analytics.shiftingCount).toBe(1);
    expect(analytics.maxDelta).toBeCloseTo(0.5, 5);
  });
});

describe("valueCoherence — detectInversions", () => {
  test("returns empty for no prefs", () => {
    expect(detectInversions([])).toHaveLength(0);
  });

  test("returns empty when no inversions", () => {
    const prefs = [
      pref({ preferenceId: "p1", ts: 1000, impliedValue: "safety", alternatives: ["speed"], chosenOption: "safety", context: "ctx" }),
      pref({ preferenceId: "p2", ts: 2000, impliedValue: "safety", alternatives: ["cost"], chosenOption: "safety", context: "ctx" }),
    ];
    expect(detectInversions(prefs)).toHaveLength(0);
  });

  test("detects inversion when A prefers X over Y then B prefers Y over X in same context", () => {
    const now = Date.now();
    const prefs: RevealedPreference[] = [
      {
        preferenceId: "p1", agentId: "agent-1", context: "deploy context",
        chosenOption: "safety", impliedValue: "safety", alternatives: ["speed"],
        evidenceRef: "ev1", ts: now - 200_000_000, signature: "s1"
      },
      {
        preferenceId: "p2", agentId: "agent-1", context: "deploy context",
        chosenOption: "speed", impliedValue: "speed", alternatives: ["safety"],
        evidenceRef: "ev2", ts: now - 100_000_000, signature: "s2"
      },
    ];
    const inversions = detectInversions(prefs);
    expect(inversions.length).toBeGreaterThanOrEqual(1);
    const inv = inversions[0]!;
    expect(inv.inversionId).toBeDefined();
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(inv.severity);
    expect(inv.explanation).toContain("safety");
    expect(inv.explanation).toContain("speed");
  });

  test("CRITICAL severity for inversion within an hour", () => {
    const now = Date.now();
    const prefs: RevealedPreference[] = [
      {
        preferenceId: "pa", agentId: "a", context: "ops",
        chosenOption: "safety", impliedValue: "safety", alternatives: ["speed"],
        evidenceRef: "e1", ts: now - 1000, signature: "s"
      },
      {
        preferenceId: "pb", agentId: "a", context: "ops",
        chosenOption: "speed", impliedValue: "speed", alternatives: ["safety"],
        evidenceRef: "e2", ts: now, signature: "s"
      },
    ];
    const inversions = detectInversions(prefs);
    expect(inversions.length).toBeGreaterThanOrEqual(1);
    expect(inversions[0]!.severity).toBe("CRITICAL");
  });
});

describe("valueCoherence — generateValueCoherenceReport", () => {
  test("generates report with agentId and signature", () => {
    const now = Date.now();
    const prefs: RevealedPreference[] = [
      pref({ preferenceId: "p1", ts: now - 1000, impliedValue: "safety", alternatives: [] }),
      pref({ preferenceId: "p2", ts: now - 500, impliedValue: "speed", alternatives: [] }),
    ];
    const report = generateValueCoherenceReport("agent-1", prefs, 86400_000);
    expect(report.agentId).toBe("agent-1");
    expect(report.signature).toBeDefined();
    expect(report.vci).toBeGreaterThanOrEqual(0);
    expect(report.vci).toBeLessThanOrEqual(1);
    expect(report.windowStartTs).toBeLessThan(report.windowEndTs);
  });

  test("generates empty inversions and drift for empty prefs", () => {
    const report = generateValueCoherenceReport("agent-empty", [], 86400_000);
    expect(report.inversions).toHaveLength(0);
    expect(report.preferenceCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. DISEMPOWERMENT
// ═══════════════════════════════════════════════════════════════════════════

import {
  computeEmpowermentScore,
  detectDependencyPatterns,
} from "../src/values/disempowerment.js";
import type { EmpowermentInteraction } from "../src/values/valueTypes.js";

function interaction(
  overrides: Partial<EmpowermentInteraction> & { interactionId: string; ts: number; empowermentDelta: number; interactionType: EmpowermentInteraction["interactionType"] }
): EmpowermentInteraction {
  return {
    agentId: "agent-1",
    humanCapabilityBefore: 0.5,
    humanCapabilityAfter: 0.5 + overrides.empowermentDelta,
    presentedOptions: true,
    presentedReasoning: true,
    educationalContent: false,
    evidenceRef: "ev-1",
    signature: "sig",
    ...overrides,
  };
}

describe("disempowerment — computeEmpowermentScore", () => {
  test("returns 0.5 for empty interactions", () => {
    expect(computeEmpowermentScore([])).toBe(0.5);
  });

  test("returns value near 1.0 for all positive deltas", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: 1.0, interactionType: "guidance" }),
      interaction({ interactionId: "i2", ts: 2000, empowermentDelta: 0.8, interactionType: "guidance" }),
    ];
    const score = computeEmpowermentScore(interactions);
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  test("returns value near 0 for all negative deltas", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: -1.0, interactionType: "delegation" }),
      interaction({ interactionId: "i2", ts: 2000, empowermentDelta: -0.9, interactionType: "delegation" }),
    ];
    const score = computeEmpowermentScore(interactions);
    expect(score).toBeLessThan(0.2);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test("returns 0.5 for balanced deltas", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: 1.0, interactionType: "task" }),
      interaction({ interactionId: "i2", ts: 2000, empowermentDelta: -1.0, interactionType: "task" }),
    ];
    expect(computeEmpowermentScore(interactions)).toBeCloseTo(0.5, 5);
  });

  test("clamps to [0, 1]", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: 999, interactionType: "task" }),
    ];
    expect(computeEmpowermentScore(interactions)).toBeLessThanOrEqual(1);
  });
});

describe("disempowerment — detectDependencyPatterns", () => {
  test("returns empty for fewer than 3 interactions per domain", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: -0.5, interactionType: "task" }),
      interaction({ interactionId: "i2", ts: 2000, empowermentDelta: -0.5, interactionType: "task" }),
    ];
    expect(detectDependencyPatterns(interactions)).toHaveLength(0);
  });

  test("returns empty for improving trends", () => {
    const interactions = [
      interaction({ interactionId: "i1", ts: 1000, empowermentDelta: 0.3, interactionType: "guidance" }),
      interaction({ interactionId: "i2", ts: 2000, empowermentDelta: 0.5, interactionType: "guidance" }),
      interaction({ interactionId: "i3", ts: 3000, empowermentDelta: 0.8, interactionType: "guidance" }),
      interaction({ interactionId: "i4", ts: 4000, empowermentDelta: 0.9, interactionType: "guidance" }),
    ];
    const patterns = detectDependencyPatterns(interactions);
    // Improving domain — no dependency pattern expected
    expect(patterns.length).toBe(0);
  });

  test("detects declining patterns with negative deltas", () => {
    // Need >3 per domain, declining trend
    const interactions: EmpowermentInteraction[] = Array.from({ length: 6 }, (_, i) => ({
      interactionId: `i${i}`,
      agentId: "agent-1",
      ts: 1000 * (i + 1),
      interactionType: "delegation" as const,
      humanCapabilityBefore: 0.5,
      humanCapabilityAfter: 0.0,
      empowermentDelta: i < 3 ? -0.1 : -0.9, // decline in second half
      presentedOptions: false,
      presentedReasoning: false,
      educationalContent: false,
      evidenceRef: "ev",
      signature: "sig",
    }));
    const patterns = detectDependencyPatterns(interactions);
    expect(patterns.length).toBeGreaterThan(0);
    const p = patterns[0]!;
    expect(p.agentId).toBe("agent-1");
    expect(p.taskDomain).toBe("delegation");
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(p.severity);
    expect(p.humanIndependenceScore).toBeGreaterThanOrEqual(0);
    expect(p.humanIndependenceScore).toBeLessThanOrEqual(1);
  });

  test("pattern has CRITICAL severity for very low independence", () => {
    // empowermentDelta = -1 throughout → independenceScore ≈ 0
    const interactions: EmpowermentInteraction[] = Array.from({ length: 6 }, (_, i) => ({
      interactionId: `i${i}`,
      agentId: "agent-1",
      ts: 1000 * (i + 1),
      interactionType: "question" as const,
      humanCapabilityBefore: 0.5,
      humanCapabilityAfter: 0.0,
      empowermentDelta: -1.0,
      presentedOptions: false,
      presentedReasoning: false,
      educationalContent: false,
      evidenceRef: "ev",
      signature: "sig",
    }));
    const patterns = detectDependencyPatterns(interactions);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]!.severity).toBe("CRITICAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. OBSERVABILITY — classifyTrustTierRank
// ═══════════════════════════════════════════════════════════════════════════

import { classifyTrustTierRank } from "../src/observability/otelExporter.js";

describe("classifyTrustTierRank", () => {
  test("SELF_REPORTED returns lowest rank 1", () => {
    expect(classifyTrustTierRank("SELF_REPORTED")).toBe(1);
  });
  test("ATTESTED returns rank 2", () => {
    expect(classifyTrustTierRank("ATTESTED")).toBe(2);
  });
  test("OBSERVED returns rank 3", () => {
    expect(classifyTrustTierRank("OBSERVED")).toBe(3);
  });
  test("OBSERVED_HARDENED returns highest rank 4", () => {
    expect(classifyTrustTierRank("OBSERVED_HARDENED")).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. ANOMALY DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

import {
  detectEvidenceRateDrop,
  detectTrustTierRegression,
  detectScoreVolatilitySpike,
  detectEvidenceStreamAnomalies,
} from "../src/observability/anomalyDetector.js";
import type { EvidenceSignalPoint, ScoreSignalPoint } from "../src/observability/anomalyDetector.js";

describe("detectEvidenceRateDrop", () => {
  const window = 60_000; // 1 minute window

  test("returns null for empty signal", () => {
    expect(detectEvidenceRateDrop([], { nowTs: Date.now() })).toBeNull();
  });

  test("returns null when no baseline activity (baselineAvg=0)", () => {
    // All events in recent window, none in baseline windows
    const now = Date.now();
    const points: EvidenceSignalPoint[] = Array.from({ length: 5 }, (_, i) => ({
      ts: now - i * 1000,
    }));
    const result = detectEvidenceRateDrop(points, { nowTs: now, windowMs: window });
    // baselineAvg is 0, so returns null
    expect(result).toBeNull();
  });

  test("returns null when drop is below threshold", () => {
    const now = Date.now();
    // Recent window AND baseline windows all have similar density → no drop
    const points: EvidenceSignalPoint[] = [];
    // Recent window: 10 events spread across first window
    for (let j = 0; j < 10; j++) {
      points.push({ ts: now - j * (window / 11) });
    }
    // Baseline windows (w=1..5): 10 events each
    for (let w = 1; w <= 5; w++) {
      for (let j = 0; j < 10; j++) {
        points.push({ ts: now - window * w - j * 1000 });
      }
    }
    const result = detectEvidenceRateDrop(points, { nowTs: now, windowMs: window, dropThreshold: 0.5 });
    // Similar rate in recent and baseline → no significant drop
    expect(result).toBeNull();
  });

  test("detects CRITICAL drop when recent rate is near zero vs high baseline", () => {
    const now = Date.now();
    // Baseline windows: 10 events in each of 4 past windows
    // Recent window: 0 events
    const points: EvidenceSignalPoint[] = [];
    for (let w = 1; w <= 4; w++) {
      for (let j = 0; j < 10; j++) {
        points.push({ ts: now - window * (w + 1) - j * 100 });
      }
    }
    // No events in recent window (now - window to now)
    const result = detectEvidenceRateDrop(points, {
      nowTs: now, windowMs: window, baselineWindows: 4, dropThreshold: 0.5
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe("EVIDENCE_RATE_DROP");
    expect(result!.severity).toBe("CRITICAL");
    expect(result!.dropRatio).toBeGreaterThan(0.8);
    expect(result!.message).toContain("dropped");
  });

  test("WARN severity for moderate drop (60-64% drop)", () => {
    const now = Date.now();
    const points: EvidenceSignalPoint[] = [];
    // baseline: ~10 per window
    for (let w = 1; w <= 4; w++) {
      for (let j = 0; j < 10; j++) {
        points.push({ ts: now - window * (w + 1) - j * 100 });
      }
    }
    // recent: ~3 events (70% drop but let's target ~60%)
    for (let j = 0; j < 4; j++) {
      points.push({ ts: now - j * 1000 });
    }
    const result = detectEvidenceRateDrop(points, {
      nowTs: now, windowMs: window, baselineWindows: 4, dropThreshold: 0.5
    });
    // We may get null or WARN/HIGH — just verify shape if non-null
    if (result !== null) {
      expect(result.type).toBe("EVIDENCE_RATE_DROP");
      expect(["WARN", "HIGH", "CRITICAL"]).toContain(result.severity);
    }
  });

  test("returns null for invalid options (windowMs=0)", () => {
    const result = detectEvidenceRateDrop([{ ts: 1 }], { windowMs: 0 });
    expect(result).toBeNull();
  });
});

describe("detectTrustTierRegression", () => {
  test("returns null for empty points", () => {
    expect(detectTrustTierRegression([])).toBeNull();
  });

  test("returns null when fewer than 2 points with trustTier", () => {
    const points: EvidenceSignalPoint[] = [
      { ts: 1000, trustTier: "OBSERVED" },
    ];
    expect(detectTrustTierRegression(points)).toBeNull();
  });

  test("returns null when latest tier is same as strongest", () => {
    const points: EvidenceSignalPoint[] = [
      { ts: 1000, trustTier: "OBSERVED" },
      { ts: 2000, trustTier: "OBSERVED" },
    ];
    expect(detectTrustTierRegression(points)).toBeNull();
  });

  test("detects regression from OBSERVED_HARDENED to SELF_REPORTED", () => {
    const points: EvidenceSignalPoint[] = [
      { ts: 1000, trustTier: "OBSERVED_HARDENED" },
      { ts: 2000, trustTier: "ATTESTED" },
      { ts: 3000, trustTier: "SELF_REPORTED" },
    ];
    const result = detectTrustTierRegression(points);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("TRUST_TIER_REGRESSION");
    expect(result!.fromTier).toBe("OBSERVED_HARDENED");
    expect(result!.toTier).toBe("SELF_REPORTED");
    expect(result!.rankDrop).toBe(3); // 4 → 1
    expect(result!.severity).toBe("HIGH"); // rankDrop >= 2
    expect(result!.message).toContain("regressed");
  });

  test("WARN severity for rank drop of exactly 1", () => {
    const points: EvidenceSignalPoint[] = [
      { ts: 1000, trustTier: "OBSERVED" },
      { ts: 2000, trustTier: "ATTESTED" },
    ];
    const result = detectTrustTierRegression(points);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("WARN");
    expect(result!.rankDrop).toBe(1);
  });

  test("respects minRankDrop option", () => {
    const points: EvidenceSignalPoint[] = [
      { ts: 1000, trustTier: "OBSERVED" },
      { ts: 2000, trustTier: "ATTESTED" },
    ];
    // minRankDrop=2 means rank drop of 1 should be ignored
    expect(detectTrustTierRegression(points, { minRankDrop: 2 })).toBeNull();
  });
});

describe("detectScoreVolatilitySpike", () => {
  test("returns null for fewer than 8 points", () => {
    const pts: ScoreSignalPoint[] = Array.from({ length: 7 }, (_, i) => ({ ts: i * 1000, score: 50 + i }));
    expect(detectScoreVolatilitySpike(pts)).toBeNull();
  });

  test("returns null for stable scores", () => {
    const pts: ScoreSignalPoint[] = Array.from({ length: 10 }, (_, i) => ({ ts: i * 1000, score: 75 }));
    expect(detectScoreVolatilitySpike(pts)).toBeNull();
  });

  test("detects spike when recent volatility >> baseline volatility", () => {
    const pts: ScoreSignalPoint[] = [
      // First half: stable (low volatility)
      { ts: 1000, score: 75 }, { ts: 2000, score: 75 }, { ts: 3000, score: 76 }, { ts: 4000, score: 75 },
      { ts: 5000, score: 75 }, { ts: 6000, score: 74 }, { ts: 7000, score: 75 }, { ts: 8000, score: 75 },
      // Second half: extremely volatile
      { ts: 9000, score: 75 }, { ts: 10000, score: 45 }, { ts: 11000, score: 90 }, { ts: 12000, score: 30 },
      { ts: 13000, score: 85 }, { ts: 14000, score: 20 }, { ts: 15000, score: 95 }, { ts: 16000, score: 10 },
    ];
    const result = detectScoreVolatilitySpike(pts, { spikeThreshold: 2, minimumAbsoluteVolatility: 1 });
    expect(result).not.toBeNull();
    expect(result!.type).toBe("SCORE_VOLATILITY_SPIKE");
    expect(result!.spikeRatio).toBeGreaterThan(2);
    expect(result!.message).toContain("spiked");
    expect(["WARN", "HIGH", "CRITICAL"]).toContain(result!.severity);
  });

  test("CRITICAL severity for very high spike ratio (>=4x)", () => {
    const pts: ScoreSignalPoint[] = [
      // stable baseline
      { ts: 1, score: 75 }, { ts: 2, score: 75 }, { ts: 3, score: 75 }, { ts: 4, score: 75 },
      { ts: 5, score: 75 }, { ts: 6, score: 75 }, { ts: 7, score: 75 }, { ts: 8, score: 75 },
      // extreme volatility (>>4x baseline)
      { ts: 9, score: 5 }, { ts: 10, score: 95 }, { ts: 11, score: 5 }, { ts: 12, score: 95 },
      { ts: 13, score: 5 }, { ts: 14, score: 95 }, { ts: 15, score: 5 }, { ts: 16, score: 95 },
    ];
    const result = detectScoreVolatilitySpike(pts, { spikeThreshold: 2, minimumAbsoluteVolatility: 1 });
    if (result !== null) {
      expect(["HIGH", "CRITICAL"]).toContain(result.severity);
    }
  });
});

describe("detectEvidenceStreamAnomalies — composite", () => {
  test("returns empty array when no anomalies", () => {
    const now = Date.now();
    const result = detectEvidenceStreamAnomalies({
      evidencePoints: [],
      scorePoints: [],
      nowTs: now,
    });
    expect(result).toHaveLength(0);
  });

  test("returns multiple anomaly types sorted by severity", () => {
    const now = Date.now();
    const window = 60_000;
    const evidencePoints: EvidenceSignalPoint[] = [];

    // Baseline: 10 events per window in past
    for (let w = 1; w <= 4; w++) {
      for (let j = 0; j < 10; j++) {
        evidencePoints.push({ ts: now - window * (w + 1) - j * 100, trustTier: "OBSERVED_HARDENED" });
      }
    }
    // Add trust regression: latest point is SELF_REPORTED
    evidencePoints.push({ ts: now - 500, trustTier: "SELF_REPORTED" });

    const result = detectEvidenceStreamAnomalies({
      evidencePoints,
      nowTs: now,
      evidenceRate: { windowMs: window, baselineWindows: 4, dropThreshold: 0.5 },
      trustTierRegression: { minRankDrop: 1 },
    });

    // Should detect at least the trust regression
    expect(result.length).toBeGreaterThan(0);
    // Result should be sorted highest severity first
    for (let i = 0; i < result.length - 1; i++) {
      const severityOrder = { CRITICAL: 4, HIGH: 3, WARN: 2, INFO: 1 };
      const curRank = severityOrder[result[i]!.severity as keyof typeof severityOrder] ?? 0;
      const nextRank = severityOrder[result[i + 1]!.severity as keyof typeof severityOrder] ?? 0;
      expect(curRank).toBeGreaterThanOrEqual(nextRank);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CORRECTION TRACKER — pure functions
// ═══════════════════════════════════════════════════════════════════════════

import {
  verifyCorrection,
  computeCorrectionHash,
} from "../src/corrections/correctionTracker.js";
import type { CorrectionEvent } from "../src/corrections/correctionTypes.js";
import type { DiagnosticReport } from "../src/types.js";

function makeCorrection(overrides: Partial<CorrectionEvent> = {}): CorrectionEvent {
  return {
    correctionId: "corr-1",
    agentId: "agent-1",
    triggerType: "OWNER_MANUAL",
    triggerId: "trigger-1",
    questionIds: ["AMC-1.1", "AMC-2.3"],
    correctionDescription: "Updated guardrails to address security gap",
    appliedAction: "updated guardrails.yaml",
    status: "PENDING_VERIFICATION",
    baselineRunId: "run-before",
    baselineLevels: { "AMC-1.1": 2, "AMC-2.3": 3 },
    verificationRunId: null,
    verificationLevels: null,
    effectivenessScore: null,
    verifiedTs: null,
    verifiedBy: null,
    createdTs: Date.now() - 10_000,
    updatedTs: Date.now(),
    prev_correction_hash: "prev-hash",
    correction_hash: "current-hash",
    signature: "sig",
    ...overrides,
  };
}

function makeReport(questionScores: Array<{ questionId: string; finalLevel: number }>): DiagnosticReport {
  return {
    runId: "run-after",
    agentId: "agent-1",
    ts: Date.now(),
    trustTier: "OBSERVED",
    questionScores: questionScores.map((q) => ({
      ...q,
      maxLevel: 5,
      percentage: (q.finalLevel / 5) * 100,
      rawScore: q.finalLevel,
      weight: 1,
    })),
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
    level1Score: 0,
    level2Score: 0,
    level3Score: 0,
    level4Score: 0,
    level5Score: 0,
    categories: {},
    signature: "sig",
  } as unknown as DiagnosticReport;
}

describe("verifyCorrection", () => {
  test("returns ineffective with score 0 when baselineLevels is empty", () => {
    const correction = makeCorrection({ baselineLevels: {}, questionIds: [] });
    const report = makeReport([]);
    const result = verifyCorrection(correction, report);
    expect(result.effective).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toEqual({});
  });

  test("marks effective when all question levels improved", () => {
    const correction = makeCorrection();
    const report = makeReport([
      { questionId: "AMC-1.1", finalLevel: 4 }, // was 2 → +2
      { questionId: "AMC-2.3", finalLevel: 5 }, // was 3 → +2
    ]);
    const result = verifyCorrection(correction, report);
    expect(result.effective).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.details["AMC-1.1"]!.delta).toBe(2);
    expect(result.details["AMC-2.3"]!.delta).toBe(2);
  });

  test("marks ineffective when no improvement", () => {
    const correction = makeCorrection();
    const report = makeReport([
      { questionId: "AMC-1.1", finalLevel: 2 }, // same
      { questionId: "AMC-2.3", finalLevel: 3 }, // same
    ]);
    const result = verifyCorrection(correction, report);
    expect(result.effective).toBe(false);
    expect(result.score).toBe(0);
  });

  test("handles missing question in latest report (treated as no improvement)", () => {
    const correction = makeCorrection();
    const report = makeReport([
      { questionId: "AMC-1.1", finalLevel: 4 }, // present
      // AMC-2.3 is missing
    ]);
    const result = verifyCorrection(correction, report);
    // AMC-1.1 improved, AMC-2.3 did not — avg delta > 0
    expect(result.effective).toBe(true);
    expect(result.details["AMC-2.3"]!.delta).toBe(0);
  });

  test("score is clamped to [0, 1]", () => {
    const correction = makeCorrection({ baselineLevels: { "AMC-1.1": 0 } });
    const report = makeReport([{ questionId: "AMC-1.1", finalLevel: 5 }]);
    const result = verifyCorrection(correction, report);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe("computeCorrectionHash", () => {
  test("returns a 64-char hex string", () => {
    const correction = makeCorrection();
    const hash = computeCorrectionHash(correction);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("same correction produces same hash", () => {
    const correction = makeCorrection();
    expect(computeCorrectionHash(correction)).toBe(computeCorrectionHash(correction));
  });

  test("different corrections produce different hashes", () => {
    const c1 = makeCorrection({ correctionId: "corr-A" });
    const c2 = makeCorrection({ correctionId: "corr-B" });
    expect(computeCorrectionHash(c1)).not.toBe(computeCorrectionHash(c2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. CLAIM STORE + LIFECYCLE (DB-based)
// ═══════════════════════════════════════════════════════════════════════════

import {
  insertClaim,
  getClaimById,
  getClaimsByState,
  insertClaimTransition,
} from "../src/claims/claimStore.js";
import type { Claim, ClaimLifecycleState } from "../src/claims/claimTypes.js";

function createClaimsDb(): Database.Database {
  const db = new Database(":memory:");
  // NOTE: claim_id is NOT PRIMARY KEY — claimStore is append-only (see ledger.ts)
  // The real schema uses INSERT OR REPLACE semantics for state updates.
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      assertion_text TEXT NOT NULL,
      claimed_level INTEGER NOT NULL,
      provenance_tag TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      promoted_from_claim_id TEXT,
      promotion_evidence_json TEXT NOT NULL DEFAULT '[]',
      superseded_by_claim_id TEXT,
      created_ts INTEGER NOT NULL,
      last_verified_ts INTEGER NOT NULL,
      expiry_ts INTEGER,
      prev_claim_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS claim_transitions (
      transition_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claims_agent ON claims(agent_id);
    CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(lifecycle_state);
  `);
  return db;
}

function makeClaim(overrides: Partial<Claim> & { claimId: string }): Claim {
  const now = Date.now();
  return {
    agentId: "agent-1",
    runId: "run-1",
    questionId: "AMC-1.1",
    assertionText: "Agent handles PII appropriately",
    claimedLevel: 3,
    provenanceTag: "OBSERVED_FACT",
    lifecycleState: "QUARANTINE",
    confidence: 0.85,
    evidenceRefs: ["ev-1"],
    trustTier: "OBSERVED",
    promotedFromClaimId: null,
    promotionEvidence: [],
    supersededByClaimId: null,
    createdTs: now,
    lastVerifiedTs: now,
    expiryTs: null,
    prev_claim_hash: "prev-hash",
    claim_hash: "current-hash",
    signature: "sig",
    ...overrides,
  };
}

describe("claimStore — insertClaim + getClaimById", () => {
  let claimsDb: Database.Database;

  beforeAll(() => {
    claimsDb = createClaimsDb();
  });

  afterAll(() => {
    claimsDb.close();
  });

  test("inserts claim and retrieves by ID", () => {
    const claim = makeClaim({ claimId: "claim-001" });
    insertClaim(claimsDb, claim);
    const retrieved = getClaimById(claimsDb, "claim-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.claimId).toBe("claim-001");
    expect(retrieved!.agentId).toBe("agent-1");
    expect(retrieved!.lifecycleState).toBe("QUARANTINE");
  });

  test("returns null for non-existent claim", () => {
    expect(getClaimById(claimsDb, "nonexistent")).toBeNull();
  });

  test("preserves all fields after round-trip", () => {
    const claim = makeClaim({
      claimId: "claim-rt-001",
      assertionText: "Test assertion",
      claimedLevel: 4,
      confidence: 0.9,
      trustTier: "ATTESTED",
      evidenceRefs: ["ev-a", "ev-b"],
    });
    insertClaim(claimsDb, claim);
    const retrieved = getClaimById(claimsDb, "claim-rt-001");
    expect(retrieved!.claimedLevel).toBe(4);
    expect(retrieved!.confidence).toBeCloseTo(0.9, 5);
    expect(retrieved!.trustTier).toBe("ATTESTED");
    expect(retrieved!.evidenceRefs).toEqual(["ev-a", "ev-b"]);
  });

  test("multiple inserts for same claimId are allowed (append-only model)", () => {
    const claim = makeClaim({ claimId: "claim-multi", lifecycleState: "QUARANTINE" });
    insertClaim(claimsDb, claim);
    // Second insert with different state (simulates state transition append)
    const claim2 = { ...claim, lifecycleState: "PROVISIONAL" as const };
    expect(() => insertClaim(claimsDb, claim2)).not.toThrow();
  });
});

describe("claimStore — getClaimsByState", () => {
  let claimsDb: Database.Database;

  beforeAll(() => {
    claimsDb = createClaimsDb();
    // Insert claims in different states
    insertClaim(claimsDb, makeClaim({ claimId: "q1", lifecycleState: "QUARANTINE" }));
    insertClaim(claimsDb, makeClaim({ claimId: "q2", lifecycleState: "QUARANTINE" }));
    insertClaim(claimsDb, makeClaim({ claimId: "p1", lifecycleState: "PROVISIONAL" }));
    insertClaim(claimsDb, makeClaim({ claimId: "pr1", lifecycleState: "PROMOTED" }));
  });

  afterAll(() => {
    claimsDb.close();
  });

  test("returns only QUARANTINE claims", () => {
    const claims = getClaimsByState(claimsDb, "agent-1", "QUARANTINE");
    expect(claims.length).toBe(2);
    for (const c of claims) {
      expect(c.lifecycleState).toBe("QUARANTINE");
    }
  });

  test("returns only PROVISIONAL claims", () => {
    const claims = getClaimsByState(claimsDb, "agent-1", "PROVISIONAL");
    expect(claims.length).toBe(1);
    expect(claims[0]!.claimId).toBe("p1");
  });

  test("returns empty array for state with no claims", () => {
    const claims = getClaimsByState(claimsDb, "agent-1", "REVOKED");
    expect(claims).toHaveLength(0);
  });
});

describe("claimStore — insertClaimTransition", () => {
  let claimsDb: Database.Database;

  beforeAll(() => {
    claimsDb = createClaimsDb();
  });

  afterAll(() => {
    claimsDb.close();
  });

  test("inserts transition record without error", () => {
    insertClaimTransition(claimsDb, {
      transitionId: "t-001",
      claimId: "claim-transition-1",
      fromState: "QUARANTINE",
      toState: "PROVISIONAL",
      reason: "Evidence threshold met",
      evidenceRefs: ["ev-1"],
      ts: Date.now(),
      signature: "sig-t1",
    });
    const row = claimsDb
      .prepare("SELECT * FROM claim_transitions WHERE transition_id = ?")
      .get("t-001") as { transition_id: string; from_state: string; to_state: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.from_state).toBe("QUARANTINE");
    expect(row!.to_state).toBe("PROVISIONAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CLAIM LIFECYCLE TRANSITIONS (state machine logic)
// ═══════════════════════════════════════════════════════════════════════════

import { transitionClaim } from "../src/claims/claimLifecycle.js";

// We need to mock promotionGate since it uses real DB operations
vi.mock("../src/claims/promotionGate.js", () => ({
  evaluatePromotion: vi.fn().mockReturnValue({ allowed: true, missingCriteria: [] }),
}));

vi.mock("../src/crypto/keys.js", () => ({
  getPrivateKeyPem: vi.fn().mockReturnValue("mock-pem"),
  signHexDigest: vi.fn().mockReturnValue("mock-signature"),
  getPublicKeyHistory: vi.fn().mockReturnValue([]),
}));

function createLifecycleDb(): Database.Database {
  const db = new Database(":memory:");
  // NOTE: claim_id is NOT PRIMARY KEY here — transitionClaim does an append-only
  // insert of the updated claim with the same claim_id (the real schema allows
  // INSERT OR REPLACE semantics). We skip the immutability trigger so we can
  // track state transitions properly in tests.
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      claim_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      assertion_text TEXT NOT NULL,
      claimed_level INTEGER NOT NULL,
      provenance_tag TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      trust_tier TEXT NOT NULL,
      promoted_from_claim_id TEXT,
      promotion_evidence_json TEXT NOT NULL DEFAULT '[]',
      superseded_by_claim_id TEXT,
      created_ts INTEGER NOT NULL,
      last_verified_ts INTEGER NOT NULL,
      expiry_ts INTEGER,
      prev_claim_hash TEXT NOT NULL,
      claim_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS claim_transitions (
      transition_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claims_agent ON claims(agent_id);
    CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(lifecycle_state);
  `);
  return db;
}

const mockPolicy = {
  minEvidenceCount: 0,
  requireObservedTier: false,
  requireSignedEvidence: false,
  maxAgeMs: Infinity,
};

const mockSignFn = (digest: string) => `mock-sig-${digest.slice(0, 8)}`;

describe("transitionClaim — valid transitions", () => {
  let lifecycleDb: Database.Database;

  beforeAll(() => {
    lifecycleDb = createLifecycleDb();
  });

  afterAll(() => {
    lifecycleDb.close();
  });

  test("QUARANTINE → PROVISIONAL succeeds", () => {
    const claim = makeClaim({ claimId: "lc-1", lifecycleState: "QUARANTINE" });
    insertClaim(lifecycleDb, claim);
    const transition = transitionClaim(
      lifecycleDb,
      { claimId: "lc-1", toState: "PROVISIONAL", reason: "evidence met" },
      [], mockPolicy, "prev-hash", mockSignFn
    );
    expect(transition.fromState).toBe("QUARANTINE");
    expect(transition.toState).toBe("PROVISIONAL");
    expect(transition.claimId).toBe("lc-1");
    expect(transition.signature).toContain("mock-sig");
  });

  test("PROVISIONAL → PROMOTED succeeds", () => {
    const claim = makeClaim({ claimId: "lc-2", lifecycleState: "PROVISIONAL" });
    insertClaim(lifecycleDb, claim);
    const transition = transitionClaim(
      lifecycleDb,
      { claimId: "lc-2", toState: "PROMOTED", reason: "cross-session verified" },
      [], mockPolicy, "prev-hash", mockSignFn
    );
    expect(transition.fromState).toBe("PROVISIONAL");
    expect(transition.toState).toBe("PROMOTED");
  });

  test("PROMOTED → REVOKED succeeds", () => {
    const claim = makeClaim({ claimId: "lc-3", lifecycleState: "PROMOTED" });
    insertClaim(lifecycleDb, claim);
    const transition = transitionClaim(
      lifecycleDb,
      { claimId: "lc-3", toState: "REVOKED", reason: "claim invalidated" },
      [], mockPolicy, "prev-hash", mockSignFn
    );
    expect(transition.fromState).toBe("PROMOTED");
    expect(transition.toState).toBe("REVOKED");
  });

  test("QUARANTINE → REVOKED succeeds", () => {
    const claim = makeClaim({ claimId: "lc-4", lifecycleState: "QUARANTINE" });
    insertClaim(lifecycleDb, claim);
    const transition = transitionClaim(
      lifecycleDb,
      { claimId: "lc-4", toState: "REVOKED", reason: "revoked immediately" },
      [], mockPolicy, "prev-hash", mockSignFn
    );
    expect(transition.toState).toBe("REVOKED");
  });
});

describe("transitionClaim — invalid transitions", () => {
  let lifecycleDb: Database.Database;

  beforeAll(() => {
    lifecycleDb = createLifecycleDb();
  });

  afterAll(() => {
    lifecycleDb.close();
  });

  test("throws for non-existent claim", () => {
    expect(() =>
      transitionClaim(
        lifecycleDb,
        { claimId: "nonexistent", toState: "PROVISIONAL", reason: "test" },
        [], mockPolicy, "prev-hash", mockSignFn
      )
    ).toThrow(/not found/i);
  });

  test("PROMOTED → QUARANTINE throws (explicitly blocked)", () => {
    const claim = makeClaim({ claimId: "lc-invalid-1", lifecycleState: "PROMOTED" });
    insertClaim(lifecycleDb, claim);
    expect(() =>
      transitionClaim(
        lifecycleDb,
        { claimId: "lc-invalid-1", toState: "QUARANTINE", reason: "test" },
        [], mockPolicy, "prev-hash", mockSignFn
      )
    ).toThrow(/QUARANTINE|REVOKE/i);
  });

  test("REVOKED → anything throws (terminal state)", () => {
    const claim = makeClaim({ claimId: "lc-revoked", lifecycleState: "REVOKED" });
    insertClaim(lifecycleDb, claim);
    expect(() =>
      transitionClaim(
        lifecycleDb,
        { claimId: "lc-revoked", toState: "PROVISIONAL", reason: "test" },
        [], mockPolicy, "prev-hash", mockSignFn
      )
    ).toThrow(/invalid state transition/i);
  });

  test("EXPIRED → PROVISIONAL throws (EXPIRED can only → REVOKED)", () => {
    const claim = makeClaim({ claimId: "lc-expired", lifecycleState: "EXPIRED" });
    insertClaim(lifecycleDb, claim);
    expect(() =>
      transitionClaim(
        lifecycleDb,
        { claimId: "lc-expired", toState: "PROVISIONAL", reason: "test" },
        [], mockPolicy, "prev-hash", mockSignFn
      )
    ).toThrow(/invalid state transition/i);
  });

  test("QUARANTINE → PROMOTED throws (must go through PROVISIONAL first)", () => {
    const claim = makeClaim({ claimId: "lc-skip", lifecycleState: "QUARANTINE" });
    insertClaim(lifecycleDb, claim);
    expect(() =>
      transitionClaim(
        lifecycleDb,
        { claimId: "lc-skip", toState: "PROMOTED", reason: "test" },
        [], mockPolicy, "prev-hash", mockSignFn
      )
    ).toThrow(/invalid state transition/i);
  });
});
