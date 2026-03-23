import { describe, it, expect } from "vitest";
import {
  estimateCost,
  OTLPAdapter,
  LangfuseAdapter,
  HeliconeAdapter,
  WebhookAdapter,
  DatadogAdapter,
  createProviderAdapter,
  createObservabilityBridge,
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
