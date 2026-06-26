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

const DOC = "docs/source-reviews/GAP-0755-object-detection-provider-drift-unavailable.md";
const DOI = "10.1016/j.imavis.2026.105944";
const OPENALEX = "W7133353378";
const TITLE = "All you need for object detection: From pixels, points, and prompts to Next-Gen fusion and multimodal LLMs/VLMs in autonomous vehicles";

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
  provider: "google",
  model: "gemini-2.5-flash",
  version: side === "baseline" ? "2026-06-01" : "2026-06-21",
  canaryId: "multimodal-object-detection-provider-canary",
  benchmarkFamily: "multimodal-perception-provider-model-drift",
  capabilityId: "object-detection-style-multimodal-agent-eval",
  evaluationFrameworkId: "amc-owned-multimodal-perception-eval",
  evaluationFrameworkVersion: "2026.06.21",
  providerRouteId: `google:gemini-2.5-flash:${side}:multimodal-perception`,
  metricSuiteId: "multimodal-perception-drift-suite",
  metricIds: ["object_localization_proxy", "sensor_context_grounding", "prompt_following", "guardrail_pass", "latency", "cost"],
  metricCount: 6,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  verdictAggregation: "mean",
  verdictAggregationConfigHash: hash(side === "baseline" ? "e" : "f"),
  dashboardArtifactHash: hash(side === "baseline" ? "1" : "2"),
  pipelineOrchestratorId: "amc-multimodal-provider-drift-canary",
  pipelineRunId: `object-detection-${side}`,
  experimentTrackerId: "amc-provider-drift-ledger",
  experimentRunId: `object-detection-canary-${side}`,
  observabilityProjectId: "amc-multimodal-perception-observability",
  datastoreId: "amc-owned-multimodal-fixtures",
  retrievalIndexHash: hash(side === "baseline" ? "3" : "4"),
  contentDatasetHash: hash("5"),
  summaryArtifactHash: hash(side === "baseline" ? "6" : "7"),
  qaDatasetHash: hash("8"),
  traceExportHash: hash(side === "baseline" ? "9" : "0"),
  metricReportHash: hash(side === "baseline" ? "a" : "b"),
  pipelineConfigHash: hash(side === "baseline" ? "c" : "d"),
  sampleSize: 36,
  trajectoryCount: 36,
  scoreMean0to1: side === "baseline" ? 0.84 : 0.815,
  refusalRate0to1: side === "baseline" ? 0.03 : 0.035,
  invalidActionRate0to1: side === "baseline" ? 0.025 : 0.03,
  evaluatorCoverage0to1: side === "baseline" ? 0.95 : 0.94,
  guardrailPassRate0to1: side === "baseline" ? 0.955 : 0.947,
  latencyMsP95: side === "baseline" ? 1700 : 1860,
  costUsdMean: side === "baseline" ? 0.012 : 0.013,
  evidenceRefs: [`object-detection:${side}:canary`, `object-detection:${side}:trace-export`],
  signedEvidenceRefs: [`ledger:object-detection-${side}`],
  ...overrides,
});

describe("GAP-0755 object-detection provider-drift unavailable-source boundary", () => {
  it("documents unavailable source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0755");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title and DOI searches did not surface a reachable primary source");
    expect(doc).toContain("direct DOI opening was blocked");
    expect(doc).toContain("provider and model drift benchmark");
    expect(doc).toContain("object detection");
    expect(doc).toContain("pixels");
    expect(doc).toContain("points");
    expect(doc).toContain("prompts");
    expect(doc).toContain("Next-Gen fusion");
    expect(doc).toContain("multimodal LLMs/VLMs");
    expect(doc).toContain("autonomous vehicles");
    expect(doc).toContain("sensor fusion");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("uses existing provider-drift evaluator for multimodal object-detection context", () => {
    const report = runProviderDriftBenchmark({
      agentId: "object-detection-reviewed-agent",
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
      baselineEvaluationFrameworkId: "amc-owned-multimodal-perception-eval",
      candidateEvaluationFrameworkId: "amc-owned-multimodal-perception-eval",
      baselinePipelineOrchestratorId: "amc-multimodal-provider-drift-canary",
      candidatePipelineOrchestratorId: "amc-multimodal-provider-drift-canary",
      baselineObservabilityProjectId: "amc-multimodal-perception-observability",
      candidateObservabilityProjectId: "amc-multimodal-perception-observability",
      evaluationFrameworkMissingReasons: [],
      observabilityPipelineMissingReasons: [],
    });

    const pack = buildProviderDriftEvalPack(report, {
      packId: "provider-drift-object-detection-v1",
      datasetHash: hash("f"),
      sourceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
    });

    expect(pack.replayable).toBe(true);
    expect(pack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.rows[0]?.baselineMetricIds).toEqual([
      "object_localization_proxy",
      "sensor_context_grounding",
      "prompt_following",
      "guardrail_pass",
      "latency",
      "cost",
    ]);
    expect(buildProviderDriftWatchAlerts(report)).toEqual([]);
    expect(buildProviderDriftCiGate(report, { mode: "ci" }).passed).toBe(true);

    const markdown = renderProviderDriftBenchmarkMarkdown(report);
    expect(markdown).toContain("Evaluation Framework Proof");
    expect(markdown).toContain("Observability Pipeline Proof");
    expect(markdown).toContain("amc-owned-multimodal-perception-eval");
  });

  it("fails closed when object-detection metadata replaces AMC-owned provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "object-detection-reviewed-agent",
      baseline: [
        baseRow("baseline", {
          evidenceRefs: [`doi:${DOI}`],
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
          evidenceRefs: [`doi:${DOI}`, `openalex:${OPENALEX}`],
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
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("object_detection_provider_drift");
      expect(source).not.toContain(TITLE);
    }
  });
});
