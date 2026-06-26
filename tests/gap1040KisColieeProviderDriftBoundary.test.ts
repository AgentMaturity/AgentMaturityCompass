import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1040-kis-coliee-provider-drift.md";
const OPENALEX = "https://openalex.org/W7139042755";
const OPENALEX_API = "https://api.openalex.org/works/W7139042755";
const DOI = "https://doi.org/10.1007/s12626-026-00209-w";
const DOI_VALUE = "10.1007/s12626-026-00209-w";
const CROSSREF = "https://api.crossref.org/works/10.1007/s12626-026-00209-w";
const SPRINGER = "https://link.springer.com/article/10.1007/s12626-026-00209-w";
const PDF = "https://link.springer.com/content/pdf/10.1007/s12626-026-00209-w.pdf";
const TITLE = "KIS: COLIEE 2025 Task 4 Solver Using Japanese LLM";
const IDENTIFIER = "kis-coliee-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "japanese-legal-entailment-provider",
  model: "coliee-task4-llm-canary",
  version: side === "baseline" ? "japanese-legal-entailment-2026-03" : "japanese-legal-entailment-2026-06",
  canaryId: "kis-coliee-provider-drift-canary",
  benchmarkFamily: "japanese-legal-entailment-provider-drift",
  capabilityId: "legal-entailment-answer-stability",
  evaluationFrameworkId: "amc-owned-kis-coliee-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.25",
  providerRouteId: `japanese-legal-entailment:${side}:coliee-task4-canary`,
  metricSuiteId: "kis-coliee-provider-drift-score-shield-watch",
  metricIds: [
    "legal_entailment_accuracy",
    "answer_label_stability",
    "prompt_strategy_stability",
    "explanation_consistency",
    "citation_grounding_rate",
    "evaluator_agreement",
    "refusal_rate",
    "invalid_action_rate",
    "guardrail_pass_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 11,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "weighted_mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `kis-coliee-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `kis-coliee-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-japanese-legal-entailment-observability-project",
  datastoreId: "amc-owned-kis-coliee-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 104,
  trajectoryCount: 104,
  scoreMean0to1: side === "baseline" ? 0.802 : 0.795,
  refusalRate0to1: side === "baseline" ? 0.018 : 0.019,
  invalidActionRate0to1: side === "baseline" ? 0.014 : 0.015,
  judgeAgreement0to1: side === "baseline" ? 0.918 : 0.916,
  evaluatorCoverage0to1: side === "baseline" ? 0.984 : 0.982,
  guardrailPassRate0to1: side === "baseline" ? 0.979 : 0.976,
  latencyMsP95: side === "baseline" ? 1720 : 1765,
  costUsdMean: side === "baseline" ? 0.022 : 0.023,
  evidenceRefs: [`kis-coliee-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:kis-coliee-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1040 KIS COLIEE provider-drift boundary", () => {
  it("documents live paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1040");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(PDF);
    expect(doc).toContain("The Review of Socionetwork Strategies");
    expect(doc).toContain("publication_date `2026-03-18`");
    expect(doc).toContain("publication month `2026/04`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("publisher `Springer Science and Business Media LLC`");
    expect(doc).toContain("dc.publisher `Springer`");
    expect(doc).toContain("volume `20`");
    expect(doc).toContain("page `341-359`");
    expect(doc).toContain("firstpage `341`");
    expect(doc).toContain("lastpage `359`");
    expect(doc).toContain("oa_status `hybrid`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Takaaki Onaga");
    expect(doc).toContain("Yoshinobu Kano");
    expect(doc).toContain("Shizuoka University");
    expect(doc).toContain("Task (project management)");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Solver");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("Textual entailment");
    expect(doc).toContain("Natural language processing");
    expect(doc).toContain("Logical consequence");
    expect(doc).toContain("Task analysis");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 301");
    expect(doc).toContain("HTTP/2 303");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("idp.springer.com");
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

  it("uses existing provider-drift evaluator for Japanese legal-entailment canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "kis-coliee-reviewed-legal-entailment-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 100,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-kis-coliee-legal-entailment-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, SPRINGER, PDF],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, OPENALEX_API, DOI, CROSSREF, SPRINGER, PDF]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "kis-coliee-metadata-only-agent",
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, SPRINGER, PDF],
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

  it("keeps paper-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("COLIEE 2025 Task 4");
    }
  });
});
