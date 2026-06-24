import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1053-open-rag-eval-provider-drift.md";
const REPO = "https://github.com/vectara/open-rag-eval";
const API = "https://api.github.com/repos/vectara/open-rag-eval";
const README_API = "https://api.github.com/repos/vectara/open-rag-eval/readme";
const README = "https://raw.githubusercontent.com/vectara/open-rag-eval/dev/README.md";
const METRICS = "https://raw.githubusercontent.com/vectara/open-rag-eval/dev/METRICS.md";
const LICENSE = "https://raw.githubusercontent.com/vectara/open-rag-eval/dev/LICENSE";
const HEAD = "9803c35bc1cf5a8f7190cedb74a2f5fad9bf7129";
const RELEASE = "https://github.com/vectara/open-rag-eval/releases/tag/v0.3.0";
const REPO_NAME = "vectara/open-rag-eval";
const IDENTIFIER = "open-rag-eval-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "rag-evaluation-provider",
  model: "rag-quality-canary",
  version: side === "baseline" ? "rag-eval-provider-2026-05" : "rag-eval-provider-2026-06",
  canaryId: "open-rag-eval-provider-drift-canary",
  benchmarkFamily: "rag-evaluation-provider-drift",
  capabilityId: "rag-quality-metric-stability",
  evaluationFrameworkId: "amc-owned-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.25",
  providerRouteId: `rag-eval-provider:${side}:open-rag-eval-canary`,
  metricSuiteId: "provider-drift-score-shield-watch",
  metricIds: [
    "retrieval_score_mean_umbrela_score",
    "generation_score_vital_nuggetizer_score",
    "generation_score_hallucination_score",
    "generation_score_citation_f1_score",
    "generation_score_no_answer_score",
    "consistency_bert_score",
    "golden_answer_semantic_similarity",
    "golden_answer_factual_correctness_f1",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
    "evaluator_coverage",
    "guardrail_pass_rate",
  ],
  metricCount: 14,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `open-rag-eval-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `open-rag-eval-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-rag-eval-observability-project",
  datastoreId: "amc-owned-rag-eval-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "9" : "0"),
  contentDatasetHash: hash("a"),
  summaryArtifactHash: hash(side === "baseline" ? "b" : "c"),
  qaDatasetHash: hash("d"),
  traceExportHash: hash(side === "baseline" ? "3" : "4"),
  metricReportHash: hash(side === "baseline" ? "5" : "6"),
  pipelineConfigHash: hash(side === "baseline" ? "7" : "8"),
  sampleSize: 120,
  trajectoryCount: 120,
  scoreMean0to1: side === "baseline" ? 0.824 : 0.819,
  refusalRate0to1: side === "baseline" ? 0.014 : 0.015,
  invalidActionRate0to1: side === "baseline" ? 0.01 : 0.011,
  judgeAgreement0to1: side === "baseline" ? 0.943 : 0.94,
  evaluatorCoverage0to1: side === "baseline" ? 0.996 : 0.993,
  guardrailPassRate0to1: side === "baseline" ? 0.985 : 0.982,
  artifactAccuracy0to1: side === "baseline" ? 0.912 : 0.908,
  formulaIntegrity0to1: side === "baseline" ? 0.934 : 0.931,
  latencyMsP95: side === "baseline" ? 2140 : 2168,
  costUsdMean: side === "baseline" ? 0.047 : 0.0478,
  evidenceRefs: [`open-rag-eval-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:open-rag-eval-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1053 Open RAG Eval provider-drift boundary", () => {
  it("documents live open-rag-eval repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1053");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(METRICS);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("RAG evaluation without the need for");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `375`");
    expect(doc).toContain("Forks `23`");
    expect(doc).toContain("Watchers API total `5`");
    expect(doc).toContain("watchers_count `375`");
    expect(doc).toContain("open issues `8`");
    expect(doc).toContain("default branch `dev`");
    expect(doc).toContain("dev branch protected `true`");
    expect(doc).toContain("main branch protected `true`");
    expect(doc).toContain("main branch commit `74e72d0fee7088b0497b9068b6bb7d436b685a64`");
    expect(doc).toContain("README sha `8493ab0a0d6979a19ba42f0c98a697b6026bfdb9`");
    expect(doc).toContain("METRICS.md sha `caa8c9216e53fdceecad810777ffc5b8baa95d86`");
    expect(doc).toContain("requirements.txt sha `71822e15130b7b985762a673f0126094a8cac897`");
    expect(doc).toContain("setup.py sha `f493c9b2bccb6a048f1cc84ab1f719b7323ba9d0`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Python, Dockerfile, and Makefile");
    expect(doc).toContain("latest release `v0.3.0`");
    expect(doc).toContain("published_at `2025-12-15T23:29:13Z`");
    expect(doc).toContain("tag commit `74e72d0fee7088b0497b9068b6bb7d436b685a64`");
    expect(doc).toContain("GitHub repo returned HTTP/2 200");
    expect(doc).toContain("raw README returned HTTP/2 200");
    expect(doc).toContain("content-length: 32265");
    expect(doc).toContain("TREC-RAG");
    expect(doc).toContain("UMBRELA");
    expect(doc).toContain("AutoNuggetizer");
    expect(doc).toContain("HHEM");
    expect(doc).toContain("GoldenAnswerEvaluator");
    expect(doc).toContain("ConsistencyEvaluator");
    expect(doc).toContain("Vectara connector");
    expect(doc).toContain("LlamaIndex");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("per-query scores");
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

  it("accepts open-rag-eval context only through existing provider-drift receipts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "open-rag-eval-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 12,
        minTrajectoryCount: 100,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-open-rag-eval-rag-quality-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, METRICS, LICENSE, RELEASE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, METRICS, LICENSE, RELEASE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when open-rag-eval metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "open-rag-eval-metadata-only-agent",
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
          evidenceRefs: [REPO, API, README, METRICS, LICENSE, RELEASE],
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

  it("does not add open-rag-eval identifiers to provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain("open-rag-eval");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
