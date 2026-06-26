import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1032-mlgym-provider-drift.md";
const REPO = "https://github.com/facebookresearch/MLGym";
const API = "https://api.github.com/repos/facebookresearch/MLGym";
const README_API = "https://api.github.com/repos/facebookresearch/MLGym/readme";
const README = "https://raw.githubusercontent.com/facebookresearch/MLGym/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/facebookresearch/MLGym/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/facebookresearch/MLGym/main/pyproject.toml";
const WEBSITE = "https://sites.google.com/view/mlgym";
const ARXIV = "https://arxiv.org/abs/2502.14499";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2502.14499";
const ARXIV_PDF = "https://arxiv.org/pdf/2502.14499";
const HEAD = "9d40c1b5035202018cd7091fb4e83a9c68b377c0";
const REPO_NAME = "facebookresearch/MLGym";
const IDENTIFIER = "mlgym-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "mlgym-research-agent-provider",
  model: "ai-research-agent-benchmark-canary",
  version: side === "baseline" ? "research-agent-provider-2026-05" : "research-agent-provider-2026-06",
  canaryId: "mlgym-provider-drift-canary",
  benchmarkFamily: "ai-research-agent-provider-drift",
  capabilityId: "machine-learning-research-task-stability",
  evaluationFrameworkId: "amc-owned-mlgym-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `ml-research-agent-provider:${side}:canary`,
  metricSuiteId: "mlgym-provider-drift-score-shield-watch",
  metricIds: [
    "ml_task_score",
    "baseline_improvement",
    "experiment_success_rate",
    "trajectory_quality",
    "hypothesis_iteration_score",
    "data_processing_score",
    "implementation_correctness",
    "analysis_quality",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 12,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "weighted_mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `mlgym-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `mlgym-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-ai-research-agent-observability-project",
  datastoreId: "amc-owned-mlgym-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 104,
  trajectoryCount: 104,
  scoreMean0to1: side === "baseline" ? 0.748 : 0.743,
  refusalRate0to1: side === "baseline" ? 0.018 : 0.019,
  invalidActionRate0to1: side === "baseline" ? 0.021 : 0.022,
  judgeAgreement0to1: side === "baseline" ? 0.928 : 0.925,
  evaluatorCoverage0to1: side === "baseline" ? 0.987 : 0.984,
  guardrailPassRate0to1: side === "baseline" ? 0.976 : 0.973,
  latencyMsP95: side === "baseline" ? 3120 : 3180,
  costUsdMean: side === "baseline" ? 0.083 : 0.085,
  evidenceRefs: [`mlgym-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:mlgym-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1032 MLGym provider-drift boundary", () => {
  it("documents live MLGym repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1032");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(WEBSITE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("MLGym A New Framework and Benchmark for Advancing AI Research Agents");
    expect(doc).toContain("Attribution-NonCommercial 4.0 International");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `607`");
    expect(doc).toContain("Forks `59`");
    expect(doc).toContain("Watchers `11`");
    expect(doc).toContain("open issues `9`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `false`");
    expect(doc).toContain("README sha `f441612f8ba9de5809dfd838bbba5ae60ce47082`");
    expect(doc).toContain("Python, Shell, and Dockerfile");
    expect(doc).toContain("no releases returned");
    expect(doc).toContain("no tags returned");
    expect(doc).toContain("package name `mlgym`");
    expect(doc).toContain("version `0.1.1`");
    expect(doc).toContain("requires-python `>=3.11`");
    expect(doc).toContain("gymnasium");
    expect(doc).toContain("openai>=1.0");
    expect(doc).toContain("litellm");
    expect(doc).toContain("docker");
    expect(doc).toContain("datasets");
    expect(doc).toContain("streamlit");
    expect(doc).toContain("13 diverse and open-ended AI research tasks");
    expect(doc).toContain("experimental framework");
    expect(doc).toContain("under heavy development");
    expect(doc).toContain("configs");
    expect(doc).toContain("data");
    expect(doc).toContain("demo");
    expect(doc).toContain("mlgym");
    expect(doc).toContain("results");
    expect(doc).toContain("trajectories");
    expect(doc).toContain("battleOfSexes");
    expect(doc).toContain("imageClassificationCifar10");
    expect(doc).toContain("languageModelingFineWeb");
    expect(doc).toContain("rlBreakoutMinAtar");
    expect(doc).toContain("titanic");
    expect(doc).toContain("trajectory visualizer");
    expect(doc).toContain("website HTTP/2 200");
    expect(doc).toContain("arXiv");
    expect(doc).toContain("cs.CL");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.LG");
    expect(doc).toContain("published `2025-02-20T12:28:23Z`");
    expect(doc).toContain("updated `2025-02-20T12:28:23Z`");
    expect(doc).toContain("content-length: 1811246");
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

  it("uses existing provider-drift evaluator for MLGym-style research-agent canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "mlgym-reviewed-research-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 12,
        minTrajectoryCount: 100,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-mlgym-research-agent-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, PYPROJECT, WEBSITE, ARXIV, ARXIV_PDF],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, PYPROJECT, WEBSITE, ARXIV, ARXIV_PDF]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when MLGym metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "mlgym-metadata-only-agent",
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
          evidenceRefs: [REPO, API, README, PYPROJECT, WEBSITE, ARXIV],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 12,
        minTrajectoryCount: 100,
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

  it("keeps MLGym identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("MLGym");
      expect(source).not.toContain("mlgym");
    }
  });
});
