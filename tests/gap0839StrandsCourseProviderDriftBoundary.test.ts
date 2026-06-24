import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0839-strands-course-provider-drift.md";
const REPO = "aws-samples/sample-getting-started-with-strands-agents-course";
const URL = "https://github.com/aws-samples/sample-getting-started-with-strands-agents-course";
const TITLE = "Getting Started with Strands Agents - Complete Learning Path";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "aws-bedrock" : "aws-bedrock",
  model: "anthropic.claude-sonnet-4",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "strands-course-agent-provider-canary",
  benchmarkFamily: "strands-agent-provider-drift",
  capabilityId: "agent-provider-tooling-evaluation-stability",
  evaluationFrameworkId: "amc-owned-strands-course-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `bedrock:claude-sonnet-4:${side}:strands-agent-course`,
  metricSuiteId: "strands-agent-drift-suite",
  metricIds: ["agent_score", "tool_success", "ragas_score", "refusal_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-strands-course-provider-drift-canary",
  pipelineRunId: `strands-course-agent-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `strands-course-agent-canary-${side}`,
  observabilityProjectId: "amc-strands-course-observability",
  datastoreId: "amc-owned-strands-agent-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.85 : 0.832,
  refusalRate0to1: side === "baseline" ? 0.04 : 0.047,
  invalidActionRate0to1: side === "baseline" ? 0.028 : 0.033,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.962 : 0.956,
  latencyMsP95: side === "baseline" ? 2100 : 2250,
  costUsdMean: side === "baseline" ? 0.026 : 0.0275,
  evidenceRefs: [`strands-course:${side}:canary`],
  signedEvidenceRefs: [`ledger:strands-course-${side}`],
  ...overrides,
});

describe("GAP-0839 Strands course provider-drift boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0839");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT-0 license");
    expect(doc).toContain("api.github.com DNS lookup failed");
    expect(doc).toContain("Course 1");
    expect(doc).toContain("Course 2");
    expect(doc).toContain("Course 3");
    expect(doc).toContain("Course 4");
    expect(doc).toContain("Amazon Bedrock");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("Agent-to-Agent Communication");
    expect(doc).toContain("LangFuse");
    expect(doc).toContain("RAGAS");
    expect(doc).toContain("AgentCore");
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

  it("uses existing provider-drift evaluator for Strands-course agent context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "strands-course-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-strands-course-v1",
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

  it("fails closed when course metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "strands-course-reviewed-agent",
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

  it("keeps Strands course identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("strands_course_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
