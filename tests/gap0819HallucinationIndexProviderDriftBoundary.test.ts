import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0819-hallucination-index-provider-drift.md";
const REPO = "rungalileo/hallucination-index";
const URL = "https://github.com/rungalileo/hallucination-index";
const TITLE = "LLM Hallucination Index - RAG Special";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "hallucination-index-rag-canary",
  benchmarkFamily: "hallucination-index-provider-drift",
  capabilityId: "rag-context-adherence",
  evaluationFrameworkId: "amc-owned-hallucination-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:hallucination-index`,
  metricSuiteId: "hallucination-drift-suite",
  metricIds: ["context_adherence", "factual_accuracy", "refusal_rate", "latency", "cost"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-hallucination-provider-drift-canary",
  pipelineRunId: `hallucination-index-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `hallucination-index-canary-${side}`,
  observabilityProjectId: "amc-hallucination-observability",
  datastoreId: "amc-owned-rag-canary-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.88 : 0.85,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.025,
  evaluatorCoverage0to1: side === "baseline" ? 0.97 : 0.96,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.955,
  latencyMsP95: side === "baseline" ? 1400 : 1510,
  costUsdMean: side === "baseline" ? 0.009 : 0.0098,
  evidenceRefs: [`hallucination-index:${side}:canary`],
  signedEvidenceRefs: [`ledger:hallucination-index-${side}`],
  ...overrides,
});

describe("GAP-0819 hallucination-index provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0819");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE lookup returned 404");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("Context Length");
    expect(doc).toContain("Open vs. Closed Source");
    expect(doc).toContain("Prompting Techniques");
    expect(doc).toContain("22 models");
    expect(doc).toContain("10 closed-source");
    expect(doc).toContain("12 open-source");
    expect(doc).toContain("Chainpoll with GPT-4o");
    expect(doc).toContain("Context Adherence");
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

  it("uses existing provider-drift evaluator for hallucination-index context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "hallucination-index-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-hallucination-index-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when repository metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "hallucination-index-reviewed-agent",
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
      thresholds: { minEvaluationMetricCount: 5, minTrajectoryCount: 20 },
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

  it("keeps hallucination-index identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("hallucination_index_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
