import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0899-ragflow-provider-drift.md";
const REPO = "AndreasX42/RAGflow";
const URL = "https://github.com/AndreasX42/RAGflow";
const TITLE = "RAGflow: Build optimized and robust LLM applications";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "rag-canary",
  model: "retrieval-qa-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "ragflow-provider-canary",
  benchmarkFamily: "ragflow-provider-drift",
  capabilityId: "rag-provider-route-stability",
  evaluationFrameworkId: "amc-owned-ragflow-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `rag-canary:retrieval-qa-agent:${side}`,
  metricSuiteId: "rag-provider-drift-suite",
  metricIds: ["answer_relevance", "retrieval_grounding", "split_strategy_stability", "embedding_route_quality", "guardrail_pass_rate", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-ragflow-provider-drift-canary",
  pipelineRunId: `ragflow-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `ragflow-canary-${side}`,
  observabilityProjectId: "amc-ragflow-observability",
  datastoreId: "amc-owned-ragflow-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.835 : 0.821,
  refusalRate0to1: side === "baseline" ? 0.029 : 0.034,
  invalidActionRate0to1: side === "baseline" ? 0.021 : 0.027,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.981,
  guardrailPassRate0to1: side === "baseline" ? 0.964 : 0.958,
  latencyMsP95: side === "baseline" ? 2110 : 2240,
  costUsdMean: side === "baseline" ? 0.022 : 0.023,
  evidenceRefs: [`ragflow:${side}:canary`],
  signedEvidenceRefs: [`ledger:ragflow-${side}`],
  ...overrides,
});

describe("GAP-0899 RAGflow provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0899");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 18");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("153 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 96.3%");
    expect(doc).toContain("Shell 2.9%");
    expect(doc).toContain("Dockerfile 0.8%");
    expect(doc).toContain(".circleci");
    expect(doc).toContain("app");
    expect(doc).toContain("k8s");
    expect(doc).toContain("ragflow");
    expect(doc).toContain("resources");
    expect(doc).toContain("tests");
    expect(doc).toContain("vectorstore");
    expect(doc).toContain("RAGflow overview.drawio");
    expect(doc).toContain("docker-compose.dev.yaml");
    expect(doc).toContain("docker-compose.integration.test.yaml");
    expect(doc).toContain("docker-compose.local.test.yaml");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("FastAPI");
    expect(doc).toContain("ChromaDB");
    expect(doc).toContain("Postgres");
    expect(doc).toContain("Streamlit");
    expect(doc).toContain("Docker");
    expect(doc).toContain("Kubernetes");
    expect(doc).toContain("CircleCI");
    expect(doc).toContain("GKE");
    expect(doc).toContain("question-answer pairs");
    expect(doc).toContain("hyperparameter evaluation");
    expect(doc).toContain("document splitting strategies");
    expect(doc).toContain("language and embedding models");
    expect(doc).toContain("MMR");
    expect(doc).toContain("SelfQueryRetriever");
    expect(doc).toContain("Anyscale");
    expect(doc).toContain("MosaicML");
    expect(doc).toContain("Replicate");
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

  it("uses existing provider-drift evaluator for RAGflow context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragflow-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ragflow-v1",
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

  it("fails closed when RAGflow metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragflow-reviewed-agent",
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

  it("keeps RAGflow identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragflow_provider_drift");
    }
  });
});
