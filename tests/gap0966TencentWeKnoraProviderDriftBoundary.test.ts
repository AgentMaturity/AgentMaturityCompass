import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0966-tencent-weknora-provider-drift.md";
const REPO = "Tencent/WeKnora";
const URL = "https://github.com/Tencent/WeKnora";
const README = "https://raw.githubusercontent.com/Tencent/WeKnora/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/Tencent/WeKnora/main/LICENSE";
const TITLE = "WeKnora";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "tencent-weknora-reviewed-provider",
  model: "rag-agent-provider-canary",
  version: side === "baseline" ? "weknora-provider-2026-06-01" : "weknora-provider-2026-06-22",
  canaryId: "weknora-provider-drift-canary",
  benchmarkFamily: "weknora-llmops-provider-drift",
  capabilityId: "rag-agent-provider-stability",
  evaluationFrameworkId: "amc-owned-weknora-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `weknora-reviewed-provider:${side}:rag-agent`,
  metricSuiteId: "weknora-provider-drift-score-shield-watch",
  metricIds: [
    "score_mean",
    "refusal_rate",
    "invalid_action_rate",
    "evaluator_coverage",
    "guardrail_pass_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `weknora-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `weknora-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-weknora-style-observability-project",
  datastoreId: "amc-owned-weknora-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 72,
  trajectoryCount: 72,
  scoreMean0to1: side === "baseline" ? 0.88 : 0.862,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.035,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.022,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.966 : 0.958,
  latencyMsP95: side === "baseline" ? 1420 : 1535,
  costUsdMean: side === "baseline" ? 0.012 : 0.0128,
  evidenceRefs: [`weknora-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:weknora-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0966 Tencent WeKnora provider-drift boundary", () => {
  it("documents live WeKnora metadata, license posture, and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0966");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("16.5k stars");
    expect(doc).toContain("2.1k forks");
    expect(doc).toContain("201 issues");
    expect(doc).toContain("61 pull requests");
    expect(doc).toContain("2,108 commits");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("enterprise-grade document understanding");
    expect(doc).toContain("semantic retrieval");
    expect(doc).toContain("autonomous reasoning");
    expect(doc).toContain("RAG-based Quick Q&A");
    expect(doc).toContain("ReAct Agent");
    expect(doc).toContain("Wiki Mode");
    expect(doc).toContain("20+ LLM provider integrations");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("DeepSeek");
    expect(doc).toContain("Qwen");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("Langfuse observability");
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

  it("uses existing provider-drift evaluator for WeKnora-style provider routing context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "weknora-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 7,
        minTrajectoryCount: 50,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-weknora-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when WeKnora metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "weknora-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL, README], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL, README, LICENSE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 7,
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

  it("keeps WeKnora identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("weknora-provider-drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
