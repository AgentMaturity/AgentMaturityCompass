/**
 * AMC-437: Wire race stage into wrapFetch — actual multi-model fan-out
 * Tests: raceModels fan-out, wrapFetch integration with raceOptions in metadata
 */
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";
import { raceModels, createRaceStage, type RaceOptions, type RaceCandidate, type RaceResult } from "../src/steer/race.js";
import { wrapFetch, type WrapFetchOptions } from "../src/runtime/wrapFetch.js";
import { createSteerPipeline } from "../src/steer/pipeline.js";

// Mock fetch for controlled responses
function makeMockFetch(responses: Record<string, { body: unknown; delay?: number; status?: number }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        if (resp.delay) await new Promise((r) => setTimeout(r, resp.delay));
        return new Response(JSON.stringify(resp.body), {
          status: resp.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("{}", { status: 404 });
  });
}

describe("raceModels — core fan-out", () => {
  test("races multiple candidates and picks best score", async () => {
    const mockFetch = makeMockFetch({
      "model-a": {
        body: {
          choices: [{ message: { content: "A short answer." } }],
        },
      },
      "model-b": {
        body: {
          choices: [{
            message: {
              content: "Here is a detailed, comprehensive response with thorough analysis and clear reasoning about the topic at hand. This response contains multiple sentences, proper structure, and substantive content that demonstrates understanding.",
            },
          }],
        },
      },
    });

    // Temporarily replace global fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    try {
      const result = await raceModels(
        {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", content: "test" }] }),
        },
        {
          candidates: [
            { id: "a", url: "https://api.openai.com/model-a/v1/chat/completions" },
            { id: "b", url: "https://api.openai.com/model-b/v1/chat/completions" },
          ],
        },
      );

      expect(result.candidates).toHaveLength(2);
      expect(result.winnerId).toBe("b"); // longer, better response
      expect(result.winnerScore.composite).toBeGreaterThan(0);
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("handles candidate failures gracefully", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("model-a")) {
        throw new Error("Connection refused");
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Good response from B with detail." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    try {
      const result = await raceModels(
        { method: "POST", body: JSON.stringify({}) },
        {
          candidates: [
            { id: "a", url: "https://fail.example.com/model-a/v1" },
            { id: "b", url: "https://ok.example.com/model-b/v1" },
          ],
        },
      );

      expect(result.winnerId).toBe("b");
      expect(result.candidates.find((c) => c.id === "a")?.error).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("fastestAboveThreshold picks fastest qualifying", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("model-a")) {
        // Fast but decent
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "A good enough answer with some detail and reasoning about the question." } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Slow but better
      await new Promise((r) => setTimeout(r, 50));
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: "An incredibly detailed answer with comprehensive analysis, examples, citations, and thorough exploration of every aspect of the question.",
            },
          }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    try {
      const result = await raceModels(
        { method: "POST", body: JSON.stringify({}) },
        {
          candidates: [
            { id: "a", url: "https://fast.example.com/model-a/v1" },
            { id: "b", url: "https://slow.example.com/model-b/v1" },
          ],
          fastestAboveThreshold: 0.1, // very low threshold
        },
      );

      // model-a should win because it's faster and above threshold
      expect(result.winnerId).toBe("a");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("wrapFetch — race integration", () => {
  let origFetch: typeof fetch;
  
  beforeEach(() => {
    origFetch = globalThis.fetch;
  });
  
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("detects raceOptions in metadata and fans out", async () => {
    const fetchCalls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `Response from ${url} with some detailed content for scoring.` } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    // raceModels uses globalThis.fetch internally, so we must set it
    globalThis.fetch = mockFetch;

    const raceStage = createRaceStage({
      candidates: [
        { id: "gpt4", url: "https://api.openai.com/v1/chat/completions", bodyOverrides: { model: "gpt-4" } },
        { id: "claude", url: "https://api.anthropic.com/v1/messages", bodyOverrides: { model: "claude-3" } },
      ],
    });

    const pipeline = createSteerPipeline({ stages: [raceStage] });

    const wrapped = wrapFetch(mockFetch, {
      agentId: "test-agent",
      gatewayBaseUrl: "https://gateway.example.com/openai",
      forceBaseUrl: false,
      steerPipeline: pipeline,
    });

    const response = await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    expect(response.status).toBe(200);
    // Should have made calls to BOTH candidate URLs (fan-out) + 1 winner re-fetch
    expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test("normal request without raceOptions passes through unchanged", async () => {
    const fetchCalls: string[] = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const pipeline = createSteerPipeline({ stages: [] });

    const wrapped = wrapFetch(mockFetch as unknown as typeof fetch, {
      agentId: "test-agent",
      gatewayBaseUrl: "https://gateway.example.com/openai",
      forceBaseUrl: false,
      steerPipeline: pipeline,
    });

    await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    // Only one fetch call — no fan-out
    expect(fetchCalls).toHaveLength(1);
  });
});
