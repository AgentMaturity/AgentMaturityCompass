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

const DOC = "docs/source-reviews/GAP-0731-crab-provider-drift.md";
const SOURCE = "https://github.com/camel-ai/crab";
const README = "https://raw.githubusercontent.com/camel-ai/crab/main/README.md";
const PROJECT = "https://crab.camel-ai.org/";
const PAPER = "https://arxiv.org/abs/2407.01511";
const DOI = "10.48550/arxiv.2407.01511";
const REPO = "camel-ai/crab";

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
  provider: "anthropic",
  model: "claude-4-sonnet",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "crab-cross-environment-canary",
  benchmarkFamily: "cross-environment-multimodal-agent-provider-drift",
  capabilityId: "gui-multienvironment-agent-task-completion",
  evaluationFrameworkId: "amc-owned-crab-style-cross-env-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `anthropic:claude-4-sonnet:${side}:cross-environment-agent`,
  metricSuiteId: "cross-environment-agent-drift-suite",
  metricIds: ["task_completion", "graph_evaluator_score", "invalid_action_rate", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-cross-environment-agent-canary",
  pipelineRunId: `crab-cross-env-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `crab-cross-env-canary-${side}`,
  observabilityProjectId: "amc-crab-style-cross-env-observability",
  datastoreId: "amc-owned-cross-environment-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 48,
  trajectoryCount: 48,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.815,
  refusalRate0to1: side === "baseline" ? 0.04 : 0.045,
  invalidActionRate0to1: side === "baseline" ? 0.03 : 0.035,
  evaluatorCoverage0to1: side === "baseline" ? 0.94 : 0.935,
  guardrailPassRate0to1: side === "baseline" ? 0.95 : 0.945,
  latencyMsP95: side === "baseline" ? 2100 : 2185,
  costUsdMean: side === "baseline" ? 0.012 : 0.0125,
  evidenceRefs: [`crab:${side}:cross-env-canary`, `crab:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:crab-${side}`],
  ...overrides,
});

describe("GAP-0731 CRAB provider-drift boundary", () => {
  it("documents live GitHub/arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0731");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(PROJECT);
    expect(doc).toContain(PAPER);
    expect(doc).toContain(DOI);
    expect(doc).toContain(REPO);
    expect(doc).toContain("CRAB");
    expect(doc).toContain("cross-environment agent benchmark");
    expect(doc).toContain("multimodal language model agents");
    expect(doc).toContain("Docker");
    expect(doc).toContain("virtual-machine");
    expect(doc).toContain("physical-machine");
    expect(doc).toContain("Python-function action spaces");
    expect(doc).toContain("@action");
    expect(doc).toContain("graph evaluators");
    expect(doc).toContain("CRAB-Benchmark-v0");
    expect(doc).toContain("desktop and mobile");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for CRAB-style context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "crab-cross-environment-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-crab-style-cross-env-eval",
      candidateEvaluationFrameworkId: "amc-owned-crab-style-cross-env-eval",
      baselinePipelineOrchestratorId: "amc-cross-environment-agent-canary",
      candidatePipelineOrchestratorId: "amc-cross-environment-agent-canary",
      baselineObservabilityProjectId: "amc-crab-style-cross-env-observability",
      candidateObservabilityProjectId: "amc-crab-style-cross-env-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-crab-cross-env-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE, README, PROJECT, PAPER, `doi:${DOI}`],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "task_completion",
      "graph_evaluator_score",
      "invalid_action_rate",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-crab-style-cross-env-eval");
    expect(markdown).toContain("amc-cross-environment-agent-canary");
  });

  it("fails closed when CRAB metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "crab-cross-environment-reviewed-agent",
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
          evidenceRefs: [SOURCE, README, PAPER],
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

  it("keeps CRAB identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("CRAB");
      expect(source).not.toContain("crab_provider_drift");
      expect(source).not.toContain("Cross-environment Agent Benchmark");
    }
  });
});
