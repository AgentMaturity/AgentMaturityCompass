import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1021-wikipedia-neutrality-provider-drift.md";
const OPENALEX = "https://openalex.org/W4400434455";
const OPENALEX_API = "https://api.openalex.org/works/W4400434455";
const DOI = "10.1609/icwsm.v20i1.42630";
const DOI_URL = "https://doi.org/10.1609/icwsm.v20i1.42630";
const AAAI_ARTICLE = "https://ojs.aaai.org/index.php/ICWSM/article/view/42630";
const AAAI_PDF = "https://ojs.aaai.org/index.php/ICWSM/article/download/42630/50190";
const CROSSREF_API = "https://api.crossref.org/works/10.1609/icwsm.v20i1.42630";
const ARXIV = "http://arxiv.org/abs/2407.04183v5";
const ARXIV_PDF = "https://arxiv.org/pdf/2407.04183";
const ARXIV_DOI = "https://doi.org/10.48550/arxiv.2407.04183";
const IDENTIFIER = "wikipedia-neutrality-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "community-norm-review-provider",
  model: "wikipedia-neutrality-canary",
  version: side === "baseline" ? "neutrality-norm-baseline-2026-05" : "neutrality-norm-provider-refresh-2026-06",
  canaryId: "wikipedia-neutrality-provider-drift-canary",
  benchmarkFamily: "wikipedia-npov-community-norm-provider-drift",
  capabilityId: "community-norm-bias-detection-and-editing-stability",
  evaluationFrameworkId: "amc-owned-wikipedia-neutrality-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `community-norm-provider:${side}:neutrality-canary`,
  metricSuiteId: "wikipedia-neutrality-provider-drift-score-shield-watch",
  metricIds: [
    "bias_detection_accuracy",
    "neutrality_rewrite_precision",
    "neutrality_rewrite_recall",
    "extraneous_edit_rate",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 8,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `wikipedia-neutrality-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `wikipedia-neutrality-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-wikipedia-neutrality-observability-project",
  datastoreId: "amc-owned-wikipedia-neutrality-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 88,
  trajectoryCount: 88,
  scoreMean0to1: side === "baseline" ? 0.742 : 0.737,
  refusalRate0to1: side === "baseline" ? 0.023 : 0.024,
  invalidActionRate0to1: side === "baseline" ? 0.015 : 0.016,
  evaluatorCoverage0to1: side === "baseline" ? 0.986 : 0.983,
  guardrailPassRate0to1: side === "baseline" ? 0.977 : 0.974,
  latencyMsP95: side === "baseline" ? 1260 : 1295,
  costUsdMean: side === "baseline" ? 0.014 : 0.0145,
  evidenceRefs: [`wikipedia-neutrality-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:wikipedia-neutrality-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1021 Wikipedia neutrality provider-drift boundary", () => {
  it("documents live Wikipedia neutrality paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1021");
    expect(doc).toContain("Seeing Like an AI: How LLMs Apply (and Misapply) Wikipedia Neutrality Norms");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_URL);
    expect(doc).toContain(AAAI_ARTICLE);
    expect(doc).toContain(AAAI_PDF);
    expect(doc).toContain(CROSSREF_API);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(ARXIV_DOI);
    expect(doc).toContain("Proceedings of the International AAAI Conference on Web and Social Media");
    expect(doc).toContain("publication_date `2026-05-25`");
    expect(doc).toContain("OpenAlex type `preprint`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("volume `20`");
    expect(doc).toContain("issue `1`");
    expect(doc).toContain("pages `146-173`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Joshua Ashkinaze");
    expect(doc).toContain("University of Michigan");
    expect(doc).toContain("Neutrality");
    expect(doc).toContain("Political science");
    expect(doc).toContain("Internet privacy");
    expect(doc).toContain("NPOV");
    expect(doc).toContain("64%");
    expect(doc).toContain("79%");
    expect(doc).toContain("70%");
    expect(doc).toContain("61%");
    expect(doc).toContain("arXiv `2407.04183v5`");
    expect(doc).toContain("cs.CL");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.CY");
    expect(doc).toContain("cs.HC");
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

  it("uses existing provider-drift evaluator for Wikipedia-neutrality norm canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "wikipedia-neutrality-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-wikipedia-neutrality-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, DOI_URL, AAAI_ARTICLE, AAAI_PDF, ARXIV],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, DOI_URL, AAAI_ARTICLE, AAAI_PDF, ARXIV]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when Wikipedia neutrality paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "wikipedia-neutrality-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [OPENALEX, DOI_URL], signedEvidenceRefs: [] })],
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
          evidenceRefs: [OPENALEX, DOI_URL, AAAI_ARTICLE, AAAI_PDF, ARXIV],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
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

  it("keeps Wikipedia-neutrality identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI_URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Wikipedia neutrality provider drift");
    }
  });
});
