import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { compareRuns, generateReport, runDiagnostic } from "../src/diagnostic/runner.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

let ws: string;
let report: DiagnosticReport;
beforeAll(async () => {
  ws = mkdtempSync(join(tmpdir(), "amc-report-lens-"));
  initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  report = await runDiagnostic({ workspace: ws, agentId: "default", window: "14d", targetName: "default", claimMode: "auto", noSign: true });
}, 180_000);
afterAll(() => { if (ws) rmSync(ws, { recursive: true, force: true }); });

/** One lens with every measurement present and one with every measurement missing. */
const measuredAndUnknown = (ids: Record<string, unknown>, measured: Record<string, unknown>) =>
  [{ ...ids, ...measured }, { ...ids, ...Object.fromEntries(Object.keys(measured).map(key => [key, Array.isArray(measured[key]) ? [] : key === "agentBehaviorEvaluation" ? false : null])) }];

function withLenses(): DiagnosticReport {
  const base = report.questionExplainability!.rows[0]!;
  const row = {
    ...base,
    rubricLens: [{ rubricId: "rub", rubricVersion: "1", skillType: "coding", score0to100: 80, grade: "B", checks: [{ checkId: "c1", pillar: "safety", status: "pass", fixHint: "none" }] }],
    landscapeLens: [
      { landscapeId: "land", category: "eval", status: "fresh", updateCadence: "weekly", freshnessDays: 3, maxAllowedFreshnessDays: 7, sourceRef: "src", cohortRefs: ["c"], datasetRefs: ["d"], repairHint: "keep" },
      { landscapeId: "land2", category: "eval", status: "stale", updateCadence: "weekly", freshnessDays: null, maxAllowedFreshnessDays: null, sourceRef: "src", cohortRefs: [], datasetRefs: [], repairHint: "refresh" }
    ],
    benchmarkSubmissionLens: measuredAndUnknown(
      { benchmarkId: "bench", submissionId: "sub", taskId: "task", taskCategory: "cat", taskStatus: "done", gradingType: "auto", status: "ok", repairHint: "hint-bench", criterionScores: [1, 2] },
      { overallScore0to100: 90, categoryScore0to100: 85, speedMs: 1200, costUsd: 0.5, leaderboardMetricViews: ["v1"] }),
    testSuiteEvaluationLens: measuredAndUnknown(
      { suiteId: "suite", testCaseId: "case", language: "ts", testFramework: "vitest", adapter: "a", status: "ok", repairHint: "hint-suite" },
      { passRate0to1: 0.9, averageScore0to1: 0.8, ciRunId: "ci-1", experimentRunId: "exp-1", evaluatorIds: ["e1"], agentBehaviorEvaluation: true }),
    opikEvaluationQuestionLens: measuredAndUnknown(
      { lensId: "opik", questionIdRef: "AMC-1.1", metricFamily: "fam", status: "ok", repairHint: "hint-opik" },
      { traceCount: 4, questionCount: 2, evidenceCoverage0to1: 0.5, thresholdPassRate0to1: 0.75, ciRunId: "ci-o", metricIds: ["m1"] }),
    deepEvalQuestionLens: measuredAndUnknown(
      { lensId: "deep", questionIdRef: "AMC-1.1", metricFamily: "fam", status: "ok", repairHint: "hint-deep" },
      { testCaseCount: 6, questionCount: 3, evidenceCoverage0to1: 0.6, thresholdPassRate0to1: 0.7, ciRunId: "ci-d", metricIds: ["m2"] }),
    multiUserBenchmarkLens: measuredAndUnknown(
      { benchmarkId: "mu", scenarioId: "sc", scenarioFamily: "fam", capability: "cap", status: "ok", repairHint: "hint-mu" },
      { privacyPassRate0to1: 1, coordinationSuccessRate0to1: 0.9, queueFairnessScore0to1: 0.8, instructionFollowingScore0to1: 0.7, userRoleCount: 3, turnCount: 12 }),
    professionalTaskLens: measuredAndUnknown(
      { benchmarkId: "pro", taskId: "t", scenarioId: "s", industryCategory: "ind", professionalDomain: "dom", environmentMode: "env", faultMode: "none", status: "ok", repairHint: "hint-pro" },
      { passRate0to1: 0.6, robustnessScore0to1: 0.5, verifierVoteCount: 3, trajectoryStepCount: 9 }),
    iotFirmwareQuestionLens: measuredAndUnknown(
      { benchmarkId: "iot", taskId: "t", platform: "esp", boardId: "b", chipFamily: "xtensa", status: "ok", repairHint: "hint-iot" },
      { bugClosureRate0to1: 0.4, tokenEfficiencyRatio: 1.5, logCaptureCoverage0to1: 0.9, hardwareRunCount: 5, deviceCount: 2 }),
    retailSalesQuestionLens: measuredAndUnknown(
      { benchmarkId: "retail", taskId: "t", salesChannel: "web", status: "ok", repairHint: "hint-retail" },
      { modelProviderCount: 2, customerScenarioCount: 4, orderCount: 7, orderCaptureAccuracy0to1: 0.95, policyComplianceRate0to1: 0.9, recommendationGrounding0to1: 0.85, piiRedactionRate0to1: 1 }),
    continualLearningBenchmarkLens: measuredAndUnknown(
      { benchmarkId: "cl", domainId: "dom", workflowId: "wf", status: "ok", repairHint: "hint-cl" },
      { taskCompletionRate0to1: 0.7, responseQualityScore0to1: 0.6, stateAccuracy0to1: 0.5, retentionScore0to1: 0.4, tokenCostUsd: 0.02, scenarioCount: 3, turnCount: 8, stateMutationCount: 2, entityCount: 5 }),
    hermesTurboPerformanceLens: measuredAndUnknown(
      { benchmarkId: "hermes", performanceFacet: "latency", defaultBranch: "main", status: "ok", repairHint: "hint-hermes" },
      { runCount: 10, latencyP50Ms: 20, latencyP95Ms: 45, throughputOpsPerSec: 300, speedupFactor: 2, dashboardCoverage0to1: 0.5, regressionPassRate0to1: 0.99 })
  };
  return { ...report, questionExplainability: { ...report.questionExplainability!, rows: [row] } } as unknown as DiagnosticReport;
}

describe("diagnostic report rendering", () => {
  test("json format returns the report object itself", () => {
    expect(generateReport(report, "json")).toBe(report);
  });

  test("each question lens renders its measured values, and 'unknown' or 'missing' where a value was not measured", () => {
    const markdown = generateReport(withLenses(), "md") as string;
    for (const text of [
      "rub@1 coding 80/B: c1 (safety/pass): none",
      "land (eval/fresh/weekly/freshness=3/7d): src; cohorts=c; datasets=d; keep", "freshness=unknown",
      "bench/sub/task (cat/done/auto/ok; score=90; category=85; speedMs=1200; costUsd=0.5; criteria=2; views=v1): hint-bench",
      "score=unknown; category=unknown; speed=unknown; cost=unknown; criteria=2; views=-",
      "suite/case (ts/vitest/a/ok; pass=0.9; score=0.8; ci=ci-1; experiment=exp-1; evaluators=e1; agent-trace=required): hint-suite",
      "pass=unknown; score=unknown; ci=missing; experiment=missing; evaluators=-; agent-trace=optional",
      "opik/AMC-1.1 (fam/ok; traces=4; questions=2; coverage=0.5; thresholds=0.75; ci=ci-o; metrics=m1): hint-opik",
      "traces=unknown; questions=unknown; coverage=unknown; thresholds=unknown; ci=missing; metrics=-",
      "deep/AMC-1.1 (fam/ok; cases=6; questions=3; coverage=0.6; thresholds=0.7; ci=ci-d; metrics=m2): hint-deep", "cases=unknown",
      "mu/sc (fam/cap/ok; roles=3; turns=12; privacy=1; coordination=0.9; fairness=0.8; instruction=0.7): hint-mu",
      "roles=unknown; turns=unknown; privacy=unknown; coordination=unknown; fairness=unknown; instruction=unknown",
      "pro/t/s (ind/dom/env/none/ok; votes=3; steps=9; pass=0.6; robustness=0.5): hint-pro", "votes=unknown; steps=unknown; pass=unknown; robustness=unknown",
      "iot/t (esp/b/xtensa/ok; runs=5; devices=2; closure=0.4; tokenEfficiency=1.5; logCoverage=0.9): hint-iot",
      "runs=unknown; devices=unknown; closure=unknown; tokenEfficiency=unknown; logCoverage=unknown",
      "retail/t (web/ok; providers=2; scenarios=4; orders=7; orderAccuracy=0.95; policy=0.9; grounding=0.85; pii=1): hint-retail",
      "providers=unknown; scenarios=unknown; orders=unknown; orderAccuracy=unknown; policy=unknown; grounding=unknown; pii=unknown",
      "cl/dom/wf (ok; scenarios=3; turns=8; mutations=2; entities=5; completion=0.7; quality=0.6; state=0.5; retention=0.4; tokenCost=0.02): hint-cl",
      "mutations=unknown; entities=unknown; completion=unknown; quality=unknown; state=unknown; retention=unknown; tokenCost=unknown",
      "hermes/latency (main/ok; runs=10; p50=20ms; p95=45ms; throughput=300; speedup=2x; dashboard=0.5; regression=0.99): hint-hermes",
      "p50=unknown; p95=unknown; throughput=unknown; speedup=unknown; dashboard=unknown; regression=unknown"
    ]) expect(markdown).toContain(text);
  });

  test("lists inflation attempts with the claimed and supported levels", () => {
    const markdown = generateReport({ ...report, inflationAttempts: [{ questionId: "AMC-1.1", claimed: 4, supported: 1 }] }, "md") as string;
    expect(markdown).toContain("- AMC-1.1: claimed 4, supported 1");
  });

  test("an older report without recommendation controls derives them from its upgrade actions", () => {
    const questionId = report.questionScores[0]!.questionId;
    const older = { ...report, recommendationControls: undefined, confidenceSummary: undefined,
      prioritizedUpgradeActions: [`${questionId}: raise evidence coverage`, "no question id here"] } as unknown as DiagnosticReport;
    const markdown = generateReport(older, "md") as string;
    expect(markdown).toContain(`${questionId}: raise evidence coverage`);
    // One control row is derived, for the action that names a question; the other action yields none.
    const controlRows = markdown.split("\n").filter(line => /^\| \S+ \| \d+\.\d\d \| \S+ \| (allowed|blocked) \| /.test(line));
    expect(controlRows).toHaveLength(1);
    expect(controlRows[0]!.startsWith(`| ${questionId} | `)).toBe(true);
  });
});

describe("compareRuns", () => {
  test("reports integrity, layer and question deltas from run A to run B, counting a missing row as 0", () => {
    const [first, second] = report.questionScores;
    const a = { ...report, runId: "run-a", integrityIndex: 0.25,
      layerScores: [{ ...report.layerScores[0]!, avgFinalLevel: 1 }, { ...report.layerScores[1]!, avgFinalLevel: 2 }],
      questionScores: [{ ...first!, finalLevel: 1 }, { ...second!, finalLevel: 3 }] } as DiagnosticReport;
    const b = { ...report, runId: "run-b", integrityIndex: 0.5,
      layerScores: [{ ...report.layerScores[0]!, avgFinalLevel: 2.5 }],
      questionScores: [{ ...first!, finalLevel: 4 }] } as DiagnosticReport;
    expect(compareRuns(a, b)).toEqual({
      runA: "run-a", runB: "run-b", integrityDelta: 0.25,
      layerDeltas: [{ layerName: report.layerScores[0]!.layerName, delta: 1.5 }, { layerName: report.layerScores[1]!.layerName, delta: -2 }],
      questionDeltas: [{ questionId: first!.questionId, delta: 3 }, { questionId: second!.questionId, delta: -3 }]
    });
  });
});
