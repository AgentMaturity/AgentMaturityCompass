import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1033-all-futures-provider-drift.md";
const OPENALEX = "https://openalex.org/W7154019849";
const OPENALEX_API = "https://api.openalex.org/works/W7154019849";
const DOI = "https://doi.org/10.1145/3772318.3791543";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3791543";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3791543";
const TITLE = "All Futures at Once: Supporting Speculative Design for Placemaking with Multi-Agent Social Simulation";
const DOI_VALUE = "10.1145/3772318.3791543";
const IDENTIFIER = "all-futures-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "social-simulation-agent-provider",
  model: "placemaking-multi-agent-canary",
  version: side === "baseline" ? "social-sim-provider-2026-05" : "social-sim-provider-2026-06",
  canaryId: "all-futures-provider-drift-canary",
  benchmarkFamily: "multi-agent-social-simulation-provider-drift",
  capabilityId: "placemaking-social-dynamics-stability",
  evaluationFrameworkId: "amc-owned-all-futures-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `placemaking-social-simulation:${side}:canary`,
  metricSuiteId: "all-futures-provider-drift-score-shield-watch",
  metricIds: [
    "stakeholder_outcome_stability",
    "scenario_diversity_score",
    "social_dynamics_consistency",
    "placemaking_quality_agreement",
    "speculative_design_coherence",
    "agent_role_consistency",
    "deliberation_trace_coverage",
    "participatory_risk_score",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 12,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "weighted_mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `all-futures-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `all-futures-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-social-simulation-observability-project",
  datastoreId: "amc-owned-all-futures-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.781 : 0.776,
  refusalRate0to1: side === "baseline" ? 0.015 : 0.016,
  invalidActionRate0to1: side === "baseline" ? 0.019 : 0.020,
  judgeAgreement0to1: side === "baseline" ? 0.922 : 0.920,
  evaluatorCoverage0to1: side === "baseline" ? 0.982 : 0.981,
  guardrailPassRate0to1: side === "baseline" ? 0.974 : 0.971,
  latencyMsP95: side === "baseline" ? 2860 : 2910,
  costUsdMean: side === "baseline" ? 0.071 : 0.073,
  evidenceRefs: [`all-futures-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:all-futures-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1033 All Futures provider-drift boundary", () => {
  it("documents live paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1033");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain("publication year `2026`");
    expect(doc).toContain("publication date `2026-04-13`");
    expect(doc).toContain("type `article`");
    expect(doc).toContain("proceedings-article");
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("publisher `ACM`");
    expect(doc).toContain("pages `1-20`");
    expect(doc).toContain("open access `gold`");
    expect(doc).toContain("license `cc-by`");
    expect(doc).toContain("referenced_works_count `72`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("reference_count `91`");
    expect(doc).toContain("is_referenced_by_count `0`");
    expect(doc).toContain("Jiayang Li");
    expect(doc).toContain("Jiarui Jiang");
    expect(doc).toContain("Yang Shi");
    expect(doc).toContain("Tongji University");
    expect(doc).toContain("Shanghai Jiao Tong University");
    expect(doc).toContain("Placemaking");
    expect(doc).toContain("Futures contract");
    expect(doc).toContain("Human-computer interaction");
    expect(doc).toContain("Stakeholder");
    expect(doc).toContain("Social dynamics");
    expect(doc).toContain("DOI redirect");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("ACM landing page returned HTTP/2 403");
    expect(doc).toContain("Cloudflare challenge");
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

  it("uses existing provider-drift evaluator for social-simulation canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "all-futures-reviewed-social-simulation-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 12,
        minTrajectoryCount: 90,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-all-futures-social-simulation-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, DOI, CROSSREF, ACM],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, DOI, CROSSREF, ACM]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "all-futures-metadata-only-agent",
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, ACM],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 12,
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

  it("keeps paper-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("All Futures at Once");
      expect(source).not.toContain("Placemaking");
    }
  });
});
