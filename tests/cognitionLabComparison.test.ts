import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  compareExperiments,
  createLabExperiment,
  generateLabReport,
  recordLabProbeResult,
  renderLabReportMarkdown,
  resetLabState,
} from "../dist/lab/cognitionLab.js";

const workspaces: string[] = [];
afterEach(() => {
  resetLabState();
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true });
});

function record(experimentId: string, probeId: string, scores: Record<string, number>, workspace?: string) {
  return recordLabProbeResult({
    experimentId, probeId, scores, responseText: "Explicit fixture", latencyMs: 0, tokenCount: 0, metadata: {},
  }, workspace);
}

describe("AXE-29 cognition comparisons", () => {
  test("a large single-sample difference never claims statistical significance", () => {
    record("baseline", "probe", { quality: 0.1 });
    record("candidate", "probe", { quality: 0.9 });
    const [pair] = compareExperiments("baseline", "candidate");
    expect(pair).toMatchObject({
      comparisonMode: "single_sample", status: "matched", sampleIndex: 1,
      deltas: { quality: 0.8 }, significantDimensions: [],
    });
  });

  test("missing dimensions remain missing on either side, including a measured zero", () => {
    record("baseline", "probe", { common: 0, baselineOnly: 0.6 });
    record("candidate", "probe", { common: 0.5, candidateOnly: 0 });
    const [pair] = compareExperiments("baseline", "candidate");
    expect(pair?.deltas).toEqual({ common: 0.5 });
    expect(pair?.missingDimensions).toEqual({ baseline: ["candidateOnly"], candidate: ["baselineOnly"] });
  });

  test("unmatched probes on both sides are retained with an explicit missing side", () => {
    record("baseline", "baseline-only", { quality: 0.8 });
    record("candidate", "candidate-only", { quality: 0.9 });
    const pairs = compareExperiments("baseline", "candidate");
    expect(pairs).toHaveLength(2);
    expect(pairs.find((pair) => pair.probeId === "baseline-only")).toMatchObject({
      status: "missing_candidate", baselineScores: { quality: 0.8 }, candidateScores: {}, deltas: {},
      missingDimensions: { baseline: [], candidate: ["quality"] },
    });
    expect(pairs.find((pair) => pair.probeId === "candidate-only")).toMatchObject({
      status: "missing_baseline", baselineScores: {}, candidateScores: { quality: 0.9 }, deltas: {},
      missingDimensions: { baseline: ["quality"], candidate: [] },
    });
  });

  test("repeated probe results pair by occurrence without discarding extra baseline samples", () => {
    record("baseline", "probe", { quality: 0.1 });
    record("baseline", "probe", { quality: 0.4 });
    record("baseline", "probe", { quality: 0.7 });
    record("candidate", "probe", { quality: 0.3 });
    record("candidate", "probe", { quality: 0.8 });
    const pairs = compareExperiments("baseline", "candidate");
    expect(pairs.map((pair) => [pair.sampleIndex, pair.status, pair.deltas])).toEqual([
      [1, "matched", { quality: 0.2 }],
      [2, "matched", { quality: 0.4 }],
      [3, "missing_candidate", {}],
    ]);
    expect(pairs.every((pair) => pair.comparisonMode === "single_sample" && pair.significantDimensions.length === 0)).toBe(true);
  });

  test("only own score dimensions participate, while numeric __proto__ dimensions survive", () => {
    const baseline = JSON.parse('{"__proto__":0.1,"own":0.4}') as Record<string, number>;
    Object.setPrototypeOf(baseline, { inherited: 0.2 });
    record("baseline", "probe", baseline);
    record("candidate", "probe", JSON.parse('{"__proto__":0.8,"inherited":0.9,"own":0.4}'));
    const [pair] = compareExperiments("baseline", "candidate");
    expect(pair?.deltas).toEqual(JSON.parse('{"__proto__":0.7,"own":0}'));
    expect(pair?.missingDimensions.baseline).toEqual(["inherited"]);
    expect(Object.getPrototypeOf(pair?.deltas)).toBe(Object.prototype);
  });

  test("persisted explicit results are readable and comparable in a fresh process", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-cognition-comparison-"));
    workspaces.push(workspace);
    const baseline = createLabExperiment({ kind: "custom", name: "Baseline", description: "Fixture", modelId: "fixture", probes: [] }, workspace);
    const candidate = createLabExperiment({ kind: "custom", name: "Candidate", description: "Fixture", modelId: "fixture", probes: [] }, workspace);
    record(baseline.experimentId, "probe", { quality: 0.2 }, workspace);
    record(candidate.experimentId, "probe", { quality: 0.6 }, workspace);
    const moduleUrl = new URL("../dist/lab/cognitionLab.js", import.meta.url).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { compareExperiments, generateLabReport } from ${JSON.stringify(moduleUrl)};
      const [workspace, baseline, candidate] = process.argv.slice(1);
      console.log(JSON.stringify({ report: generateLabReport(candidate, workspace), pairs: compareExperiments(baseline, candidate, workspace) }));
    `, workspace, baseline.experimentId, candidate.experimentId], { encoding: "utf8" });
    expect(child.stderr).toBe("");
    expect(child.status).toBe(0);
    const result = JSON.parse(child.stdout);
    expect(result.report.probeResults).toHaveLength(1);
    expect(result.report.probeResults[0].scores).toEqual({ quality: 0.6 });
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].deltas).toEqual({ quality: 0.4 });
  });

  test("markdown names the descriptive method and exposes missing comparison dimensions", () => {
    const experiment = createLabExperiment({ kind: "custom", name: "Fixture", description: "Fixture", modelId: "fixture", probes: [] });
    record(experiment.experimentId, "probe", { quality: 0.8 });
    const report = generateLabReport(experiment.experimentId)!;
    report.comparisons = compareExperiments(experiment.experimentId, "missing");
    const markdown = renderLabReportMarkdown(report);
    expect(markdown).toContain("Single-sample descriptive comparisons; statistical significance is not assessed.");
    expect(markdown).toContain("missing_candidate");
    expect(markdown).toContain("candidate: quality");
    expect(markdown).not.toContain("Significant Dimensions");
  });

  test("markdown does not render an absent primary score as measured zero", () => {
    const experiment = createLabExperiment({ kind: "custom", name: "Fixture", description: "Fixture", modelId: "fixture", probes: [] });
    record(experiment.experimentId, "empty-score", {});
    const markdown = renderLabReportMarkdown(generateLabReport(experiment.experimentId)!);
    expect(markdown).toContain("| empty-score | 0ms | 0 | — |");
    expect(markdown).not.toContain("0.0%");
  });

  test("markdown retains legacy comparison maps and marks unavailable descriptive metadata", () => {
    const experiment = createLabExperiment({ kind: "custom", name: "Legacy fixture", description: "Fixture", modelId: "fixture", probes: [] });
    const report = generateLabReport(experiment.experimentId)!;
    report.comparisons = [{
      pairId: "legacy-pair", baselineExperimentId: "legacy-baseline", candidateExperimentId: "legacy-candidate",
      probeId: "legacy-probe", baselineScores: { quality: 0.2 }, candidateScores: { quality: 0.6 },
      deltas: { quality: 0.4 }, significantDimensions: ["legacy-significance-claim"],
    }];
    const before = structuredClone(report.comparisons);
    const markdown = renderLabReportMarkdown(report);
    expect(markdown).toContain("| legacy-probe | unavailable | legacy descriptive | unavailable (legacy metadata) | quality: 40.0% |");
    expect(markdown).toContain("statistical significance is not assessed");
    expect(markdown).not.toContain("legacy-significance-claim");
    expect(report.comparisons).toEqual(before);
  });
});
