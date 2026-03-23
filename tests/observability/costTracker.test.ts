import { describe, it, expect } from "vitest";
import { CostTracker } from "../../src/observability/costTracker.js";
import type { NormalizedTrace } from "../../src/watch/observabilityBridge.js";

function makeTrace(overrides?: Partial<NormalizedTrace>): NormalizedTrace {
  return {
    traceId: "t-" + Math.random().toString(36).slice(2, 8),
    startTimeMs: Date.now() - 1000,
    endTimeMs: Date.now(),
    durationMs: 1000,
    status: "ok",
    spans: [{
      spanId: "s1", traceId: "t1", name: "chat", kind: "llm_call",
      startTimeMs: Date.now() - 500, endTimeMs: Date.now(), durationMs: 500,
      status: "ok", model: "gpt-4o",
      tokenUsage: { prompt: 500, completion: 200, total: 700 },
      costUsd: 0.0033,
    }],
    totalTokens: 700,
    totalCostUsd: 0.0033,
    modelBreakdown: { "gpt-4o": { tokens: 700, costUsd: 0.0033, calls: 1 } },
    errorCount: 0, toolCallCount: 0, llmCallCount: 1,
    ...overrides,
  };
}

describe("CostTracker", () => {
  it("records trace costs", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost", agentId: "test" });
    const records = tracker.recordTrace(makeTrace());
    expect(records.length).toBeGreaterThan(0);
    expect(records[0]!.costUsd).toBeGreaterThan(0);
    expect(records[0]!.model).toBe("gpt-4o");
  });

  it("generates a report with model breakdown", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost2", agentId: "test" });
    for (let i = 0; i < 5; i++) tracker.recordTrace(makeTrace());
    const report = tracker.generateReport(7);
    expect(report.totalCalls).toBeGreaterThanOrEqual(5);
    expect(report.totalCostUsd).toBeGreaterThan(0);
    expect(report.costByModel["gpt-4o"]).toBeDefined();
    expect(report.costByModel["gpt-4o"]!.pctOfTotal).toBeCloseTo(100, 0);
  });

  it("calculates budget status", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost3", agentId: "test", budgetUsd: 1.0, budgetPeriod: "monthly" });
    tracker.recordTrace(makeTrace());
    const status = tracker.getBudgetStatus();
    expect(status.spent).toBeGreaterThan(0);
    expect(status.remaining).toBeLessThan(1.0);
    expect(status.pctUsed).toBeGreaterThan(0);
  });

  it("detects budget exceeded anomaly", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost4", agentId: "test", budgetUsd: 0.001 });
    tracker.recordTrace(makeTrace());
    const report = tracker.generateReport(7);
    const budgetAnomaly = report.anomalies.find((a) => a.type === "budget_exceeded");
    expect(budgetAnomaly).toBeDefined();
  });

  it("generates recommendations for single model usage", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost5", agentId: "test" });
    for (let i = 0; i < 25; i++) tracker.recordTrace(makeTrace());
    const report = tracker.generateReport(7);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("handles empty state gracefully", () => {
    const tracker = new CostTracker({ workspace: "/tmp/test-amc-cost-empty", agentId: "empty" });
    const report = tracker.generateReport(30);
    expect(report.totalCalls).toBe(0);
    expect(report.totalCostUsd).toBe(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
