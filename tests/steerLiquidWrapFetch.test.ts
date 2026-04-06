/**
 * AMC-438: Wire liquid streaming into wrapFetch — real SSE transform
 */
import { describe, test, expect } from "vitest";
import {
  createLiquidStage,
  createLiquidStreamState,
  flushRemaining,
  ingestDelta,
  parseSSEDelta,
} from "../src/steer/liquid.js";
import { wrapFetch } from "../src/runtime/wrapFetch.js";
import { createSteerPipeline } from "../src/steer/pipeline.js";

function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

async function readResponseText(response: Response): Promise<string> {
  return await response.text();
}

describe("liquid core streaming", () => {
  test("parseSSEDelta extracts OpenAI delta content", () => {
    const delta = parseSSEDelta(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    );
    expect(delta).toBe("Hello");
  });

  test("parseSSEDelta extracts Anthropic delta content", () => {
    const delta = parseSSEDelta(
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
    );
    expect(delta).toBe("Hello");
  });

  test("ingestDelta flushes transformed text at sentence boundary", () => {
    const state = createLiquidStreamState();
    const flushed = ingestDelta(state, "hello world. ", {
      flushThreshold: 50,
      transform: (text) => text.toUpperCase(),
    });
    expect(flushed).toBe("HELLO WORLD. ");
    expect(state.buffer).toBe("");
  });

  test("flushRemaining returns transformed remainder", () => {
    const state = createLiquidStreamState();
    ingestDelta(state, "leftover text", { flushThreshold: 9999 });
    const flushed = flushRemaining(state, {
      transform: (text) => `[${text}]`,
    });
    expect(flushed).toBe("[leftover text]");
  });
});

describe("wrapFetch liquid integration", () => {
  test("transforms streaming SSE chunks when liquid is enabled", async () => {
    const originalFetch = async () => {
      return new Response(
        makeSSEStream([
          'data: {"choices":[{"delta":{"content":"hello world. "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"second sentence."}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
          },
        },
      );
    };

    const pipeline = createSteerPipeline({
      stages: [
        createLiquidStage({
          transform: (text) => text.toUpperCase(),
          flushThreshold: 5,
          flushOnSentenceBoundary: true,
        }),
      ],
    });

    const wrapped = wrapFetch(originalFetch as typeof fetch, {
      agentId: "test-agent",
      gatewayBaseUrl: "https://gateway.example.com/openai",
      forceBaseUrl: false,
      steerPipeline: pipeline,
    });

    const response = await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ stream: true, messages: [{ role: "user", content: "hello" }] }),
    });

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await readResponseText(response);
    expect(body).toContain("HELLO WORLD. ");
    expect(body).toContain("SECOND SENTENCE.");
    expect(body).toContain("data: [DONE]");
  });

  test("passes through non-streaming JSON responses unchanged even when liquid enabled", async () => {
    const originalFetch = async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "plain response" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const pipeline = createSteerPipeline({
      stages: [createLiquidStage({ transform: (text) => text.toUpperCase() })],
    });

    const wrapped = wrapFetch(originalFetch as typeof fetch, {
      agentId: "test-agent",
      gatewayBaseUrl: "https://gateway.example.com/openai",
      forceBaseUrl: false,
      steerPipeline: pipeline,
    });

    const response = await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    expect(await response.json()).toEqual({
      choices: [{ message: { content: "plain response" } }],
    });
  });
});
