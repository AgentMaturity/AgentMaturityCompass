import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildProviderDriftCiGate,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const DOC = "docs/source-reviews/GAP-0714-social-vr-speaking-anxiety-provider-drift-unavailable.md";
const DOI = "10.1145/3772318.3791068";
const OPENALEX = "W7154025559";
const TITLE = "LLM-based Embodied Conversational Agent for Reducing Foreign Language Speaking Anxiety in Social VR";

const implementationFiles = [
  "src/benchmarks/providerDriftBenchmark.ts",
  "src/api/benchmarkRouter.ts",
  "src/api/watchRouter.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

const row = (
  side: "baseline" | "candidate",
  overrides: Partial<ProviderDriftCanaryRow> = {},
): ProviderDriftCanaryRow => ({
  provider: "metadata-only",
  model: "social-vr-speaking-agent",
  version: side === "baseline" ? "doi-metadata" : "openalex-metadata",
  canaryId: "gap-0714-social-vr-metadata",
  benchmarkFamily: "unavailable-provider-drift-source-review",
  capabilityId: "foreign-language-speaking-anxiety-context",
  evaluationFrameworkId: "unavailable-paper-metadata",
  evaluationFrameworkVersion: "metadata-only",
  providerRouteId: `metadata:${side}`,
  metricSuiteId: "metadata-only",
  metricIds: ["source_title"],
  metricCount: 1,
  evaluatorConfigHash: hash(side === "baseline" ? "a" : "b"),
  generatedTestDataHash: hash(side === "baseline" ? "c" : "d"),
  dashboardArtifactHash: hash(side === "baseline" ? "e" : "f"),
  pipelineOrchestratorId: "metadata-only",
  pipelineRunId: `metadata-run-${side}`,
  observabilityProjectId: "metadata-only",
  traceExportHash: hash(side === "baseline" ? "1" : "2"),
  metricReportHash: hash(side === "baseline" ? "3" : "4"),
  sampleSize: 1,
  trajectoryCount: 1,
  scoreMean0to1: 0.8,
  refusalRate0to1: 0.01,
  latencyMsP95: 1000,
  costUsdMean: 0.001,
  evidenceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
  signedEvidenceRefs: [],
  ...overrides,
});

describe("GAP-0714 social VR provider-drift unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0714");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact title");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("ACM DOI page");
    expect(doc).toContain("OpenAlex id search");
    expect(doc).toContain("skipped as provider-drift implementation evidence");
    expect(doc).toContain("foreign-language speaking anxiety");
    expect(doc).toContain("embodied conversational agents");
    expect(doc).toContain("virtual reality");
    expect(doc).toContain("provider/model drift benchmark");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("fails closed when unavailable paper metadata is treated as provider-drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "gap-0714-metadata-only-agent",
      baseline: [row("baseline")],
      candidate: [
        row("candidate", {
          metricIds: [],
          metricCount: 1,
          evaluatorConfigHash: undefined,
          generatedTestDataHash: undefined,
          dashboardArtifactHash: undefined,
          pipelineRunId: undefined,
          traceExportHash: undefined,
          metricReportHash: undefined,
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

  it("does not create provider-drift behavior from unavailable paper metadata", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("No `src/benchmarks/providerDriftBenchmark.ts`, `src/api/benchmarkRouter.ts`, `src/api/watchRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier");
    expect(doc).toContain("metadata-only paper identifiers fail closed");
    expect(doc).toContain("No embodied-conversational-agent adapter, social-VR simulator");
  });

  it("keeps source-specific identifiers out of provider-drift implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("social_vr_provider_drift");
    }
  });
});
