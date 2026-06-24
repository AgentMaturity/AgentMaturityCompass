import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0847-ragged-provider-drift.md";
const REPO = "neulab/ragged";
const URL = "https://github.com/neulab/ragged";
const ARXIV = "https://arxiv.org/abs/2403.09040";
const HUGGINGFACE = "https://huggingface.co/datasets/jenhsia/ragged";
const TITLE = "RAGGED: Towards Informed Design of Scalable and Stable RAG Systems";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "ragged-rag-provider-canary",
  benchmarkFamily: "ragged-rag-provider-drift",
  capabilityId: "rag-retrieval-reader-stability",
  evaluationFrameworkId: "amc-owned-ragged-style-rag-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:ragged-rag`,
  metricSuiteId: "ragged-rag-drift-suite",
  metricIds: ["rag_score", "grounding", "refusal_rate", "latency", "cost", "retrieval_depth_sensitivity"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-ragged-rag-provider-drift-canary",
  pipelineRunId: `ragged-rag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `ragged-rag-canary-${side}`,
  observabilityProjectId: "amc-ragged-rag-observability",
  datastoreId: "amc-owned-ragged-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.826,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.041,
  invalidActionRate0to1: side === "baseline" ? 0.026 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.986 : 0.981,
  guardrailPassRate0to1: side === "baseline" ? 0.964 : 0.958,
  latencyMsP95: side === "baseline" ? 2050 : 2190,
  costUsdMean: side === "baseline" ? 0.024 : 0.026,
  evidenceRefs: [`ragged-rag:${side}:canary`],
  signedEvidenceRefs: [`ledger:ragged-rag-${side}`],
  ...overrides,
});

describe("GAP-0847 RAGGED provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0847");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(HUGGINGFACE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("61");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("no repository topics");
    expect(doc).toContain("Retrieval Augmented Generation Generalized Evaluation Dataset");
    expect(doc).toContain("Natural Questions");
    expect(doc).toContain("HotpotQA");
    expect(doc).toContain("BioASQ11B");
    expect(doc).toContain("retriever-reader configurations");
    expect(doc).toContain("retrieval depths");
    expect(doc).toContain("reader robustness to noise");
    expect(doc).toContain("retrievers");
    expect(doc).toContain("rerankers");
    expect(doc).toContain("prompts");
    expect(doc).toContain("BM25");
    expect(doc).toContain("ColBERT");
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

  it("uses existing provider-drift evaluator for RAGGED-style RAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragged-reviewed-rag-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ragged-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, ARXIV, HUGGINGFACE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, ARXIV, HUGGINGFACE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when RAGGED metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragged-reviewed-rag-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL, ARXIV, HUGGINGFACE], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL, ARXIV, HUGGINGFACE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps RAGGED identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragged_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
