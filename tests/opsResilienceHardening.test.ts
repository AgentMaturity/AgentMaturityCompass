import { beforeEach, describe, expect, test } from "vitest";
import {
  configureBackpressure,
  enqueue,
  dequeue,
  getBackpressureConfig,
  getBackpressureMetrics,
  resetBackpressure,
} from "../src/ops/backpressure.js";
import {
  evaluateHealth,
  getCurrentMode,
  resetDegradationState,
  setMode,
} from "../src/ops/degradationMode.js";
import {
  configureSloTargets,
  generateSloReport,
  recordSloMeasurement,
  resetGovernanceSlo,
} from "../src/ops/governanceSlo.js";
import {
  computeLatencyBuckets,
  generateLatencyReport,
  recordLatency,
  resetLatencyAccounting,
} from "../src/ops/latencyAccounting.js";

describe("Ops resilience hardening", () => {
  beforeEach(() => {
    resetBackpressure();
    resetDegradationState();
    resetGovernanceSlo();
    resetLatencyAccounting();
  });

  test("backpressure config normalizes unsafe values and preserves fail-safe defaults", () => {
    configureBackpressure({ maxQueueDepth: 0, warningThresholdPct: 5, retryAfterSeconds: -10 });
    const cfg = getBackpressureConfig();
    expect(cfg.maxQueueDepth).toBe(1000);
    expect(cfg.warningThresholdPct).toBe(0.99);
    expect(cfg.retryAfterSeconds).toBe(5);
  });

  test("backpressure hysteresis avoids immediate signal flapping", () => {
    configureBackpressure({ maxQueueDepth: 10, warningThresholdPct: 0.8 });
    for (let i = 0; i < 8; i++) enqueue();
    expect(getBackpressureMetrics().signalActive).toBe(true);

    dequeue(1); // 7/10, still above clear threshold (7)
    expect(getBackpressureMetrics().signalActive).toBe(true);

    dequeue(1); // 6/10, now clears
    expect(getBackpressureMetrics().signalActive).toBe(false);
  });

  test("degradation mode ignores invalid TTL and invalid health values", () => {
    const evt = setMode("REDUCED", "manual test", 0);
    expect(evt.expiresAt).toBeNull();

    const change = evaluateHealth({ p95LatencyMs: Number.NaN, errorRate: Number.POSITIVE_INFINITY });
    expect(change).not.toBeNull();
    expect(getCurrentMode()).toBe("MINIMAL");
  });

  test("governance SLO clamps invalid rates and normalizes target ordering", () => {
    configureSloTargets([
      { metric: "FALSE_BLOCK_RATE", targetP95: 0.8, degradedThreshold: 0.2 },
    ]);

    recordSloMeasurement("FALSE_BLOCK_RATE", 2);
    const report = generateSloReport();
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0]!.target).toBe(0.2);
    expect(report.metrics[0]!.degradedThreshold).toBe(0.8);
    expect(report.metrics[0]!.p95).toBeLessThanOrEqual(1);
  });

  test("latency accounting drops invalid measurements and sanitizes labels", () => {
    recordLatency({ category: "LLM", label: "", latencyMs: Number.NaN, governanceOverheadMs: 5 });
    recordLatency({ category: "LLM", label: "  ", latencyMs: 100, governanceOverheadMs: -30 });

    const report = generateLatencyReport();
    expect(report.totalMeasurements).toBe(1);
    expect(report.droppedInvalidMeasurements).toBe(1);

    const buckets = computeLatencyBuckets();
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.label).toBe("unknown");
    expect(buckets[0]!.min).toBeGreaterThanOrEqual(0);
  });
});
