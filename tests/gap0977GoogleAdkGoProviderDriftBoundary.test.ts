import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0977-google-adk-go-provider-drift.md";
const REPO = "google/adk-go";
const URL = "https://github.com/google/adk-go";
const README = "https://raw.githubusercontent.com/google/adk-go/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/google/adk-go/main/LICENSE";
const GOMOD = "https://raw.githubusercontent.com/google/adk-go/main/go.mod";
const HEAD = "53502666c10261bdd2a95f56eddec3562333717f";
const RELEASE = "v1.4.0";
const MODULE = "google.golang.org/adk";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "google-adk-go-reviewed-provider",
  model: "cloud-native-agent-runtime-canary",
  version: side === "baseline" ? "adk-go-v1.3.0" : "adk-go-v1.4.0",
  canaryId: "google-adk-go-provider-drift-canary",
  benchmarkFamily: "google-adk-go-agent-runtime-provider-drift",
  capabilityId: "cloud-native-go-agent-runtime-stability",
  evaluationFrameworkId: "amc-owned-google-adk-go-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `google-adk-go-reviewed-provider:${side}:agent-runtime`,
  metricSuiteId: "google-adk-go-provider-drift-score-shield-watch",
  metricIds: [
    "agent_score_mean",
    "tool_call_validity",
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
  pipelineRunId: `google-adk-go-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `google-adk-go-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-google-adk-go-style-observability-project",
  datastoreId: "amc-owned-google-adk-go-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 80,
  trajectoryCount: 80,
  scoreMean0to1: side === "baseline" ? 0.89 : 0.872,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.039,
  invalidActionRate0to1: side === "baseline" ? 0.017 : 0.021,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.978,
  guardrailPassRate0to1: side === "baseline" ? 0.967 : 0.958,
  latencyMsP95: side === "baseline" ? 1390 : 1505,
  costUsdMean: side === "baseline" ? 0.013 : 0.0137,
  evidenceRefs: [`google-adk-go-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:google-adk-go-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0977 google/adk-go provider-drift boundary", () => {
  it("documents live ADK-Go metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0977");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(GOMOD);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(MODULE);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Go");
    expect(doc).toContain("8,230 stars");
    expect(doc).toContain("719 forks");
    expect(doc).toContain("101 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2026-06-24T10:30:13Z`");
    expect(doc).toContain("release `v1.4.0` published `2026-05-29T13:45:25Z`");
    expect(doc).toContain("go 1.25.0");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("Vertex AI");
    expect(doc).toContain("A2A");
    expect(doc).toContain("MCP");
    expect(doc).toContain("multi-agent systems");
    expect(doc).toContain("telemetry");
    expect(doc).toContain("model-agnostic");
    expect(doc).toContain("deployment-agnostic");
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

  it("uses existing provider-drift evaluator for ADK-Go-style agent runtime context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "google-adk-go-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 60,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-google-adk-go-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE, GOMOD],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE, GOMOD]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when ADK-Go metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "google-adk-go-metadata-only-agent",
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
          evidenceRefs: [URL, README, LICENSE, GOMOD],
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

  it("keeps ADK-Go identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("google-adk-go-provider-drift");
      expect(source).not.toContain(MODULE);
    }
  });
});
