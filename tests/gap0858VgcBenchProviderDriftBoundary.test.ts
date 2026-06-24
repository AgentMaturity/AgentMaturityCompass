import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0858-vgc-bench-provider-drift.md";
const REPO = "cameronangliss/vgc-bench";
const URL = "https://github.com/cameronangliss/vgc-bench";
const ARXIV = "https://arxiv.org/abs/2506.10326";
const TITLE = "VGC-Bench: Towards Mastering Diverse Team Strategies in Competitive Pokemon";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "vgc-bench-provider-canary",
  benchmarkFamily: "vgc-bench-provider-drift",
  capabilityId: "multi-agent-game-strategy-stability",
  evaluationFrameworkId: "amc-owned-vgc-bench-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:vgc`,
  metricSuiteId: "vgc-bench-drift-suite",
  metricIds: ["strategy_score", "refusal_rate", "latency", "cost", "cross_play", "generalization"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-vgc-bench-provider-drift-canary",
  pipelineRunId: `vgc-bench-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `vgc-bench-canary-${side}`,
  observabilityProjectId: "amc-vgc-bench-observability",
  datastoreId: "amc-owned-vgc-bench-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.82 : 0.803,
  refusalRate0to1: side === "baseline" ? 0.028 : 0.033,
  invalidActionRate0to1: side === "baseline" ? 0.026 : 0.031,
  evaluatorCoverage0to1: side === "baseline" ? 0.984 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.961 : 0.954,
  latencyMsP95: side === "baseline" ? 2140 : 2290,
  costUsdMean: side === "baseline" ? 0.025 : 0.027,
  evidenceRefs: [`vgc-bench:${side}:canary`],
  signedEvidenceRefs: [`ledger:vgc-bench-${side}`],
  ...overrides,
});

describe("GAP-0858 VGC-Bench provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0858");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 45");
    expect(doc).toContain("Fork 14");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("903 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 95.3%");
    expect(doc).toContain("Shell 3.0%");
    expect(doc).toContain("PowerShell 1.7%");
    expect(doc).toContain("pokemon");
    expect(doc).toContain("reinforcement-learning");
    expect(doc).toContain("game-theory");
    expect(doc).toContain("multi-agent-learning");
    expect(doc).toContain("multi-agent reinforcement learning");
    expect(doc).toContain("4 Policy Space Response Oracle");
    expect(doc).toContain("behavior cloning");
    expect(doc).toContain("Large Language Model player");
    expect(doc).toContain("3 heuristic players");
    expect(doc).toContain("Pokemon Showdown");
    expect(doc).toContain("open team sheets");
    expect(doc).toContain("cross-play evaluation");
    expect(doc).toContain("performance test");
    expect(doc).toContain("generalization test");
    expect(doc).toContain("ranking algorithm");
    expect(doc).toContain("200 battles");
    expect(doc).toContain("5 independent training runs");
    expect(doc).toContain("1000 total battles");
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

  it("uses existing provider-drift evaluator for VGC-Bench-style strategy context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "vgc-bench-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-vgc-bench-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, ARXIV],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, ARXIV]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when VGC-Bench metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "vgc-bench-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL, ARXIV], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL, ARXIV],
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

  it("keeps VGC-Bench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("vgc_bench_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
