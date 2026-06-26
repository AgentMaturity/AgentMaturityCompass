import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1048-smt-solving-provider-drift.md";
const OPENALEX = "https://openalex.org/W7137989388";
const OPENALEX_API = "https://api.openalex.org/works/W7137989388";
const DOI = "https://doi.org/10.1609/aaai.v40i17.38445";
const DOI_VALUE = "10.1609/aaai.v40i17.38445";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i17.38445";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/38445";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/38445/42407";
const TITLE = "LLM-Guided Quantified SMT Solving over Uninterpreted Functions";
const IDENTIFIER = "smt-solving-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "formal-reasoning-provider",
  model: "smt-reasoning-canary",
  version: side === "baseline" ? "formal-reasoning-provider-2026-05" : "formal-reasoning-provider-2026-06",
  canaryId: "smt-solving-provider-drift-canary",
  benchmarkFamily: "formal-reasoning-provider-drift",
  capabilityId: "quantified-smt-uninterpreted-functions-stability",
  evaluationFrameworkId: "amc-owned-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.25",
  providerRouteId: `formal-reasoning-provider:${side}:smt-canary`,
  metricSuiteId: "provider-drift-score-shield-watch",
  metricIds: [
    "score_mean",
    "formula_integrity",
    "artifact_accuracy",
    "judge_agreement",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
    "guardrail_pass_rate",
    "evaluator_coverage",
  ],
  metricCount: 10,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `smt-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `smt-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-formal-reasoning-observability-project",
  datastoreId: "amc-owned-formal-reasoning-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "9" : "0"),
  contentDatasetHash: hash("a"),
  summaryArtifactHash: hash(side === "baseline" ? "b" : "c"),
  qaDatasetHash: hash("d"),
  traceExportHash: hash(side === "baseline" ? "3" : "4"),
  metricReportHash: hash(side === "baseline" ? "5" : "6"),
  pipelineConfigHash: hash(side === "baseline" ? "7" : "8"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.842 : 0.839,
  refusalRate0to1: side === "baseline" ? 0.012 : 0.013,
  invalidActionRate0to1: side === "baseline" ? 0.011 : 0.012,
  judgeAgreement0to1: side === "baseline" ? 0.94 : 0.938,
  evaluatorCoverage0to1: side === "baseline" ? 0.995 : 0.992,
  guardrailPassRate0to1: side === "baseline" ? 0.984 : 0.982,
  artifactAccuracy0to1: side === "baseline" ? 0.91 : 0.907,
  formulaIntegrity0to1: side === "baseline" ? 0.93 : 0.928,
  latencyMsP95: side === "baseline" ? 2320 : 2325,
  costUsdMean: side === "baseline" ? 0.052 : 0.052,
  evidenceRefs: [`smt-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:smt-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1048 SMT-solving provider-drift boundary", () => {
  it("documents live SMT-solving paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1048");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("Association for the Advancement of Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("open access status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("issue `17`");
    expect(doc).toContain("pages `14304-14312`");
    expect(doc).toContain("Kunhang Lv");
    expect(doc).toContain("Yuhang Dong");
    expect(doc).toContain("Rui Han");
    expect(doc).toContain("Fuqi Jia");
    expect(doc).toContain("Feifei Ma");
    expect(doc).toContain("Jian Zhang");
    expect(doc).toContain("Jian Dong Zhang");
    expect(doc).toContain("Constraint Satisfaction and Optimization");
    expect(doc).toContain("Formal Methods in Verification");
    expect(doc).toContain("Polynomial and algebraic computation");
    expect(doc).toContain("Satisfiability modulo theories");
    expect(doc).toContain("Soundness");
    expect(doc).toContain("Automated reasoning");
    expect(doc).toContain("Quantifier elimination");
    expect(doc).toContain("Symbolic execution");
    expect(doc).toContain("Lazy evaluation");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("18066-AAAI26.LvK-CS.pdf");
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

  it("accepts SMT-solving context only through existing provider-drift receipts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "smt-solving-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 90,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-smt-solving-formal-reasoning-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, AAAI, PDF],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, OPENALEX_API, DOI, CROSSREF, AAAI, PDF]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when SMT paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "smt-solving-metadata-only-agent",
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, AAAI, PDF],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 10,
        minTrajectoryCount: 90,
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

  it("keeps SMT-solving identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
