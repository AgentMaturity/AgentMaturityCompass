import { afterEach, describe, expect, it } from "vitest";
import { median, predictWithBand, quantile, trimmedMean } from "../src/forecast/robustStats.js";
import { percentile as benchPercentile } from "../src/bench/benchPercentiles.js";
import { mean as driftMean, percentile as driftPercentile } from "../src/watch/driftMath.js";
import { mapTracesToEvidence } from "../src/diagnostic/autoAnswer/traceEvidenceMapper.js";
import { SessionCorrelator } from "../src/observability/sessionCorrelator.js";
import { detectScoreVolatilitySpike } from "../src/observability/anomalyDetector.js";
import { computeFeatureSummaries, recordOverhead, resetOverheadAccounting } from "../src/ops/overheadAccounting.js";
import { computeLatencyBuckets, recordLatency, resetLatencyAccounting } from "../src/ops/latencyAccounting.js";
import { configureSloDefinitions, generateSloReport, recordSloMeasurement, resetGovernanceSlo } from "../src/ops/governanceSlo.js";
import { computeGovernanceSLO, recordSLOMeasurement, resetPolicyCanaryState } from "../src/governor/policyCanary.js";
import type { NormalizedTrace } from "../src/watch/observabilityBridge.js";

function trace(durationMs: number): NormalizedTrace {
  return {
    traceId: `latency-${durationMs}`,
    sessionId: "stats-session",
    startTimeMs: 1,
    endTimeMs: durationMs + 1,
    durationMs,
    status: "ok",
    spans: [],
    totalTokens: 0,
    totalCostUsd: 0,
    modelBreakdown: {},
    errorCount: 0,
    toolCallCount: 0,
    llmCallCount: 0,
  };
}

afterEach(() => {
  resetOverheadAccounting();
  resetLatencyAccounting();
  resetGovernanceSlo();
  resetPolicyCanaryState();
});

describe("distribution statistics retain their published conventions", () => {
  it("keeps the midpoint median separate from weighted interpolated quantiles", () => {
    const values = [9, 1, 5, 3];
    expect(median(values)).toBe(4);
    expect(quantile(values, 0.25)).toBe(2.5);
    expect(values).toEqual([9, 1, 5, 3]);
    expect(median([1e308, 1e308])).toBe(Number.POSITIVE_INFINITY);
    expect(quantile([1e308, 1e308], 0.5)).toBe(1e308);
    expect(median([])).toBe(0);
    expect(quantile([], 0.5)).toBe(0);
  });

  it("trims extreme observations before computing the shared arithmetic mean", () => {
    expect(trimmedMean([0, 1, 2, 3, 100], 0.2)).toBe(2);
    expect(trimmedMean([1, 100], 0.45)).toBe(50.5);
  });

  it("retains a MAD-scaled prediction band rather than a bootstrap mean interval", () => {
    const prediction = predictWithBand({
      model: { slope: 2, intercept: 1, residualMad: 0, robustSigma: 3, outlierIndexes: [] },
      atX: 4,
      n: 4,
      horizonFactor: 12,
    });
    expect(prediction.value).toBe(9);
    expect(prediction.low).toBeCloseTo(-2.76, 12);
    expect(prediction.high).toBeCloseTo(20.76, 12);
  });

  it("reports inclusive empirical ranks and four-place bench serialization", () => {
    expect(benchPercentile([1, 2, 2, 4], 2)).toBe(75);
    expect(benchPercentile([1, 2, 4], 1)).toBe(33.3333);
    expect(benchPercentile([], 2)).toBe(0);
  });

  it("keeps drift fallback, finite filtering, nearest rank, and six-place rounding", () => {
    expect(driftMean([], 0.8)).toBe(0.8);
    expect(driftMean([1, 1, 0])).toBe(0.666667);
    expect(driftPercentile([1, 2, Number.NaN, Number.POSITIVE_INFINITY], 50)).toBe(1);
    expect(driftPercentile([1.12345678], 95)).toBe(1.123457);
    expect(driftPercentile([1, 2], Number.NaN)).toBeNaN();
    expect(driftPercentile([], Number.NaN)).toBe(0);
    expect(driftPercentile([Number.NaN], Number.NaN)).toBe(0);
  });

  it("uses observed nearest-rank latencies in trace evidence and session scores", () => {
    const traces = Array.from({ length: 30 }, (_, i) => trace(i + 1));
    expect(mapTracesToEvidence(traces).metrics.p95LatencyMs).toBe(29);
    const sessions = new SessionCorrelator({ workspace: "/tmp/amc-stats-compatibility", agentId: "stats" });
    for (const row of traces) sessions.ingestTrace(row);
    expect(sessions.getSession("stats-session")?.p95LatencyMs).toBe(29);
  });

  it("keeps nearest-rank percentiles in overhead summaries", () => {
    for (const latencyMs of [1, 9]) recordOverhead({ feature: "GATEWAY_PROXY", latencyMs });
    expect(computeFeatureSummaries()[0]?.p95LatencyMs).toBe(9);
  });

  it("keeps nearest-rank medians and tails in latency buckets", () => {
    for (const latencyMs of [1, 9]) recordLatency({ category: "LLM", label: "stats", latencyMs });
    expect(computeLatencyBuckets()[0]).toMatchObject({ p50: 1, p95: 9, p99: 9 });
  });

  it("keeps nearest-rank governance SLO summaries", () => {
    for (const latencyMs of [1, 9]) recordSloMeasurement("POLICY_DECISION_LATENCY", latencyMs);
    expect(generateSloReport().metrics.find((row) => row.metric === "POLICY_DECISION_LATENCY"))
      .toMatchObject({ p50: 1, p95: 9, p99: 9 });
  });

  it("preserves the legacy out-of-range governance definition sentinel", () => {
    configureSloDefinitions([{
      id: "legacy-out-of-range", name: "legacy", objective: "legacy percentile", metric: "POLICY_DECISION_LATENCY",
      mode: "P95_LTE", targetValue: 10, degradedThreshold: 20, percentile: 101 as 95,
    }]);
    recordSloMeasurement("POLICY_DECISION_LATENCY", 9);
    expect(generateSloReport().definitions[0]?.observedValue).toBe(0);
  });

  it("keeps nearest-rank policy canary SLO summaries", () => {
    for (const latencyMs of [1, 9]) recordSLOMeasurement("policy_decision", latencyMs);
    expect(computeGovernanceSLO().policyDecisionLatencyP95Ms).toBe(9);
  });

  it("uses population rather than sample spread for volatility anomalies", () => {
    // Deltas split into baseline [1, 3] and recent [10, 14]. Population SDs are 1 and 2.
    const anomaly = detectScoreVolatilitySpike([0, 1, 4, 14, 28].map((score, ts) => ({ ts, score })), {
      minPoints: 5,
      spikeThreshold: 2,
    });
    expect(anomaly).toMatchObject({ baselineVolatility: 3, recentVolatility: 14, spikeRatio: 6 });
  });
});
