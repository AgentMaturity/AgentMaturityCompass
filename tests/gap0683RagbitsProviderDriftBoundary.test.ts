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

const DOC = "docs/source-reviews/GAP-0683-ragbits-provider-drift.md";
const SOURCE = "https://github.com/deepsense-ai/ragbits";

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
  provider: "litellm",
  model: "gpt-4.1-nano",
  version: side === "baseline" ? "2026-03-31" : "2026-06-21",
  canaryId: "ragbits-rag-provider-canary",
  benchmarkFamily: "rag-agent-provider-drift",
  capabilityId: "multi-provider-rag-guarded-answer",
  evaluationFrameworkId: "ragbits-evaluate",
  evaluationFrameworkVersion: side === "baseline" ? "v1.6.2" : "amc-owned-canary-2026-06-21",
  providerRouteId: `litellm:gpt-4.1-nano:${side}`,
  metricSuiteId: "ragbits-style-rag-eval-suite",
  metricIds: ["answer_relevancy", "faithfulness", "guardrail_pass", "latency", "cost"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "ragbits-cli",
  pipelineRunId: `ragbits-provider-canary-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `ragbits-style-rag-${side}`,
  observabilityProjectId: "ragbits-open-telemetry-canaries",
  datastoreId: "amc-synthetic-rag-corpus",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.89 : 0.875,
  refusalRate0to1: side === "baseline" ? 0.04 : 0.045,
  invalidActionRate0to1: side === "baseline" ? 0.03 : 0.035,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.955,
  guardrailPassRate0to1: side === "baseline" ? 0.97 : 0.965,
  latencyMsP95: side === "baseline" ? 1300 : 1340,
  costUsdMean: side === "baseline" ? 0.004 : 0.0041,
  evidenceRefs: [`ragbits:${side}:canary`, `ragbits:${side}:opentelemetry-export`],
  signedEvidenceRefs: [`ledger:ragbits-${side}`],
  ...overrides,
});

describe("GAP-0683 Ragbits provider-drift boundary", () => {
  it("documents live Ragbits metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0683");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("deepsense-ai/ragbits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("1.6k stars");
    expect(doc).toContain("139 forks");
    expect(doc).toContain("40 issues");
    expect(doc).toContain("10 pull requests");
    expect(doc).toContain("519 commits");
    expect(doc).toContain("38 releases");
    expect(doc).toContain("v1.6.2");
    expect(doc).toContain("Mar 31, 2026");
    expect(doc).toContain("100+ LLMs via LiteLLM");
    expect(doc).toContain("ragbits-evaluate");
    expect(doc).toContain("ragbits-guardrails");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("CLI insights");
    expect(doc).toContain("promptfoo");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator and observability proof for Ragbits-style canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragbits-style-rag-agent",
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
      baselineEvaluationFrameworkId: "ragbits-evaluate",
      candidateEvaluationFrameworkId: "ragbits-evaluate",
      baselinePipelineOrchestratorId: "ragbits-cli",
      candidatePipelineOrchestratorId: "ragbits-cli",
      baselineObservabilityProjectId: "ragbits-open-telemetry-canaries",
      candidateObservabilityProjectId: "ragbits-open-telemetry-canaries",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
      guardrailPassRateDelta0to1: -0.005,
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-ragbits-style-rag-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "answer_relevancy",
      "faithfulness",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("ragbits-evaluate");
    expect(markdown).toContain("ragbits-cli");
  });

  it("fails closed when Ragbits repository metadata is used without AMC-owned proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "ragbits-style-rag-agent",
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
          evidenceRefs: [SOURCE],
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

  it("keeps Ragbits identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Ragbits");
      expect(source).not.toContain("ragbits_provider_drift");
      expect(source).not.toContain("ragbits.deepsense.ai");
      expect(source).not.toContain("deepsense-ai/ragbits");
    }
  });
});
