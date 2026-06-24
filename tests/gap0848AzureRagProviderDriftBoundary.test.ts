import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0848-azure-rag-provider-drift.md";
const REPO = "Azure-Samples/Design-and-evaluation-of-RAG-solutions";
const URL = "https://github.com/Azure-Samples/Design-and-evaluation-of-RAG-solutions";
const TITLE = "Design and evaluation of a RAG implementation";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "azure-openai" : "azure-openai",
  model: "gpt-4o-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "azure-rag-provider-canary",
  benchmarkFamily: "azure-rag-provider-drift",
  capabilityId: "rag-search-generation-stability",
  evaluationFrameworkId: "amc-owned-azure-rag-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `azure-openai:gpt-4o-mini:${side}:rag-design-eval`,
  metricSuiteId: "azure-rag-drift-suite",
  metricIds: ["rag_score", "search_result_quality", "answer_quality", "refusal_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-azure-rag-provider-drift-canary",
  pipelineRunId: `azure-rag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `azure-rag-canary-${side}`,
  observabilityProjectId: "amc-azure-rag-observability",
  datastoreId: "amc-owned-azure-rag-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.846 : 0.831,
  refusalRate0to1: side === "baseline" ? 0.034 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.031,
  evaluatorCoverage0to1: side === "baseline" ? 0.986 : 0.982,
  guardrailPassRate0to1: side === "baseline" ? 0.963 : 0.958,
  latencyMsP95: side === "baseline" ? 2080 : 2220,
  costUsdMean: side === "baseline" ? 0.025 : 0.0265,
  evidenceRefs: [`azure-rag:${side}:canary`],
  signedEvidenceRefs: [`ledger:azure-rag-${side}`],
  ...overrides,
});

describe("GAP-0848 Azure RAG provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0848");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("55");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("no repository topics");
    expect(doc).toContain("Retrieval-Augmented Generation");
    expect(doc).toContain("best practices");
    expect(doc).toContain("testing and evaluation");
    expect(doc).toContain("reusable code snippets");
    expect(doc).toContain("Azure Open AI GPT models");
    expect(doc).toContain("Azure AI Search");
    expect(doc).toContain("RAG Project Assurance");
    expect(doc).toContain("Preparation phase and document analysis");
    expect(doc).toContain("Chunk processing");
    expect(doc).toContain("Search and retrieval");
    expect(doc).toContain("Testing search results");
    expect(doc).toContain("Automatic generation of synthetic Q&A pairs");
    expect(doc).toContain("Evaluate answer quality");
    expect(doc).toContain("Testing the end-to-end process");
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

  it("uses existing provider-drift evaluator for Azure RAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "azure-rag-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-azure-rag-v1",
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

  it("fails closed when Azure RAG metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "azure-rag-reviewed-agent",
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

  it("keeps Azure RAG identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("azure_rag_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
