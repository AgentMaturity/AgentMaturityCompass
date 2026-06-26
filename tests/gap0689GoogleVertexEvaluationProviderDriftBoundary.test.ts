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

const DOC = "docs/source-reviews/GAP-0689-google-vertex-evaluation-provider-drift.md";
const SOURCE = "https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview";
const REDIRECTED = "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-overview";

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
  provider: "google",
  model: "gemini-2.5-flash",
  version: side === "baseline" ? "2026-06-01" : "2026-06-18",
  canaryId: "vertex-model-migration-canary",
  benchmarkFamily: "managed-model-evaluation",
  capabilityId: "model-migration-rubric-evaluation",
  evaluationFrameworkId: "google-vertex-ai-evaluation",
  evaluationFrameworkVersion: "2026-06-18",
  providerRouteId: `google:${side}:model-migration`,
  metricSuiteId: "adaptive-static-computation-metrics",
  metricIds: ["adaptive_rubric_pass_rate", "static_rubric_score", "rouge", "bleu", "agent_trace_quality"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "agent-platform-sdk",
  pipelineRunId: `vertex-model-migration-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `vertex-eval-${side}`,
  observabilityProjectId: "vertex-production-log-sample",
  datastoreId: "amc-synthetic-and-production-log-canary",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 48,
  trajectoryCount: 48,
  scoreMean0to1: side === "baseline" ? 0.88 : 0.865,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.95 : 0.945,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.955,
  latencyMsP95: side === "baseline" ? 1450 : 1490,
  costUsdMean: side === "baseline" ? 0.005 : 0.0052,
  evidenceRefs: [`vertex:${side}:model-migration`, `vertex:${side}:agent-trace-eval`],
  signedEvidenceRefs: [`ledger:vertex-${side}`],
  ...overrides,
});

describe("GAP-0689 Google Vertex AI Evaluation provider-drift boundary", () => {
  it("documents live Google evaluation metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0689");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REDIRECTED);
    expect(doc).toContain("Gemini Enterprise Agent Platform");
    expect(doc).toContain("Last updated 2026-06-18 UTC");
    expect(doc).toContain("adaptive rubrics");
    expect(doc).toContain("static rubrics");
    expect(doc).toContain("computation-based metrics");
    expect(doc).toContain("custom functions");
    expect(doc).toContain("Sample directly from production logs");
    expect(doc).toContain("synthetic data generation");
    expect(doc).toContain("model migrations");
    expect(doc).toContain("Google and third-party models");
    expect(doc).toContain("agent traces and response quality");
    expect(doc).toContain("GenAI Client in Agent Platform SDK");
    expect(doc).toContain("Evaluation module in Agent Platform SDK");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for Vertex-style model migrations", () => {
    const report = runProviderDriftBenchmark({
      agentId: "vertex-style-model-migration-agent",
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
      baselineEvaluationFrameworkId: "google-vertex-ai-evaluation",
      candidateEvaluationFrameworkId: "google-vertex-ai-evaluation",
      baselinePipelineOrchestratorId: "agent-platform-sdk",
      candidatePipelineOrchestratorId: "agent-platform-sdk",
      baselineObservabilityProjectId: "vertex-production-log-sample",
      candidateObservabilityProjectId: "vertex-production-log-sample",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-google-vertex-evaluation-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE, REDIRECTED],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("google-vertex-ai-evaluation");
    expect(markdown).toContain("agent-platform-sdk");
  });

  it("fails closed when Google evaluation docs metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "vertex-style-model-migration-agent",
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

  it("keeps Google Vertex identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Google Vertex AI Evaluation");
      expect(source).not.toContain("google_vertex_evaluation_provider_drift");
      expect(source).not.toContain("cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview");
      expect(source).not.toContain("gemini-enterprise-agent-platform/models/evaluation-overview");
    }
  });
});
