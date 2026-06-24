import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1009-voltagent-awesome-ai-agent-papers-provider-drift.md";
const REPO = "VoltAgent/awesome-ai-agent-papers";
const URL = "https://github.com/VoltAgent/awesome-ai-agent-papers";
const API = "https://api.github.com/repos/VoltAgent/awesome-ai-agent-papers";
const README = "https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/README.md";
const CONTRIBUTING = "https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/CONTRIBUTING.md";
const LICENSE = "https://raw.githubusercontent.com/VoltAgent/awesome-ai-agent-papers/main/LICENSE";
const HEAD = "d467d6417ca0665f36061cf4c6824d72a670b930";
const README_SHA = "8c8fa7d6b013fdfadb019f8e26f512ed77fbfef5";
const IDENTIFIER = "voltagent-awesome-ai-agent-papers-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "voltagent-reviewed-agent-research-provider",
  model: "agent-research-routing-canary",
  version: side === "baseline" ? "agent-paper-index-baseline-2026-05" : "agent-paper-index-provider-refresh-2026-06",
  canaryId: "awesome-ai-agent-papers-provider-drift-canary",
  benchmarkFamily: "awesome-ai-agent-papers-context-provider-drift",
  capabilityId: "agent-evaluation-research-routing-stability",
  evaluationFrameworkId: "amc-owned-agent-research-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `agent-research-provider:${side}:routing-canary`,
  metricSuiteId: "awesome-agent-paper-provider-drift-score-shield-watch",
  metricIds: [
    "task_success_rate",
    "evaluation_observability_recall",
    "security_topic_precision",
    "citation_grounding_rate",
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
  pipelineRunId: `awesome-ai-agent-papers-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `awesome-ai-agent-papers-experiment-${side}`,
  observabilityProjectId: "amc-agent-research-observability-project",
  datastoreId: "amc-owned-agent-research-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.846 : 0.839,
  refusalRate0to1: side === "baseline" ? 0.021 : 0.022,
  invalidActionRate0to1: side === "baseline" ? 0.012 : 0.013,
  evaluatorCoverage0to1: side === "baseline" ? 0.991 : 0.988,
  guardrailPassRate0to1: side === "baseline" ? 0.982 : 0.979,
  latencyMsP95: side === "baseline" ? 1180 : 1210,
  costUsdMean: side === "baseline" ? 0.012 : 0.0124,
  evidenceRefs: [`awesome-ai-agent-papers-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:awesome-ai-agent-papers-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1009 VoltAgent awesome-ai-agent-papers provider-drift boundary", () => {
  it("documents live VoltAgent awesome-list metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1009");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTRIBUTING);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("1,457 stars");
    expect(doc).toContain("161 forks");
    expect(doc).toContain("6 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-05-25T07:32:17Z`");
    expect(doc).toContain("updated_at `2026-06-24T09:01:27Z`");
    expect(doc).toContain("no latest release");
    expect(doc).toContain("README size `168040`");
    expect(doc).toContain("README sha `8c8fa7d6b013fdfadb019f8e26f512ed77fbfef5`");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("README.md");
    expect(doc).toContain("published in 2026");
    expect(doc).toContain("arXiv");
    expect(doc).toContain("Multi-Agent (53)");
    expect(doc).toContain("Memory & RAG (57)");
    expect(doc).toContain("Eval & Observability (80)");
    expect(doc).toContain("Agent Tooling (95)");
    expect(doc).toContain("AI Agent Security (82)");
    expect(doc).toContain("do not audit, endorse, or guarantee");
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

  it("uses existing provider-drift evaluator for awesome-list research-routing canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "awesome-ai-agent-papers-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-awesome-agent-papers-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, CONTRIBUTING, LICENSE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, CONTRIBUTING, LICENSE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when awesome-list metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "awesome-ai-agent-papers-metadata-only-agent",
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
          evidenceRefs: [URL, README, CONTRIBUTING, LICENSE],
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

  it("keeps VoltAgent awesome-list identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("VoltAgent awesome-list provider drift");
    }
  });
});
