import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0836-rag-genie-provider-drift.md";
const REPO = "stephanj/rag-genie";
const URL = "https://github.com/stephanj/rag-genie";
const TITLE = "The RAG Genie, an LLM RAG prototype to test and evaluate your embeddings, chunk splitting strategies using Q&A and evaluations.";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "rag-genie-rag-evaluation-provider-canary",
  benchmarkFamily: "rag-evaluation-provider-drift",
  capabilityId: "retrieval-generation-evaluation-stability",
  evaluationFrameworkId: "amc-owned-rag-genie-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1:${side}:rag-evaluation`,
  metricSuiteId: "rag-evaluation-drift-suite",
  metricIds: ["answer_grounding", "retrieval_precision", "chunking_recall", "refusal_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-rag-genie-provider-drift-canary",
  pipelineRunId: `rag-genie-rag-eval-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `rag-genie-rag-eval-canary-${side}`,
  observabilityProjectId: "amc-rag-genie-observability",
  datastoreId: "amc-owned-rag-evaluation-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.843,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.041,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.965 : 0.958,
  latencyMsP95: side === "baseline" ? 1800 : 1980,
  costUsdMean: side === "baseline" ? 0.019 : 0.0204,
  evidenceRefs: [`rag-genie:${side}:canary`],
  signedEvidenceRefs: [`ledger:rag-genie-${side}`],
  ...overrides,
});

describe("GAP-0836 RAG Genie provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0836");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE.txt");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("api.github.com DNS lookup failed");
    expect(doc).toContain("embeddings");
    expect(doc).toContain("chunk splitting strategies");
    expect(doc).toContain("Q&A");
    expect(doc).toContain("evaluations");
    expect(doc).toContain("Java");
    expect(doc).toContain("Spring Boot");
    expect(doc).toContain("Angular");
    expect(doc).toContain("PostgreSQL");
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

  it("uses existing provider-drift evaluator for RAG Genie-style RAG evaluation context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "rag-genie-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-rag-genie-v1",
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

  it("fails closed when repo metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "rag-genie-reviewed-agent",
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

  it("keeps RAG Genie identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("rag_genie_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
