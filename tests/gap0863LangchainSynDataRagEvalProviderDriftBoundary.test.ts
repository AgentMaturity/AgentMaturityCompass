import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0863-langchain-syndata-rag-eval-provider-drift.md";
const REPO = "mddunlap924/LangChain-SynData-RAG-Eval";
const URL = "https://github.com/mddunlap924/LangChain-SynData-RAG-Eval";
const TITLE = "Synthetic Data Generation using LangChain for IR and RAG Evaluation";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "local" : "local",
  model: "llama2-chat",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "langchain-syndata-rag-eval-provider-canary",
  benchmarkFamily: "langchain-syndata-rag-eval-provider-drift",
  capabilityId: "synthetic-rag-evaluation-stability",
  evaluationFrameworkId: "amc-owned-langchain-syndata-rag-eval-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `local:llama2-chat:${side}:syndata-rag-eval`,
  metricSuiteId: "langchain-syndata-rag-eval-drift-suite",
  metricIds: ["rag_score", "synthetic_qa_quality", "retrieval_quality", "latency", "cost", "answer_similarity"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-langchain-syndata-rag-eval-provider-drift-canary",
  pipelineRunId: `langchain-syndata-rag-eval-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `langchain-syndata-rag-eval-canary-${side}`,
  observabilityProjectId: "amc-langchain-syndata-rag-eval-observability",
  datastoreId: "amc-owned-langchain-syndata-rag-eval-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.82 : 0.804,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.034,
  invalidActionRate0to1: side === "baseline" ? 0.027 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.984 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.961 : 0.955,
  latencyMsP95: side === "baseline" ? 2060 : 2210,
  costUsdMean: side === "baseline" ? 0.018 : 0.02,
  evidenceRefs: [`langchain-syndata-rag-eval:${side}:canary`],
  signedEvidenceRefs: [`ledger:langchain-syndata-rag-eval-${side}`],
  ...overrides,
});

describe("GAP-0863 LangChain synthetic-data RAG eval provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0863");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 40");
    expect(doc).toContain("Fork 8");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("15 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Jupyter Notebook 96.0%");
    expect(doc).toContain("Python 4.0%");
    expect(doc).toContain("imgs");
    expect(doc).toContain("notebooks");
    expect(doc).toContain("notes-references");
    expect(doc).toContain("src");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("Llama2-Chat");
    expect(doc).toContain("zero- and few-shot prompting");
    expect(doc).toContain("Information Retrieval");
    expect(doc).toContain("Retrieval Augmented Generation");
    expect(doc).toContain("synthetic datasets");
    expect(doc).toContain("context-query-answer");
    expect(doc).toContain("Custom prompt engineering");
    expect(doc).toContain("Output parsers");
    expect(doc).toContain("Batch GPU inference");
    expect(doc).toContain("LangChain Expression Language");
    expect(doc).toContain("4-Bit Quantization");
    expect(doc).toContain("Offline metrics");
    expect(doc).toContain("F1");
    expect(doc).toContain("Accuracy");
    expect(doc).toContain("Exact Match");
    expect(doc).toContain("ROGUE");
    expect(doc).toContain("BLEU");
    expect(doc).toContain("Semantic Answer Similarity");
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

  it("uses existing provider-drift evaluator for LangChain synthetic RAG-eval context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "langchain-syndata-rag-eval-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-langchain-syndata-rag-eval-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when LangChain synthetic RAG-eval metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "langchain-syndata-rag-eval-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL],
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

  it("keeps LangChain synthetic RAG-eval identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("langchain_syndata_rag_eval_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
