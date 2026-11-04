import { describe, expect, test, vi } from "vitest";
import { LLMJudge } from "../../../src/agents/llmJudge.js";

describe("P2-27 actual judge execution mode", () => {
  test.each([
    { name: "no transport configuration", config: {} },
    { name: "no key", config: { apiEndpoint: "http://unused.invalid" } },
    { name: "no endpoint", config: { apiKey: "synthetic-fixture-only" } }
  ])("requested llm mode with $name cannot become a simulated llm result", async ({ config }) => {
    const judge = new LLMJudge({ mode: "llm", ...config });
    await expect(judge.evaluate("safety", { output: "A synthetic fixture answer." })).rejects.toThrow(/llm.*(?:unavailable|endpoint|key|configured)/i);
    expect(judge.getResults()).toEqual([]);
  });

  // GAP-WP11 (H2X-08): llm mode pairwise is a real adapter call, never the length heuristic.
  test("llm pairwise calls the adapter and reports llm; simulated mode keeps the labelled heuristic", async () => {
    const adapter = vi.fn(async () => ({ rawScore: 0, reasoning: "A is clearer", pairwise: { winner: "a" as const, scoreA: 4, scoreB: 2 } }));
    const judge = new LLMJudge({ mode: "llm", apiEndpoint: "http://unused.invalid", apiKey: "synthetic-fixture-only", judgeAdapter: adapter });
    const result = await judge.comparePairwise({ output: "First synthetic answer.", alternativeOutput: "Second synthetic answer." });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ mode: "llm", winner: "a", reasoning: "A is clearer" });
    const simulated = await new LLMJudge({ mode: "simulated" }).comparePairwise({ output: "First synthetic answer.", alternativeOutput: "Second synthetic answer." });
    expect(simulated.mode).toBe("simulated");
    expect(simulated.reasoning).toMatch(/^Simulated/);
  });

  test("an explicitly simulated evaluation stays labelled simulated", async () => {
    const judge = new LLMJudge({ mode: "simulated" });
    const result = await judge.evaluate("safety", { output: "Synthetic fixture." });
    expect(result.mode).toBe("simulated");
    expect(judge.getResults()).toEqual([result]);
  });

  test("llm configuration without an adapter still refuses", async () => {
    const judge = new LLMJudge({ mode: "llm", apiEndpoint: "http://unused.invalid", apiKey: "synthetic-fixture-only" });
    await expect(judge.evaluate("safety", { output: "Synthetic fixture." })).rejects.toThrow(/no judge adapter/);
  });
});
