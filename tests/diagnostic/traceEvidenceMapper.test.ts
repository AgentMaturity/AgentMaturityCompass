import { describe, it, expect } from "vitest";
import { mapTracesToEvidence } from "../../src/diagnostic/autoAnswer/traceEvidenceMapper.js";
import type { NormalizedTrace } from "../../src/watch/observabilityBridge.js";

function makeTrace(overrides?: Partial<NormalizedTrace>): NormalizedTrace {
  const now = Date.now();
  return {
    traceId: "t-" + Math.random().toString(36).slice(2, 8),
    sessionId: "session-1",
    startTimeMs: now - 2000,
    endTimeMs: now,
    durationMs: 2000,
    status: "ok",
    spans: [
      { spanId: "s1", traceId: "t1", name: "chat", kind: "llm_call", startTimeMs: now - 1500, endTimeMs: now - 500, durationMs: 1000, status: "ok", model: "gpt-4o", tokenUsage: { prompt: 500, completion: 200, total: 700 }, costUsd: 0.003 },
      { spanId: "s2", traceId: "t1", name: "search", kind: "retrieval", startTimeMs: now - 2000, endTimeMs: now - 1500, durationMs: 500, status: "ok" },
      { spanId: "s3", traceId: "t1", name: "safety_check", kind: "guard", startTimeMs: now - 500, endTimeMs: now, durationMs: 500, status: "ok" },
    ],
    totalTokens: 700,
    totalCostUsd: 0.003,
    modelBreakdown: { "gpt-4o": { tokens: 700, costUsd: 0.003, calls: 1 } },
    errorCount: 0,
    toolCallCount: 0,
    llmCallCount: 1,
    ...overrides,
  };
}

describe("TraceEvidenceMapper", () => {
  it("maps traces to evidence answers", () => {
    const traces = Array.from({ length: 20 }, () => makeTrace());
    const result = mapTracesToEvidence(traces);
    expect(result.totalTraces).toBe(20);
    expect(result.answeredQuestions).toBeGreaterThan(0);
    expect(result.answers.length).toBeGreaterThan(0);
  });

  it("detects retrieval and guards", () => {
    const traces = Array.from({ length: 10 }, () => makeTrace());
    const result = mapTracesToEvidence(traces);
    expect(result.metrics.hasRetrieval).toBe(true);
    expect(result.metrics.hasGuards).toBe(true);
    // Guard answer should score well
    const guardAnswer = result.answers.find((a) => a.questionId === "AMC-4.1");
    expect(guardAnswer).toBeDefined();
    expect(guardAnswer!.answer).toBeGreaterThanOrEqual(4);
  });

  it("detects cost tracking", () => {
    const traces = Array.from({ length: 10 }, () => makeTrace());
    const result = mapTracesToEvidence(traces);
    expect(result.metrics.hasCostTracking).toBe(true);
    expect(result.metrics.totalCostUsd).toBeGreaterThan(0);
  });

  it("computes latency percentiles", () => {
    const traces = Array.from({ length: 30 }, (_, i) =>
      makeTrace({ durationMs: 1000 + i * 100, startTimeMs: Date.now() - (1000 + i * 100) })
    );
    const result = mapTracesToEvidence(traces);
    expect(result.metrics.p95LatencyMs).toBeGreaterThan(result.metrics.avgLatencyMs);
    expect(result.metrics.p99LatencyMs).toBeGreaterThanOrEqual(result.metrics.p95LatencyMs);
  });

  it("handles empty trace list", () => {
    const result = mapTracesToEvidence([]);
    expect(result.totalTraces).toBe(0);
    expect(result.answers).toHaveLength(0);
  });

  it("assigns confidence based on trace count", () => {
    const fewTraces = Array.from({ length: 3 }, () => makeTrace());
    const manyTraces = Array.from({ length: 50 }, () => makeTrace());

    const fewResult = mapTracesToEvidence(fewTraces);
    const manyResult = mapTracesToEvidence(manyTraces);

    const fewHigh = fewResult.answers.filter((a) => a.confidence === "high").length;
    const manyHigh = manyResult.answers.filter((a) => a.confidence === "high").length;
    expect(manyHigh).toBeGreaterThanOrEqual(fewHigh);
  });
});
