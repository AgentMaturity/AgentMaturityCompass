/**
 * GAP-WP11 labelling rows: agents/LLMJudge pairwise judging in llm mode
 * (H2X-08, AXR-08), simulated harness gains (AXR-07), the human-pasted claim
 * fallback (AXR-09) and the hallucination judge's invalid/ungrounded states
 * (AXE-21, AXE-32).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LLMJudge } from "../src/agents/llmJudge.js";
import { HarnessRunner } from "../src/agents/harnessRunner.js";
import { detectHallucinations } from "../src/hallucination/detector.js";
import { LlmJudgeInvalidResponseError, createProductionJudgeFn, runLlmJudge } from "../src/hallucination/llmJudge.js";
import { ProductionLLMJudgeEngine } from "../src/eval/llmApiIntegration.js";
import type { AMCConfig } from "../src/types.js";

const harnessMock = vi.hoisted(() => ({ usedFallback: false }));
vi.mock("../src/runtimes/common.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/runtimes/common.js")>();
  return {
    ...original,
    runHarnessWithRetries: vi.fn(async (...args: Parameters<typeof original.runHarnessWithRetries>) =>
      harnessMock.usedFallback
        ? { value: { claimedLevels: { "AMC-1.1": 0 } }, attempts: 4, usedFallback: true }
        : original.runHarnessWithRetries(...args))
  };
});

afterEach(() => { vi.restoreAllMocks(); harnessMock.usedFallback = false; });

const llmConfig = { mode: "llm" as const, apiEndpoint: "http://unused.invalid", apiKey: "synthetic-fixture-only" };
const pair = { output: "First synthetic answer.", alternativeOutput: "Second synthetic answer." };

describe("agents/LLMJudge pairwise judging (H2X-08)", () => {
  it("llm mode calls the adapter exactly once and labels the result llm", async () => {
    const adapter = vi.fn(async () => ({ rawScore: 0, reasoning: "B is more precise", model: "fixture-model",
      pairwise: { winner: "b" as const, scoreA: 2, scoreB: 4 } }));
    const result = await new LLMJudge({ ...llmConfig, judgeAdapter: adapter }).comparePairwise(pair);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ mode: "llm", winner: "b", scoreA: 0.4, scoreB: 0.8, model: "fixture-model", reasoning: "B is more precise" });
  });

  it("llm mode without an adapter or with no valid verdict rejects instead of simulating", async () => {
    await expect(new LLMJudge(llmConfig).comparePairwise(pair)).rejects.toThrow(/no judge adapter/);
    await expect(new LLMJudge({ mode: "llm" }).comparePairwise(pair)).rejects.toThrow(/llm mode unavailable/);
    const noVerdict = new LLMJudge({ ...llmConfig, judgeAdapter: async () => ({ rawScore: 3, reasoning: "x" }) });
    await expect(noVerdict.comparePairwise(pair)).rejects.toThrow(/no valid pairwise verdict/);
  });

  it("an llm evaluation whose score is off the rubric rejects instead of being normalized", async () => {
    const judge = new LLMJudge({ ...llmConfig, judgeAdapter: async () => ({ rawScore: 9, reasoning: "x" }) });
    await expect(judge.evaluate("quality", { output: "o" })).rejects.toThrow(/invalid score/);
  });

  it("the simulated heuristic is always labelled simulated", async () => {
    expect((await new LLMJudge({ mode: "simulated" }).comparePairwise(pair)).mode).toBe("simulated");
    expect((await new LLMJudge({ mode: "simulated" }).evaluate("quality", { output: "o" })).mode).toBe("simulated");
  });
});

describe("amc agent harness labels simulated gains (AXR-07)", () => {
  it("separates the measured probe score from simulated projections", async () => {
    const result = await new HarnessRunner({ maxIterations: 2, targetScore: 100 }).run();
    expect(result.iterations.length).toBeGreaterThan(0);
    expect(result.scoreKind).toBe("simulated");
    expect(result.measuredScore).toBe(result.iterations[0]!.scoreBefore);
    const integrated = result.capabilityReport.filter(p => p.evidence.includes("simulated integration"));
    expect(integrated.length).toBeGreaterThan(0);
    expect(integrated.every(p => p.simulated === true)).toBe(true);
  });

  it("a run that never simulates stays measured", async () => {
    const result = await new HarnessRunner({ maxIterations: 0 }).run();
    expect(result).toMatchObject({ scoreKind: "measured", totalImprovement: 0 });
    expect(result.finalScore).toBe(result.measuredScore);
  });
});

describe("human-pasted claims (AXR-09)", () => {
  const roots: string[] = [];
  afterAll(() => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });

  it("refuses the interactive fallback when stdin is not a terminal", async () => {
    const { runHarnessWithRetries } = await vi.importActual<typeof import("../src/runtimes/common.js")>("../src/runtimes/common.js");
    expect(process.stdin.isTTY).toBeFalsy();
    const config = { runtimes: { mock: { command: process.execPath, argsTemplate: ["-e", "console.log('not json')"] } } } as unknown as AMCConfig;
    await expect(runHarnessWithRetries("unknown", "p", { config, schema: z.object({ a: z.number() }), maxRetries: 0 }))
      .rejects.toThrow(/stdin is not a terminal/);
  });

  it("a diagnostic whose claims a human pasted records that on the question", async () => {
    const { initWorkspace } = await import("../src/workspace.js");
    const { runDiagnostic } = await import("../src/diagnostic/runner.js");
    const dir = mkdtempSync(join(tmpdir(), "amc-wp11-claims-"));
    roots.push(dir);
    initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
    harnessMock.usedFallback = true;
    const report = await runDiagnostic({ workspace: dir, agentId: "default", window: "14d", claimMode: "harness", noSign: true });
    const flagged = report.questionScores.filter(row => row.flags.includes("FLAG_CLAIM_HUMAN_PASTED")).map(row => row.questionId);
    expect(flagged).toEqual(["AMC-1.1"]);
  });
});

describe("hallucination judge invalid and ungrounded states (AXE-21, AXE-32)", () => {
  it("a malformed judge reply rejects as invalid, distinct from unavailable and from clean", async () => {
    await expect(runLlmJudge({ response: "r" }, async () => "not json")).rejects.toBeInstanceOf(LlmJudgeInvalidResponseError);
    await expect(runLlmJudge({ response: "r" }, async () => JSON.stringify({ overallAssessment: "no findings key" })))
      .rejects.toBeInstanceOf(LlmJudgeInvalidResponseError);
    await expect(runLlmJudge({ response: "r" }, async () => JSON.stringify({ findings: [] }))).resolves.toEqual([]);
  });

  it("without grounding context or an LLM judge a clean-looking response is not evaluated", async () => {
    expect(await detectHallucinations({ response: "The sky is blue and water is wet." })).toMatchObject({ evaluated: false, passed: null });
    expect(await detectHallucinations({ response: "The sky is blue.", context: "The sky is blue." })).toMatchObject({ evaluated: true, passed: true });
  });

  it("the production judge function forwards its configured settings", async () => {
    const call = vi.spyOn(ProductionLLMJudgeEngine.prototype, "callJudgeModel").mockResolvedValue("{}");
    const judgeFn = await createProductionJudgeFn({ model: "gpt-4", temperature: 0.3 });
    await judgeFn("prompt");
    expect(call).toHaveBeenCalledWith("prompt", { model: "gpt-4", temperature: 0.3 });
  });
});
