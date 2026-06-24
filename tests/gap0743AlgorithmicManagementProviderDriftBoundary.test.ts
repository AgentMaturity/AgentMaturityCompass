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

const DOC = "docs/source-reviews/GAP-0743-algorithmic-management-provider-drift.md";
const SOURCE = "https://www.mdpi.com/2673-2688/7/3/102";
const DOI = "10.3390/ai7030102";
const OPENALEX = "https://openalex.org/W7134908244";

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
  canaryId: "algorithmic-management-governance-canary",
  benchmarkFamily: "governance-sensitive-provider-model-drift",
  capabilityId: "explainable-organizational-decision-support",
  evaluationFrameworkId: "amc-owned-algorithmic-management-governance-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:governance-decision-agent`,
  metricSuiteId: "governance-provider-drift-suite",
  metricIds: [
    "explanation_validity_proxy",
    "constraint_satisfaction",
    "provenance_coverage",
    "bias_review_pass",
    "latency",
    "cost",
  ],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-governance-provider-drift-canary",
  pipelineRunId: `algorithmic-management-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `algorithmic-management-canary-${side}`,
  observabilityProjectId: "amc-governance-decision-observability",
  datastoreId: "amc-owned-governance-decision-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.835,
  refusalRate0to1: side === "baseline" ? 0.025 : 0.03,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.028,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.95,
  guardrailPassRate0to1: side === "baseline" ? 0.955 : 0.945,
  latencyMsP95: side === "baseline" ? 1550 : 1680,
  costUsdMean: side === "baseline" ? 0.008 : 0.0088,
  evidenceRefs: [`algorithmic-management:${side}:canary`, `algorithmic-management:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:algorithmic-management-${side}`],
  ...overrides,
});

describe("GAP-0743 algorithmic management provider-drift boundary", () => {
  it("documents live MDPI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0743");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("LLM-Augmented Algorithmic Management");
    expect(doc).toContain("10 March 2026");
    expect(doc).toContain("AI 2026, 7(3), 102");
    expect(doc).toContain("algorithmic decision core");
    expect(doc).toContain("LLM-based cognitive interface");
    expect(doc).toContain("verification and governance layer");
    expect(doc).toContain("EU AI Act");
    expect(doc).toContain("GDPR");
    expect(doc).toContain("ISO/IEC 42001");
    expect(doc).toContain("synthetic-trace simulation");
    expect(doc).toContain("n = 120");
    expect(doc).toContain("100.3 ms");
    expect(doc).toContain("115.8 ms");
    expect(doc).toContain("85.6%");
    expect(doc).toContain("94.2%");
    expect(doc).toContain("not empirical performance benchmarks");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for governance-sensitive decision agents", () => {
    const report = runProviderDriftBenchmark({
      agentId: "algorithmic-management-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-algorithmic-management-governance-eval",
      candidateEvaluationFrameworkId: "amc-owned-algorithmic-management-governance-eval",
      baselinePipelineOrchestratorId: "amc-governance-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-governance-provider-drift-canary",
      baselineObservabilityProjectId: "amc-governance-decision-observability",
      candidateObservabilityProjectId: "amc-governance-decision-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-algorithmic-management-governance-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE, `doi:${DOI}`, OPENALEX],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "explanation_validity_proxy",
      "constraint_satisfaction",
      "provenance_coverage",
      "bias_review_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-algorithmic-management-governance-eval");
    expect(markdown).toContain("amc-governance-provider-drift-canary");
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "algorithmic-management-reviewed-agent",
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
          evidenceRefs: [SOURCE, `doi:${DOI}`, OPENALEX],
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
      expect(source).not.toContain("LLM-Augmented Algorithmic Management");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("algorithmic_management_provider_drift");
      expect(source).not.toContain("Hinov");
    }
  });
});
