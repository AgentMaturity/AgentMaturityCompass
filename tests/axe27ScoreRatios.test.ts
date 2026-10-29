import { describe, expect, test } from "vitest";
import { scorePauseQuality } from "../src/score/pauseQuality.js";
import { scoreInterpretability, type InterpretabilityEvent } from "../src/score/interpretability.js";
import {
  buildExternalDependencyInventory,
  scoreGracefulDegradation,
  scoreLogisticsOperationalReliabilityFromEvents,
  scoreOperationalIndependenceFromEvents,
  scoreVendorLockInRisk,
  type GuardEventLike,
} from "../src/score/operationalIndependence.js";

const event: GuardEventLike = {
  created_at: "2026-10-29T00:00:00.000Z",
  module_code: "LOCAL",
  decision: "allow",
  reason: "local action completed",
  severity: "low",
  meta_json: "{}",
};
const decision: InterpretabilityEvent = {
  actionId: "action-1", timestamp: 0, hasExplanation: true, explanationLength: 20,
  actionMatchesExplanation: false, hasAttribution: true, attributionSources: 1,
  isRefusal: false, refusalHasReason: false,
};

describe("AXE-27 score ratios preserve missing evidence", () => {
  test("zero pauses do not measure relevance, timing, or resolution", () => {
    const result = scorePauseQuality({ pauses: [], totalActions: 10, totalErrors: 0,
      errorsWithoutPriorPause: 0, taskDurationMs: 1 });
    expect(result.relevanceScore).toBeNull();
    expect(result.timingScore).toBeNull();
    expect(result.resolutionScore).toBeNull();
    expect(result.avgResolutionTimeMs).toBeNull();
    expect(result.metricOutcomes.relevanceScore).toBe("not_evaluated");
    expect(result.overallScore).toBe(0);
    expect(result.sampleSize).toBe(10);
  });

  test("zero actions yield null pause ratios and no measured score", () => {
    const result = scorePauseQuality({ pauses: [], totalActions: 0, totalErrors: 0,
      errorsWithoutPriorPause: 0, taskDurationMs: 0 });
    expect(result.overallScore).toBeNull();
    expect(result.pauseRate).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });

  test("missing refusal and calibration cohorts are excluded from interpretability", () => {
    const result = scoreInterpretability([decision]);
    expect(result.refusalTransparency).toBeNull();
    expect(result.calibrationError).toBeNull();
    expect(result.calibrationScore).toBeNull();
    expect(result.metricOutcomes.refusalTransparency).toBe("not_evaluated");
    expect(result.metricOutcomes.calibrationScore).toBe("not_evaluated");
    expect(result.overallScore).toBeCloseTo((0.25 + 0.15) / 0.65);
    expect(result.sampleSize).toBe(1);
    expect(result.maturitySignals).not.toContain("Confidence signals are well-calibrated");
  });

  test("absent explanations have no faithfulness measurement", () => {
    const result = scoreInterpretability([{ ...decision, hasExplanation: false }]);
    expect(result.faithfulnessScore).toBeNull();
    expect(result.metricOutcomes.faithfulnessScore).toBe("not_evaluated");
  });

  test("empty interpretability input preserves null through JSON", () => {
    const result = JSON.parse(JSON.stringify(scoreInterpretability([])));
    expect(result.overallScore).toBeNull();
    expect(result.refusalTransparency).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
  });

  test("zero dependency failures do not prove recovery", () => {
    const result = scoreGracefulDegradation([event]);
    expect(result.recoveryRate).toBeNull();
    expect(result.score).toBeNull();
    expect(result.outcome).toBe("not_evaluated");
    expect(result.metricOutcomes.recoveryRate).toBe("not_evaluated");
  });

  test("empty dependency inventory does not prove portability", () => {
    const result = scoreVendorLockInRisk(buildExternalDependencyInventory([]));
    expect(result.multiVendorCoverage).toBeNull();
    expect(result.score).toBeNull();
    expect(result.riskLevel).toBe("not_evaluated");
    expect(result.metricOutcomes.multiVendorCoverage).toBe("not_evaluated");
  });

  test("absent logistics exceptions and cold-chain samples are unevaluated", () => {
    const result = scoreLogisticsOperationalReliabilityFromEvents([{ ...event,
      reason: "delivery completed", meta_json: JSON.stringify({ domain: "logistics", shipmentId: "s1", onTime: true }) }]);
    expect(result.exceptionManagement.score).toBeNull();
    expect(result.exceptionManagement.outcome).toBe("not_evaluated");
    expect(result.exceptionManagement.exceptionResolutionRate).toBeNull();
    expect(result.coldChainIntegrity.score).toBeNull();
    expect(result.coldChainIntegrity.excursionRate).toBeNull();
  });

  test("empty operational telemetry does not become healthy or finite", () => {
    const result = scoreOperationalIndependenceFromEvents([]);
    expect(result.escalationRate).toBeNull();
    expect(result.reducedExternalAccessScore).toBeNull();
    expect(result.score).toBeNull();
    expect(result.dependencyDrift.score).toBeNull();
    expect(result.dependencyDrift.status).toBe("not_evaluated");
    expect(result.outcome).toBe("not_evaluated");
    expect(result.metricOutcomes.escalationRate).toBe("not_evaluated");
  });

  test("empty logistics cohorts expose no finite ratios", () => {
    const result = scoreLogisticsOperationalReliabilityFromEvents([]);
    expect(result.score).toBeNull();
    expect(result.status).toBe("not_evaluated");
    expect(result.carrierReliability.onTimeRate).toBeNull();
    expect(result.slaPerformance.breachRate).toBeNull();
    expect(result.traceabilityCoverage.coverage).toBeNull();
    expect(result.coldChainIntegrity.excursionRate).toBeNull();
  });

  test("an observed zero escalation rate remains measured", () => {
    const result = scoreOperationalIndependenceFromEvents([event]);
    expect(result.escalationRate).toBe(0);
    expect(result.metricOutcomes.escalationRate).toBe("measured");
    expect(result.outcome).toBe("measured");
  });
});
