import { describe, expect, test } from "vitest";
import {
  createLiquidStreamState,
  ingestDelta,
  flushRemaining,
  parseSSEDelta,
  createLiquidStage,
} from "../src/steer/liquid.js";

describe("liquid streaming", () => {
  test("buffers tokens until flush threshold", () => {
    const state = createLiquidStreamState();
    const result1 = ingestDelta(state, "Hello ", { flushThreshold: 50 });
    expect(result1).toBe("");
    expect(state.buffer).toBe("Hello ");
  });

  test("flushes at sentence boundary", () => {
    const state = createLiquidStreamState();
    ingestDelta(state, "The answer is 42. ", { flushThreshold: 10 });
    const result = ingestDelta(state, "Next sentence.", {
      flushThreshold: 10,
    });
    // Should have flushed the first sentence
    expect(state.totalTokens).toBe(2);
  });

  test("applies transform function on flush", () => {
    const state = createLiquidStreamState();
    const result = ingestDelta(
      state,
      "The answer is 42. This is enough text to trigger a flush.",
      {
        flushThreshold: 10,
        transform: (text) => text.toUpperCase(),
      },
    );
    expect(result).toBe(result.toUpperCase());
  });

  test("flushRemaining drains the buffer", () => {
    const state = createLiquidStreamState();
    ingestDelta(state, "partial", { flushThreshold: 100 });
    expect(state.buffer).toBe("partial");
    const remaining = flushRemaining(state);
    expect(remaining).toBe("partial");
    expect(state.buffer).toBe("");
  });

  test("flushRemaining applies transform", () => {
    const state = createLiquidStreamState();
    ingestDelta(state, "partial", { flushThreshold: 100 });
    const remaining = flushRemaining(state, {
      transform: (t) => t.toUpperCase(),
    });
    expect(remaining).toBe("PARTIAL");
  });

  test("tracks chunk count and total tokens", () => {
    const state = createLiquidStreamState();
    ingestDelta(state, "a", { flushThreshold: 100 });
    ingestDelta(state, "b", { flushThreshold: 100 });
    ingestDelta(state, "c", { flushThreshold: 100 });
    expect(state.totalTokens).toBe(3);
    expect(state.chunks.length).toBe(3);
  });
});

describe("parseSSEDelta", () => {
  test("parses OpenAI SSE delta", () => {
    const line =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}';
    expect(parseSSEDelta(line)).toBe("Hello");
  });

  test("returns null for [DONE]", () => {
    expect(parseSSEDelta("data: [DONE]")).toBe(null);
  });

  test("returns null for non-data lines", () => {
    expect(parseSSEDelta("event: ping")).toBe(null);
    expect(parseSSEDelta("")).toBe(null);
  });

  test("parses Anthropic content_block_delta", () => {
    const line =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"World"}}';
    expect(parseSSEDelta(line)).toBe("World");
  });
});

describe("createLiquidStage", () => {
  test("creates a SteerStage that tags metadata", async () => {
    const stage = createLiquidStage({ flushThreshold: 100 });
    expect(stage.id).toBe("liquid-stream");
    const ctx = {
      agentId: "test",
      providerId: "openai",
      url: "http://localhost",
      init: {},
      metadata: {},
    };
    const result = await stage.onRequest!(ctx);
    expect(result.metadata.liquidEnabled).toBe(true);
    expect(result.metadata.liquidOptions).toBeDefined();
  });
});
