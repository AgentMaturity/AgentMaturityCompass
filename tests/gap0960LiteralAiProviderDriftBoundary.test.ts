import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0960-literal-ai-provider-drift.md";
const HOME = "https://literalai.com";
const DOCS = "https://docs.literalai.com";
const MIGRATION = "https://docs.literalai.com/more/migration-guide";
const LOGS = "https://docs.literalai.com/guides/logs";
const MONITORING = "https://docs.literalai.com/guides/monitoring";
const DATASETS = "https://docs.literalai.com/guides/dataset";
const EVALUATION = "https://docs.literalai.com/guides/evaluation";
const TITLE = "Literal AI";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "literal-ai-reviewed-provider",
  model: "agent-observability-canary",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "literal-ai-provider-drift-canary",
  benchmarkFamily: "literal-ai-llmops-provider-drift",
  capabilityId: "production-agent-monitoring-eval-stability",
  evaluationFrameworkId: "amc-owned-literal-ai-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `literal-ai-reviewed-provider:${side}:agent-monitoring`,
  metricSuiteId: "llmops-provider-drift-score-shield-watch",
  metricIds: [
    "score_mean",
    "refusal_rate",
    "invalid_action_rate",
    "evaluator_coverage",
    "guardrail_pass_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `literal-ai-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `literal-ai-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-llmops-observability-project",
  datastoreId: "amc-owned-llmops-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 64,
  trajectoryCount: 64,
  scoreMean0to1: side === "baseline" ? 0.87 : 0.858,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.038,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.021,
  evaluatorCoverage0to1: side === "baseline" ? 0.98 : 0.973,
  guardrailPassRate0to1: side === "baseline" ? 0.965 : 0.958,
  latencyMsP95: side === "baseline" ? 1380 : 1495,
  costUsdMean: side === "baseline" ? 0.011 : 0.0117,
  evidenceRefs: [`literal-ai-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:literal-ai-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0960 Literal AI provider-drift boundary", () => {
  it("documents live Literal AI metadata, discontinuation status, and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0960");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(MIGRATION);
    expect(doc).toContain(LOGS);
    expect(doc).toContain(MONITORING);
    expect(doc).toContain(DATASETS);
    expect(doc).toContain(EVALUATION);
    expect(doc).toContain("Ship reliable LLM Products");
    expect(doc).toContain("evaluation to prompt management");
    expect(doc).toContain("Prompt Regressions");
    expect(doc).toContain("LLM Switching Cost");
    expect(doc).toContain("Dataset Cold Start");
    expect(doc).toContain("Multi-Step Debugging");
    expect(doc).toContain("Data Drift");
    expect(doc).toContain("Logs & Traces");
    expect(doc).toContain("Monitoring");
    expect(doc).toContain("Dataset");
    expect(doc).toContain("Experiments");
    expect(doc).toContain("Evaluation");
    expect(doc).toContain("Prompt Management");
    expect(doc).toContain("Human Review");
    expect(doc).toContain("Self-Hostable");
    expect(doc).toContain("Python SDK, TypeScript SDK, GraphQL API");
    expect(doc).toContain("Literal AI will be discontinued");
    expect(doc).toContain("October 31st, 2025");
    expect(doc).toContain("export all your data");
    expect(doc).toContain("datasets, experiments, prompts");
    expect(doc).toContain("Log to a Specific Environment");
    expect(doc).toContain("Log with a Release");
    expect(doc).toContain("Add a Score");
    expect(doc).toContain("Volume Metrics");
    expect(doc).toContain("Latency Metrics");
    expect(doc).toContain("AI Performance Evaluations");
    expect(doc).toContain("Cost Tracking");
    expect(doc).toContain("non regression tests");
    expect(doc).toContain("Key-Value");
    expect(doc).toContain("Generation");
    expect(doc).toContain("continuous deployment");
    expect(doc).toContain("LLM Generation");
    expect(doc).toContain("Agent Run");
    expect(doc).toContain("Conversation Thread");
    expect(doc).toContain("context relevancy");
    expect(doc).toContain("faithfulness");
    expect(doc).toContain("answer relevancy");
    expect(doc).toContain("LLM-as-a-Judge");
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

  it("uses existing provider-drift evaluator for Literal-style LLMOps context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "literal-ai-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 7,
        minTrajectoryCount: 50,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-literal-ai-v1",
      datasetHash: hash("f"),
      sourceRefs: [HOME, MIGRATION, LOGS, MONITORING, DATASETS, EVALUATION],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([HOME, MIGRATION, LOGS, MONITORING, DATASETS, EVALUATION]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when Literal AI metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "literal-ai-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [HOME, MIGRATION], signedEvidenceRefs: [] })],
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
          evidenceRefs: [HOME, MIGRATION, EVALUATION],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 7,
        minTrajectoryCount: 50,
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

  it("keeps Literal AI identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Literal AI");
      expect(source).not.toContain("literal-ai-provider-drift");
      expect(source).not.toContain("literalai.com");
      expect(source).not.toContain("docs.literalai.com");
    }
  });
});
