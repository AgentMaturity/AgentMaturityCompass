import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0862-llm-rag-eval-provider-drift.md";
const REPO = "sujitpal/llm-rag-eval";
const URL = "https://github.com/sujitpal/llm-rag-eval";
const TITLE = "llm-rag-eval";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "google" : "google",
  model: "gemini-pro",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "llm-rag-eval-provider-canary",
  benchmarkFamily: "llm-rag-eval-provider-drift",
  capabilityId: "rag-evaluator-stability",
  evaluationFrameworkId: "amc-owned-llm-rag-eval-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `google:gemini-pro:${side}:rag-eval`,
  metricSuiteId: "llm-rag-eval-drift-suite",
  metricIds: ["rag_score", "answer_relevance", "faithfulness", "latency", "cost", "context_utilization"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-llm-rag-eval-provider-drift-canary",
  pipelineRunId: `llm-rag-eval-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `llm-rag-eval-canary-${side}`,
  observabilityProjectId: "amc-llm-rag-eval-observability",
  datastoreId: "amc-owned-llm-rag-eval-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.822,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.036,
  invalidActionRate0to1: side === "baseline" ? 0.026 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.979,
  guardrailPassRate0to1: side === "baseline" ? 0.963 : 0.956,
  latencyMsP95: side === "baseline" ? 2080 : 2230,
  costUsdMean: side === "baseline" ? 0.024 : 0.026,
  evidenceRefs: [`llm-rag-eval:${side}:canary`],
  signedEvidenceRefs: [`ledger:llm-rag-eval-${side}`],
  ...overrides,
});

describe("GAP-0862 llm-rag-eval provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0862");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 41");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 1");
    expect(doc).toContain("67 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 95.1%");
    expect(doc).toContain("Jupyter Notebook 4.9%");
    expect(doc).toContain("figs");
    expect(doc).toContain("rag-data");
    expect(doc).toContain("resources");
    expect(doc).toContain("src");
    expect(doc).toContain("Large Language Model");
    expect(doc).toContain("Retrieval Augmented Generation");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("ARES");
    expect(doc).toContain("Gemini Pro 1.0");
    expect(doc).toContain("Google AI embedding model");
    expect(doc).toContain("LCEL");
    expect(doc).toContain("DSPy");
    expect(doc).toContain("Bootstrap Few Shot with Random Search");
    expect(doc).toContain("Active Learning supervision");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Answer Relevance");
    expect(doc).toContain("Context Precision");
    expect(doc).toContain("Context Utilization");
    expect(doc).toContain("Context Relevance");
    expect(doc).toContain("Context Recall");
    expect(doc).toContain("Answer Similarity");
    expect(doc).toContain("Answer Correctness");
    expect(doc).toContain("AmnestyQA");
    expect(doc).toContain("HuggingFace");
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

  it("uses existing provider-drift evaluator for llm-rag-eval-style RAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llm-rag-eval-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-llm-rag-eval-v1",
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

  it("fails closed when llm-rag-eval metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llm-rag-eval-reviewed-agent",
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

  it("keeps llm-rag-eval identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("llm_rag_eval_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
