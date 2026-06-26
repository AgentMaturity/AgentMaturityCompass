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

const DOC = "docs/source-reviews/GAP-0013-langwatch-provider-drift.md";
const HOMEPAGE = "https://langwatch.ai";
const CANONICAL = "https://langwatch.ai/";
const DOCS = "https://docs.langwatch.ai/";
const INTRO = "https://langwatch.ai/docs/introduction";
const EVALUATIONS = "https://langwatch.ai/docs/evaluations/overview";
const TITLE = "LangWatch";
const IDENTIFIER = "langwatch_provider_drift";

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
  model: "gpt-4.1",
  version: side === "baseline" ? "2026-06-01" : "2026-06-24",
  canaryId: "langwatch-style-agent-eval-canary",
  benchmarkFamily: "agent-evaluation-provider-model-drift",
  capabilityId: "score-shield-watch-agent-quality",
  evaluationFrameworkId: "amc-owned-langwatch-style-eval-gate",
  evaluationFrameworkVersion: "2026.06.25",
  providerRouteId: `openai:gpt-4.1:${side}:langwatch-agent-eval-canary`,
  metricSuiteId: "provider-drift-score-refusal-latency-cost-suite",
  metricIds: ["quality_score", "refusal_rate", "guardrail_pass", "p95_latency", "mean_cost", "simulation_success"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash("c"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "d" : "e"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `langwatch-style-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `langwatch-style-agent-eval-${side}`,
  observabilityProjectId: "amc-langwatch-style-observability",
  datastoreId: "amc-owned-agent-eval-dataset",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 64,
  trajectoryCount: 64,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.845,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.027,
  judgeAgreement0to1: side === "baseline" ? 0.92 : 0.91,
  unjudgedPredictionRate0to1: side === "baseline" ? 0.03 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.955,
  guardrailPassRate0to1: side === "baseline" ? 0.97 : 0.965,
  latencyMsP95: side === "baseline" ? 1800 : 1880,
  costUsdMean: side === "baseline" ? 0.01 : 0.0104,
  evidenceRefs: [`langwatch-style:${side}:provider-version`, `langwatch-style:${side}:canary-results`],
  signedEvidenceRefs: [`ledger:langwatch-style-${side}`],
  ...overrides,
});

describe("GAP-0013 LangWatch provider-drift boundary", () => {
  it("documents live LangWatch metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0013");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(CANONICAL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(INTRO);
    expect(doc).toContain(EVALUATIONS);
    expect(doc).toContain("LangWatch: AI Agent Testing and LLM Evaluation Platform");
    expect(doc).toContain("LangWatch: The Complete LLMOps Platform");
    expect(doc).toContain("Evaluations Overview");
    expect(doc).toContain("production traces into evals");
    expect(doc).toContain("compare prompts and models");
    expect(doc).toContain("agent simulations");
    expect(doc).toContain("CI/CD gate");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("provider version");
    expect(doc).toContain("canary results");
    expect(doc).toContain("drift statistic");
    expect(doc).toContain("alert or waiver");
    expect(doc).toContain("metadata-only LangWatch evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts LangWatch context only through signed provider-drift canary receipts", () => {
    const report = runProviderDriftBenchmark({
      agentId: "langwatch-context-agent",
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
      provider: "openai",
      model: "gpt-4.1",
      baselineVersion: "2026-06-01",
      candidateVersion: "2026-06-24",
      baselineProviderRouteId: "openai:gpt-4.1:baseline:langwatch-agent-eval-canary",
      candidateProviderRouteId: "openai:gpt-4.1:candidate:langwatch-agent-eval-canary",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-langwatch-style-v1",
      datasetHash: hash("f"),
      sourceRefs: [HOMEPAGE, CANONICAL, DOCS, INTRO, EVALUATIONS],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([HOMEPAGE, CANONICAL, DOCS, INTRO, EVALUATIONS]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.signedEvidenceRefs).toEqual(["ledger:langwatch-style-baseline", "ledger:langwatch-style-candidate"]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" })).toMatchObject({
      passed: true,
      failClosed: false,
    });

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Provider Drift Benchmark");
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-langwatch-style-eval-gate");
  });

  it("fails closed when LangWatch metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "langwatch-context-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [HOMEPAGE],
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
          evidenceRefs: [HOMEPAGE, INTRO, EVALUATIONS],
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

  it("keeps LangWatch identifiers out of provider-drift implementation modules", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(HOMEPAGE);
      expect(source).not.toContain("COMP-009");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
