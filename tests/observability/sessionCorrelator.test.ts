import { describe, it, expect } from "vitest";
import { SessionCorrelator } from "../../src/observability/sessionCorrelator.js";
import type { NormalizedTrace } from "../../src/watch/observabilityBridge.js";

function makeTrace(sessionId: string, status: "ok" | "error" = "ok", durationMs = 1000): NormalizedTrace {
  const now = Date.now();
  return {
    traceId: "t-" + Math.random().toString(36).slice(2, 8),
    sessionId,
    startTimeMs: now - durationMs,
    endTimeMs: now,
    durationMs,
    status,
    spans: [{ spanId: "s1", traceId: "t1", name: "chat", kind: "llm_call", startTimeMs: now - 500, endTimeMs: now, durationMs: 500, status }],
    totalTokens: 500,
    totalCostUsd: 0.01,
    modelBreakdown: { "gpt-4o": { tokens: 500, costUsd: 0.01, calls: 1 } },
    errorCount: status === "error" ? 1 : 0,
    toolCallCount: 0,
    llmCallCount: 1,
  };
}

describe("SessionCorrelator", () => {
  it("groups traces by session", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    correlator.ingestTrace(makeTrace("session-1"));
    correlator.ingestTrace(makeTrace("session-1"));
    correlator.ingestTrace(makeTrace("session-2"));

    const sessions = correlator.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("computes quality score for a session", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    correlator.ingestTrace(makeTrace("session-1"));
    correlator.ingestTrace(makeTrace("session-1"));

    const summary = correlator.getSession("session-1");
    expect(summary).not.toBeNull();
    expect(summary!.qualityScore).toBeGreaterThan(0);
    expect(summary!.traceCount).toBe(2);
    expect(summary!.errorRate).toBe(0);
  });

  it("detects error-heavy sessions", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    for (let i = 0; i < 5; i++) correlator.ingestTrace(makeTrace("good-session"));
    for (let i = 0; i < 5; i++) correlator.ingestTrace(makeTrace("bad-session", "error"));

    const bad = correlator.getSession("bad-session");
    const good = correlator.getSession("good-session");
    expect(bad!.qualityScore).toBeLessThan(good!.qualityScore);
    expect(bad!.errorRate).toBe(1.0);
  });

  it("detects anomalies across sessions", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    // Create several good sessions
    for (let s = 0; s < 8; s++) {
      for (let i = 0; i < 3; i++) correlator.ingestTrace(makeTrace(`good-${s}`));
    }
    // One terrible session
    for (let i = 0; i < 3; i++) correlator.ingestTrace(makeTrace("terrible", "error"));

    const anomalies = correlator.detectAnomalies();
    expect(anomalies.length).toBeGreaterThan(0);
    const errorBurst = anomalies.find((a) => a.type === "error_burst");
    expect(errorBurst).toBeDefined();
  });

  it("provides aggregate stats", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    correlator.ingestTrace(makeTrace("s1"));
    correlator.ingestTrace(makeTrace("s2"));

    const stats = correlator.getAggregateStats();
    expect(stats.totalSessions).toBe(2);
    expect(stats.avgTracesPerSession).toBe(1);
    expect(stats.totalCostUsd).toBeGreaterThan(0);
  });

  it("returns null for unknown session", () => {
    const correlator = new SessionCorrelator({ workspace: "/tmp/test", agentId: "test" });
    expect(correlator.getSession("nonexistent")).toBeNull();
  });
});
