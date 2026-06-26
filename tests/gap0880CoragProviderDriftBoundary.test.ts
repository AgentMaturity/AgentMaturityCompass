import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0880-corag-provider-drift.md";
const REPO = "harinaralasetty/CORAG";
const URL = "https://github.com/harinaralasetty/CORAG";
const TITLE = "Completely OpenSource Retrieval Augmented Generation";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "local",
  model: "rag-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "corag-provider-canary",
  benchmarkFamily: "corag-provider-drift",
  capabilityId: "contextual-rag-provider-stability",
  evaluationFrameworkId: "amc-owned-corag-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `local:rag-agent:${side}:corag`,
  metricSuiteId: "corag-drift-suite",
  metricIds: ["retrieval_quality", "rerank_quality", "tool_routing_quality", "memory_consistency", "answer_quality", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-corag-provider-drift-canary",
  pipelineRunId: `corag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `corag-canary-${side}`,
  observabilityProjectId: "amc-corag-observability",
  datastoreId: "amc-owned-corag-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.832 : 0.818,
  refusalRate0to1: side === "baseline" ? 0.031 : 0.036,
  invalidActionRate0to1: side === "baseline" ? 0.024 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.962 : 0.956,
  latencyMsP95: side === "baseline" ? 2160 : 2290,
  costUsdMean: side === "baseline" ? 0.023 : 0.0245,
  evidenceRefs: [`corag:${side}:canary`],
  signedEvidenceRefs: [`ledger:corag-${side}`],
  ...overrides,
});

describe("GAP-0880 CORAG provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0880");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 27");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 1");
    expect(doc).toContain("41 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("chat_management");
    expect(doc).toContain("inference");
    expect(doc).toContain("preprocessing");
    expect(doc).toContain("prompts");
    expect(doc).toContain("retrieval");
    expect(doc).toContain("test_files");
    expect(doc).toContain("toolkit");
    expect(doc).toContain("CORAG_ICON.png");
    expect(doc).toContain("Flowchart.png");
    expect(doc).toContain("Screenshot.png");
    expect(doc).toContain("config.py");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("server.py");
    expect(doc).toContain("Google Gemini");
    expect(doc).toContain("Anthropic Claude");
    expect(doc).toContain("Google");
    expect(doc).toContain("Voyage AI");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("sentence-transformers");
    expect(doc).toContain("PDF documents");
    expect(doc).toContain("audio files");
    expect(doc).toContain("conversational history");
    expect(doc).toContain("HNSW indexing");
    expect(doc).toContain("cosine similarity");
    expect(doc).toContain("Custom Agent Executor");
    expect(doc).toContain("search and calculator");
    expect(doc).toContain("conversational memory");
    expect(doc).toContain("NiceGUI");
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

  it("uses existing provider-drift evaluator for CORAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "corag-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-corag-v1",
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

  it("fails closed when CORAG metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "corag-reviewed-agent",
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

  it("keeps CORAG identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("corag_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
