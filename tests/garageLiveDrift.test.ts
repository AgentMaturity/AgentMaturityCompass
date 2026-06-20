import { describe, expect, test } from "vitest";
import { buildLiveDriftWatchAlerts, verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";
import {
  runGarageLiveDrift,
  type GarageQuestionComplexity,
  type GarageQuestionType,
  type GarageLiveDriftRow,
} from "../src/watch/garageLiveDrift.js";

const complexities: GarageQuestionComplexity[] = ["simple", "multi_hop", "aggregation"];
const questionTypes: GarageQuestionType[] = ["slow_changing", "fast_changing", "non_time_sensitive"];

function garageRow(
  index: number,
  phase: "baseline" | "live",
  overrides: Partial<GarageLiveDriftRow> = {},
): GarageLiveDriftRow {
  const isBaseline = phase === "baseline";
  return {
    traceId: `garage-${phase}-${index + 1}`,
    scenarioId: `garage-rag-${phase}-${index + 1}`,
    timestamp: isBaseline
      ? `2026-06-20T00:0${index}:00.000Z`
      : `2026-06-20T01:0${index}:00.000Z`,
    evalPackId: "garage-grounding-live-drift-v1",
    sourceRefHash: "github:amazon-science/GaRAGe@2b7264f5d4e066affbe4b67b7d3b9cffeff98ede",
    repositorySnapshotHash: "tree:36fef0a0e42a820f24508c003dd82dfa63eadc5e",
    licenseRefHash: "LICENSE@fe463e0f7888bbf8b82e42d55f5743508ddafb7e",
    readmeBlobHash: "README.md@2043d4219c2f0488f976af9cb2d193ac35ca8003",
    benchmarkDatasetHash: "data/GaRAGe_benchmark.jsonl@7f3e72c9e0d49946f862b282f863b1a7f01646d6",
    datasetManifestHash: "amc-garage-dataset-manifest-v1",
    paperRefHash: "arxiv:2506.07671",
    groundingAnnotationSchemaHash: "amc-garage-grounding-schema-v1",
    retrievalCorpusSnapshotHash: `amc-garage-corpus-snapshot-${index + 1}`,
    promptTemplateHash: "amc-garage-rag-answer-prompt-v1",
    evaluatorConfigHash: "amc-garage-grounding-evaluator-v1",
    baselineResultHash: isBaseline ? `garage-baseline-result-${index + 1}` : undefined,
    liveResultHash: isBaseline ? undefined : `garage-live-result-${index + 1}`,
    driftStatisticHash: isBaseline ? undefined : `garage-drift-statistic-${index + 1}`,
    alertReceiptHash: isBaseline ? undefined : `garage-alert-receipt-${index + 1}`,
    sampleId: `garage-sample-${index + 1}`,
    questionType: questionTypes[index]!,
    questionComplexity: complexities[index]!,
    questionCategory: index === 0 ? "Science" : index === 1 ? "Finance" : "Health",
    questionSource: index === 0 ? "web" : index === 1 ? "enterprise" : "mixed",
    topicSource: index === 0 ? "web" : index === 1 ? "enterprise" : "mixed",
    groundingPassageCount: 12 + index,
    relevantPassageCount: 5 + index,
    citedPassageCount: 4 + index,
    answerValidated: true,
    groundingPrecision0to1: isBaseline ? 0.91 - index * 0.01 : 0.895 - index * 0.01,
    groundingRecall0to1: isBaseline ? 0.88 - index * 0.01 : 0.87 - index * 0.01,
    citationSupport0to1: isBaseline ? 0.9 - index * 0.01 : 0.885 - index * 0.01,
    deflectionAccuracy0to1: isBaseline ? 0.86 - index * 0.01 : 0.85 - index * 0.01,
    answerFaithfulness0to1: isBaseline ? 0.92 - index * 0.01 : 0.91 - index * 0.01,
    latencyMs: isBaseline ? 820 + index * 20 : 850 + index * 20,
    costUsd: isBaseline ? 0.007 + index * 0.001 : 0.0075 + index * 0.001,
    evidenceRefs: [`garage-trace:${phase}-${index + 1}`],
    signedEvidenceRefs: [`garage-ledger:${phase}-${index + 1}`],
    ...overrides,
  };
}

describe("runGarageLiveDrift", () => {
  test("approves stable GaRAGe grounding drift with source, dataset, annotation, baseline, live, statistic, and alert proof", () => {
    const result = runGarageLiveDrift({
      agentId: "rag-grounding-agent",
      baselineWindow: {
        windowId: "baseline-garage",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: complexities.map((_, index) => garageRow(index, "baseline")),
      },
      liveWindow: {
        windowId: "live-garage",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: complexities.map((_, index) => garageRow(index, "live")),
      },
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.recommendation).toBe("approve");
    expect(result.receipt.sourceRefs).toContain("https://github.com/amazon-science/GaRAGe");
    expect(result.garageReceiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.liveDistribution.rowCount).toBe(3);
    expect(result.liveDistribution.groundingPrecisionMean0to1).toBeGreaterThan(0.86);
    expect(result.liveDistribution.groundingRecallMean0to1).toBeGreaterThan(0.84);
    expect(result.liveDistribution.evidenceCoverage0to1).toBe(1);
    expect(result.scoreDrift.groundingPrecisionDrop0to1).toBeCloseTo(0.015, 5);
    expect(result.behaviorDrift.contextDivergence0to1).toBe(0);
    expect(result.liveRows[0]).toMatchObject({
      evalPackId: "garage-grounding-live-drift-v1",
      benchmarkDatasetHash: "data/GaRAGe_benchmark.jsonl@7f3e72c9e0d49946f862b282f863b1a7f01646d6",
      liveResultHash: "garage-live-result-1",
      driftStatisticHash: "garage-drift-statistic-1",
      alertReceiptHash: "garage-alert-receipt-1",
      evidenceCoverage0to1: 1,
    });
    expect(result.liveRows[0]!.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildLiveDriftWatchAlerts(result.receipt)).toEqual([]);
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({
      valid: true,
      errors: [],
      receiptHash: result.receipt.receiptHash,
    });
  });

  test("fails closed when GaRAGe live rows lose source/dataset proof, signed evidence, and grounding quality", () => {
    const result = runGarageLiveDrift({
      agentId: "rag-grounding-agent",
      baselineWindow: {
        windowId: "baseline-garage-proof",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: complexities.map((_, index) => garageRow(index, "baseline")),
      },
      liveWindow: {
        windowId: "live-garage-proof",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: complexities.map((_, index) =>
          garageRow(index, "live", {
            sourceRefHash: index === 0 ? "github:amazon-science/GaRAGe@2b7264f5d4e066affbe4b67b7d3b9cffeff98ede" : "",
            benchmarkDatasetHash: index === 0 ? "data/GaRAGe_benchmark.jsonl@7f3e72c9e0d49946f862b282f863b1a7f01646d6" : "",
            datasetManifestHash: index === 0 ? "amc-garage-dataset-manifest-v1" : "",
            groundingAnnotationSchemaHash: index === 0 ? "amc-garage-grounding-schema-v1" : "",
            liveResultHash: index === 0 ? "garage-live-result-1" : undefined,
            driftStatisticHash: index === 0 ? "garage-drift-statistic-1" : undefined,
            alertReceiptHash: index === 0 ? "garage-alert-receipt-1" : undefined,
            answerValidated: index === 0,
            groundingPrecision0to1: 0.5,
            groundingRecall0to1: 0.48,
            citationSupport0to1: 0.46,
            answerFaithfulness0to1: 0.52,
            questionComplexity: index === 0 ? complexities[index]! : "custom",
            signedEvidenceRefs: index === 0 ? ["garage-ledger:live-1"] : [],
          }),
        ),
      },
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    const alertMetricIds = result.receipt.alerts.map((alert) => alert.metricId);
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.recommendation).toBe("alert");
    expect(result.liveDistribution.evidenceCoverage0to1).toBeLessThan(1);
    expect(result.scoreDrift.groundingPrecisionDrop0to1).toBeGreaterThan(0.3);
    expect(alertMetricIds).toEqual(expect.arrayContaining([
      "garageGroundingPrecisionMean0to1",
      "garageGroundingRecallMean0to1",
      "garageCitationSupportMean0to1",
      "garageEvidenceCoverage0to1",
    ]));
    expect(result.liveRows[1]!.evidenceCoverage0to1).toBeLessThan(1);
    expect(buildLiveDriftWatchAlerts(result.receipt).map((alert) => alert.metricId)).toEqual(alertMetricIds);
    const verification = verifyLiveDriftReceipt(result.receipt);
    expect(verification.valid).toBe(false);
    expect(verification.errors.join(" ")).toContain("missing signedEvidenceRefs");
  });
});
