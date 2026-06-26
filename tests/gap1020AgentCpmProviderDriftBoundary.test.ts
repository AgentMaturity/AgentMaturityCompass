import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1020-agentcpm-provider-drift.md";
const REPO = "OpenBMB/AgentCPM";
const URL = "https://github.com/OpenBMB/AgentCPM";
const API = "https://api.github.com/repos/OpenBMB/AgentCPM";
const README = "https://raw.githubusercontent.com/OpenBMB/AgentCPM/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/OpenBMB/AgentCPM/main/LICENSE";
const EXPLORE_DIR_API = "https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Explore?ref=main";
const REPORT_DIR_API = "https://api.github.com/repos/OpenBMB/AgentCPM/contents/AgentCPM-Report?ref=main";
const EXPLORE_HF = "https://huggingface.co/openbmb/AgentCPM-Explore";
const REPORT_HF = "https://huggingface.co/openbmb/AgentCPM-Report";
const EXPLORE_ARXIV = "https://arxiv.org/abs/2602.06485";
const REPORT_ARXIV = "https://arxiv.org/abs/2602.06540";
const HEAD = "4a43561e790c154292798b3edd50171f71241cec";
const README_SHA = "af860ad5bf93c9bf13c97d022c81ade9939a2204";
const LICENSE_SHA = "261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64";
const IDENTIFIER = "agentcpm-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "agentcpm-reviewed-agent-provider",
  model: "long-horizon-agent-canary",
  version: side === "baseline" ? "agentcpm-context-baseline-2026-02" : "agentcpm-provider-refresh-2026-06",
  canaryId: "agentcpm-provider-drift-canary",
  benchmarkFamily: "agentcpm-style-long-horizon-provider-drift",
  capabilityId: "long-horizon-agent-evaluation-stability",
  evaluationFrameworkId: "amc-owned-agentcpm-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `agentcpm-reviewed-provider:${side}:long-horizon-canary`,
  metricSuiteId: "agentcpm-provider-drift-score-shield-watch",
  metricIds: [
    "task_success_rate",
    "tool_call_validity",
    "trace_grounding_rate",
    "refusal_rate",
    "invalid_action_rate",
    "guardrail_pass_rate",
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
  pipelineRunId: `agentcpm-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `agentcpm-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-agentcpm-style-observability-project",
  datastoreId: "amc-owned-agentcpm-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 96,
  trajectoryCount: 96,
  scoreMean0to1: side === "baseline" ? 0.824 : 0.818,
  refusalRate0to1: side === "baseline" ? 0.019 : 0.02,
  invalidActionRate0to1: side === "baseline" ? 0.011 : 0.012,
  evaluatorCoverage0to1: side === "baseline" ? 0.99 : 0.987,
  guardrailPassRate0to1: side === "baseline" ? 0.981 : 0.978,
  latencyMsP95: side === "baseline" ? 1420 : 1455,
  costUsdMean: side === "baseline" ? 0.018 : 0.0186,
  evidenceRefs: [`agentcpm-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:agentcpm-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1020 AgentCPM provider-drift boundary", () => {
  it("documents live AgentCPM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1020");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(EXPLORE_DIR_API);
    expect(doc).toContain(REPORT_DIR_API);
    expect(doc).toContain(EXPLORE_HF);
    expect(doc).toContain(REPORT_HF);
    expect(doc).toContain(EXPLORE_ARXIV);
    expect(doc).toContain(REPORT_ARXIV);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(README_SHA);
    expect(doc).toContain(LICENSE_SHA);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("810 stars");
    expect(doc).toContain("70 forks");
    expect(doc).toContain("7 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-02-09T13:39:47Z`");
    expect(doc).toContain("updated_at `2026-06-24T08:49:56Z`");
    expect(doc).toContain("no latest release");
    expect(doc).toContain("HEAD verification `unsigned`");
    expect(doc).toContain("AgentCPM-Explore");
    expect(doc).toContain("AgentCPM-Report");
    expect(doc).toContain("MiniCPM4.1-8B");
    expect(doc).toContain("4B parameters");
    expect(doc).toContain("AgentDock");
    expect(doc).toContain("AgentRL");
    expect(doc).toContain("AgentToLeaP");
    expect(doc).toContain("GAIA");
    expect(doc).toContain("HLE");
    expect(doc).toContain("BrowseComp");
    expect(doc).toContain("XBench");
    expect(doc).toContain("BASE_URL");
    expect(doc).toContain("API_KEY");
    expect(doc).toContain("MODEL_NAME");
    expect(doc).toContain("config.toml");
    expect(doc).toContain("docker compose up -d");
    expect(doc).toContain("quickstart.py");
    expect(doc).toContain("outputs/quickstart_results/");
    expect(doc).toContain("dialog.json");
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

  it("uses existing provider-drift evaluator for AgentCPM-style long-horizon canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentcpm-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 80,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-agentcpm-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE, EXPLORE_ARXIV, REPORT_ARXIV],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE, EXPLORE_ARXIV, REPORT_ARXIV]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when AgentCPM metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentcpm-metadata-only-agent",
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
          evidenceRefs: [URL, README, LICENSE, EXPLORE_HF, REPORT_HF],
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

  it("keeps AgentCPM identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AgentCPM provider drift");
    }
  });
});
