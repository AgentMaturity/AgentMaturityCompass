import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0832-calbench-provider-drift.md";
const OPENALEX = "https://openalex.org/W7161090376";
const ARXIV = "https://arxiv.org/abs/2605.09823";
const DOI = "10.48550/arXiv.2605.09823";
const TITLE = "CalBench: Evaluating Coordination-Privacy Trade-offs in Multi-Agent LLMs";

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
  canaryId: "calbench-calendar-coordination-provider-canary",
  benchmarkFamily: "multi-agent-calendar-provider-drift",
  capabilityId: "coordination-privacy-tradeoff-stability",
  evaluationFrameworkId: "amc-owned-calbench-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `anthropic:claude-sonnet-4:${side}:calendar-coordination`,
  metricSuiteId: "coordination-privacy-drift-suite",
  metricIds: ["task_success", "excess_cost", "privacy_leakage", "burden_fairness", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-calbench-provider-drift-canary",
  pipelineRunId: `calbench-calendar-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `calbench-calendar-canary-${side}`,
  observabilityProjectId: "amc-calbench-observability",
  datastoreId: "amc-owned-calendar-coordination-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 40,
  trajectoryCount: 40,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.821,
  refusalRate0to1: side === "baseline" ? 0.04 : 0.047,
  invalidActionRate0to1: side === "baseline" ? 0.03 : 0.035,
  evaluatorCoverage0to1: side === "baseline" ? 0.98 : 0.975,
  guardrailPassRate0to1: side === "baseline" ? 0.96 : 0.953,
  latencyMsP95: side === "baseline" ? 2100 : 2250,
  costUsdMean: side === "baseline" ? 0.021 : 0.0228,
  evidenceRefs: [`calbench:${side}:canary`],
  signedEvidenceRefs: [`ledger:calbench-${side}`],
  ...overrides,
});

describe("GAP-0832 CalBench provider-drift boundary", () => {
  it("documents live arXiv/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0832");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("OpenAlex page returned HTTP/2 403");
    expect(doc).toContain("api.openalex.org DNS lookup failed");
    expect(doc).toContain("Submitted on 10 May 2026");
    expect(doc).toContain("last revised 5 Jun 2026");
    expect(doc).toContain("Chelsea Zou");
    expect(doc).toContain("Yiheng Yao");
    expect(doc).toContain("Selena She");
    expect(doc).toContain("Noah Goodman");
    expect(doc).toContain("Robert D. Hawkins");
    expect(doc).toContain("calendar scheduling");
    expect(doc).toContain("private calendars");
    expect(doc).toContain("incoming meetings");
    expect(doc).toContain("CP-SAT oracle");
    expect(doc).toContain("decentralized non-LLM reference protocols");
    expect(doc).toContain("task success");
    expect(doc).toContain("excess cost");
    expect(doc).toContain("communication efficiency");
    expect(doc).toContain("burden fairness");
    expect(doc).toContain("privacy leakage");
    expect(doc).toContain("seven model families");
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

  it("uses existing provider-drift evaluator for CalBench-style coordination/privacy context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "calbench-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-calbench-v1",
      datasetHash: hash("f"),
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, OPENALEX],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, OPENALEX]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "calbench-reviewed-agent",
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

  it("keeps CalBench identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("calbench_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
