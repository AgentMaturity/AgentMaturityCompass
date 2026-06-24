import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1027-ares-provider-drift.md";
const REPO = "https://github.com/stanford-futuredata/ARES";
const API = "https://api.github.com/repos/stanford-futuredata/ARES";
const README_API = "https://api.github.com/repos/stanford-futuredata/ARES/readme";
const README = "https://raw.githubusercontent.com/stanford-futuredata/ARES/main/README.md";
const PYPROJECT = "https://raw.githubusercontent.com/stanford-futuredata/ARES/main/pyproject.toml";
const LICENSE = "https://raw.githubusercontent.com/stanford-futuredata/ARES/main/LICENSE";
const HOMEPAGE = "https://ares-ai.vercel.app/";
const ARXIV = "https://arxiv.org/abs/2311.09476";
const HEAD = "c7c9018a755faf8347c4da415632bae1593ef104";
const REPO_NAME = "stanford-futuredata/ARES";
const IDENTIFIER = "ares-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "rag-agent-provider",
  model: "retrieval-augmented-generation-canary",
  version: side === "baseline" ? "rag-provider-2026-05" : "rag-provider-2026-06",
  canaryId: "ares-rag-provider-drift-canary",
  benchmarkFamily: "rag-evaluation-provider-drift",
  capabilityId: "rag-context-faithfulness-answer-relevance-stability",
  evaluationFrameworkId: "amc-owned-rag-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `rag-provider:${side}:ares-context-canary`,
  metricSuiteId: "rag-provider-drift-score-shield-watch",
  metricIds: [
    "context_relevance",
    "answer_faithfulness",
    "answer_relevance",
    "retrieval_precision",
    "judge_agreement",
    "confidence_interval_width",
    "score_mean",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 11,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `ares-rag-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `ares-rag-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-rag-observability-project",
  datastoreId: "amc-owned-rag-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 88,
  trajectoryCount: 88,
  scoreMean0to1: side === "baseline" ? 0.836 : 0.832,
  refusalRate0to1: side === "baseline" ? 0.017 : 0.018,
  invalidActionRate0to1: side === "baseline" ? 0.014 : 0.015,
  judgeAgreement0to1: side === "baseline" ? 0.91 : 0.907,
  evaluatorCoverage0to1: side === "baseline" ? 0.992 : 0.99,
  guardrailPassRate0to1: side === "baseline" ? 0.981 : 0.979,
  latencyMsP95: side === "baseline" ? 1710 : 1744,
  costUsdMean: side === "baseline" ? 0.026 : 0.0265,
  evidenceRefs: [`ares-rag-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:ares-rag-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1027 ARES provider-drift boundary", () => {
  it("documents live ARES repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1027");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("Automated Evaluation of RAG Systems");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `717`");
    expect(doc).toContain("Forks `66`");
    expect(doc).toContain("Watchers `10`");
    expect(doc).toContain("open issues `21`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `false`");
    expect(doc).toContain("README sha `3c6230c40cb10478f354b880d5969ef6840014a6`");
    expect(doc).toContain("pyproject version `0.6.6`");
    expect(doc).toContain("project name `ares-ai`");
    expect(doc).toContain("optional `vllm == 0.4.1`");
    expect(doc).toContain("script `ares-cli`");
    expect(doc).toContain("homepage HTTP/2 200");
    expect(doc).toContain("content-length: 36405");
    expect(doc).toContain("last-modified: Fri, 29 May 2026 13:44:45 GMT");
    expect(doc).toContain("no releases returned");
    expect(doc).toContain("no tags returned");
    expect(doc).toContain("ares");
    expect(doc).toContain("checkpoints");
    expect(doc).toContain("datasets");
    expect(doc).toContain("docs");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("context relevance");
    expect(doc).toContain("answer faithfulness");
    expect(doc).toContain("answer relevance");
    expect(doc).toContain("synthetic data");
    expect(doc).toContain("fine-tuned classifiers");
    expect(doc).toContain("Prediction-Powered Inference");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("vLLM");
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

  it("uses existing provider-drift evaluator for RAG canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ares-reviewed-rag-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 72,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ares-rag-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, PYPROJECT, HOMEPAGE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, PYPROJECT, HOMEPAGE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when ARES metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ares-metadata-only-agent",
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
          evidenceRefs: [REPO, API, README, PYPROJECT, HOMEPAGE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 72,
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

  it("keeps ARES identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("ARES");
    }
  });
});
