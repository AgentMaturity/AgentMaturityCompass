import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0907-rag-evaluation-provider-drift.md";
const REPO = "0xshre/rag-evaluation";
const URL = "https://github.com/0xshre/rag-evaluation";
const TITLE = "QA RAG (Retrieval-Augmented Generation) System with Evaluation";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "rag-eval-canary",
  model: "retrieval-qa-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "rag-evaluation-provider-canary",
  benchmarkFamily: "rag-evaluation-provider-drift",
  capabilityId: "rag-eval-provider-route-stability",
  evaluationFrameworkId: "amc-owned-rag-evaluation-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `rag-eval-canary:retrieval-qa-agent:${side}`,
  metricSuiteId: "rag-eval-provider-drift-suite",
  metricIds: ["faithfulness", "answer_relevance", "context_precision", "context_recall", "answer_correctness", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-rag-evaluation-provider-drift-canary",
  pipelineRunId: `rag-evaluation-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `rag-evaluation-canary-${side}`,
  observabilityProjectId: "amc-rag-evaluation-observability",
  datastoreId: "amc-owned-rag-evaluation-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 43,
  trajectoryCount: 43,
  scoreMean0to1: side === "baseline" ? 0.832 : 0.819,
  refusalRate0to1: side === "baseline" ? 0.028 : 0.034,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.026,
  evaluatorCoverage0to1: side === "baseline" ? 0.986 : 0.982,
  guardrailPassRate0to1: side === "baseline" ? 0.965 : 0.959,
  latencyMsP95: side === "baseline" ? 2140 : 2250,
  costUsdMean: side === "baseline" ? 0.021 : 0.023,
  evidenceRefs: [`rag-evaluation:${side}:canary`],
  signedEvidenceRefs: [`ledger:rag-evaluation-${side}`],
  ...overrides,
});

describe("GAP-0907 rag-evaluation provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0907");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 16");
    expect(doc).toContain("Fork 4");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("16 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Jupyter Notebook 98.8%");
    expect(doc).toContain("Python 1.2%");
    expect(doc).toContain("notebooks");
    expect(doc).toContain("src");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("setup_script.sh");
    expect(doc).toContain("DSPy");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("chromadb");
    expect(doc).toContain("wikitext-raw-2");
    expect(doc).toContain("RecursiveCharacterTextSplitter");
    expect(doc).toContain("sentence-transformers/paraphrase-MiniLM-L6-v2");
    expect(doc).toContain("427");
    expect(doc).toContain("gpt-3.5-turbo");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Answer Relevance");
    expect(doc).toContain("Context Precision");
    expect(doc).toContain("Context Relevancy");
    expect(doc).toContain("Context Recall");
    expect(doc).toContain("Answer Semantic Similarity");
    expect(doc).toContain("Answer Correctness");
    expect(doc).toContain("Hyper-parameter Search");
    expect(doc).toContain("Query Expansion");
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

  it("uses existing provider-drift evaluator for rag-evaluation context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "rag-evaluation-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-rag-evaluation-v1",
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

  it("fails closed when rag-evaluation metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "rag-evaluation-reviewed-agent",
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

  it("keeps rag-evaluation identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_evaluation_provider_drift");
    }
  });
});
