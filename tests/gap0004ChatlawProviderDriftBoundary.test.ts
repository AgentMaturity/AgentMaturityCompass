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

const DOC = "docs/source-reviews/GAP-0004-chatlaw-provider-drift.md";
const OPENALEX = "https://openalex.org/W4382618722";
const OPENALEX_API = "https://api.openalex.org/works/W4382618722";
const DOI = "https://doi.org/10.1016/j.fmre.2026.03.026";
const DOI_VALUE = "10.1016/j.fmre.2026.03.026";
const CROSSREF = "https://api.crossref.org/works/10.1016/j.fmre.2026.03.026";
const ELSEVIER = "https://linkinghub.elsevier.com/retrieve/pii/S2667325826004048";
const ARXIV = "https://arxiv.org/abs/2306.16092";
const TITLE = "Chatlaw: A Multi-Agent Legal Assistant based on a Role-Aligned Mixture-of-Experts Architecture";
const IDENTIFIER = "chatlaw_provider_drift";

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
  provider: "anthropic",
  model: "claude-4-sonnet",
  version: side === "baseline" ? "2026-06-01" : "2026-06-24",
  canaryId: "chatlaw-style-legal-agent-canary",
  benchmarkFamily: "legal-multi-agent-provider-model-drift",
  capabilityId: "legal-consultation-groundedness-and-refusal",
  evaluationFrameworkId: "amc-owned-chatlaw-style-legal-agent-eval",
  evaluationFrameworkVersion: "2026.06.25",
  providerRouteId: `anthropic:claude-4-sonnet:${side}:legal-agent-canary`,
  metricSuiteId: "legal-agent-provider-drift-suite",
  metricIds: [
    "legal_groundedness",
    "hallucination_refusal",
    "role_handoff_quality",
    "guardrail_pass",
    "p95_latency",
    "mean_cost",
  ],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash("c"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "d" : "e"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-legal-agent-provider-drift-canary",
  pipelineRunId: `chatlaw-style-legal-canary-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `chatlaw-style-legal-agent-${side}`,
  observabilityProjectId: "amc-chatlaw-style-observability",
  datastoreId: "amc-owned-legal-agent-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 52,
  trajectoryCount: 52,
  scoreMean0to1: side === "baseline" ? 0.83 : 0.812,
  refusalRate0to1: side === "baseline" ? 0.055 : 0.061,
  invalidActionRate0to1: side === "baseline" ? 0.028 : 0.031,
  judgeAgreement0to1: side === "baseline" ? 0.9 : 0.895,
  evaluatorCoverage0to1: side === "baseline" ? 0.94 : 0.936,
  guardrailPassRate0to1: side === "baseline" ? 0.955 : 0.948,
  latencyMsP95: side === "baseline" ? 2400 : 2505,
  costUsdMean: side === "baseline" ? 0.018 : 0.0187,
  evidenceRefs: [`chatlaw-style:${side}:provider-version`, `chatlaw-style:${side}:canary-results`],
  signedEvidenceRefs: [`ledger:chatlaw-style-${side}`],
  ...overrides,
});

describe("GAP-0004 Chatlaw provider-drift boundary", () => {
  it("documents live Chatlaw metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0004");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ELSEVIER);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("publication year `2026`");
    expect(doc).toContain("publication date `2026-05-01`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("OpenAlex type `preprint`");
    expect(doc).toContain("Fundamental Research");
    expect(doc).toContain("Elsevier BV");
    expect(doc).toContain("OpenAlex OA status `gold`");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Language model");
    expect(doc).toContain("Information retrieval");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("provider version");
    expect(doc).toContain("canary results");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert or waiver");
    expect(doc).toContain("metadata-only Chatlaw evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Chatlaw context only through signed provider-drift canary receipts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "chatlaw-context-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        maxScoreDrop0to1: 0.03,
        maxRefusalRateIncrease0to1: 0.02,
        maxLatencyIncreaseRatio: 0.1,
        maxCostIncreaseRatio: 0.1,
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 40,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.comparisons[0]).toMatchObject({
      provider: "anthropic",
      model: "claude-4-sonnet",
      baselineVersion: "2026-06-01",
      candidateVersion: "2026-06-24",
      baselineProviderRouteId: "anthropic:claude-4-sonnet:baseline:legal-agent-canary",
      candidateProviderRouteId: "anthropic:claude-4-sonnet:candidate:legal-agent-canary",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-chatlaw-style-v1",
      datasetHash: hash("f"),
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, ELSEVIER, ARXIV],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([OPENALEX, OPENALEX_API, DOI, CROSSREF, ELSEVIER, ARXIV]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.signedEvidenceRefs).toEqual(["ledger:chatlaw-style-baseline", "ledger:chatlaw-style-candidate"]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" })).toMatchObject({
      passed: true,
      failClosed: false,
    });

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Provider Drift Benchmark");
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-chatlaw-style-legal-agent-eval");
  });

  it("fails closed when Chatlaw metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "chatlaw-context-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [OPENALEX, DOI],
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
          evidenceRefs: [OPENALEX, DOI, CROSSREF, ARXIV],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 40,
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
    expect(buildProviderDriftWatchAlerts(report).length).toBeGreaterThan(0);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps Chatlaw identifiers out of provider-drift implementation modules", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain("W4382618722");
      expect(source).not.toContain("Chatlaw");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
