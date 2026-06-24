import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0824-protea-provider-drift.md";
const ARXIV = "https://arxiv.org/abs/2605.18032";
const DOI = "10.48550/arXiv.2605.18032";
const OPENALEX = "W7161915061";
const TITLE = "PROTEA: Offline Evaluation and Iterative Refinement for Multi-Agent LLM Workflows";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "anthropic" : "anthropic",
  model: "claude-sonnet-4",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "protea-multi-agent-workflow-canary",
  benchmarkFamily: "multi-agent-workflow-provider-drift",
  capabilityId: "workflow-node-evaluation-stability",
  evaluationFrameworkId: "amc-owned-protea-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `anthropic:claude-sonnet-4:${side}:protea-workflow`,
  metricSuiteId: "workflow-node-drift-suite",
  metricIds: ["workflow_score", "node_error_rate", "refusal_rate", "latency", "cost"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-protea-provider-drift-canary",
  pipelineRunId: `protea-workflow-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `protea-workflow-canary-${side}`,
  observabilityProjectId: "amc-protea-observability",
  datastoreId: "amc-owned-workflow-canary-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 32,
  trajectoryCount: 32,
  scoreMean0to1: side === "baseline" ? 0.86 : 0.845,
  refusalRate0to1: side === "baseline" ? 0.04 : 0.045,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.028,
  evaluatorCoverage0to1: side === "baseline" ? 0.98 : 0.975,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.955,
  latencyMsP95: side === "baseline" ? 1800 : 1880,
  costUsdMean: side === "baseline" ? 0.015 : 0.0158,
  evidenceRefs: [`protea:${side}:canary`],
  signedEvidenceRefs: [`ledger:protea-${side}`],
  ...overrides,
});

describe("GAP-0824 PROTEA provider-drift boundary", () => {
  it("documents live arXiv/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0824");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("Submitted on 18 May 2026");
    expect(doc).toContain("Kazuki Kawamura");
    expect(doc).toContain("Satoshi Waki");
    expect(doc).toContain("Kei Tateno");
    expect(doc).toContain("role-specific LLM calls");
    expect(doc).toContain("intermediate outputs");
    expect(doc).toContain("downstream nodes");
    expect(doc).toContain("offline, test-driven improvement");
    expect(doc).toContain("configurable rubrics");
    expect(doc).toContain("workflow graph");
    expect(doc).toContain("backward node evaluation");
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

  it("uses existing provider-drift evaluator for PROTEA multi-agent workflow context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "protea-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-protea-v1",
      datasetHash: hash("f"),
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "protea-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [ARXIV], signedEvidenceRefs: [] })],
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
          evidenceRefs: [ARXIV],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: { minEvaluationMetricCount: 5, minTrajectoryCount: 20 },
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

  it("keeps PROTEA identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("protea_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
