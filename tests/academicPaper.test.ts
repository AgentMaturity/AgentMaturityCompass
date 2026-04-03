/**
 * AMC-447: Academic paper with statistical methodology
 */
import { describe, expect, test } from "vitest";
import {
  buildAcademicPaper,
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

    const markdown = renderAcademicPaperMarkdown(
      buildAcademicPaper(report, {
        title: "Thermostat vs Thermometer: Real-Time Steering in AMC",
        authors: ["Sid Patel", "AMC Research"],
      }),
    );

    expect(markdown).toContain("# Thermostat vs Thermometer");
    expect(markdown).toContain("## Abstract");
    expect(markdown).toContain("## Methods");
    expect(markdown).toContain("## Results");
    expect(markdown).toContain("## Limitations");
  });
});
