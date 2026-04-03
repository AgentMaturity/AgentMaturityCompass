/**
 * AMC-447: Academic paper with statistical methodology
 */
import { describe, expect, test } from "vitest";
import {
  buildAcademicPaper,
  computePaperStatistics,
  renderAcademicPaperLatex,
  renderAcademicPaperMarkdown,
} from "../src/benchmarks/academicPaper.js";
import { createEvalConfig, buildEvalReport, type EvalTrial } from "../src/benchmarks/evalHarness.js";

describe("buildAcademicPaper", () => {
  test("builds structured paper sections from eval report", () => {
    const config = createEvalConfig({
      name: "Steer Impact Study",
      description: "Test whether steering improves scores",
      hypotheses: ["H1: Steering improves composite score"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 2,
    });

    const trials: EvalTrial[] = [
      { trialId: "t1", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 88 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t2", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 90 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t3", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 70 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t4", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 72 }, startedAt: "", completedAt: "", durationMs: 100 },
    ];

    const report = buildEvalReport(config, trials);
    const paper = buildAcademicPaper(report, {
      title: "Thermostat vs Thermometer: Real-Time Steering in AMC",
      authors: ["Sid Patel", "AMC Research"],
    });

    expect(paper.title).toContain("Thermostat");
    expect(paper.abstract.length).toBeGreaterThan(50);
    expect(paper.methods).toContain("Cohen");
    expect(paper.results).toContain("compositeScore");
    expect(paper.limitations.length).toBeGreaterThan(0);
  });
});

describe("computePaperStatistics", () => {
  test("computes effect size, confidence interval, and significance proxy", () => {
    const config = createEvalConfig({
      name: "Steer Impact Study",
      description: "Test whether steering improves scores",
      hypotheses: ["H1: Steering improves composite score"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 3,
    });

    const report = buildEvalReport(config, [
      { trialId: "t1", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 90 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t2", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 92 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t3", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 94 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t4", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 70 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t5", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 72 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t6", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 74 }, startedAt: "", completedAt: "", durationMs: 100 },
    ]);

    const stats = computePaperStatistics(report, "compositeScore");
    expect(stats.effectSize).toBeGreaterThan(1);
    expect(stats.confidenceInterval95.lower).toBeLessThan(stats.confidenceInterval95.upper);
    expect(stats.isSignificant).toBe(true);
  });

  test("fails closed to zeros when metric groups are missing instead of returning NaN", () => {
    const config = createEvalConfig({
      name: "Sparse Study",
      description: "Metric absent",
      hypotheses: [],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["missingMetric"],
      trialsPerCondition: 1,
    });

    const report = buildEvalReport(config, [
      { trialId: "t1", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { otherMetric: 1 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t2", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { otherMetric: 2 }, startedAt: "", completedAt: "", durationMs: 100 },
    ] as unknown as EvalTrial[]);

    const stats = computePaperStatistics(report, "missingMetric");
    expect(Number.isNaN(stats.meanDifference)).toBe(false);
    expect(stats.meanDifference).toBe(0);
    expect(stats.effectSize).toBe(0);
  });
});

describe("renderAcademicPaperMarkdown", () => {
  test("renders paper-like markdown with canonical sections", () => {
    const config = createEvalConfig({
      name: "Steer Impact Study",
      description: "Test whether steering improves scores",
      hypotheses: ["H1: Steering improves composite score"],
      independentVars: [{ name: "steerEnabled", values: [true, false] }],
      dependentVars: ["compositeScore"],
      trialsPerCondition: 1,
    });

    const report = buildEvalReport(config, [
      { trialId: "t1", conditionId: "cond-0", variables: { steerEnabled: true }, metrics: { compositeScore: 88 }, startedAt: "", completedAt: "", durationMs: 100 },
      { trialId: "t2", conditionId: "cond-1", variables: { steerEnabled: false }, metrics: { compositeScore: 70 }, startedAt: "", completedAt: "", durationMs: 100 },
    ]);

    const paper = buildAcademicPaper(report, {
      title: "Thermostat vs Thermometer: Real-Time Steering in AMC",
      authors: ["Sid Patel", "AMC Research"],
    });

    const markdown = renderAcademicPaperMarkdown(paper);
    expect(markdown).toContain("# Thermostat vs Thermometer");
    expect(markdown).toContain("## Abstract");
    expect(markdown).toContain("## Methods");
    expect(markdown).toContain("## Results");
    expect(markdown).toContain("## Limitations");

    const latex = renderAcademicPaperLatex(paper);
    expect(latex).toContain("\\section{Abstract}");
    expect(latex).toContain("\\title{Thermostat vs Thermometer: Real-Time Steering in AMC}");
    expect(latex).toContain("\\begin{itemize}");
    expect(latex).toContain("\\end{itemize}");
  });

  test("escapes backslashes without corrupting generated latex commands", () => {
    const latex = renderAcademicPaperLatex({
      title: "Path \\ check",
      authors: ["A"],
      abstract: "Contains \\ slash",
      introduction: "",
      methods: "",
      results: "",
      discussion: "",
      limitations: ["One \\ item"],
    });

    expect(latex).toContain("\\textbackslash{}");
    expect(latex).not.toContain("\\textbackslash\\{\\}");
  });
});
