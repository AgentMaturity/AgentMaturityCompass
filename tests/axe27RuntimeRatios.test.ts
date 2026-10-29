import { beforeEach, describe, expect, test } from "vitest";
import { RealtimeAssuranceEngine } from "../src/watch/realtimeAssurance.js";
import { createObservabilityBridge, type NormalizedTrace } from "../src/watch/observabilityBridge.js";
import { configureSloDefinitions, evaluateSloAlerts, generateSloReport, recordSloMeasurement, renderSloPrometheus, renderSloStatus, resetGovernanceSlo } from "../src/ops/governanceSlo.js";

const trace: NormalizedTrace = { traceId: "axe27", startTimeMs: 1, endTimeMs: 2, durationMs: 1, status: "ok", spans: [], totalTokens: 0, totalCostUsd: 0, modelBreakdown: {}, errorCount: 0, toolCallCount: 0, llmCallCount: 0 };
function engine() {
  const bridge = createObservabilityBridge({ workspace: "/tmp/axe27", agentId: "axe27", providers: [] });
  return new RealtimeAssuranceEngine({ workspace: "/tmp/axe27", agentId: "axe27", bridge, enabledChecks: [], persistResults: false });
}
beforeEach(() => resetGovernanceSlo());
describe("AXE-27 runtime zero denominators", () => {
  test("zero registered checks and empty history never score perfect", async () => {
    const assurance = engine();
    expect(assurance.getStats()).toMatchObject({ avgScore: null, outcome: "not_evaluated", sampleSize: 0 });
    const result = await assurance.evaluateTrace(trace);
    expect(result).toMatchObject({ score: null, outcome: "not_evaluated", sampleSize: 0, checksRun: 0 });
    expect(JSON.parse(JSON.stringify(result)).score).toBeNull();
    expect(assurance.getStats().avgScore).toBeNull();
  });
  test("measured checks still score zero and one hundred", async () => {
    const assurance = engine();
    assurance.addCheck({ id: "pass", name: "pass", description: "pass", severity: "info", evaluate: () => [] });
    expect(await assurance.evaluateTrace(trace)).toMatchObject({ score: 100, outcome: "measured", sampleSize: 1 });
    const failed = engine();
    failed.addCheck({ id: "throw", name: "throw", description: "throw", severity: "info", evaluate: () => { throw new Error("failed"); } });
    expect(await failed.evaluateTrace(trace)).toMatchObject({ score: 0, outcome: "measured", sampleSize: 1 });
  });
  test("empty governance windows report NO_DATA for percentiles and compliance", () => {
    const report = generateSloReport();
    expect(report.overallStatus).toBe("NO_DATA");
    expect(report.metrics.length).toBeGreaterThan(0);
    for (const metric of report.metrics) expect(metric).toMatchObject({ status: "NO_DATA", outcome: "not_evaluated", p50: null, p95: null, p99: null });
    for (const definition of report.definitions) expect(definition).toMatchObject({ status: "NO_DATA", outcome: "not_evaluated", sampleSize: 0, observedValue: null });
    expect(renderSloStatus()).toContain("not evaluated");
    expect(renderSloPrometheus()).toContain("NaN");
    expect(renderSloPrometheus()).not.toContain(" null");
  });
  test("data loss cannot emit a healthy recovery alert", () => {
    configureSloDefinitions([{ id: "compliance", name: "compliance", objective: "test", metric: "FALSE_BLOCK_RATE", mode: "COMPLIANCE_GTE", targetValue: 1, degradedThreshold: 0.5, thresholdValue: 0 }]);
    recordSloMeasurement("FALSE_BLOCK_RATE", 1);
    expect(evaluateSloAlerts().some(alert => alert.status === "VIOLATED")).toBe(true);
    configureSloDefinitions([{ id: "compliance", name: "compliance", objective: "test", metric: "FALSE_BLOCK_RATE", mode: "COMPLIANCE_GTE", targetValue: 1, degradedThreshold: 0.5, thresholdValue: 0, labelFilters: { missing: ["yes"] } }]);
    expect(evaluateSloAlerts().some(alert => alert.severity === "RECOVERY")).toBe(false);
    expect(generateSloReport().definitions[0]).toMatchObject({ observedValue: null, status: "NO_DATA" });
  });
  test("compliance retains measured zero and one", () => {
    configureSloDefinitions([{ id: "rate", name: "rate", objective: "test", metric: "FALSE_BLOCK_RATE", mode: "COMPLIANCE_GTE", targetValue: 1, degradedThreshold: 0.5, thresholdValue: 0 }]);
    recordSloMeasurement("FALSE_BLOCK_RATE", 1);
    expect(generateSloReport().definitions[0]).toMatchObject({ observedValue: 0, outcome: "measured", sampleSize: 1, status: "VIOLATED" });
    resetGovernanceSlo();
    configureSloDefinitions([{ id: "rate", name: "rate", objective: "test", metric: "FALSE_BLOCK_RATE", mode: "COMPLIANCE_GTE", targetValue: 1, degradedThreshold: 0.5, thresholdValue: 0 }]);
    recordSloMeasurement("FALSE_BLOCK_RATE", 0);
    expect(generateSloReport().definitions[0]).toMatchObject({ observedValue: 1, outcome: "measured", sampleSize: 1, status: "HEALTHY" });
  });
});
