import { describe, expect, test } from "vitest";
import {
  createEvalConfig,
  generateConditions,
  cohensD,
  buildEvalReport,
  toLatexTable,
  type EvalTrial,
} from "../src/benchmarks/evalHarness.js";

describe("createEvalConfig", () => {
  test("creates a valid eval config with defaults", () => {
    const config = createEvalConfig({
      name: "Steer Impact",
      description: "Test whether steering improves agent maturity scores",
      hypotheses: ["H1: Steering increases composite score by >5 points"],
      independentVars: [
        { name: "steerEnabled", values: [true, false] },
      ],
      dependentVars: ["compositeScore", "latencyMs"],
    });
    expect(config.experimentId).toMatch(/^exp-/);
    expect(config.trialsPerCondition).toBe(5);
    expect(config.seed).toBe(42);
  });
});

describe("generateConditions", () => {
  test("generates cartesian product of variables", () => {
    const config = createEvalConfig({
      name: "test",
      description: "test",
      hypotheses: [],
      independentVars: [
        { name: "steerEnabled", values: [true, false] },
        { name: "model", values: ["gpt-4", "claude-3"] },
      ],
      dependentVars: ["score"],
    });
    const conditions = generateConditions(config);
    expect(conditions.length).toBe(4);
    expect(conditions[0]!.conditionId).toBe("cond-0");
  });

  test("returns empty for no variables", () => {
    const config = createEvalConfig({
      name: "test",
      description: "test",
      hypotheses: [],
      independentVars: [],
      dependentVars: [],
    });
    expect(generateConditions(config)).toEqual([]);
  });
});

describe("cohensD", () => {
  test("returns 0 for identical groups", () => {
    expect(cohensD([5, 5, 5], [5, 5, 5])).toBe(0);
  });

  test("returns large effect for very different groups", () => {
    const d = cohensD([90, 92, 88, 91], [50, 52, 48, 51]);
    expect(Math.abs(d)).toBeGreaterThan(0.8); // large effect
  });

  test("handles empty groups", () => {
    expect(cohensD([], [1, 2, 3])).toBe(0);
  });
});

describe("buildEvalReport", () => {
  test("builds a complete report with condition summaries", () => {
    const config = createEvalConfig({
      name: "Steer Test",
      description: "Testing steer impact",
      hypotheses: ["H1: Steer improves scores"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 2,
    });

    const trials: EvalTrial[] = [
      { trialId: "t1", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 85 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t2", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 90 }, startedAt: "", completedAt: "", durationMs: 120 },
      { trialId: "t3", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 70 }, startedAt: "", completedAt: "", durationMs: 80 },
      { trialId: "t4", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 65 }, startedAt: "", completedAt: "", durationMs: 90 },
    ];

    const report = buildEvalReport(config, trials);
    expect(report.summary.totalTrials).toBe(4);
    expect(report.summary.completedTrials).toBe(4);
    expect(report.summary.conditions.length).toBe(2);

    const steerOn = report.summary.conditions.find(
      (c) => c.variables.steerEnabled === true,
    )!;
    expect(steerOn.metrics.compositeScore!.mean).toBe(87.5);

    // Significance test
    expect(report.summary.significanceTests.length).toBe(1);
    expect(report.summary.significanceTests[0]!.practicallySignificant).toBe(true);
  });
});

describe("toLatexTable", () => {
  test("generates valid LaTeX table markup", () => {
    const config = createEvalConfig({
      name: "Test",
      description: "test",
      hypotheses: [],
      independentVars: [{ name: "model", values: ["gpt-4"] }],
      dependentVars: ["score"],
    });
    const trials: EvalTrial[] = [
      { trialId: "t1", conditionId: "cond-0", variables: { model: "gpt-4" }, metrics: { score: 80 }, startedAt: "", completedAt: "", durationMs: 100 },
    ];
    const report = buildEvalReport(config, trials);
    const latex = toLatexTable(report, "score");
    expect(latex).toContain("\\begin{table}");
    expect(latex).toContain("\\end{table}");
    expect(latex).toContain("\\textbf{model}");
  });
});
