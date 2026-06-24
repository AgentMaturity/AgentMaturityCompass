import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0961-automl-pipeline-provider-drift.md";
const DOI = "https://doi.org/10.1109/access.2026.3673923";
const IEEE = "https://ieeexplore.ieee.org/document/11433654/";
const OPENALEX = "https://openalex.org/W7135172733";
const OPENALEX_API = "https://api.openalex.org/works/W7135172733";
const TITLE = "AutoML-Pipeline: A RAG-Enhanced Code Generation Framework With Pre-Validation for Cloud-Native Machine Learning Workflows";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "automl-pipeline-reviewed-provider",
  model: "cloud-native-codegen-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "automl-pipeline-provider-drift-canary",
  benchmarkFamily: "automl-pipeline-cloud-native-codegen-provider-drift",
  capabilityId: "cloud-native-ml-workflow-codegen-stability",
  evaluationFrameworkId: "amc-owned-automl-pipeline-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `automl-pipeline-reviewed-provider:${side}:codegen`,
  metricSuiteId: "cloud-native-codegen-provider-drift-suite",
  metricIds: [
    "workflow_score",
    "pre_validation_pass_rate",
    "code_safety_refusal_rate",
    "invalid_action_rate",
    "evaluator_coverage",
    "guardrail_pass_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 8,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-cloud-native-provider-drift-canary-runner",
  pipelineRunId: `automl-pipeline-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `automl-pipeline-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-cloud-native-ml-observability-project",
  datastoreId: "amc-owned-cloud-native-codegen-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 56,
  trajectoryCount: 56,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.848,
  refusalRate0to1: side === "baseline" ? 0.045 : 0.049,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.023,
  evaluatorCoverage0to1: side === "baseline" ? 0.97 : 0.966,
  guardrailPassRate0to1: side === "baseline" ? 0.955 : 0.949,
  latencyMsP95: side === "baseline" ? 1650 : 1780,
  costUsdMean: side === "baseline" ? 0.017 : 0.018,
  evidenceRefs: [`automl-pipeline-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:automl-pipeline-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0961 AutoML-Pipeline provider-drift boundary", () => {
  it("documents live DOI/OpenAlex/IEEE reachability and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0961");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(IEEE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("IEEE Xplore document 11433654");
    expect(doc).toContain("JavaScript is disabled");
    expect(doc).toContain("not a robot");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("OpenAlex API body retry failed with DNS ENOTFOUND");
    expect(doc).toContain("OpenAlex 2026 metadata");
    expect(doc).toContain("RAG-Enhanced Code Generation Framework");
    expect(doc).toContain("Pre-Validation");
    expect(doc).toContain("Cloud-Native Machine Learning Workflows");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Code generation");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("Machine learning");
    expect(doc).toContain("Software engineering");
    expect(doc).toContain("local backlog abstract remains metadata-only");
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

  it("uses existing provider-drift evaluator for cloud-native codegen workflow context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "automl-pipeline-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 50,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-automl-pipeline-v1",
      datasetHash: hash("f"),
      sourceRefs: [DOI, IEEE, OPENALEX, OPENALEX_API],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([DOI, IEEE, OPENALEX, OPENALEX_API]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when AutoML-Pipeline metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "automl-pipeline-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [DOI, OPENALEX], signedEvidenceRefs: [] })],
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
          evidenceRefs: [IEEE, OPENALEX_API],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 8,
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

  it("keeps AutoML-Pipeline identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("AutoML-Pipeline");
      expect(source).not.toContain("10.1109/access.2026.3673923");
      expect(source).not.toContain("W7135172733");
      expect(source).not.toContain("automl-pipeline-provider-drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
