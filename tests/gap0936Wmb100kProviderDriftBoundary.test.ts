import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0936-wmb-100k-provider-drift.md";
const REPO = "Irina1920/WMB-100K";
const URL = "https://github.com/Irina1920/WMB-100K";
const TITLE = "WMB-100K";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "local",
  model: "memory-system-reviewed-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "wmb100k-provider-drift-canary",
  benchmarkFamily: "wmb-100k-memory-provider-drift",
  capabilityId: "long-context-memory-retrieval-stability",
  evaluationFrameworkId: "amc-owned-wmb100k-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `local:memory-system-reviewed-agent:${side}:wmb100k`,
  metricSuiteId: "wmb100k-memory-drift-suite",
  metricIds: [
    "memory_score",
    "false_memory_defense",
    "judge_agreement",
    "retrieval_accuracy",
    "latency",
    "cost",
  ],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "majority",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-wmb100k-provider-drift-canary",
  pipelineRunId: `wmb100k-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `wmb100k-canary-${side}`,
  observabilityProjectId: "amc-wmb100k-observability",
  datastoreId: "amc-owned-wmb100k-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 48,
  trajectoryCount: 48,
  scoreMean0to1: side === "baseline" ? 0.842 : 0.828,
  refusalRate0to1: side === "baseline" ? 0.02 : 0.024,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.022,
  evaluatorCoverage0to1: side === "baseline" ? 0.99 : 0.984,
  guardrailPassRate0to1: side === "baseline" ? 0.966 : 0.959,
  latencyMsP95: side === "baseline" ? 1850 : 1990,
  costUsdMean: side === "baseline" ? 0.019 : 0.0205,
  evidenceRefs: [`wmb100k:${side}:canary`],
  signedEvidenceRefs: [`ledger:wmb100k-${side}`],
  ...overrides,
});

describe("GAP-0936 WMB-100K provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0936");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("master");
    expect(doc).toContain("Star 13");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("1 Commit");
    expect(doc).toContain("datasets");
    expect(doc).toContain("documents");
    expect(doc).toContain("scripts");
    expect(doc).toContain("src");
    expect(doc).toContain("COMPARISON.md");
    expect(doc).toContain("Cargo.lock");
    expect(doc).toContain("Cargo.toml");
    expect(doc).toContain("README.md");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Rust 81.8%");
    expect(doc).toContain("Python 18.2%");
    expect(doc).toContain("100,000-turn benchmark");
    expect(doc).toContain("4.3M tokens");
    expect(doc).toContain("2,708 questions");
    expect(doc).toContain("105,591 turns");
    expect(doc).toContain("situational retrieval accuracy");
    expect(doc).toContain("false memory defense");
    expect(doc).toContain("GPT-4o-mini semantic judge");
    expect(doc).toContain("3 LLMs majority vote");
    expect(doc).toContain("Claude Haiku");
    expect(doc).toContain("Gemini Flash");
    expect(doc).toContain("Speed Penalty");
    expect(doc).toContain("vendor-created benchmark");
    expect(doc).toContain("Apache 2.0");
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

  it("uses existing provider-drift evaluator for WMB-100K memory benchmark context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "wmb100k-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 40,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-wmb100k-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when WMB-100K metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "wmb100k-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 40 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).failClosed).toBe(true);
  });

  it("keeps WMB-100K identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("wmb100k_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
