import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0875-redthread-provider-drift.md";
const REPO = "matheusht/redthread";
const URL = "https://github.com/matheusht/redthread";
const TITLE = "RedThread";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "local",
  model: "red-team-target-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "redthread-provider-canary",
  benchmarkFamily: "redthread-provider-drift",
  capabilityId: "red-team-evidence-loop-stability",
  evaluationFrameworkId: "amc-owned-redthread-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `local:red-team-target-agent:${side}:redthread`,
  metricSuiteId: "redthread-drift-suite",
  metricIds: ["attack_success_rate", "judge_agreement", "replay_block_rate", "semantic_drift", "response_consistency", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-redthread-provider-drift-canary",
  pipelineRunId: `redthread-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `redthread-canary-${side}`,
  observabilityProjectId: "amc-redthread-observability",
  datastoreId: "amc-owned-redthread-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.83 : 0.815,
  refusalRate0to1: side === "baseline" ? 0.034 : 0.039,
  invalidActionRate0to1: side === "baseline" ? 0.026 : 0.032,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.961 : 0.955,
  latencyMsP95: side === "baseline" ? 2180 : 2320,
  costUsdMean: side === "baseline" ? 0.026 : 0.0275,
  evidenceRefs: [`redthread:${side}:canary`],
  signedEvidenceRefs: [`ledger:redthread-${side}`],
  ...overrides,
});

describe("GAP-0875 RedThread provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0875");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 35");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("255 Commits");
    expect(doc).toContain("RedThread Security Scan v0.1.0 Latest May 13, 2026");
    expect(doc).toContain("Python 96.7%");
    expect(doc).toContain("HTML 3.0%");
    expect(doc).toContain("Other 0.3%");
    expect(doc).toContain(".agent");
    expect(doc).toContain(".agents/ plugins");
    expect(doc).toContain(".clarity-protocol");
    expect(doc).toContain(".codex");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("artifacts");
    expect(doc).toContain("autoresearch/ templates");
    expect(doc).toContain("plugins/ caveman");
    expect(doc).toContain("src/ redthread");
    expect(doc).toContain("test_pyrit.py");
    expect(doc).toContain("attack generation");
    expect(doc).toContain("target execution");
    expect(doc).toContain("judge scoring");
    expect(doc).toContain("defense synthesis");
    expect(doc).toContain("replay validation");
    expect(doc).toContain("promotion evidence");
    expect(doc).toContain("semantic drift");
    expect(doc).toContain("response consistency");
    expect(doc).toContain("latency / token anomalies");
    expect(doc).toContain("canary probe variance");
    expect(doc).toContain("tool poisoning");
    expect(doc).toContain("confused-deputy delegation");
    expect(doc).toContain("pre-action authorization");
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

  it("uses existing provider-drift evaluator for RedThread context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "redthread-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-redthread-v1",
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

  it("fails closed when RedThread metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "redthread-reviewed-agent",
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

  it("keeps RedThread identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("redthread_provider_drift");
      expect(source).not.toContain("RedThread Security Scan");
    }
  });
});
