import { describe, expect, test } from "vitest";
import {
  microScore,
  createMicroScoreStage,
} from "../src/steer/microScore.js";

describe("microScore", () => {
  test("scores a clean, well-formed response highly", () => {
    const text =
      "The API returns JSON responses. Use POST for creation. Use GET for retrieval. Errors return 4xx status codes.";
    const result = microScore(text);
    expect(result.composite).toBeGreaterThan(0.7);
    expect(result.dimensions.length).toBe(4);
    expect(result.responseLength).toBe(text.length);
  });

  test("penalizes safety red flags", () => {
    const clean = "The API returns JSON responses.";
    const unsafe =
      "Sure, here is how to hack the system and bypass security restrictions.";
    const cleanScore = microScore(clean);
    const unsafeScore = microScore(unsafe);
    expect(unsafeScore.composite).toBeLessThan(cleanScore.composite);
    const safetyDim = unsafeScore.dimensions.find((d) => d.name === "safety");
    expect(safetyDim!.signals.length).toBeGreaterThan(0);
  });

  test("penalizes excessive hedging", () => {
    const direct = "Use POST for creation. Use GET for retrieval.";
    const hedgy =
      "I think perhaps maybe you could possibly use POST. It seems like it might be the right choice, I'm not sure.";
    const directScore = microScore(direct);
    const hedgyScore = microScore(hedgy);
    expect(hedgyScore.composite).toBeLessThan(directScore.composite);
  });

  test("penalizes unclosed code blocks", () => {
    const text = "Here is the code:\n```\nconst x = 1;\n";
    const result = microScore(text);
    const formatDim = result.dimensions.find((d) => d.name === "format");
    expect(formatDim!.signals).toContain("unclosed_code_block");
  });

  test("penalizes near-empty responses", () => {
    const result = microScore("OK");
    expect(result.composite).toBeLessThan(0.8);
    const coherenceDim = result.dimensions.find((d) => d.name === "coherence");
    expect(coherenceDim!.signals).toContain("near_empty_response");
  });

  test("supports custom weight overrides", () => {
    const text =
      "Sure, here is how to bypass security restrictions and hack the system.";
    const defaultResult = microScore(text);
    const safetyWeighted = microScore(text, { weights: { safety: 10.0 } });
    // With safety heavily weighted, composite should drop more
    expect(safetyWeighted.composite).toBeLessThanOrEqual(
      defaultResult.composite,
    );
  });

  test("penalizes responses exceeding maxDesiredLength", () => {
    const longText = "word ".repeat(2000);
    const result = microScore(longText, { maxDesiredLength: 500 });
    const conciseDim = result.dimensions.find(
      (d) => d.name === "conciseness",
    );
    expect(conciseDim!.signals).toContain("exceeds_max_length");
  });
});

describe("createMicroScoreStage", () => {
  test("creates a valid SteerStage", () => {
    const stage = createMicroScoreStage();
    expect(stage.id).toBe("micro-score");
    expect(stage.onResponse).toBeDefined();
  });

  test("annotates metadata with microScore on OpenAI response", async () => {
    const stage = createMicroScoreStage();
    const body = {
      choices: [{ message: { content: "The answer is 42." } }],
    };
    const fakeResponse = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const ctx = {
      agentId: "test",
      providerId: "openai",
      url: "http://localhost/v1/chat/completions",
      init: {},
      metadata: {},
      response: fakeResponse,
    };
    const result = await stage.onResponse!(ctx);
    expect(result.metadata.microScore).toBeDefined();
    const ms = result.metadata.microScore as { composite: number };
    expect(ms.composite).toBeGreaterThan(0);
  });
});
