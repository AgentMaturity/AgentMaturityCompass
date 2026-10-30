import { describe, expect, test } from "vitest";
import { computeIndustryAdjustedScore } from "../src/score/industryTrustModels.js";
import { analyzeSessionFingerprints, detectGaming, stabilizeScores, type SessionFingerprint } from "../src/score/antiGaming.js";
import { computeInterRaterReliability, computeScoreStability } from "../src/score/predictiveValidity.js";
import type { DiagnosticReport } from "../src/types.js";

const now = Date.UTC(2026, 9, 29);
function fingerprint(sessionId: string, ts: number, scoreDistribution: number[] = [], responseLatencyMs: number[] = []): SessionFingerprint {
  return { sessionId, ts, agentId: "same-agent", scoreDistribution, responseLatencyMs,
    evidencePatterns: [], questionOrder: [] };
}

describe("AXE-27 industry and gaming ratio denominators", () => {
  test("empty industry dimensions yield no raw, adjusted, maturity, or decay measurement", () => {
    const result = computeIndustryAdjustedScore({}, "enterprise_saas", now, null, now);
    expect(result.rawScore).toBeNull();
    expect(result.adjustedScore).toBeNull();
    expect(result.maturityLevel).toBeNull();
    expect(result.decayApplied).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
    expect(result.sampleSize).toBe(0);
    expect(result.metricOutcomes.rawScore).toBe("not_evaluated");
  });

  test("a measured zero industry score remains an actual L0 result", () => {
    const result = computeIndustryAdjustedScore({ security: 0 }, "enterprise_saas", now, null, now);
    expect(result.rawScore).toBe(0);
    expect(result.adjustedScore).toBe(0);
    expect(result.maturityLevel).toBe("L0");
    expect(result.outcome).toBe("measured");
  });

  test("empty gaming questions are not a clean gaming score", () => {
    const result = detectGaming({ questionScores: [] } as unknown as DiagnosticReport);
    expect(result.gamingScore).toBeNull();
    expect(result.verdict).toBe("not_evaluated");
    expect(result.metricOutcomes.perfectRatio).toBe("not_evaluated");
  });

  test("absent score distributions cannot create artificial score convergence", () => {
    const result = analyzeSessionFingerprints([
      fingerprint("absent", 1), fingerprint("high-1", 2, [5]), fingerprint("high-2", 3, [5]),
    ]);
    expect(result.suspiciousPatterns.some(pattern => pattern.type === "score-convergence")).toBe(false);
    expect(result.metricOutcomes["absent.scoreMean"]).toBe("not_evaluated");
  });

  test("zero timing mean has no coefficient of variation or anomaly", () => {
    const result = analyzeSessionFingerprints([
      fingerprint("zero-1", 1, [3], [0, 0, 0, 0, 0]),
      fingerprint("zero-2", 2, [3], [0, 0, 0, 0, 0]),
    ]);
    expect(result.suspiciousPatterns.some(pattern => pattern.type === "timing-anomaly")).toBe(false);
    expect(result.metricOutcomes["zero-1.timingCoefficientOfVariation"]).toBe("not_evaluated");
  });

  test("a single session cannot yield a clean cross-session analysis", () => {
    const result = analyzeSessionFingerprints([fingerprint("single", 1, [4])]);
    expect(result.adaptationScore).toBeNull();
    expect(result.overallVerdict).toBe("not_evaluated");
  });

  test("empty evidence sets do not measure cross-agent similarity", () => {
    const result = analyzeSessionFingerprints([{ ...fingerprint("a", 1), agentId: "agent-a" },
      { ...fingerprint("b", 2), agentId: "agent-b" }]);
    expect(result.metricOutcomes["evidenceSimilarity:agent-a:agent-b"]).toBe("not_evaluated");
  });

  test("an entirely empty cross-session cohort has no finite clean adaptation score", () => {
    const result = analyzeSessionFingerprints([fingerprint("empty-1", 1), fingerprint("empty-2", 2)]);
    expect(result.adaptationScore).toBeNull();
    expect(result.overallVerdict).toBe("not_evaluated");
    expect(result.outcome).toBe("not_evaluated");
  });

  test("empty stabilization input has null estimates and interval bounds", () => {
    const result = stabilizeScores([]);
    expect(result.stabilizedScore).toBeNull();
    expect(result.confidenceInterval).toEqual({ lower: null, upper: null });
    expect(result.variance).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });

  test.each([-1, NaN, Infinity])("unusable confidence %s contributes no weight", (unusable) => {
    const result = stabilizeScores([5, 4], [unusable, 1]);
    expect(result.stabilizedScore).toBe(4);
  });

  test("one score with zero confidence has no weighted measurement", () => {
    expect(stabilizeScores([5], [0]).stabilizedScore).toBeNull();
  });

  test("zero usable confidence weight cannot fall back to an unweighted perfect score", () => {
    const result = stabilizeScores([5, 5], [0, 0]);
    expect(result.stabilizedScore).toBeNull();
    expect(result.confidenceInterval).toEqual({ lower: null, upper: null });
    expect(result.metricOutcomes.stabilizedScore).toBe("not_evaluated");
  });
});


describe("AXE-27 inter-rater pair denominator", () => {
  test.each([
    [],
    [{ agentId: "a", evaluatorId: "single", score: 100 }],
    [{ agentId: "a", evaluatorId: "single", score: 90 }, { agentId: "a", evaluatorId: "single", score: 100 }],
    [{ agentId: "a", evaluatorId: "r1", score: 90 }, { agentId: "b", evaluatorId: "r2", score: 90 }],
  ])("no comparable rater pairs cannot mean perfect agreement (%#)", (...rows) => {
    const result = computeInterRaterReliability(rows);
    expect(result.averagePairwiseDifference).toBeNull();
    expect(result.agreementScore).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
    expect(result.sampleSize).toBe(0);
    expect(result.metricOutcomes.agreementScore).toBe("not_evaluated");
  });

  test("two actual equal ratings retain measured perfect agreement", () => {
    const result = computeInterRaterReliability([
      { agentId: "a", evaluatorId: "r1", score: 90 }, { agentId: "a", evaluatorId: "r2", score: 90 },
    ]);
    expect(result.averagePairwiseDifference).toBe(0);
    expect(result.agreementScore).toBe(1);
    expect(result.outcome).toBe("measured");
    expect(result.sampleSize).toBe(1);
  });
});


describe("AXE-27 inter-rater target denominator", () => {
  test("empty targets have no average rater count or multi-rater coverage", () => {
    const result = computeInterRaterReliability([]);
    expect(result.averageRatersPerTarget).toBeNull();
    expect(result.multiRaterCoverage).toBeNull();
    expect(result.metricOutcomes.averageRatersPerTarget).toBe("not_evaluated");
    expect(result.metricOutcomes.multiRaterCoverage).toBe("not_evaluated");
  });

  test("one measured target has a real average and zero multi-rater coverage", () => {
    const result = computeInterRaterReliability([{ agentId: "a", evaluatorId: "r1", score: 80 }]);
    expect(result.averageRatersPerTarget).toBe(1);
    expect(result.multiRaterCoverage).toBe(0);
    expect(result.metricOutcomes.averageRatersPerTarget).toBe("measured");
    expect(result.metricOutcomes.multiRaterCoverage).toBe("measured");
  });
});


describe("AXE-27 stability delta denominator", () => {
  test("a single observed score does not prove perfect stability", () => {
    const result = computeScoreStability([{ agentId: "a", score: 80, timestamp: 1 }]);
    expect(result.stabilityIndex).toBeNull();
    expect(result.meanAbsoluteDelta).toBeNull();
    expect(result.maxDelta).toBeNull();
    expect(result.meanScore).toBe(80);
    expect(result.standardDeviation).toBe(0);
    expect(result.outcome).toBe("not_evaluated");
    expect(result.metricOutcomes.stabilityIndex).toBe("not_evaluated");
  });

  test("empty stability inputs have no empirical means or stability measurement", () => {
    const result = computeScoreStability([]);
    expect(result.meanScore).toBeNull();
    expect(result.standardDeviation).toBeNull();
    expect(result.coefficientOfVariation).toBeNull();
    expect(result.meanAbsoluteDelta).toBeNull();
    expect(result.maxDelta).toBeNull();
    expect(result.stabilityIndex).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
    expect(result.sampleSize).toBe(0);
  });

  test("a measured zero mean does not define a coefficient of variation", () => {
    const result = computeScoreStability([{ agentId: "a", score: 0, timestamp: 1 },
      { agentId: "a", score: 0, timestamp: 2 }]);
    expect(result.coefficientOfVariation).toBeNull();
    expect(result.metricOutcomes.coefficientOfVariation).toBe("not_evaluated");
    expect(result.stabilityIndex).toBe(1);
    expect(result.meanAbsoluteDelta).toBe(0);
  });

  test("actual repeated equal positive scores retain measured perfect stability", () => {
    const result = computeScoreStability([{ agentId: "a", score: 80, timestamp: 1 },
      { agentId: "a", score: 80, timestamp: 2 }]);
    expect(result.stabilityIndex).toBe(1);
    expect(result.meanAbsoluteDelta).toBe(0);
    expect(result.coefficientOfVariation).toBe(0);
    expect(result.outcome).toBe("measured");
  });
});
