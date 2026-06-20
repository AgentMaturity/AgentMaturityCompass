import { describe, expect, test } from "vitest";
import {
  runRagTextGenerationLiveDrift,
  type RagTextGenerationLiveDriftRow,
  type RagTextGenerationSourceProof,
} from "../src/watch/ragTextGenerationLiveDrift.js";
import { verifyLiveDriftReceipt } from "../src/watch/liveDriftAlerts.js";

const sourceProof: RagTextGenerationSourceProof = {
  openAlexWorkId: "https://openalex.org/W4394947112",
  doi: "https://doi.org/10.1145/3805774",
  title: "A Survey on Retrieval-Augmented Text Generation for Large Language Models",
  publisher: "Association for Computing Machinery (ACM)",
  venue: "ACM Computing Surveys",
  publicationDate: "2026-05-15",
  openAlexMetadataHash: "openalex-w4394947112-metadata-hash",
  crossrefMetadataHash: "crossref-10-1145-3805774-metadata-hash",
  publisherMetadataHash: "acm-dl-10-1145-3805774-metadata-hash",
  metadataVerifiedAt: "2026-06-20T00:00:00.000Z",
  metadataReviewReceiptHash: "gap-0606-metadata-review-receipt-hash",
  noPaperContentCopyProofHash: "gap-0606-no-paper-prose-or-data-copy-proof",
};

function row(index: number, phase: "baseline" | "live", overrides: Partial<RagTextGenerationLiveDriftRow> = {}): RagTextGenerationLiveDriftRow {
  return {
    traceId: `rag-text-${phase}-${index}`,
    scenarioId: `rag-text-scenario-${index}`,
    timestamp: phase === "baseline" ? `2026-06-20T00:0${index}:00.000Z` : `2026-06-20T01:0${index}:00.000Z`,
    queryHash: `query-hash-${index}`,
    retrievedContextHash: `${phase}-retrieved-context-hash-${index}`,
    generatedAnswerHash: `${phase}-generated-answer-hash-${index}`,
    referenceAnswerHash: `reference-answer-hash-${index}`,
    strategyComparisonId: "rag-text-generation-comparison-v1",
    strategyRunId: `${phase}-run-${index}`,
    strategyManifestHash: "rag-text-strategy-manifest-v1",
    indexManifestHash: "rag-text-index-manifest-v1",
    querySetHash: "rag-text-query-set-v1",
    evaluatorConfigHash: "rag-text-evaluator-config-v1",
    modelConfigHash: "rag-text-model-config-v1",
    strategyResultHash: `${phase}-strategy-result-${index}`,
    corpusHash: "rag-text-corpus-v1",
    retrieverId: "hybrid-retriever-v1",
    generatorId: "generation-model-route-v1",
    frameworkId: "enterprise-rag-runtime-v1",
    evaluationMode: "hybrid",
    pipelineStrategy: "metadata_replacement_sentence_window",
    judgeType: "hybrid",
    retrievalTopK: 5,
    accuracy0to1: 0.92 - index * 0.01,
    completeness0to1: 0.9 - index * 0.01,
    utilization0to1: 0.86 - index * 0.01,
    numericalAccuracy0to1: 0.94 - index * 0.01,
    hallucinationRate0to1: 0.02 + index * 0.005,
    passageGroundingCoverage0to1: 0.95,
    citationCoverage0to1: 0.9,
    answerSupportCoverage0to1: 0.93,
    latencyMs: 800 + index * 10,
    costUsd: 0.02 + index * 0.001,
    baselineDistributionHash: `baseline-distribution-${index}`,
    liveSampleManifestHash: `live-sample-manifest-${index}`,
    driftStatisticHash: `drift-statistic-${index}`,
    alertReceiptHash: `alert-receipt-${index}`,
    evidenceRefs: [`rag-text-evidence:${phase}:${index}`],
    signedEvidenceRefs: [`rag-text-ledger:${phase}:${index}`],
    ...overrides,
  };
}

describe("GAP-0606 RAG text-generation live drift", () => {
  test("approves stable metadata-grounded RAG text-generation windows and emits a verifiable receipt", () => {
    const baselineRows = [1, 2, 3].map((index) => row(index, "baseline"));
    const liveRows = baselineRows.map((baselineRow, zeroIndex) => row(zeroIndex + 1, "live", {
      scenarioId: baselineRow.scenarioId,
      accuracy0to1: baselineRow.accuracy0to1 - 0.01,
      completeness0to1: baselineRow.completeness0to1 - 0.005,
      utilization0to1: baselineRow.utilization0to1,
      numericalAccuracy0to1: baselineRow.numericalAccuracy0to1,
      hallucinationRate0to1: baselineRow.hallucinationRate0to1 + 0.005,
    }));

    const result = runRagTextGenerationLiveDrift({
      agentId: "rag-text-generation-agent",
      sourceProof,
      baselineWindow: {
        windowId: "baseline-rag-text-generation",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-rag-text-generation",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: liveRows,
      },
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    expect(result.sourceEvidenceCoverage0to1).toBe(1);
    expect(result.sourceMissingReasons).toEqual([]);
    expect(result.receipt.failClosed).toBe(false);
    expect(result.receipt.alerts).toEqual([]);
    expect(result.watchAlerts).toEqual([]);
    expect(result.receipt.baselineDistribution.ragRowCount).toBe(3);
    expect(result.receipt.liveDistribution.ragRowCount).toBe(3);
    expect(result.receipt.liveDistribution.ragStrategyEvidenceCoverage0to1).toBe(1);
    expect(result.receipt.scoreDrift.ragAccuracyDrop0to1).toBeCloseTo(0.01);
    expect(result.receipt.liveRows).toHaveLength(3);
    expect(result.receipt.liveRows[0]).toMatchObject({
      ragEvaluationMode: "hybrid",
      ragPipelineStrategy: "metadata_replacement_sentence_window",
      ragStrategyManifestHash: "rag-text-strategy-manifest-v1",
      ragGeneratedDataFinalized: true,
    });
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true, errors: [] });
  });

  test("fails closed on live RAG quality drift and incomplete metadata-only source proof", () => {
    const baselineRows = [1, 2, 3].map((index) => row(index, "baseline", {
      accuracy0to1: 0.93,
      completeness0to1: 0.92,
      utilization0to1: 0.9,
      hallucinationRate0to1: 0.02,
    }));
    const liveRows = baselineRows.map((baselineRow, zeroIndex) => row(zeroIndex + 1, "live", {
      scenarioId: baselineRow.scenarioId,
      accuracy0to1: 0.78,
      completeness0to1: 0.77,
      utilization0to1: 0.7,
      numericalAccuracy0to1: 0.8,
      hallucinationRate0to1: 0.11,
      strategyResultHash: zeroIndex === 0 ? `live-strategy-result-${zeroIndex + 1}` : "",
      liveSampleManifestHash: zeroIndex === 0 ? `live-sample-manifest-${zeroIndex + 1}` : "",
    }));
    const incompleteSourceProof: RagTextGenerationSourceProof = {
      ...sourceProof,
      publisherMetadataHash: "",
      metadataReviewReceiptHash: "",
    };

    const result = runRagTextGenerationLiveDrift({
      agentId: "rag-text-generation-agent",
      sourceProof: incompleteSourceProof,
      baselineWindow: {
        windowId: "baseline-rag-text-generation-drift",
        startedAt: "2026-06-20T00:00:00.000Z",
        endedAt: "2026-06-20T00:05:00.000Z",
        rows: baselineRows,
      },
      liveWindow: {
        windowId: "live-rag-text-generation-drift",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:05:00.000Z",
        rows: liveRows,
      },
      thresholds: {
        maxRagAccuracyDrop0to1: 0.05,
        maxRagCompletenessDrop0to1: 0.05,
        maxRagUtilizationDrop0to1: 0.05,
        maxRagHallucinationRateIncrease0to1: 0.03,
        minRagStrategyEvidenceCoverage0to1: 1,
      },
      now: new Date("2026-06-20T01:06:00.000Z"),
    });

    expect(result.sourceEvidenceCoverage0to1).toBeLessThan(1);
    expect(result.sourceMissingReasons).toEqual(expect.arrayContaining(["publisherMetadataHash", "metadataReviewReceiptHash"]));
    expect(result.receipt.failClosed).toBe(true);
    expect(result.receipt.recommendation).toBe("alert");
    expect(result.receipt.scoreDrift.ragAccuracyDrop0to1).toBeCloseTo(0.15);
    expect(result.receipt.scoreDrift.ragHallucinationRateIncrease0to1).toBeCloseTo(0.09);
    expect(result.receipt.liveDistribution.ragStrategyEvidenceCoverage0to1).toBeCloseTo(1 / 3);
    expect(result.receipt.alerts.map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "ragAccuracyMean0to1",
      "ragCompletenessMean0to1",
      "ragUtilizationMean0to1",
      "ragHallucinationRate0to1",
      "ragStrategyEvidenceCoverage0to1",
    ]));
    expect(result.watchAlerts.map((alert) => alert.metricId)).toEqual(result.receipt.alerts.map((alert) => alert.metricId));
    expect(verifyLiveDriftReceipt(result.receipt)).toMatchObject({ valid: true, errors: [] });
  });
});
