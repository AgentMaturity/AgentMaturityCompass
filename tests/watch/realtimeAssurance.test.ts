import { describe, it, expect, beforeEach } from "vitest";
import { RealtimeAssuranceEngine } from "../../src/watch/realtimeAssurance.js";
import { WebhookAdapter, createObservabilityBridge, type NormalizedTrace, type NormalizedSpan } from "../../src/watch/observabilityBridge.js";

function makeTrace(overrides?: Partial<NormalizedTrace>): NormalizedTrace {
  return {
    traceId: "test-trace",
    startTimeMs: Date.now() - 1000,
    endTimeMs: Date.now(),
    durationMs: 1000,
    status: "ok",
    spans: [],
    totalTokens: 500,
    totalCostUsd: 0.01,
    modelBreakdown: {},
    errorCount: 0,
    toolCallCount: 0,
    llmCallCount: 1,
    ...overrides,
  };
}

function makeSpan(overrides?: Partial<NormalizedSpan>): NormalizedSpan {
  return {
    spanId: "span-1",
    traceId: "test-trace",
    name: "test",
    kind: "llm_call",
    startTimeMs: Date.now() - 500,
    endTimeMs: Date.now(),
    durationMs: 500,
    status: "ok",
    ...overrides,
  };
}

describe("RealtimeAssuranceEngine", () => {
  let bridge: ReturnType<typeof createObservabilityBridge>;

  beforeEach(() => {
    bridge = createObservabilityBridge({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      providers: [{ provider: "webhook", endpoint: "http://localhost:0" }],
    });
  });

  it("evaluates a clean trace with no violations", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
    });

    const trace = makeTrace();
    const result = await engine.evaluateTrace(trace);
    expect(result.checksRun).toBeGreaterThan(0);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  it("detects high latency", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
      maxLatencyMs: 1000,
    });

    const trace = makeTrace({ durationMs: 60000, endTimeMs: Date.now(), startTimeMs: Date.now() - 60000 });
    const result = await engine.evaluateTrace(trace);
    const latencyViolations = result.violations.filter((v) => v.checkId === "rt-high-latency");
    expect(latencyViolations.length).toBeGreaterThan(0);
  });

  it("detects tool failure loops", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
      maxToolRetries: 2,
    });

    const spans: NormalizedSpan[] = Array.from({ length: 5 }, (_, i) =>
      makeSpan({
        spanId: `tool-${i}`,
        kind: "tool_call",
        toolName: "fetch_data",
        status: "error",
        toolSuccess: false,
      })
    );

    const trace = makeTrace({ spans, toolCallCount: 5 });
    const result = await engine.evaluateTrace(trace);
    const toolViolations = result.violations.filter((v) => v.checkId === "rt-tool-failure");
    expect(toolViolations.length).toBeGreaterThan(0);
  });

  it("detects model misuse (expensive model for trivial task)", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
    });

    const spans = [makeSpan({
      model: "claude-opus-4",
      tokenUsage: { prompt: 50, completion: 30, total: 80 },
      durationMs: 500,
    })];

    const trace = makeTrace({ spans });
    const result = await engine.evaluateTrace(trace);
    const misuseViolations = result.violations.filter((v) => v.checkId === "rt-model-misuse");
    expect(misuseViolations.length).toBeGreaterThan(0);
  });

  it("tracks stats correctly", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
    });

    await engine.evaluateTrace(makeTrace({ traceId: "t1" }));
    await engine.evaluateTrace(makeTrace({ traceId: "t2" }));

    const stats = engine.getStats();
    expect(stats.totalResults).toBe(2);
    expect(stats.totalChecks).toBeGreaterThan(0);
  });

  it("detects governance bypass (high-stakes without guard)", async () => {
    const engine = new RealtimeAssuranceEngine({
      workspace: "/tmp/test-amc",
      agentId: "test-agent",
      bridge,
    });

    const spans = [makeSpan({
      kind: "tool_call",
      name: "deploy_production",
      toolName: "deploy_production",
    })];

    const trace = makeTrace({ spans });
    const result = await engine.evaluateTrace(trace);
    const govViolations = result.violations.filter((v) => v.checkId === "rt-governance-bypass");
    expect(govViolations.length).toBeGreaterThan(0);
  });
});
