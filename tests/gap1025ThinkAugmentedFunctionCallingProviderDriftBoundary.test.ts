import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1025-think-augmented-function-calling-provider-drift.md";
const OPENALEX = "https://openalex.org/W7155089383";
const OPENALEX_API = "https://api.openalex.org/works/W7155089383";
const DOI = "https://doi.org/10.1109/icassp55912.2026.11462757";
const DOI_VALUE = "10.1109/icassp55912.2026.11462757";
const CROSSREF = "https://api.crossref.org/works/10.1109/icassp55912.2026.11462757";
const IEEE = "https://ieeexplore.ieee.org/document/11462757/";
const TITLE = "Think-Augmented Function Calling: Improving LLM Parameter Accuracy through Embedded Reasoning";
const IDENTIFIER = "think-augmented-function-calling-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "function-calling-agent-provider",
  model: "tool-use-parameter-accuracy-canary",
  version: side === "baseline" ? "function-calling-provider-2026-05" : "function-calling-provider-2026-06",
  canaryId: "think-augmented-function-calling-provider-drift-canary",
  benchmarkFamily: "function-calling-parameter-accuracy-provider-drift",
  capabilityId: "tool-argument-schema-and-parameter-stability",
  evaluationFrameworkId: "amc-owned-function-calling-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `function-calling-provider:${side}:parameter-canary`,
  metricSuiteId: "function-calling-provider-drift-score-shield-watch",
  metricIds: [
    "function_call_success_rate",
    "parameter_accuracy",
    "schema_adherence_rate",
    "argument_name_match_rate",
    "argument_value_match_rate",
    "tool_selection_accuracy",
    "repair_effectiveness",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 11,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `think-augmented-function-calling-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `think-augmented-function-calling-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-function-calling-observability-project",
  datastoreId: "amc-owned-function-calling-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 120,
  trajectoryCount: 120,
  scoreMean0to1: side === "baseline" ? 0.881 : 0.878,
  refusalRate0to1: side === "baseline" ? 0.012 : 0.013,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.019,
  repairEffectiveness0to1: side === "baseline" ? 0.833 : 0.829,
  evaluatorCoverage0to1: side === "baseline" ? 0.994 : 0.991,
  guardrailPassRate0to1: side === "baseline" ? 0.987 : 0.984,
  latencyMsP95: side === "baseline" ? 1510 : 1538,
  costUsdMean: side === "baseline" ? 0.019 : 0.0194,
  evidenceRefs: [`think-augmented-function-calling-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:think-augmented-function-calling-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1025 think-augmented function-calling provider-drift boundary", () => {
  it("documents live paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1025");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(IEEE);
    expect(doc).toContain("publication_date `2026-04-21`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("language `null`");
    expect(doc).toContain("oa_status `closed`");
    expect(doc).toContain("is_oa `false`");
    expect(doc).toContain("any_repository_has_fulltext `false`");
    expect(doc).toContain("raw_type `proceedings-article`");
    expect(doc).toContain("locations_count `1`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Crossref type `proceedings-article`");
    expect(doc).toContain("publisher `IEEE`");
    expect(doc).toContain("issued `2026-05-03`");
    expect(doc).toContain("Barcelona, Spain");
    expect(doc).toContain("event dates `2026-05-03` to `2026-05-08`");
    expect(doc).toContain("page `5676-5680`");
    expect(doc).toContain("reference-count `17`");
    expect(doc).toContain("is-referenced-by-count `1`");
    expect(doc).toContain("prefix `10.1109`");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 202");
    expect(doc).toContain("x-amzn-waf-action: challenge");
    expect(doc).toContain("Lei Wei");
    expect(doc).toContain("Jinpeng Ou");
    expect(doc).toContain("Xiao Peng");
    expect(doc).toContain("Bin Wang");
    expect(doc).toContain("Peking University");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("function calling");
    expect(doc).toContain("parameter accuracy");
    expect(doc).toContain("embedded reasoning");
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

  it("uses existing provider-drift evaluator for function-calling canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "think-augmented-function-calling-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 100,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-think-augmented-function-calling-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, DOI, CROSSREF, IEEE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, DOI, CROSSREF, IEEE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "think-augmented-function-calling-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [OPENALEX, DOI], signedEvidenceRefs: [] })],
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, IEEE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 100,
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

  it("keeps think-augmented function-calling identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
