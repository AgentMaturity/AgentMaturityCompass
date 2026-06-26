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

const DOC = "docs/source-reviews/GAP-0801-urban-planning-provider-drift-unavailable.md";
const DOI = "10.1016/j.jum.2025.12.006";
const OPENALEX = "W7118760046";
const TITLE = "Generative AI for complex urban planning: Pathways, potentials, and challenges";

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
  canaryId: "urban-planning-provider-canary",
  benchmarkFamily: "urban-planning-provider-model-drift",
  capabilityId: "complex-urban-planning-agent-eval",
  evaluationFrameworkId: "amc-owned-urban-planning-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:urban-planning`,
  metricSuiteId: "urban-planning-drift-suite",
  metricIds: ["planning_consistency", "stakeholder_grounding", "risk_tradeoff_quality", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-urban-planning-provider-drift-canary",
  pipelineRunId: `urban-planning-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `urban-planning-canary-${side}`,
  observabilityProjectId: "amc-urban-planning-observability",
  datastoreId: "amc-owned-urban-planning-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 34,
  trajectoryCount: 34,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.815,
  refusalRate0to1: side === "baseline" ? 0.025 : 0.03,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.95 : 0.944,
  guardrailPassRate0to1: side === "baseline" ? 0.955 : 0.948,
  latencyMsP95: side === "baseline" ? 1550 : 1690,
  costUsdMean: side === "baseline" ? 0.009 : 0.0096,
  evidenceRefs: [`urban-planning:${side}:canary`, `urban-planning:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:urban-planning-${side}`],
  ...overrides,
});

describe("GAP-0801 urban planning provider-drift unavailable-source boundary", () => {
  it("documents unavailable source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0801");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("complex urban planning");
    expect(doc).toContain("generative AI");
    expect(doc).toContain("transformative learning");
    expect(doc).toContain("urban planning");
    expect(doc).toContain("data science");
    expect(doc).toContain("management science");
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

  it("uses existing provider-drift evaluator for urban-planning context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "urban-planning-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-urban-planning-eval",
      candidateEvaluationFrameworkId: "amc-owned-urban-planning-eval",
      baselinePipelineOrchestratorId: "amc-urban-planning-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-urban-planning-provider-drift-canary",
      baselineObservabilityProjectId: "amc-urban-planning-observability",
      candidateObservabilityProjectId: "amc-urban-planning-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-urban-planning-v1",
      datasetHash: hash("f"),
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "planning_consistency",
      "stakeholder_grounding",
      "risk_tradeoff_quality",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-urban-planning-eval");
  });

  it("fails closed when urban-planning metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "urban-planning-reviewed-agent",
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
      expect(source).not.toContain("urban_planning_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
