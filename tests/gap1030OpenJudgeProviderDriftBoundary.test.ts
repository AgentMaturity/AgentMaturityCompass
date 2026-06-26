import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1030-openjudge-provider-drift.md";
const REPO = "https://github.com/agentscope-ai/OpenJudge";
const API = "https://api.github.com/repos/agentscope-ai/OpenJudge";
const README_API = "https://api.github.com/repos/agentscope-ai/OpenJudge/readme";
const README = "https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/agentscope-ai/OpenJudge/main/pyproject.toml";
const HOMEPAGE = "https://openjudge.me/";
const DOCS = "https://agentscope-ai.github.io/OpenJudge/";
const HEAD = "344e45d21a8f8ab25d8c6d2035c503ba24e5616a";
const REPO_NAME = "agentscope-ai/OpenJudge";
const IDENTIFIER = "openjudge-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "openjudge-reviewed-agent-provider",
  model: "quality-reward-evaluation-canary",
  version: side === "baseline" ? "openjudge-agent-provider-2026-05" : "openjudge-agent-provider-2026-06",
  canaryId: "openjudge-provider-drift-canary",
  benchmarkFamily: "openjudge-quality-reward-provider-drift",
  capabilityId: "holistic-agent-grader-stability",
  evaluationFrameworkId: "amc-owned-openjudge-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `openjudge-quality-reward-provider:${side}:canary`,
  metricSuiteId: "openjudge-provider-drift-score-shield-watch",
  metricIds: [
    "relevance_score",
    "hallucination_score",
    "tool_selection_score",
    "trajectory_quality",
    "memory_use_score",
    "reflection_score",
    "rubric_consistency",
    "reward_signal_stability",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 10,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "weighted_mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `openjudge-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `openjudge-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-agent-grader-observability-project",
  datastoreId: "amc-owned-openjudge-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.826 : 0.817,
  refusalRate0to1: side === "baseline" ? 0.012 : 0.013,
  invalidActionRate0to1: side === "baseline" ? 0.014 : 0.016,
  judgeAgreement0to1: side === "baseline" ? 0.935 : 0.931,
  evaluatorCoverage0to1: side === "baseline" ? 0.99 : 0.987,
  guardrailPassRate0to1: side === "baseline" ? 0.984 : 0.979,
  latencyMsP95: side === "baseline" ? 2210 : 2280,
  costUsdMean: side === "baseline" ? 0.048 : 0.050,
  evidenceRefs: [`openjudge-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:openjudge-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1030 OpenJudge provider-drift boundary", () => {
  it("documents live OpenJudge repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1030");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("OpenJudge: A Unified Framework for Holistic Evaluation and Quality Rewards");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `683`");
    expect(doc).toContain("Forks `57`");
    expect(doc).toContain("Watchers `4`");
    expect(doc).toContain("open issues `12`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `true`");
    expect(doc).toContain("README sha `029da8dfc4641c12935783f2684099a5d6ddcbf9`");
    expect(doc).toContain("Python and Shell");
    expect(doc).toContain("py-openjudge");
    expect(doc).toContain("requires-python `>=3.10`");
    expect(doc).toContain("openai>=2.8.0");
    expect(doc).toContain("python-Levenshtein>=0.20.0");
    expect(doc).toContain("v0.2.2");
    expect(doc).toContain("v0.2.1");
    expect(doc).toContain("content-length: 116322");
    expect(doc).toContain("last-modified: Wed, 17 Jun 2026 10:14:37 GMT");
    expect(doc).toContain("50+ production-ready graders");
    expect(doc).toContain("Agent lifecycle");
    expect(doc).toContain("Tool Use");
    expect(doc).toContain("reward signals");
    expect(doc).toContain("LangSmith");
    expect(doc).toContain("Langfuse");
    expect(doc).toContain("VERL");
    expect(doc).toContain("PawBench v1.0");
    expect(doc).toContain("150 tasks");
    expect(doc).toContain("9 models");
    expect(doc).toContain("3 harnesses");
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

  it("uses existing provider-drift evaluator for OpenJudge-style quality-reward canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "openjudge-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 90,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-openjudge-quality-reward-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, PYPROJECT, HOMEPAGE, DOCS],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, PYPROJECT, HOMEPAGE, DOCS]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when OpenJudge metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "openjudge-metadata-only-agent",
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
          evidenceRefs: [REPO, API, README, PYPROJECT, HOMEPAGE, DOCS],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 90,
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

  it("keeps OpenJudge identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("OpenJudge");
      expect(source).not.toContain("py-openjudge");
    }
  });
});
