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

const DOC = "docs/source-reviews/GAP-0803-secure-llm-agents-provider-drift.md";
const ARXIV = "https://arxiv.org/abs/2606.10749";
const DOI = "10.48550/arxiv.2606.10749";
const OPENALEX = "W7164162217";
const TITLE = "Toward Secure LLM Agents: Threat Surfaces, Attacks, Defenses, and Evaluation";

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
  canaryId: "secure-llm-agents-provider-canary",
  benchmarkFamily: "secure-llm-agents-provider-model-drift",
  capabilityId: "secure-agent-threat-evaluation",
  evaluationFrameworkId: "amc-owned-secure-llm-agents-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:secure-llm-agents`,
  metricSuiteId: "secure-llm-agents-drift-suite",
  metricIds: ["attack_resistance", "privilege_control", "state_integrity", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-secure-agent-provider-drift-canary",
  pipelineRunId: `secure-llm-agents-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `secure-llm-agents-canary-${side}`,
  observabilityProjectId: "amc-secure-agent-observability",
  datastoreId: "amc-owned-secure-agent-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 38,
  trajectoryCount: 38,
  scoreMean0to1: side === "baseline" ? 0.87 : 0.842,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.041,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.034,
  evaluatorCoverage0to1: side === "baseline" ? 0.96 : 0.951,
  guardrailPassRate0to1: side === "baseline" ? 0.965 : 0.955,
  latencyMsP95: side === "baseline" ? 1500 : 1650,
  costUsdMean: side === "baseline" ? 0.01 : 0.0108,
  evidenceRefs: [`secure-llm-agents:${side}:canary`, `secure-llm-agents:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:secure-llm-agents-${side}`],
  ...overrides,
});

describe("GAP-0803 secure LLM agents provider-drift boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0803");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("same live source reviewed for GAP-0802");
    expect(doc).toContain("Yuchen Ling");
    expect(doc).toContain("Tue Jun 9 12:01:07 2026");
    expect(doc).toContain("247 papers");
    expect(doc).toContain("lifecycle-based");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("tool-mediated control-flow hijacking");
    expect(doc).toContain("persistent state");
    expect(doc).toContain("multi-agent propagation");
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

  it("uses existing provider-drift evaluator for secure-agent context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "secure-llm-agents-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-secure-llm-agents-eval",
      candidateEvaluationFrameworkId: "amc-owned-secure-llm-agents-eval",
      baselinePipelineOrchestratorId: "amc-secure-agent-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-secure-agent-provider-drift-canary",
      baselineObservabilityProjectId: "amc-secure-agent-observability",
      candidateObservabilityProjectId: "amc-secure-agent-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-secure-llm-agents-v1",
      datasetHash: hash("f"),
      sourceRefs: [ARXIV, `doi:${DOI}`, `openalex:${OPENALEX}`],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "attack_resistance",
      "privilege_control",
      "state_integrity",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-secure-llm-agents-eval");
  });

  it("fails closed when secure-agent paper metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "secure-llm-agents-reviewed-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [ARXIV],
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
          evidenceRefs: [ARXIV, `openalex:${OPENALEX}`],
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

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("secure_llm_agents_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
