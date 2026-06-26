import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0830-llamp-provider-drift.md";
const REPO = "chiang-yuan/llamp";
const URL = "https://github.com/chiang-yuan/llamp";
const ACL = "https://aclanthology.org/2025.emnlp-main.1280/";
const DOI = "10.18653/v1/2025.emnlp-main.1280";
const ARXIV = "https://arxiv.org/abs/2401.17244";
const TITLE = "LLaMP: Large Language Model Made Powerful for High-fidelity Materials Knowledge Retrieval";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: side === "baseline" ? "openai" : "openai",
  model: "gpt-4.1",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "llamp-materials-rag-provider-canary",
  benchmarkFamily: "materials-rag-provider-drift",
  capabilityId: "materials-retrieval-tool-use-stability",
  evaluationFrameworkId: "amc-owned-llamp-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `openai:gpt-4.1:${side}:materials-rag`,
  metricSuiteId: "materials-rag-drift-suite",
  metricIds: ["answer_grounding", "tool_success", "self_consistency", "refusal_rate", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-llamp-provider-drift-canary",
  pipelineRunId: `llamp-materials-rag-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `llamp-materials-rag-canary-${side}`,
  observabilityProjectId: "amc-llamp-observability",
  datastoreId: "amc-owned-materials-rag-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.87 : 0.852,
  refusalRate0to1: side === "baseline" ? 0.035 : 0.041,
  invalidActionRate0to1: side === "baseline" ? 0.02 : 0.026,
  evaluatorCoverage0to1: side === "baseline" ? 0.985 : 0.98,
  guardrailPassRate0to1: side === "baseline" ? 0.965 : 0.958,
  latencyMsP95: side === "baseline" ? 1900 : 2050,
  costUsdMean: side === "baseline" ? 0.018 : 0.0195,
  evidenceRefs: [`llamp:${side}:canary`],
  signedEvidenceRefs: [`ledger:llamp-${side}`],
  ...overrides,
});

describe("GAP-0830 LLaMP provider-drift boundary", () => {
  it("documents live GitHub/ACL/arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0830");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ACL);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("raw.githubusercontent.com DNS lookup failed");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("ACL Anthology");
    expect(doc).toContain("EMNLP 2025");
    expect(doc).toContain("Yuan Chiang");
    expect(doc).toContain("Elvis Hsieh");
    expect(doc).toContain("Chia-Hong Chou");
    expect(doc).toContain("Janosh Riebesell");
    expect(doc).toContain("hierarchical multi-agent framework");
    expect(doc).toContain("Materials Project");
    expect(doc).toContain("atomistic simulations");
    expect(doc).toContain("uncertainty and confidence");
    expect(doc).toContain("self-consistency");
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

  it("uses existing provider-drift evaluator for LLaMP-style materials RAG context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llamp-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 6,
        minTrajectoryCount: 30,
        maxGuardrailPassRateDrop0to1: 0.02,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-llamp-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, ACL, `https://doi.org/${DOI}`, ARXIV],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, ACL, `https://doi.org/${DOI}`, ARXIV]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when repo and paper metadata replace AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "llamp-reviewed-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL, ACL], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL, ACL],
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

  it("keeps LLaMP identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("llamp_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
