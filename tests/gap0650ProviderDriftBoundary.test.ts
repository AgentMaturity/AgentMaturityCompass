import { describe, expect, test } from "vitest";
import {
  buildProviderDriftCiGate,
  buildProviderDriftWatchAlerts,
  runProviderDriftBenchmark,
  type ProviderDriftCanaryRow,
} from "../src/benchmarks/providerDriftBenchmark.js";

const GAP_0650_SOURCE_REFS = [
  "https://openalex.org/W7125268930",
  "https://doi.org/10.1080/09544828.2026.2616583",
];

const paperMetadataOnlyBaseline: ProviderDriftCanaryRow = {
  provider: "openai",
  model: "gpt-4.1",
  version: "paper-metadata-only-baseline",
  canaryId: "gap-0650-product-design-paper",
  benchmarkFamily: "paper-metadata-only",
  capabilityId: "product-design-evaluation-context",
  evaluationFrameworkId: "doi:10.1080/09544828.2026.2616583",
  sampleSize: 24,
  scoreMean0to1: 0.9,
  refusalRate0to1: 0.02,
  latencyMsP95: 1000,
  costUsdMean: 0.01,
  evidenceRefs: GAP_0650_SOURCE_REFS,
};

const paperMetadataOnlyCandidate: ProviderDriftCanaryRow = {
  ...paperMetadataOnlyBaseline,
  version: "paper-metadata-only-candidate",
  scoreMean0to1: 0.9,
  refusalRate0to1: 0.02,
  latencyMsP95: 1000,
  costUsdMean: 0.01,
};

describe("GAP-0650 product-design paper provider-drift boundary", () => {
  test("fails closed when DOI/OpenAlex metadata is offered as provider/model drift proof", () => {
    const report = runProviderDriftBenchmark({
      agentId: "source-review-gap-0650",
      baseline: [paperMetadataOnlyBaseline],
      candidate: [paperMetadataOnlyCandidate],
      now: new Date("2026-06-21T04:34:44.000Z"),
    });

    expect(report.failClosed).toBe(true);
    expect(report.recommendation).toBe("alert");
    expect(report.providerVersions).toEqual([
      "openai/gpt-4.1@paper-metadata-only-baseline",
      "openai/gpt-4.1@paper-metadata-only-candidate",
    ]);
    expect(report.comparisons[0]).toMatchObject({
      canaryId: "gap-0650-product-design-paper",
      driftStatistic: 0,
      status: "alert",
    });

    const alertMetricIds = report.alerts.map((alert) => alert.metricId);
    expect(alertMetricIds).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
    ]));
    expect(alertMetricIds).not.toContain("scoreMean0to1");
    expect(report.alerts.find((alert) => alert.metricId === "evaluationFrameworkEvidence")?.message).toContain(
      "baseline:evaluationFrameworkVersion",
    );

    const gate = buildProviderDriftCiGate(report, { mode: "ci" });
    expect(gate.passed).toBe(false);
    expect(gate.failClosed).toBe(true);

    const watchAlerts = buildProviderDriftWatchAlerts(report);
    expect(watchAlerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "signedEvidenceRefs",
      "evaluationFrameworkEvidence",
    ]));
    expect(watchAlerts.every((alert) => alert.source === "provider-drift-benchmark")).toBe(true);
  });
});
