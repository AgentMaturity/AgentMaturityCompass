import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0984-agentbench-provider-drift.md";
const REPO = "THUDM/AgentBench";
const URL = "https://github.com/THUDM/AgentBench";
const README = "https://raw.githubusercontent.com/THUDM/AgentBench/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/THUDM/AgentBench/main/LICENSE";
const REQUIREMENTS = "https://raw.githubusercontent.com/THUDM/AgentBench/main/requirements.txt";
const HEAD = "d1e4a10db08c87075c78972e48ecc182be03e2d5";
const IDENTIFIER = "agentbench-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "agentbench-reviewed-provider",
  model: "multi-environment-agent-canary",
  version: side === "baseline" ? "agentbench-v0.2-reference" : "agentbench-fc-2025-10-10",
  canaryId: "agentbench-provider-drift-canary",
  benchmarkFamily: "agentbench-style-multi-environment-provider-drift",
  capabilityId: "multi-turn-agent-task-stability",
  evaluationFrameworkId: "amc-owned-agentbench-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `agentbench-reviewed-provider:${side}:multi-env-agent`,
  metricSuiteId: "agentbench-provider-drift-score-shield-watch",
  metricIds: [
    "agent_score_mean",
    "task_success_rate",
    "refusal_rate",
    "invalid_action_rate",
    "tool_call_validity",
    "environment_completion_rate",
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
  pipelineRunId: `agentbench-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `agentbench-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-agentbench-style-observability-project",
  datastoreId: "amc-owned-agentbench-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.842 : 0.831,
  refusalRate0to1: side === "baseline" ? 0.046 : 0.049,
  invalidActionRate0to1: side === "baseline" ? 0.031 : 0.034,
  evaluatorCoverage0to1: side === "baseline" ? 0.981 : 0.976,
  guardrailPassRate0to1: side === "baseline" ? 0.957 : 0.949,
  latencyMsP95: side === "baseline" ? 1810 : 1905,
  costUsdMean: side === "baseline" ? 0.018 : 0.0188,
  evidenceRefs: [`agentbench-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:agentbench-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0984 THUDM/AgentBench provider-drift boundary", () => {
  it("documents live AgentBench metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0984");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("3,512 stars");
    expect(doc).toContain("263 forks");
    expect(doc).toContain("74 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-02-08T17:01:05Z`");
    expect(doc).toContain("AgentBench FC");
    expect(doc).toContain("AgentRL");
    expect(doc).toContain("function-calling");
    expect(doc).toContain("alfworld");
    expect(doc).toContain("dbbench");
    expect(doc).toContain("knowledgegraph");
    expect(doc).toContain("os_interaction");
    expect(doc).toContain("webshop");
    expect(doc).toContain("Docker Compose");
    expect(doc).toContain("VisualAgentBench");
    expect(doc).toContain("8 distinct environments");
    expect(doc).toContain("Dev and Test");
    expect(doc).toContain("No releases published");
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

  it("uses existing provider-drift evaluator for AgentBench-style multi-environment canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentbench-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-agentbench-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE, REQUIREMENTS],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE, REQUIREMENTS]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when AgentBench metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentbench-metadata-only-agent",
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
          evidenceRefs: [URL, README, LICENSE, REQUIREMENTS],
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

  it("keeps AgentBench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AgentBench FC");
    }
  });
});
