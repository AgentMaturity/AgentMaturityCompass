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

const DOC = "docs/source-reviews/GAP-0776-physics-simulation-provider-drift-unavailable.md";
const DOI = "10.1038/s44387-025-00057-z";
const OPENALEX = "W7124960098";
const TITLE = "A self-correcting multi-agent LLM framework for language-based physics simulation and explanation";

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
  canaryId: "physics-simulation-provider-canary",
  benchmarkFamily: "physics-simulation-provider-model-drift",
  capabilityId: "physics-simulation-explanation-agent-eval",
  evaluationFrameworkId: "amc-owned-physics-simulation-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:physics-simulation`,
  metricSuiteId: "physics-simulation-drift-suite",
  metricIds: ["physics_consistency", "self_correction_quality", "explanation_grounding", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-physics-provider-drift-canary",
  pipelineRunId: `physics-simulation-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `physics-simulation-canary-${side}`,
  observabilityProjectId: "amc-physics-simulation-observability",
  datastoreId: "amc-owned-physics-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 32,
  trajectoryCount: 32,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.82,
  refusalRate0to1: side === "baseline" ? 0.02 : 0.025,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.026,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.95,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.952,
  latencyMsP95: side === "baseline" ? 1600 : 1820,
  costUsdMean: side === "baseline" ? 0.013 : 0.014,
  evidenceRefs: [`physics-simulation:${side}:canary`, `physics-simulation:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:physics-simulation-${side}`],
  ...overrides,
});

describe("GAP-0776 physics simulation provider-drift unavailable-source boundary", () => {
  it("documents unavailable source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0776");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches did not surface a reachable primary source");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("physics simulation");
    expect(doc).toContain("self-correcting");
    expect(doc).toContain("multi-agent");
    expect(doc).toContain("language-based physics simulation");
    expect(doc).toContain("explanation");
    expect(doc).toContain("robustness");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for physics-simulation context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "physics-simulation-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-physics-simulation-eval",
      candidateEvaluationFrameworkId: "amc-owned-physics-simulation-eval",
      baselinePipelineOrchestratorId: "amc-physics-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-physics-provider-drift-canary",
      baselineObservabilityProjectId: "amc-physics-simulation-observability",
      candidateObservabilityProjectId: "amc-physics-simulation-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-physics-simulation-v1",
      datasetHash: hash("f"),
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "physics_consistency",
      "self_correction_quality",
      "explanation_grounding",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-physics-simulation-eval");
  });

  it("fails closed when physics metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "physics-simulation-reviewed-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [`doi:${DOI}`],
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
          evidenceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
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

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("physics_simulation_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
