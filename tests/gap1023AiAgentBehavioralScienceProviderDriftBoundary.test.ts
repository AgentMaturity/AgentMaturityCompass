import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1023-ai-agent-behavioral-science-provider-drift.md";
const OPENALEX = "https://openalex.org/W4417116172";
const OPENALEX_API = "https://api.openalex.org/works/W4417116172";
const DOI = "https://doi.org/10.1057/s41599-026-07316-7";
const DOI_VALUE = "10.1057/s41599-026-07316-7";
const CROSSREF = "https://api.crossref.org/works/10.1057/s41599-026-07316-7";
const NATURE = "https://www.nature.com/articles/s41599-026-07316-7";
const PDF = "https://www.nature.com/articles/s41599-026-07316-7_reference.pdf";
const CITATION_PDF = "https://www.nature.com/articles/s41599-026-07316-7.pdf";
const IDENTIFIER = "ai-agent-behavioral-science-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "behavioral-science-agent-provider",
  model: "autonomous-agent-behavior-canary",
  version: side === "baseline" ? "behavioral-agent-baseline-2026-04" : "behavioral-agent-provider-refresh-2026-06",
  canaryId: "ai-agent-behavioral-science-provider-drift-canary",
  benchmarkFamily: "ai-agent-behavioral-science-provider-drift",
  capabilityId: "agent-behavior-adaptation-and-social-dynamics-stability",
  evaluationFrameworkId: "amc-owned-behavioral-agent-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `behavioral-agent-provider:${side}:agent-behavior-canary`,
  metricSuiteId: "behavioral-agent-provider-drift-score-shield-watch",
  metricIds: [
    "planning_success_rate",
    "adaptation_stability",
    "interaction_policy_consistency",
    "safety_behavior_pass_rate",
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
  pipelineRunId: `ai-agent-behavioral-science-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `ai-agent-behavioral-science-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-behavioral-agent-observability-project",
  datastoreId: "amc-owned-behavioral-agent-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 92,
  trajectoryCount: 92,
  scoreMean0to1: side === "baseline" ? 0.812 : 0.806,
  refusalRate0to1: side === "baseline" ? 0.022 : 0.023,
  invalidActionRate0to1: side === "baseline" ? 0.013 : 0.014,
  evaluatorCoverage0to1: side === "baseline" ? 0.989 : 0.986,
  guardrailPassRate0to1: side === "baseline" ? 0.98 : 0.976,
  latencyMsP95: side === "baseline" ? 1330 : 1365,
  costUsdMean: side === "baseline" ? 0.016 : 0.0164,
  evidenceRefs: [`ai-agent-behavioral-science-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:ai-agent-behavioral-science-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1023 AI agent behavioral science provider-drift boundary", () => {
  it("documents live behavioral-science paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1023");
    expect(doc).toContain("AI agent behavioral science");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(NATURE);
    expect(doc).toContain(PDF);
    expect(doc).toContain(CITATION_PDF);
    expect(doc).toContain("Humanities and Social Sciences Communications");
    expect(doc).toContain("publication_date `2026-04-28`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("oa_status `gold`");
    expect(doc).toContain("Creative Commons Attribution 4.0");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("content-length: 1945590");
    expect(doc).toContain("last-modified: Tue, 28 Apr 2026 06:26:25 GMT");
    expect(doc).toContain("Lin Chen");
    expect(doc).toContain("Yunke Zhang");
    expect(doc).toContain("Yibo Ma");
    expect(doc).toContain("Hong Kong University of Science and Technology");
    expect(doc).toContain("Tsinghua University");
    expect(doc).toContain("Cognitive science");
    expect(doc).toContain("Behavioural sciences");
    expect(doc).toContain("Autonomous agent");
    expect(doc).toContain("Behavioral analysis");
    expect(doc).toContain("individual agent");
    expect(doc).toContain("multi-agent");
    expect(doc).toContain("human-agent");
    expect(doc).toContain("responsible AI");
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

  it("uses existing provider-drift evaluator for behavioral-agent canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "behavioral-science-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ai-agent-behavioral-science-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, DOI, CROSSREF, NATURE, PDF],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, DOI, CROSSREF, NATURE, PDF]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when behavioral-science paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "behavioral-science-metadata-only-agent",
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, NATURE, PDF],
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

  it("keeps AI agent behavioral science identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AI agent behavioral science");
    }
  });
});
