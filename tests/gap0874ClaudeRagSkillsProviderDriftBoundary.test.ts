import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0874-claude-rag-skills-provider-drift.md";
const REPO = "floflo777/claude-rag-skills";
const URL = "https://github.com/floflo777/claude-rag-skills";
const TITLE = "Ailog RAG Skills for Claude Code";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "anthropic",
  model: "claude-rag-agent",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "claude-rag-skills-provider-canary",
  benchmarkFamily: "claude-rag-skills-provider-drift",
  capabilityId: "rag-quality-advice-stability",
  evaluationFrameworkId: "amc-owned-claude-rag-skills-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `anthropic:claude-rag-agent:${side}:rag-skills`,
  metricSuiteId: "claude-rag-skills-drift-suite",
  metricIds: ["recall_at_k", "precision_at_k", "mrr", "ndcg", "faithfulness", "relevance", "latency", "cost"],
  metricCount: 8,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-claude-rag-skills-provider-drift-canary",
  pipelineRunId: `claude-rag-skills-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `claude-rag-skills-canary-${side}`,
  observabilityProjectId: "amc-claude-rag-skills-observability",
  datastoreId: "amc-owned-claude-rag-skills-style-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 42,
  trajectoryCount: 42,
  scoreMean0to1: side === "baseline" ? 0.836 : 0.82,
  refusalRate0to1: side === "baseline" ? 0.031 : 0.036,
  invalidActionRate0to1: side === "baseline" ? 0.024 : 0.031,
  evaluatorCoverage0to1: side === "baseline" ? 0.984 : 0.979,
  guardrailPassRate0to1: side === "baseline" ? 0.963 : 0.957,
  latencyMsP95: side === "baseline" ? 2040 : 2190,
  costUsdMean: side === "baseline" ? 0.02 : 0.0215,
  evidenceRefs: [`claude-rag-skills:${side}:canary`],
  signedEvidenceRefs: [`ledger:claude-rag-skills-${side}`],
  ...overrides,
});

describe("GAP-0874 Claude RAG skills provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0874");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 32");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("1 Commit");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("chunking-advisor");
    expect(doc).toContain("examples");
    expect(doc).toContain("rag-audit");
    expect(doc).toContain("rag-eval");
    expect(doc).toContain("rag-scaffold");
    expect(doc).toContain("marketplace.json");
    expect(doc).toContain("ai");
    expect(doc).toContain("claude-code");
    expect(doc).toContain("embeddings");
    expect(doc).toContain("vector-database");
    expect(doc).toContain("retrieval-augmented-generation");
    expect(doc).toContain("RAG Audit");
    expect(doc).toContain("RAG Eval");
    expect(doc).toContain("Chunking Advisor");
    expect(doc).toContain("RAG Scaffold");
    expect(doc).toContain("chunking issues");
    expect(doc).toContain("embedding problems");
    expect(doc).toContain("retrieval anti-patterns");
    expect(doc).toContain("generation issues");
    expect(doc).toContain("production gaps");
    expect(doc).toContain("Recall@K");
    expect(doc).toContain("Precision@K");
    expect(doc).toContain("Mean Reciprocal Rank");
    expect(doc).toContain("Normalized Discounted Cumulative Gain");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Relevance");
    expect(doc).toContain("Coherence and conciseness");
    expect(doc).toContain("Ailog Benchmark");
    expect(doc).toContain("Ailog API");
    expect(doc).toContain("Claude Code >= 2.0.0");
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

  it("uses existing provider-drift evaluator for Claude RAG skills context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "claude-rag-skills-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-claude-rag-skills-v1",
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

  it("fails closed when Claude RAG skills metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "claude-rag-skills-reviewed-agent",
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

  it("keeps Claude RAG skills identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("claude_rag_skills_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
