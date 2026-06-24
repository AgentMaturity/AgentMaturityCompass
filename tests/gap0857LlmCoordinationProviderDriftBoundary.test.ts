import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0857-llm-coordination-provider-drift.md";
const REPO = "UCSB-AI/llm_coordination";
const URL = "https://github.com/UCSB-AI/llm_coordination";
const TITLE = "LLM-Coordination: Evaluating and Analyzing Multi-agent Coordination Abilities in Large Language Models";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "anthropic" : "anthropic",
  model: "claude-3-5-sonnet",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "llm-coordination-provider-canary",
  benchmarkFamily: "llm-coordination-provider-drift",
  capabilityId: "multi-agent-coordination-stability",
  evaluationFrameworkId: "amc-owned-llm-coordination-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `anthropic:claude-3-5-sonnet:${side}:coordination`,
  metricSuiteId: "llm-coordination-drift-suite",
  metricIds: ["coordination_score", "refusal_rate", "latency", "cost", "agentic_coordination", "coordination_qa"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-llm-coordination-provider-drift-canary",
  pipelineRunId: `llm-coordination-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `llm-coordination-canary-${side}`,
  observabilityProjectId: "amc-llm-coordination-observability",
  datastoreId: "amc-owned-llm-coordination-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.83 : 0.812,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.035,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.031,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.979,
  guardrailPassRate0to1: side === "baseline" ? 0.962 : 0.955,
  latencyMsP95: side === "baseline" ? 2100 : 2250,
  costUsdMean: side === "baseline" ? 0.026 : 0.028,
  evidenceRefs: [`llm-coordination:${side}:canary`],
  signedEvidenceRefs: [`ledger:llm-coordination-${side}`],
  ...overrides,
});

describe("GAP-0857 LLM-Coordination provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0857");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 46");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("13 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("agent-coordination");
    expect(doc).toContain("coordination-game");
    expect(doc).toContain("llms");
    expect(doc).toContain("multiagent");
    expect(doc).toContain("NAACL 2025");
    expect(doc).toContain("Pure Coordination Games");
    expect(doc).toContain("Agentic Coordination");
    expect(doc).toContain("Coordination QA");
    expect(doc).toContain("Experiment Workflow");
    expect(doc).toContain("vLLM");
    expect(doc).toContain("Llama-3.1-8B");
    expect(doc).toContain("Llama-3.1-70B");
    expect(doc).toContain("Mixtral");
    expect(doc).toContain("gemma-2");
    expect(doc).toContain("GPT-4o-mini");
    expect(doc).toContain("Claude-3.5-Sonnet");
    expect(doc).toContain("Gemini-1.5-Pro");
    expect(doc).toContain("Qwen-72B");
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

  it("uses existing provider-drift evaluator for LLM-Coordination-style multi-agent context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llm-coordination-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-llm-coordination-v1",
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

  it("fails closed when LLM-Coordination metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llm-coordination-reviewed-agent",
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

  it("keeps LLM-Coordination identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("llm_coordination_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
