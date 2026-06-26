import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  renderProviderDriftBenchmarkMarkdown,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0735-enterpriserag-provider-drift.md";
const SOURCE = "https://github.com/onyx-dot-app/EnterpriseRAG-Bench";
const REPO = "onyx-dot-app/EnterpriseRAG-Bench";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (
  side: "baseline" | "candidate",
  overrides: Partial<ProviderDriftCanaryRow> = {},
): ProviderDriftCanaryRow => ({
  provider: "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "enterprise-rag-provider-drift-canary",
  benchmarkFamily: "enterprise-rag-provider-model-drift",
  capabilityId: "metadata-aware-enterprise-rag-answering",
  evaluationFrameworkId: "amc-owned-enterprise-rag-style-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:enterprise-rag`,
  metricSuiteId: "enterprise-rag-drift-suite",
  metricIds: ["answer_correctness", "retrieval_relevance", "metadata_filter_accuracy", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-enterprise-rag-canary",
  pipelineRunId: `enterprise-rag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `enterprise-rag-canary-${side}`,
  observabilityProjectId: "amc-enterprise-rag-observability",
  datastoreId: "amc-owned-enterprise-rag-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 50,
  trajectoryCount: 50,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.835,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.035,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.95 : 0.94,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.95,
  latencyMsP95: side === "baseline" ? 1800 : 1890,
  costUsdMean: side === "baseline" ? 0.009 : 0.0095,
  evidenceRefs: [`enterprise-rag:${side}:canary`, `enterprise-rag:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:enterprise-rag-${side}`],
  ...overrides,
});

describe("GAP-0735 EnterpriseRAG-Bench provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0735");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("EnterpriseRAG-Bench");
    expect(doc).toContain("company internal documents");
    expect(doc).toContain("Redwood Inference");
    expect(doc).toContain("500,000");
    expect(doc).toContain("500` questions");
    expect(doc).toContain("100` metadata-dependent questions");
    expect(doc).toContain("10` categories");
    expect(doc).toContain("Slack");
    expect(doc).toContain("Gmail");
    expect(doc).toContain("Linear");
    expect(doc).toContain("Google Drive");
    expect(doc).toContain("HubSpot");
    expect(doc).toContain("Jira");
    expect(doc).toContain("Confluence");
    expect(doc).toContain("leaderboard");
    expect(doc).toContain("MIT");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for enterprise RAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "enterprise-rag-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.03,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvaluationFrameworkId: "amc-owned-enterprise-rag-style-eval",
      candidateEvaluationFrameworkId: "amc-owned-enterprise-rag-style-eval",
      baselinePipelineOrchestratorId: "amc-enterprise-rag-canary",
      candidatePipelineOrchestratorId: "amc-enterprise-rag-canary",
      baselineObservabilityProjectId: "amc-enterprise-rag-observability",
      candidateObservabilityProjectId: "amc-enterprise-rag-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-enterprise-rag-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "answer_correctness",
      "retrieval_relevance",
      "metadata_filter_accuracy",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-enterprise-rag-style-eval");
    expect(markdown).toContain("amc-enterprise-rag-canary");
  });

  it("fails closed when EnterpriseRAG-Bench metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "enterprise-rag-reviewed-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [SOURCE],
          signedEvidenceRefs: [],
        }),
      ],
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
          evidenceRefs: [SOURCE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
      },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(report.comparisons[0]?.evaluationFrameworkMissingReasons).toContain("candidate:metricIds");
    expect(report.comparisons[0]?.observabilityPipelineMissingReasons).toContain("candidate:traceExportHash");
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps EnterpriseRAG-Bench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("EnterpriseRAG-Bench");
      expect(source).not.toContain("enterpriserag_provider_drift");
      expect(source).not.toContain("Redwood Inference");
    }
  });
});
