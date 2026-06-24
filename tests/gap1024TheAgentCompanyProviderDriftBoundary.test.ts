import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1024-theagentcompany-provider-drift.md";
const REPO = "https://github.com/TheAgentCompany/TheAgentCompany";
const API = "https://api.github.com/repos/TheAgentCompany/TheAgentCompany";
const README = "https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/README.md";
const EVALUATION_README = "https://raw.githubusercontent.com/TheAgentCompany/TheAgentCompany/main/evaluation/README.md";
const RELEASE = "https://github.com/TheAgentCompany/TheAgentCompany/releases/tag/1.0.0";
const DEFAULT_COMMIT = "98b68ef82a47690c316f42fddb05baafaab56851";
const REPO_NAME = "TheAgentCompany/TheAgentCompany";
const IDENTIFIER = "theagentcompany-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "professional-work-agent-provider",
  model: "software-company-task-agent-canary",
  version: side === "baseline" ? "work-agent-provider-2026-05" : "work-agent-provider-2026-06",
  canaryId: "theagentcompany-provider-drift-canary",
  benchmarkFamily: "professional-work-task-provider-drift",
  capabilityId: "simulated-software-company-task-execution-stability",
  evaluationFrameworkId: "amc-owned-professional-work-agent-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `professional-work-provider:${side}:software-company-canary`,
  metricSuiteId: "professional-work-agent-provider-drift-score-shield-watch",
  metricIds: [
    "task_completion_rate",
    "result_based_score",
    "browser_task_success_rate",
    "coding_task_success_rate",
    "conversation_task_consistency",
    "score_mean",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 10,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `theagentcompany-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `theagentcompany-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-professional-work-agent-observability-project",
  datastoreId: "amc-owned-professional-work-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 64,
  trajectoryCount: 64,
  scoreMean0to1: side === "baseline" ? 0.744 : 0.741,
  refusalRate0to1: side === "baseline" ? 0.018 : 0.019,
  invalidActionRate0to1: side === "baseline" ? 0.021 : 0.022,
  evaluatorCoverage0to1: side === "baseline" ? 0.982 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.974 : 0.972,
  latencyMsP95: side === "baseline" ? 2190 : 2214,
  costUsdMean: side === "baseline" ? 0.047 : 0.0475,
  evidenceRefs: [`theagentcompany-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:theagentcompany-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1024 TheAgentCompany provider-drift boundary", () => {
  it("documents live repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1024");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(EVALUATION_README);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(DEFAULT_COMMIT);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `true`");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `731`");
    expect(doc).toContain("Forks `118`");
    expect(doc).toContain("Watchers `11`");
    expect(doc).toContain("agent");
    expect(doc).toContain("ai-benchmark");
    expect(doc).toContain("benchmark");
    expect(doc).toContain("llm");
    expect(doc).toContain("release `1.0.0`");
    expect(doc).toContain("published `2024-12-20T02:40:53Z`");
    expect(doc).toContain("pyproject version `1.0.0`");
    expect(doc).toContain("Python `>=3.12,<3.14`");
    expect(doc).toContain("OpenHands `0.42.0`");
    expect(doc).toContain("evaluation/run_eval.py");
    expect(doc).toContain("evaluation/summarise_results.py");
    expect(doc).toContain("servers");
    expect(doc).toContain("workspaces");
    expect(doc).toContain("Docker image");
    expect(doc).toContain("trajectories");
    expect(doc).toContain("evaluation scores");
    expect(doc).toContain("provider version");
    expect(doc).toContain("canary results");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert or waiver");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for professional-work canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "theagentcompany-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 48,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-theagentcompany-professional-work-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, EVALUATION_README, RELEASE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, EVALUATION_README, RELEASE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when repository metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "theagentcompany-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [REPO, API], signedEvidenceRefs: [] })],
      candidate: [
        baseRow("candidate", {
          metricIds: [],
          metricCount: 1,
          evaluatorConfigHash: undefined,
          generatedTestDataHash: undefined,
          dashboardArtifactHash: undefined,
          pipelineRunId: undefined,
          traceExportHash: undefined,
          metricReportHash: undefined,
          evidenceRefs: [REPO, API, README, EVALUATION_README, RELEASE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 48,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:metricIds");
    expect(report.comparisons[0]?.observabilityPipelineMissingReasons).toContain("candidate:traceExportHash");
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps TheAgentCompany identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("The Agent Company");
    }
  });
});
