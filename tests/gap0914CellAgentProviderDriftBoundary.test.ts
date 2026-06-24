import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0914-cellagent-provider-drift.md";
const REPO = "liu-shiqiang/CellAgent";
const URL = "https://github.com/liu-shiqiang/CellAgent";
const TITLE = "CellAgent: LLM-Driven Multi-Agent Framework for Automated scRNA-Seq Data Analysis";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "cellagent-canary",
  model: "scrna-seq-analysis-agent",
  version: side === "baseline" ? "ollama-llama3.1-2026-06-01" : "openai-gpt4-2026-06-22",
  canaryId: "cellagent-provider-canary",
  benchmarkFamily: "cellagent-provider-drift",
  capabilityId: "cellagent-scrna-analysis-stability",
  evaluationFrameworkId: "amc-owned-cellagent-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.22",
  providerRouteId: `cellagent-provider:${side}`,
  metricSuiteId: "cellagent-provider-drift-suite",
  metricIds: ["quality_evaluation", "notebook_completion", "retry_success", "invalid_code_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-cellagent-provider-drift-canary",
  pipelineRunId: `cellagent-provider-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `cellagent-canary-${side}`,
  observabilityProjectId: "amc-cellagent-observability",
  datastoreId: "amc-owned-cellagent-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 38,
  trajectoryCount: 38,
  scoreMean0to1: side === "baseline" ? 0.824 : 0.811,
  refusalRate0to1: side === "baseline" ? 0.022 : 0.026,
  invalidActionRate0to1: side === "baseline" ? 0.031 : 0.035,
  evaluatorCoverage0to1: side === "baseline" ? 0.987 : 0.982,
  guardrailPassRate0to1: side === "baseline" ? 0.964 : 0.957,
  latencyMsP95: side === "baseline" ? 1960 : 2060,
  costUsdMean: side === "baseline" ? 0.018 : 0.02,
  evidenceRefs: [`cellagent:${side}:canary`],
  signedEvidenceRefs: [`ledger:cellagent-${side}`],
  ...overrides,
});

describe("GAP-0914 CellAgent provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0914");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("master");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 15");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("7 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("src");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("main.py");
    expect(doc).toContain("scRNA-Seq");
    expect(doc).toContain("single-cell RNA sequencing");
    expect(doc).toContain("Planner");
    expect(doc).toContain("Executor");
    expect(doc).toContain("Evaluator");
    expect(doc).toContain("Global Memory");
    expect(doc).toContain("Code Sandbox");
    expect(doc).toContain("Tool Registry");
    expect(doc).toContain("Jupyter Notebook");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("OpenAI API key");
    expect(doc).toContain("GPT-4");
    expect(doc).toContain("llama3.1");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("scanpy");
    expect(doc).toContain("H5AD");
    expect(doc).toContain("quality evaluation");
    expect(doc).toContain("self-optimization");
    expect(doc).toContain("retry");
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

  it("uses existing provider-drift evaluator for CellAgent context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "cellagent-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-cellagent-v1",
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

  it("fails closed when CellAgent metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "cellagent-reviewed-agent",
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

  it("keeps CellAgent identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("cellagent_provider_drift");
    }
  });
});
