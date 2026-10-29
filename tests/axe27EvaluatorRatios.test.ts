import { describe, expect, test } from "vitest";
import { scoreCalibrationGap, type CalibrationInput } from "../src/score/calibrationGap.js";
import { scoreCapabilityElicitation } from "../src/score/capabilityElicitation.js";
import { detectErrorAmplification } from "../src/score/architectureTaskAlignment.js";
import { scoreRAGMaturity, type RAGCapabilityProfile } from "../src/score/ragMaturity.js";

const ragProfile: RAGCapabilityProfile = {
  hybridSearchEnabled: false, rerankingEnabled: false, retrievalAccuracyBenchmarked: false,
  chunkingStrategy: "naive", chunkOverlapConfigured: false, metadataAttachedToChunks: true,
  chunkQualityValidated: false, incrementalIndexingEnabled: false, stalenessDetectionEnabled: false,
  dataLineageTracked: false, testedBeyond100Docs: false, latencyBenchmarked: false,
  failoverConfigured: false, sourceAttributionInAnswers: true, confidenceScoresProvided: true,
  groundingVerified: true, accessControlOnIndex: false, piiFilteringEnabled: false, indexTamperDetected: false,
};

describe("AXE-27 evaluator denominator guards", () => {
  test("empty calibration cannot score 100 or L5", () => {
    expect(scoreCalibrationGap({ selfReported: {}, observed: {} })).toMatchObject({
      score: null, meanCalibrationError: null, expectedCalibrationError: null,
      overconfidenceRatio: null, underconfidenceRatio: null, outcome: "not_evaluated", sampleSize: 0,
    });
  });

  const unpairedCalibration: CalibrationInput[] = [
    { selfReported: { accuracy: 0 }, observed: {} },
    { selfReported: {}, observed: { accuracy: 0 } },
    { selfReported: { accuracy: Number.NaN }, observed: { accuracy: 0 } },
    { selfReported: { accuracy: 0 }, observed: { accuracy: Number.POSITIVE_INFINITY } },
  ];
  test.each(unpairedCalibration)("unpaired or nonfinite calibration dimensions cannot become observations", (input) => {
    expect(scoreCalibrationGap(input)).toMatchObject({
      score: null, meanCalibrationError: null, outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test("measured zero calibration error still produces perfect measured calibration", () => {
    expect(scoreCalibrationGap({ selfReported: { accuracy: 0.8 }, observed: { accuracy: 0.8 } })).toMatchObject({
      score: 100, meanCalibrationError: 0, outcome: "measured", sampleSize: 1,
    });
  });

  test("no targets and only a baseline cannot establish coverage or an elicitation delta", () => {
    expect(scoreCapabilityElicitation({ targetCapabilities: [], probes: [{ capabilityId: "a", mode: "baseline", succeeded: false }] })).toMatchObject({
      targetCoverageRate: null, elicitationDelta: null, score: null,
      metricOutcomes: { targetCoverageRate: "not_evaluated", elicitationDelta: "not_evaluated" },
    });
  });

  test("an empty capability evaluation retains missing ratios", () => {
    expect(scoreCapabilityElicitation({ targetCapabilities: [], probes: [] })).toMatchObject({
      score: null, targetCoverageRate: null, discoveredRate: null, hiddenCapabilityRate: null,
      elicitationDelta: null, outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test("unattempted elicitation cannot appear as a measured zero delta", () => {
    expect(scoreCapabilityElicitation({ targetCapabilities: ["a"], probes: [{ capabilityId: "a", mode: "baseline", succeeded: true }] })).toMatchObject({
      elicitationDelta: null, metricOutcomes: { elicitationDelta: "not_evaluated" },
    });
  });

  test("empty pipelines cannot claim perfect containment", () => {
    expect(detectErrorAmplification([])).toMatchObject({
      score: null, amplificationRatio: null, independentErrorRate: null, compoundedErrorRate: null,
      outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test("zero absolute errors do not define a relative amplification ratio", () => {
    expect(detectErrorAmplification([{ stageId: "a", errorRate: 0 }])).toMatchObject({
      score: 100, amplificationRatio: null, independentErrorRate: 0, compoundedErrorRate: 0,
      metricOutcomes: { amplificationRatio: "not_evaluated", score: "measured" },
    });
  });

  test("small positive error denominators preserve the actual relative ratio", () => {
    const result = detectErrorAmplification([{ stageId: "a", errorRate: 1e-8 }, { stageId: "b", errorRate: 1e-8, propagationFactor: 2 }]);
    expect(result).toMatchObject({ amplificationRatio: 1.5, metricOutcomes: { amplificationRatio: "measured" } });
    expect(result.independentErrorRate).toBeGreaterThan(0);
  });

  test("RAG configuration flags cannot fabricate missing metric samples", () => {
    const diagnostics = scoreRAGMaturity(ragProfile).diagnostics;
    expect(diagnostics.retrievalQuality).toMatchObject({ precision: null, recall: null, f1: null, score: null, outcome: "not_evaluated", sampleSize: 0 });
    expect(diagnostics.metadataQuality).toMatchObject({ attributionRate: null, score: null, outcome: "not_evaluated", sampleSize: 0 });
    expect(diagnostics.hallucinationRisk).toMatchObject({ riskScore: null, groundedClaimRate: null, outcome: "not_evaluated", sampleSize: 0 });
    expect(diagnostics.citationIntegrity).toMatchObject({ accuracyRate: null, integrityScore: null, outcome: "not_evaluated", sampleSize: 0 });
    expect(diagnostics.retrievalDrift).toMatchObject({ deltaF1: null, score: null, outcome: "not_evaluated", sampleSize: 0 });
  });

  test("missing hallucination and citation measurements cannot classify deployment risk as low", () => {
    const profile: RAGCapabilityProfile = { ...ragProfile, hybridSearchEnabled: true, rerankingEnabled: true,
      retrievalAccuracyBenchmarked: true, retrievalHitRate: 1, chunkingStrategy: "semantic",
      chunkOverlapConfigured: true, chunkQualityValidated: true, incrementalIndexingEnabled: true,
      stalenessDetectionEnabled: true, dataLineageTracked: true, testedBeyond100Docs: true,
      latencyBenchmarked: true, p99LatencyMs: 1, failoverConfigured: true, accessControlOnIndex: true,
      piiFilteringEnabled: true, indexTamperDetected: true };
    expect(scoreRAGMaturity(profile).deploymentRisk).toBe("high");
  });

  test("empty retrieved and relevant sets cannot be averaged as measured ratios", () => {
    expect(scoreRAGMaturity({ ...ragProfile, retrievalEvaluations: [{ queryId: "empty", retrievedChunkIds: [], relevantChunkIds: [] }] }).diagnostics.retrievalQuality).toMatchObject({
      precision: null, recall: null, f1: null, score: null, outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("invalid claim denominators cannot manufacture perfect grounded rates (%s)", (claimCount) => {
    expect(scoreRAGMaturity({ ...ragProfile, ragOutputEvaluations: [{ outputId: "empty", claimCount, groundedClaimCount: 1, citationCount: 1 }] }).diagnostics.hallucinationRisk).toMatchObject({
      riskScore: null, groundedClaimRate: null, citationCoverageRate: null, contradictionRate: null,
      outcome: "not_evaluated", sampleSize: 0,
    });
  });

  test("zero-claim outputs cannot dilute measured unsupported claims", () => {
    expect(scoreRAGMaturity({ ...ragProfile, ragOutputEvaluations: [
      { outputId: "empty", claimCount: 0, groundedClaimCount: 1, citationCount: 1 },
      { outputId: "real", claimCount: 1, groundedClaimCount: 0, citationCount: 0 },
    ] }).diagnostics.hallucinationRisk).toMatchObject({
      groundedClaimRate: 0, citationCoverageRate: 0, outcome: "measured", sampleSize: 1,
    });
  });
});
