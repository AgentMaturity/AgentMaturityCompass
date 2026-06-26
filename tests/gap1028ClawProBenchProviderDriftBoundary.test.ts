import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-1028-clawprobench-provider-drift.md";
const REPO = "https://github.com/suyoumo/ClawProBench";
const API = "https://api.github.com/repos/suyoumo/ClawProBench";
const README_API = "https://api.github.com/repos/suyoumo/ClawProBench/readme";
const README = "https://raw.githubusercontent.com/suyoumo/ClawProBench/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/suyoumo/ClawProBench/main/LICENSE";
const REQUIREMENTS = "https://raw.githubusercontent.com/suyoumo/ClawProBench/main/requirements.txt";
const HOMEPAGE = "https://suyoumo.github.io/bench/";
const HEAD = "1d7a2bdaf6c3280622c174231a3e9568538fdd3e";
const REPO_NAME = "suyoumo/ClawProBench";
const IDENTIFIER = "clawprobench-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "openclaw-runtime-agent-provider",
  model: "live-runtime-agent-benchmark-canary",
  version: side === "baseline" ? "openclaw-agent-provider-2026-05" : "openclaw-agent-provider-2026-06",
  canaryId: "clawprobench-provider-drift-canary",
  benchmarkFamily: "live-runtime-agent-provider-drift",
  capabilityId: "openclaw-runtime-deterministic-grading-stability",
  evaluationFrameworkId: "amc-owned-live-runtime-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `openclaw-runtime-provider:${side}:clawprobench-canary`,
  metricSuiteId: "live-runtime-provider-drift-score-shield-watch",
  metricIds: [
    "pass_power_3",
    "pass_at_3",
    "average_score",
    "final_score",
    "deterministic_grading_agreement",
    "repeated_trial_reliability",
    "scenario_coverage",
    "refusal_rate",
    "invalid_action_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 11,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `clawprobench-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `clawprobench-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-live-runtime-agent-observability-project",
  datastoreId: "amc-owned-live-runtime-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 102,
  trajectoryCount: 102,
  scoreMean0to1: side === "baseline" ? 0.802 : 0.798,
  refusalRate0to1: side === "baseline" ? 0.016 : 0.017,
  invalidActionRate0to1: side === "baseline" ? 0.018 : 0.019,
  judgeAgreement0to1: side === "baseline" ? 0.94 : 0.937,
  evaluatorCoverage0to1: side === "baseline" ? 0.995 : 0.992,
  guardrailPassRate0to1: side === "baseline" ? 0.982 : 0.98,
  latencyMsP95: side === "baseline" ? 2480 : 2525,
  costUsdMean: side === "baseline" ? 0.061 : 0.0618,
  evidenceRefs: [`clawprobench-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:clawprobench-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-1028 ClawProBench provider-drift boundary", () => {
  it("documents live ClawProBench repository metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1028");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(REQUIREMENTS);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("live-first benchmark harness");
    expect(doc).toContain("OpenClaw runtime");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `785`");
    expect(doc).toContain("Forks `52`");
    expect(doc).toContain("Watchers `12`");
    expect(doc).toContain("open issues `0`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("protected `false`");
    expect(doc).toContain("README sha `66fb39d27cb9d8ed79b02491ad57896b3efb2a16`");
    expect(doc).toContain("Python and Shell");
    expect(doc).toContain("PyYAML>=6.0");
    expect(doc).toContain("fastapi>=0.110");
    expect(doc).toContain("uvicorn>=0.29");
    expect(doc).toContain("homepage HTTP/2 200");
    expect(doc).toContain("content-length: 773115");
    expect(doc).toContain("last-modified: Thu, 18 Jun 2026 15:38:05 GMT");
    expect(doc).toContain("no releases returned");
    expect(doc).toContain("no tags returned");
    expect(doc).toContain("config/openclaw.json.template");
    expect(doc).toContain("config/pricing.yaml");
    expect(doc).toContain("custom_checks");
    expect(doc).toContain("datasets");
    expect(doc).toContain("fixtures");
    expect(doc).toContain("frameworks");
    expect(doc).toContain("harness");
    expect(doc).toContain("mock_tools");
    expect(doc).toContain("scenarios");
    expect(doc).toContain("tests");
    expect(doc).toContain("102 active scenarios");
    expect(doc).toContain("162 catalog scenarios");
    expect(doc).toContain("core profile");
    expect(doc).toContain("deterministic grading");
    expect(doc).toContain("repeated-trial reliability");
    expect(doc).toContain("pass^3");
    expect(doc).toContain("pass@3");
    expect(doc).toContain("FinalScore");
    expect(doc).toContain("avg_score");
    expect(doc).toContain("max_score");
    expect(doc).toContain("cost");
    expect(doc).toContain("latency");
    expect(doc).toContain("resume metadata");
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

  it("uses existing provider-drift evaluator for live-runtime agent canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "clawprobench-reviewed-live-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 96,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-clawprobench-live-runtime-v1",
      datasetHash: hash("f"),
      sourceRefs: [REPO, API, README, REQUIREMENTS, HOMEPAGE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([REPO, API, README, REQUIREMENTS, HOMEPAGE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when ClawProBench metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "clawprobench-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [REPO, API], signedEvidenceRefs: [] })],
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
          evidenceRefs: [REPO, API, README, REQUIREMENTS, HOMEPAGE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 11,
        minTrajectoryCount: 96,
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

  it("keeps ClawProBench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("ClawProBench");
    }
  });
});
