import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0920-multi-agent-benchmark-tool-provider-drift.md";
const REPO = "digitalspaceport/Multi-Agent-Benchmark-Tool";
const URL = "https://github.com/digitalspaceport/Multi-Agent-Benchmark-Tool";
const TITLE = "Multi Agent Benchmark Tool";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "multi-agent-benchmark-canary",
  model: "openai-compatible-local-agent-endpoint",
  version: side === "baseline" ? "vllm-2026-06-01" : "llamacpp-2026-06-22",
  canaryId: "multi-agent-benchmark-provider-canary",
  benchmarkFamily: "multi-agent-benchmark-provider-drift",
  capabilityId: "multi-agent-local-endpoint-stability",
  evaluationFrameworkId: "amc-owned-mabt-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `mabt-provider:${side}`,
  metricSuiteId: "mabt-provider-drift-suite",
  metricIds: ["ttft", "tpot", "latency_p95", "rps", "tool_followup_success", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-mabt-provider-drift-canary",
  pipelineRunId: `mabt-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `mabt-canary-${side}`,
  observabilityProjectId: "amc-mabt-observability",
  datastoreId: "amc-owned-mabt-fixtures",
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
  refusalRate0to1: side === "baseline" ? 0.02 : 0.023,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.031,
  evaluatorCoverage0to1: side === "baseline" ? 0.989 : 0.984,
  guardrailPassRate0to1: side === "baseline" ? 0.967 : 0.961,
  latencyMsP95: side === "baseline" ? 1850 : 1960,
  costUsdMean: side === "baseline" ? 0.014 : 0.016,
  evidenceRefs: [`mabt:${side}:canary`],
  signedEvidenceRefs: [`ledger:mabt-${side}`],
  ...overrides,
});

describe("GAP-0920 Multi-Agent Benchmark Tool provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0920");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("5 Commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("mabt.py");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("OpenAI-compatible endpoint");
    expect(doc).toContain("vLLM");
    expect(doc).toContain("llama.cpp");
    expect(doc).toContain("Time-To-First-Token");
    expect(doc).toContain("TTFT");
    expect(doc).toContain("TPOT");
    expect(doc).toContain("Request latency distributions");
    expect(doc).toContain("tool-calling flows");
    expect(doc).toContain("target-total-rps");
    expect(doc).toContain("mabt_benchmark_results.json");
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

  it("uses existing provider-drift evaluator for Multi-Agent Benchmark Tool context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "mabt-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30, maxGuardrailPassRateDrop0to1: 0.02 },
    });
    const pack = buildProviderDriftEvalPack(report, { packId: "provider-drift-mabt-v1", datasetHash: hash("f"), sourceRefs: [URL] });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when benchmark metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "mabt-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL], signedEvidenceRefs: [] })],
      candidate: [baseRow("candidate", {
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
      })],
      thresholds: { minEvaluationMetricCount: 6, minTrajectoryCount: 30 },
    });

    expect(report.recommendation).toBe("alert");
    expect(report.failClosed).toBe(true);
    expect(report.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
      "observabilityPipelineEvidence",
    ]));
  });

  it("keeps benchmark identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("multi_agent_benchmark_provider_drift");
    }
  });
});
