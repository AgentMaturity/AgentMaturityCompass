/**
 * AMC-449: Eval harness execution engine
 */
import { describe, expect, test, vi } from "vitest";
import {
  createEvalConfig,
  executeEvalHarness,
  renderEvalSummaryMarkdown,
} from "../src/benchmarks/evalHarness.js";

describe("executeEvalHarness", () => {
  test("executes all conditions across configured trials", async () => {
    const config = createEvalConfig({
      name: "Steer Test",
      description: "Testing execution",
      hypotheses: ["H1"],
      independentVars: [
        { name: "steerEnabled", values: [true, false] },
        { name: "model", values: ["gpt-4"] },
      ],
      dependentVars: ["compositeScore", "latencyMs"],
      trialsPerCondition: 2,
      seed: 7,
    });

    const runner = vi.fn(async ({ variables }: { variables: Record<string, string | number | boolean> }) => ({
      metrics: {
        compositeScore: variables.steerEnabled ? 88 : 71,
        latencyMs: variables.steerEnabled ? 120 : 100,
      },
    }));

    const report = await executeEvalHarness(config, runner);

    expect(runner).toHaveBeenCalledTimes(4);
    expect(report.trials).toHaveLength(4);
    expect(report.summary.completedTrials).toBe(4);
    expect(report.summary.failedTrials).toBe(0);
  });

  test("captures per-trial failures without aborting experiment", async () => {
    const config = createEvalConfig({
      name: "Steer Failure Test",
      description: "Testing failures",
      hypotheses: ["H1"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 2,
      seed: 7,
    });

    const runner = vi.fn(async ({ variables, trialIndex }: { variables: Record<string, string | number | boolean>; trialIndex: number }) => {
      if (variables.steerEnabled === false && trialIndex === 1) {
        throw new Error("simulated failure");
      }
      return {
        metrics: {
          compositeScore: variables.steerEnabled ? 88 : 71,
        },
      };
    });

    const report = await executeEvalHarness(config, runner);

    expect(report.summary.totalTrials).toBe(4);
    expect(report.summary.failedTrials).toBe(1);
    expect(report.trials.some((t) => t.error === "simulated failure")).toBe(true);
  });

  test("produces deterministic trial IDs and condition coverage", async () => {
    const config = createEvalConfig({
      name: "Determinism Test",
      description: "Trial ids",
      hypotheses: ["H1"],
      independentVars: [{ name: "mode", values: ["a", "b"] }],
      dependentVars: ["score"],
      trialsPerCondition: 2,
      seed: 123,
    });

    const report = await executeEvalHarness(config, async () => ({
      metrics: { score: 1 },
    }));

    expect(report.trials[0]?.trialId).toBe("cond-0-trial-0");
    expect(report.trials[1]?.trialId).toBe("cond-0-trial-1");
    expect(report.trials[2]?.trialId).toBe("cond-1-trial-0");
  });
});

describe("renderEvalSummaryMarkdown", () => {
  test("renders paper-friendly markdown summary", async () => {
    const config = createEvalConfig({
      name: "Markdown Test",
      description: "Summary output",
      hypotheses: ["H1"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 1,
    });

    const report = await executeEvalHarness(config, async ({ variables }) => ({
      metrics: { compositeScore: variables.steerEnabled ? 90 : 70 },
    }));

    const markdown = renderEvalSummaryMarkdown(report);
    expect(markdown).toContain("# Eval Harness Summary");
    expect(markdown).toContain("Markdown Test");
    expect(markdown).toContain("completedTrials");
    expect(markdown).toContain("compositeScore");
  });
});
