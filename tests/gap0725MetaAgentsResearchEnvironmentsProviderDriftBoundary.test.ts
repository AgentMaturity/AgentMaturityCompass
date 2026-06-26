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

const DOC = "docs/source-reviews/GAP-0725-meta-agents-research-environments-provider-drift.md";
const SOURCE = "https://github.com/facebookresearch/meta-agents-research-environments";
const README = "https://raw.githubusercontent.com/facebookresearch/meta-agents-research-environments/main/README.md";
const REPO = "facebookresearch/meta-agents-research-environments";

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
  canaryId: "meta-agents-dynamic-environment-canary",
  benchmarkFamily: "dynamic-agent-environment-provider-drift",
  capabilityId: "gaia2-style-dynamic-task-adaptation",
  evaluationFrameworkId: "amc-owned-meta-agents-research-environments-style-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:dynamic-environment`,
  metricSuiteId: "dynamic-environment-agent-drift-suite",
  metricIds: ["task_success", "adaptation_quality", "invalid_action_rate", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-dynamic-environment-canary",
  pipelineRunId: `meta-agents-dynamic-env-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `dynamic-env-canary-${side}`,
  observabilityProjectId: "amc-meta-agents-dynamic-env-observability",
  datastoreId: "amc-owned-dynamic-environment-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.88 : 0.865,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.95 : 0.945,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.955,
  latencyMsP95: side === "baseline" ? 1500 : 1535,
  costUsdMean: side === "baseline" ? 0.006 : 0.0062,
  evidenceRefs: [`meta-agents:${side}:dynamic-env-canary`, `meta-agents:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:meta-agents-${side}`],
  ...overrides,
});

describe("GAP-0725 Meta Agents Research Environments provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0725");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("Meta Agents Research Environments");
    expect(doc).toContain("Gaia2");
    expect(doc).toContain("app/event/scenario");
    expect(doc).toContain("dynamic information updates");
    expect(doc).toContain("model-provider configuration");
    expect(doc).toContain("evaluation runs");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("provider version, generated test data");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for dynamic agent environments", () => {
    const report = runProviderDriftBenchmark({
      agentId: "meta-agents-dynamic-env-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-meta-agents-research-environments-style-eval",
      candidateEvaluationFrameworkId: "amc-owned-meta-agents-research-environments-style-eval",
      baselinePipelineOrchestratorId: "amc-dynamic-environment-canary",
      candidatePipelineOrchestratorId: "amc-dynamic-environment-canary",
      baselineObservabilityProjectId: "amc-meta-agents-dynamic-env-observability",
      candidateObservabilityProjectId: "amc-meta-agents-dynamic-env-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-meta-agents-dynamic-env-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE, README],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "task_success",
      "adaptation_quality",
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
    expect(markdown).toContain("amc-owned-meta-agents-research-environments-style-eval");
    expect(markdown).toContain("amc-dynamic-environment-canary");
  });

  it("fails closed when GitHub metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "meta-agents-dynamic-env-reviewed-agent",
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
          evidenceRefs: [SOURCE, README],
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

  it("keeps Meta Agents Research Environments identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("Meta Agents Research Environments");
      expect(source).not.toContain("meta_agents_research_environments_provider_drift");
      expect(source).not.toContain("Gaia2");
    }
  });
});
