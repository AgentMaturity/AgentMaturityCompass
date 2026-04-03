import { describe, expect, test } from "vitest";
import {
  raceModels,
  createRaceStage,
  type RaceCandidate,
  type RaceOptions,
} from "../src/steer/race.js";
import { microScore } from "../src/steer/microScore.js";

describe("raceModels", () => {
  test("selects the candidate with the highest micro-score", async () => {
    // Mock global fetch to return different quality responses per URL
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("model-a")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "The answer is 42." } }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("model-b")) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "I think perhaps maybe the answer might possibly be 42, I'm not sure, but it could be.",
                },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    };

    try {
      const candidates: RaceCandidate[] = [
        { id: "a", url: "http://model-a/v1/chat/completions" },
        { id: "b", url: "http://model-b/v1/chat/completions" },
      ];
      const result = await raceModels(
        { method: "POST", body: JSON.stringify({ model: "test" }) },
        { candidates },
      );
      expect(result.winnerId).toBe("a");
      expect(result.candidates.length).toBe(2);
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handles candidate failures gracefully", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("model-a")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "The answer is 42." } }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error("Connection refused");
    };

    try {
      const candidates: RaceCandidate[] = [
        { id: "a", url: "http://model-a/v1/chat/completions" },
        { id: "b", url: "http://model-b/v1/chat/completions" },
      ];
      const result = await raceModels(
        { method: "POST", body: JSON.stringify({ model: "test" }) },
        { candidates },
      );
      expect(result.winnerId).toBe("a");
      const failedCandidate = result.candidates.find((c) => c.id === "b");
      expect(failedCandidate!.error).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("fastestAboveThreshold selects fastest qualifying response", async () => {
    const originalFetch = globalThis.fetch;
    let callOrder = 0;
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const order = callOrder++;
      if (url.includes("model-slow")) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "The answer is 42." } }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };

    try {
      const candidates: RaceCandidate[] = [
        { id: "slow", url: "http://model-slow/v1/chat/completions" },
        { id: "fast", url: "http://model-fast/v1/chat/completions" },
      ];
      const result = await raceModels(
        { method: "POST", body: JSON.stringify({ model: "test" }) },
        { candidates, fastestAboveThreshold: 0.5 },
      );
      // Both have same content/score, but fast should be picked for lower latency
      expect(result.winnerId).toBe("fast");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("createRaceStage", () => {
  test("creates a SteerStage that tags metadata with raceOptions", async () => {
    const options: RaceOptions = {
      candidates: [{ id: "a", url: "http://model-a/v1" }],
    };
    const stage = createRaceStage(options);
    expect(stage.id).toBe("race");
    const ctx = {
      agentId: "test",
      providerId: "openai",
      url: "http://localhost",
      init: {},
      metadata: {},
    };
    const result = await stage.onRequest!(ctx);
    expect(result.metadata.raceOptions).toBeDefined();
  });
});
