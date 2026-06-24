import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0879-multiagenteval-provider-drift.md";
const REPO = "najeed/ai-agent-eval-harness";
const URL = "https://github.com/najeed/ai-agent-eval-harness";
const TITLE = "MultiAgentEval - The Enterprise-Grade Reliability Framework for AI Agents";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "local",
  model: "multiagentops-reviewed-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-22",
  canaryId: "multiagenteval-provider-canary",
  benchmarkFamily: "multiagenteval-provider-drift",
  capabilityId: "business-workflow-agent-stability",
  evaluationFrameworkId: "amc-owned-multiagenteval-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `local:multiagentops-reviewed-agent:${side}:multiagenteval`,
  metricSuiteId: "multiagenteval-drift-suite",
  metricIds: ["task_success", "trace_replay_quality", "pii_redaction_quality", "judge_agreement", "scenario_regression", "latency", "cost"],
  metricCount: 7,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-multiagenteval-provider-drift-canary",
  pipelineRunId: `multiagenteval-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `multiagenteval-canary-${side}`,
  observabilityProjectId: "amc-multiagenteval-observability",
  datastoreId: "amc-owned-multiagenteval-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.835 : 0.82,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.035,
  invalidActionRate0to1: side === "baseline" ? 0.024 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.986 : 0.981,
  guardrailPassRate0to1: side === "baseline" ? 0.963 : 0.957,
  latencyMsP95: side === "baseline" ? 2140 : 2280,
  costUsdMean: side === "baseline" ? 0.024 : 0.0255,
  evidenceRefs: [`multiagenteval:${side}:canary`],
  signedEvidenceRefs: [`ledger:multiagenteval-${side}`],
  ...overrides,
});

describe("GAP-0879 MultiAgentEval provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0879");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("TESTING.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 30");
    expect(doc).toContain("Fork 7");
    expect(doc).toContain("Issues 15");
    expect(doc).toContain("Pull requests 2");
    expect(doc).toContain("252 Commits");
    expect(doc).toContain("1 tags");
    expect(doc).toContain("Python 88.9%");
    expect(doc).toContain("JavaScript 10.4%");
    expect(doc).toContain("Other 0.7%");
    expect(doc).toContain("benchmarks");
    expect(doc).toContain("dashboard");
    expect(doc).toContain("dataproc_engine");
    expect(doc).toContain("eval_runner");
    expect(doc).toContain("industries");
    expect(doc).toContain("reports");
    expect(doc).toContain("sample_agent");
    expect(doc).toContain("scenarios");
    expect(doc).toContain("schemas");
    expect(doc).toContain("spec/ aes");
    expect(doc).toContain("ui/ visual-debugger");
    expect(doc).toContain("vscode-extension");
    expect(doc).toContain("deep-trace replay debugging");
    expect(doc).toContain("20-Shim Enterprise Suite");
    expect(doc).toContain("5,000+ scenarios");
    expect(doc).toContain("Agent Eval Specification");
    expect(doc).toContain("import-drift");
    expect(doc).toContain("model-based scoring");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Gemini");
    expect(doc).toContain("Claude");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("PII/Secret Redaction");
    expect(doc).toContain("WORM Logs");
    expect(doc).toContain("OTEL Drift Gauges");
    expect(doc).toContain("AES Scenario Merkle Sync");
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

  it("uses existing provider-drift evaluator for MultiAgentEval context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "multiagenteval-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-multiagenteval-v1",
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

  it("fails closed when MultiAgentEval metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "multiagenteval-reviewed-agent",
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

  it("keeps MultiAgentEval identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("multiagenteval_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
