import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0849-spark-dashboard-provider-drift.md";
const REPO = "niklasfrick/spark-dashboard";
const URL = "https://github.com/niklasfrick/spark-dashboard";
const TITLE = "Spark Dashboard";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "vllm" : "vllm",
  model: "llama-3.1-70b-instruct",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "spark-dashboard-provider-canary",
  benchmarkFamily: "spark-dashboard-provider-drift",
  capabilityId: "llm-inference-monitoring-stability",
  evaluationFrameworkId: "amc-owned-spark-dashboard-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `vllm:llama-3.1-70b:${side}:spark-dashboard`,
  metricSuiteId: "spark-dashboard-drift-suite",
  metricIds: ["score", "refusal_rate", "latency", "cost", "time_to_first_token", "gpu_queue_pressure"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-spark-dashboard-provider-drift-canary",
  pipelineRunId: `spark-dashboard-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `spark-dashboard-canary-${side}`,
  observabilityProjectId: "amc-spark-dashboard-observability",
  datastoreId: "amc-owned-spark-dashboard-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.842 : 0.829,
  refusalRate0to1: side === "baseline" ? 0.036 : 0.041,
  invalidActionRate0to1: side === "baseline" ? 0.027 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.981,
  guardrailPassRate0to1: side === "baseline" ? 0.962 : 0.957,
  latencyMsP95: side === "baseline" ? 2110 : 2250,
  costUsdMean: side === "baseline" ? 0.023 : 0.0245,
  evidenceRefs: [`spark-dashboard:${side}:canary`],
  signedEvidenceRefs: [`ledger:spark-dashboard-${side}`],
  ...overrides,
});

describe("GAP-0849 Spark Dashboard provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0849");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("62");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("ai-monitoring");
    expect(doc).toContain("gpu-monitoring");
    expect(doc).toContain("llm-monitoring");
    expect(doc).toContain("observability");
    expect(doc).toContain("vllm");
    expect(doc).toContain("Real-time hardware and LLM inference monitoring");
    expect(doc).toContain("GPU");
    expect(doc).toContain("CPU");
    expect(doc).toContain("memory");
    expect(doc).toContain("Rust");
    expect(doc).toContain("React");
    expect(doc).toContain("WebSocket");
    expect(doc).toContain("Prometheus");
    expect(doc).toContain("tokens per second");
    expect(doc).toContain("time to first token");
    expect(doc).toContain("inter-token latency");
    expect(doc).toContain("end-to-end latency");
    expect(doc).toContain("queue time");
    expect(doc).toContain("KV cache utilization");
    expect(doc).toContain("SLO Goodput");
    expect(doc).toContain("Multi-Engine Support");
    expect(doc).toContain("provider chips");
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

  it("uses existing provider-drift evaluator for Spark Dashboard-style inference monitoring context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "spark-dashboard-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-spark-dashboard-v1",
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

  it("fails closed when Spark Dashboard metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "spark-dashboard-reviewed-agent",
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
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
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

  it("keeps Spark Dashboard identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("spark_dashboard_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
