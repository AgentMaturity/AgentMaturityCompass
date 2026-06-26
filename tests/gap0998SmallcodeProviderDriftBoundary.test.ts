import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0998-smallcode-provider-drift.md";
const REPO = "Doorman11991/smallcode";
const URL = "https://github.com/Doorman11991/smallcode";
const API = "https://api.github.com/repos/Doorman11991/smallcode";
const README = "https://raw.githubusercontent.com/Doorman11991/smallcode/master/README.md";
const LICENSE_API = "https://api.github.com/repos/Doorman11991/smallcode/license";
const PACKAGE_JSON = "https://raw.githubusercontent.com/Doorman11991/smallcode/master/package.json";
const RELEASE = "v1.6.0";
const HEAD = "c3fc7baa149129b35e36a3d5623d123e926003ed";
const IDENTIFIER = "smallcode-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "smallcode-reviewed-provider",
  model: "small-llm-coding-agent-canary",
  version: side === "baseline" ? "smallcode-v1.5-reference" : "smallcode-v1.6-provider-refresh",
  canaryId: "smallcode-provider-drift-canary",
  benchmarkFamily: "smallcode-style-small-llm-coding-agent-provider-drift",
  capabilityId: "small-llm-tool-use-coding-stability",
  evaluationFrameworkId: "amc-owned-smallcode-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `smallcode-reviewed-provider:${side}:coding-agent-route`,
  metricSuiteId: "smallcode-provider-drift-score-shield-watch",
  metricIds: [
    "coding_task_success_rate",
    "tool_sequence_validity",
    "refusal_rate",
    "invalid_action_rate",
    "evaluator_coverage",
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
  pipelineRunId: `smallcode-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `smallcode-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-smallcode-style-observability-project",
  datastoreId: "amc-owned-smallcode-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 64,
  trajectoryCount: 64,
  scoreMean0to1: side === "baseline" ? 0.816 : 0.807,
  refusalRate0to1: side === "baseline" ? 0.042 : 0.044,
  invalidActionRate0to1: side === "baseline" ? 0.036 : 0.039,
  evaluatorCoverage0to1: side === "baseline" ? 0.982 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.964 : 0.957,
  latencyMsP95: side === "baseline" ? 1320 : 1395,
  costUsdMean: side === "baseline" ? 0.003 : 0.0032,
  evidenceRefs: [`smallcode-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:smallcode-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0998 smallcode provider-drift boundary", () => {
  it("documents live smallcode metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0998");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(PACKAGE_JSON);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain("MIT License");
    expect(doc).toContain("JavaScript");
    expect(doc).toContain("1,926 stars");
    expect(doc).toContain("144 forks");
    expect(doc).toContain("18 open issues");
    expect(doc).toContain("default branch `master`");
    expect(doc).toContain("pushed_at `2026-06-20T04:11:30Z`");
    expect(doc).toContain("release `v1.6.0` published `2026-05-31T05:35:24Z`");
    expect(doc).toContain("package version `1.6.0`");
    expect(doc).toContain("8B-35B");
    expect(doc).toContain("OpenAI-compatible endpoint");
    expect(doc).toContain("adaptive routing");
    expect(doc).toContain("provider wizard");
    expect(doc).toContain("structured traces");
    expect(doc).toContain("MCP");
    expect(doc).toContain("bench scripts");
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

  it("uses existing provider-drift evaluator for small-LLM coding-agent canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "smallcode-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 60,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-smallcode-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE_API, PACKAGE_JSON],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE_API, PACKAGE_JSON]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when smallcode metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "smallcode-metadata-only-agent",
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
          evidenceRefs: [URL, README, LICENSE_API, PACKAGE_JSON],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 60,
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

  it("keeps smallcode identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("SmallCode provider drift");
    }
  });
});
