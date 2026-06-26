import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftEvalPack,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0994-beir-provider-drift.md";
const REPO = "beir-cellar/beir";
const URL = "https://github.com/beir-cellar/beir";
const API = "https://api.github.com/repos/beir-cellar/beir";
const README = "https://raw.githubusercontent.com/beir-cellar/beir/main/README.md";
const LICENSE = "https://raw.githubusercontent.com/beir-cellar/beir/main/LICENSE";
const PYPROJECT = "https://raw.githubusercontent.com/beir-cellar/beir/main/pyproject.toml";
const RELEASE = "https://github.com/beir-cellar/beir/releases/tag/v2.2.0";
const HEAD = "ef83d29307061c65d04b035b4f4e7c18bd8374af";
const IDENTIFIER = "beir-provider-drift";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/watch/providerDriftAlerts.ts",
  "src/api/benchmarkRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const baseRow = (side: "baseline" | "candidate", overrides: Partial<ProviderDriftCanaryRow> = {}): ProviderDriftCanaryRow => ({
  provider: "beir-reviewed-retrieval-provider",
  model: "retrieval-embedding-api-canary",
  version: side === "baseline" ? "beir-v2.2.0-reference" : "beir-v2.2.0-provider-refresh",
  canaryId: "beir-provider-drift-canary",
  benchmarkFamily: "beir-style-information-retrieval-provider-drift",
  capabilityId: "retrieval-quality-stability",
  evaluationFrameworkId: "amc-owned-beir-style-provider-drift-eval",
  evaluationFrameworkVersion: "2026.06.24",
  providerRouteId: `beir-reviewed-retrieval-provider:${side}:embedding-api`,
  metricSuiteId: "beir-provider-drift-score-shield-watch",
  metricIds: [
    "ndcg_at_10",
    "map_at_100",
    "recall_at_100",
    "precision_at_10",
    "mrr_at_10",
    "refusal_rate",
    "latency_p95",
    "cost_mean",
  ],
  metricCount: 8,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-provider-drift-canary-runner",
  pipelineRunId: `beir-provider-drift-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `beir-provider-drift-experiment-${side}`,
  observabilityProjectId: "amc-beir-style-observability-project",
  datastoreId: "amc-owned-beir-provider-drift-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 120,
  trajectoryCount: 120,
  scoreMean0to1: side === "baseline" ? 0.782 : 0.775,
  refusalRate0to1: side === "baseline" ? 0.018 : 0.019,
  invalidActionRate0to1: side === "baseline" ? 0.009 : 0.01,
  evaluatorCoverage0to1: side === "baseline" ? 0.989 : 0.985,
  guardrailPassRate0to1: side === "baseline" ? 0.982 : 0.978,
  latencyMsP95: side === "baseline" ? 920 : 945,
  costUsdMean: side === "baseline" ? 0.004 : 0.0043,
  evidenceRefs: [`beir-provider-drift:${side}:canary`],
  signedEvidenceRefs: [`ledger:beir-provider-drift-${side}`],
  ...overrides,
});

describe("GAP-0994 BEIR provider-drift boundary", () => {
  it("documents live BEIR metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0994");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("2,220 stars");
    expect(doc).toContain("246 forks");
    expect(doc).toContain("79 open issues");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("pushed_at `2025-10-16T06:38:03Z`");
    expect(doc).toContain("updated_at `2026-06-19T16:29:32Z`");
    expect(doc).toContain("latest release `v2.2.0`");
    expect(doc).toContain("published_at `2025-06-04T18:42:18Z`");
    expect(doc).toContain("pyproject version `2.2.0`");
    expect(doc).toContain("requires-python `>=3.9`");
    expect(doc).toContain("sentence-transformers");
    expect(doc).toContain("pytrec-eval-terrier");
    expect(doc).toContain("datasets");
    expect(doc).toContain("faiss-cpu");
    expect(doc).toContain("17 benchmark datasets");
    expect(doc).toContain("Cohere");
    expect(doc).toContain("Voyage");
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

  it("uses existing provider-drift evaluator for BEIR-style retrieval canaries", () => {
    const report = runProviderDriftBenchmark({
      agentId: "beir-reviewed-agent",
      baseline: [baseRow("baseline")],
      candidate: [baseRow("candidate")],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 100,
        maxGuardrailPassRateDrop0to1: 0.01,
      },
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-beir-v1",
      datasetHash: hash("f"),
      sourceRefs: [URL, README, LICENSE, PYPROJECT, RELEASE],
    });

    expect(report.recommendation).toBe("approve");
    expect(report.failClosed).toBe(false);
    expect(pack.replayable).toBe(true);
    expect(pack.sourceRefs).toEqual([URL, README, LICENSE, PYPROJECT, RELEASE]);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);
  });

  it("fails closed when BEIR metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "beir-metadata-only-agent",
      baseline: [baseRow("baseline", { evidenceRefs: [URL, README], signedEvidenceRefs: [] })],
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
          evidenceRefs: [URL, README, LICENSE, PYPROJECT, RELEASE],
          signedEvidenceRefs: [],
        }),
      ],
      thresholds: {
        minEvaluationMetricCount: 8,
        minTrajectoryCount: 100,
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

  it("keeps BEIR identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("BEIR provider drift");
    }
  });
});
