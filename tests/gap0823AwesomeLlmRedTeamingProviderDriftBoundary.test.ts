import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0823-awesome-llm-red-teaming-provider-drift.md";
const REPO = "user1342/Awesome-LLM-Red-Teaming";
const URL = "https://github.com/user1342/Awesome-LLM-Red-Teaming";
const TITLE = "Awesome LLM Red Teaming";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1-mini",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "awesome-llm-red-teaming-canary",
  benchmarkFamily: "llm-red-teaming-provider-drift",
  capabilityId: "red-team-robustness-canary",
  evaluationFrameworkId: "amc-owned-red-team-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1-mini:${side}:red-team-canary`,
  metricSuiteId: "red-team-drift-suite",
  metricIds: ["score", "refusal_rate", "invalid_action_rate", "latency", "cost"],
  metricCount: 5,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-red-team-provider-drift-canary",
  pipelineRunId: `awesome-llm-red-teaming-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `awesome-llm-red-teaming-canary-${side}`,
  observabilityProjectId: "amc-red-team-observability",
  datastoreId: "amc-owned-red-team-canary-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.82,
  refusalRate0to1: side === "baseline" ? 0.08 : 0.09,
  invalidActionRate0to1: side === "baseline" ? 0.03 : 0.035,
  evaluatorCoverage0to1: side === "baseline" ? 0.98 : 0.97,
  guardrailPassRate0to1: side === "baseline" ? 0.95 : 0.944,
  latencyMsP95: side === "baseline" ? 1600 : 1690,
  costUsdMean: side === "baseline" ? 0.011 : 0.0115,
  evidenceRefs: [`awesome-llm-red-teaming:${side}:canary`],
  signedEvidenceRefs: [`ledger:awesome-llm-red-teaming-${side}`],
  ...overrides,
});

describe("GAP-0823 Awesome LLM Red Teaming provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0823");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("LLM Red Teaming Resources by Technical Function");
    expect(doc).toContain("Playgrounds and practice targets");
    expect(doc).toContain("Red teaming frameworks and agent harnesses");
    expect(doc).toContain("Attack generation and jailbreak toolkits");
    expect(doc).toContain("Defences, standards and guardrails to test against");
    expect(doc).toContain("Bug bounties and programmes");
    expect(doc).toContain("Folly");
    expect(doc).toContain("PyRIT");
    expect(doc).toContain("OWASP Top 10 for LLMs");
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

  it("uses existing provider-drift evaluator for red-teaming context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "awesome-llm-red-teaming-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 5,
        minTrajectoryCount: 20,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-awesome-llm-red-teaming-v1",
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

  it("fails closed when repository metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "awesome-llm-red-teaming-reviewed-agent",
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

  it("keeps Awesome LLM Red Teaming identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("awesome_llm_red_teaming_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
