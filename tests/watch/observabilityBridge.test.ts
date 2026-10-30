import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";

vi.mock("node:http", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:http")>(),
  request: vi.fn(),
}));
import {
  estimateCost,
  OTLPAdapter,
  LangfuseAdapter,
  HeliconeAdapter,
  WebhookAdapter,
  DatadogAdapter,
  createProviderAdapter,
  createObservabilityBridge,
  type NormalizedSpan,
} from "../../src/watch/observabilityBridge.js";

describe("ObservabilityBridge", () => {
  describe("estimateCost", () => {
    it("estimates OpenAI GPT-4o cost correctly", () => {
      const cost = estimateCost("gpt-4o", { prompt: 1000, completion: 500 });
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(0.1);
    });

    it("estimates Claude Opus cost correctly", () => {
      const cost = estimateCost("claude-opus-4", { prompt: 1000, completion: 500 });
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1);
    });

    it("returns fallback cost for unknown models", () => {
      const cost = estimateCost("unknown-model-xyz", { prompt: 1000, completion: 500 });
      expect(cost).toBeGreaterThan(0);
    });

    it("returns 0 for undefined model", () => {
      const cost = estimateCost(undefined, { prompt: 1000, completion: 500 });
      expect(cost).toBe(0);
    });

    it("handles zero tokens", () => {
      const cost = estimateCost("gpt-4o", { prompt: 0, completion: 0 });
      expect(cost).toBe(0);
    });
  });

  describe("createProviderAdapter", () => {
    it("creates OTLP adapter", () => {
      const adapter = createProviderAdapter("otlp");
      expect(adapter).toBeInstanceOf(OTLPAdapter);
      expect(adapter.provider).toBe("otlp");
    });

    it("creates Langfuse adapter", () => {
      const adapter = createProviderAdapter("langfuse");
      expect(adapter).toBeInstanceOf(LangfuseAdapter);
    });

    it("creates Helicone adapter", () => {
      const adapter = createProviderAdapter("helicone");
      expect(adapter).toBeInstanceOf(HeliconeAdapter);
    });

    it("creates Webhook adapter", () => {
      const adapter = createProviderAdapter("webhook");
      expect(adapter).toBeInstanceOf(WebhookAdapter);
    });

    it("throws for unknown provider", () => {
      expect(() => createProviderAdapter("unknown" as any)).toThrow();
    });
  });

  describe("WebhookAdapter", () => {
    it("ingests and retrieves traces", async () => {
      const adapter = new WebhookAdapter();
      await adapter.connect({ provider: "webhook", endpoint: "http://localhost:0" });
      expect(adapter.isConnected()).toBe(true);

      const trace = {
        traceId: "test-trace-1",
        startTimeMs: Date.now() - 1000,
        endTimeMs: Date.now(),
        durationMs: 1000,
        status: "ok" as const,
        spans: [],
        totalTokens: 100,
        totalCostUsd: 0.01,
        modelBreakdown: {},
        errorCount: 0,
        toolCallCount: 0,
        llmCallCount: 1,
      };

      adapter.ingest(trace);
      const retrieved = await adapter.fetchTraces(0, 10);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]!.traceId).toBe("test-trace-1");

      const single = await adapter.fetchTrace("test-trace-1");
      expect(single).not.toBeNull();
      expect(single?.traceId).toBe("test-trace-1");

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it("returns null for unknown trace", async () => {
      const adapter = new WebhookAdapter();
      await adapter.connect({ provider: "webhook", endpoint: "http://localhost:0" });
      const result = await adapter.fetchTrace("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("usage projection", () => {
    const span = (spanId: string, overrides: Partial<NormalizedSpan> = {}): NormalizedSpan => ({
      spanId, traceId: "usage-trace", name: "chat", kind: "llm_call",
      startTimeMs: 1, endTimeMs: 2, durationMs: 1, status: "ok", model: "gpt-4o",
      tokenUsage: { prompt: 60, completion: 40, total: 100 }, costUsd: 0.01,
      ...overrides,
    });

    it("normalizes OTLP total aliases and leaves absent usage unknown", async () => {
      const body = JSON.stringify({
        resourceSpans: [{ scopeSpans: [{ spans: [
          { traceId: "otlp", spanId: "reported", name: "chat.completion", attributes: [
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
            { key: "gen_ai.usage.input_tokens", value: { intValue: 60 } },
            { key: "gen_ai.usage.output_tokens", value: { intValue: 40 } },
            { key: "gen_ai.usage.total_tokens", value: { intValue: 95 } },
            { key: "gen_ai.usage.cost", value: { doubleValue: 0 } },
          ] },
          { traceId: "otlp", spanId: "estimated", name: "chat.completion", attributes: [
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
            { key: "gen_ai.usage.input_tokens", value: { intValue: 10 } },
            { key: "gen_ai.usage.output_tokens", value: { intValue: 10 } },
          ] },
          { traceId: "otlp", spanId: "missing", name: "chat.completion", attributes: [
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
          ] },
          { traceId: "otlp", spanId: "blank", name: "chat.completion", attributes: [
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
            { key: "gen_ai.usage.input_tokens", value: { stringValue: "" } },
            { key: "gen_ai.usage.output_tokens", value: { stringValue: "  " } },
            { key: "gen_ai.usage.total_tokens", value: { stringValue: " " } },
            { key: "gen_ai.usage.cost", value: { stringValue: "\t" } },
          ] },
          { traceId: "otlp", spanId: "total-only", name: "chat.completion", attributes: [
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
            { key: "gen_ai.usage.total_tokens", value: { intValue: 17 } },
          ] },
        ] }] }],
      });
      vi.mocked(httpRequest).mockImplementation((_url, _options, callback) => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        const request = Object.assign(new EventEmitter(), {
          end: () => {
            callback!(response as IncomingMessage);
            response.emit("data", Buffer.from(body));
            response.emit("end");
          },
          write: () => true,
          destroy: () => request,
        });
        return request as unknown as ClientRequest;
      });
      const adapter = new OTLPAdapter();
      try {
        await adapter.connect({ provider: "otlp", endpoint: "http://otlp.test" });
        const [trace] = await adapter.fetchTraces(0, 10);
        expect(trace?.totalTokens).toBe(132);
        expect(trace?.spans[0]).toMatchObject({ tokenUsage: { prompt: 60, completion: 40, total: 95 }, costUsd: 0, costSource: "reported" });
        expect(trace?.spans[1]?.costUsd).toBeGreaterThan(0);
        expect(trace?.spans[1]?.costSource).toBe("estimated");
        expect(trace?.spans[2]?.costUsd).toBeUndefined();
        expect(trace?.spans[2]?.costSource).toBe("unknown");
        expect(trace?.spans[3]?.tokenUsage).toBeUndefined();
        expect(trace?.spans[3]?.costUsd).toBeUndefined();
        expect(trace?.spans[3]?.costSource).toBe("unknown");
        expect(trace?.spans[4]?.tokenUsage).toBeUndefined();
        expect(trace?.spans[4]?.reportedTotalTokens).toBe(17);
        expect(trace?.spans[4]?.costUsd).toBeUndefined();
        expect(trace?.spans[4]?.costSource).toBe("unknown");
        expect(trace?.costUsageComplete).toBe(false);
      } finally {
        await adapter.disconnect();
        vi.mocked(httpRequest).mockReset();
      }
    });

    it("counts descendant usage once across multiple aggregate parents", () => {
      const trace = new WebhookAdapter().ingestSpans([
        span("root", { kind: "chain" }),
        span("wrapper", { parentSpanId: "root" }),
        span("child", { parentSpanId: "wrapper" }),
      ]);
      expect(trace.totalTokens).toBe(100);
      expect(trace.totalCostUsd).toBe(0.01);
      expect(trace.modelBreakdown["gpt-4o"]).toMatchObject({ tokens: 100, costUsd: 0.01, calls: 1 });
    });

    it("deduplicates repeated span identities while retaining independent siblings", () => {
      const child = span("child", { parentSpanId: "root" });
      const trace = new WebhookAdapter().ingestSpans([
        span("root", { kind: "chain", tokenUsage: { prompt: 120, completion: 80, total: 200 }, costUsd: 0.02 }),
        child, child, span("sibling", { parentSpanId: "root" }),
      ]);
      expect(trace.totalTokens).toBe(200);
      expect(trace.totalCostUsd).toBe(0.02);
      expect(trace.spans).toHaveLength(3);
    });

    it("resolves usage totals once and preserves measured zero", () => {
      const trace = new WebhookAdapter().ingestSpans([
        span("total-wins", { tokenUsage: { prompt: 60, completion: 40, total: 90 } }),
        span("zero", { tokenUsage: { prompt: 0, completion: 0, total: 0 }, costUsd: 0 }),
      ]);
      expect(trace.totalTokens).toBe(90);
      expect(trace.tokenUsageComplete).toBe(true);
      expect(trace.costUsageComplete).toBe(true);
      expect(trace.spans[1]?.costSource).toBe("reported");
    });

    it("keeps missing usage and cost distinct from measured zero", () => {
      const trace = new WebhookAdapter().ingestSpans([
        span("missing", { tokenUsage: undefined, costUsd: undefined }),
      ]);
      expect(trace.tokenUsageComplete).toBe(false);
      expect(trace.costUsageComplete).toBe(false);
      expect(trace.spans[0]?.costSource).toBe("unknown");
      expect(trace.spans[0]?.costUsd).toBeUndefined();
    });

    it("does not let malformed usage or cyclic ancestry create a spend claim", () => {
      const trace = new WebhookAdapter().ingestSpans([
        span("one", { parentSpanId: "two", tokenUsage: { prompt: NaN, completion: NaN, total: NaN }, costUsd: -1 }),
        span("two", { parentSpanId: "one", tokenUsage: undefined, costUsd: undefined }),
      ]);
      expect(trace.totalTokens).toBe(0);
      expect(trace.totalCostUsd).toBe(0);
      expect(trace.tokenUsageComplete).toBe(false);
      expect(trace.costUsageComplete).toBe(false);
    });
  });

  describe("ObservabilityBridge", () => {
    it("creates bridge with config", () => {
      const bridge = createObservabilityBridge({
        workspace: "/tmp/test-amc",
        agentId: "test-agent",
        providers: [],
      });
      expect(bridge).toBeDefined();
      const stats = bridge.getStats();
      expect(stats.totalTraces).toBe(0);
      expect(stats.providerCount).toBe(0);
    });
  });
});
