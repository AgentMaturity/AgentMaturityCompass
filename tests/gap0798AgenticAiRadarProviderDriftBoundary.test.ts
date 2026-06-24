import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  renderProviderDriftBenchmarkMarkdown,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0798-agentic-ai-radar-provider-drift.md";
const SOURCE = "https://github.com/mahmoudrabie/agentic-ai";
const REPO = "mahmoudrabie/agentic-ai";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (
  side: "baseline" | "candidate",
  overrides: Partial<ProviderDriftCanaryRow> = {},
): ProviderDriftCanaryRow => ({
  provider: "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "agentic-ai-radar-provider-canary",
  benchmarkFamily: "agentic-ai-catalog-provider-drift",
  capabilityId: "agent-evaluation-catalog-stability",
  evaluationFrameworkId: "amc-owned-agentic-ai-radar-style-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:agentic-ai-radar`,
  metricSuiteId: "agentic-ai-radar-drift-suite",
  metricIds: ["score_stability", "refusal_rate", "invalid_action_rate", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary",
  pipelineRunId: `agentic-ai-radar-canary-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `agentic-ai-radar-${side}`,
  observabilityProjectId: "amc-provider-drift-watch",
  datastoreId: "amc-owned-agentic-ai-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.9 : 0.885,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.04,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.955,
  guardrailPassRate0to1: side === "baseline" ? 0.97 : 0.962,
  latencyMsP95: side === "baseline" ? 1400 : 1435,
  costUsdMean: side === "baseline" ? 0.005 : 0.0052,
  evidenceRefs: [`agentic-ai-radar:${side}:canary`, `agentic-ai-radar:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:agentic-ai-radar-${side}`],
  ...overrides,
});

describe("GAP-0798 Agentic AI Research Radar provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0798");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REPO);
    expect(doc).toContain("Agentic AI Research Radar");
    expect(doc).toContain("300+ curated agentic AI papers");
    expect(doc).toContain("24 domains");
    expect(doc).toContain("frameworks and orchestration patterns");
    expect(doc).toContain("evaluation, testing, and benchmark resources");
    expect(doc).toContain("security, safety, and governance research");
    expect(doc).toContain("Research");
    expect(doc).toContain("Framework");
    expect(doc).toContain("Security");
    expect(doc).toContain("Testing");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("package.json returned 404");
    expect(doc).toContain("pyproject.toml returned 404");
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

  it("uses existing provider-drift evaluator and observability proof for catalog-informed canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentic-ai-radar-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.03,
      },
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(report.comparisons[0]).toMatchObject({
      baselineEvaluationFrameworkId: "amc-owned-agentic-ai-radar-style-eval",
      candidateEvaluationFrameworkId: "amc-owned-agentic-ai-radar-style-eval",
      baselinePipelineOrchestratorId: "amc-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-provider-drift-canary",
      baselineObservabilityProjectId: "amc-provider-drift-watch",
      candidateObservabilityProjectId: "amc-provider-drift-watch",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-agentic-ai-radar-v1",
      datasetHash: hash("f"),
      sourceRefs: [SOURCE],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "score_stability",
      "refusal_rate",
      "invalid_action_rate",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-agentic-ai-radar-style-eval");
    expect(markdown).toContain("amc-provider-drift-canary");
  });

  it("fails closed when curated-list metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "agentic-ai-radar-reviewed-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [SOURCE],
          signedEvidenceRefs: [],
        }),
      ],
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
          evidenceRefs: [SOURCE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
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

  it("keeps Agentic AI Research Radar identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("agentic_ai_research_radar_provider_drift");
    }
  });
});
