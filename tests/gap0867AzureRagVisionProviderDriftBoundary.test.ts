import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0867-azure-rag-vision-provider-drift.md";
const REPO = "Azure-Samples/rag-as-a-service-with-vision";
const URL = "https://github.com/Azure-Samples/rag-as-a-service-with-vision";
const TITLE = "RAG with Vision Application Framework";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "azure-openai",
  model: "gpt-4o",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "azure-rag-vision-provider-canary",
  benchmarkFamily: "azure-rag-vision-provider-drift",
  capabilityId: "rag-vision-answer-stability",
  evaluationFrameworkId: "amc-owned-azure-rag-vision-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `azure-openai:gpt-4o:${side}:rag-vision`,
  metricSuiteId: "azure-rag-vision-drift-suite",
  metricIds: ["rag_vision_score", "image_grounding_quality", "search_quality", "judge_quality", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-azure-rag-vision-provider-drift-canary",
  pipelineRunId: `azure-rag-vision-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `azure-rag-vision-canary-${side}`,
  observabilityProjectId: "amc-azure-rag-vision-observability",
  datastoreId: "amc-owned-azure-rag-vision-fixtures",
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
  refusalRate0to1: side === "baseline" ? 0.032 : 0.038,
  invalidActionRate0to1: side === "baseline" ? 0.022 : 0.029,
  evaluatorCoverage0to1: side === "baseline" ? 0.984 : 0.979,
  guardrailPassRate0to1: side === "baseline" ? 0.962 : 0.956,
  latencyMsP95: side === "baseline" ? 2120 : 2260,
  costUsdMean: side === "baseline" ? 0.029 : 0.031,
  evidenceRefs: [`azure-rag-vision:${side}:canary`],
  signedEvidenceRefs: [`ledger:azure-rag-vision-${side}`],
  ...overrides,
});

describe("GAP-0867 Azure RAG with Vision provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0867");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 36");
    expect(doc).toContain("Fork 7");
    expect(doc).toContain("Issues 3");
    expect(doc).toContain("Pull requests 4");
    expect(doc).toContain("68 Commits");
    expect(doc).toContain("Python 82.2%");
    expect(doc).toContain("HCL 17.8%");
    expect(doc).toContain(".devcontainer");
    expect(doc).toContain(".github");
    expect(doc).toContain(".vscode");
    expect(doc).toContain("deploy");
    expect(doc).toContain("docs");
    expect(doc).toContain("src");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("vision");
    expect(doc).toContain("openai");
    expect(doc).toContain("cosmosdb");
    expect(doc).toContain("rag");
    expect(doc).toContain("llm");
    expect(doc).toContain("azure-ai-search");
    expect(doc).toContain("azure-ai-vision");
    expect(doc).toContain("gpt-4o");
    expect(doc).toContain("MHTML documents");
    expect(doc).toContain("textual and image content");
    expect(doc).toContain("Azure AI Services");
    expect(doc).toContain("Azure AI Search");
    expect(doc).toContain("Azure OpenAI Service");
    expect(doc).toContain("Ingestion flow");
    expect(doc).toContain("Enrichment flow");
    expect(doc).toContain("RAG with vision pipeline");
    expect(doc).toContain("Evaluation starter code");
    expect(doc).toContain("ROUGE recall");
    expect(doc).toContain("LLM-as-a-judge");
    expect(doc).toContain("inner- and outer-loop feedback");
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

  it("uses existing provider-drift evaluator for Azure RAG with Vision context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "azure-rag-vision-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-azure-rag-vision-v1",
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

  it("fails closed when Azure RAG with Vision metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "azure-rag-vision-reviewed-agent",
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

  it("keeps Azure RAG with Vision identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_as_a_service_with_vision_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
