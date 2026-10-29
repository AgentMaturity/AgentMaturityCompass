import { describe, expect, test } from "vitest";
import {
  scoreFactuality,
  scoreParametricFactuality,
  scoreSearchRetrievalFactuality,
  scoreGroundedFactuality,
} from "../src/score/factuality.js";
import {
  createAttestation,
  verifyAttestation,
  scoreOutputAttestation,
} from "../src/score/outputAttestation.js";
import { scoreMutualVerification } from "../src/score/mutualVerification.js";

const noParametricClaims = {
  totalClaims: 0,
  verifiedCorrect: 0,
  verifiedIncorrect: 0,
  unverifiable: 0,
  expressesUncertainty: true,
  refusesWhenUnsure: true,
};
const noRetrievalClaims = {
  totalClaims: 0,
  correctlyAttributed: 0,
  fabricatedCitations: 0,
  sourcesVerified: true,
  contradictionsFlagged: true,
};
const noGroundedClaims = {
  totalClaims: 0,
  faithfulClaims: 0,
  unfaithfulClaims: 0,
  distinguishesInference: true,
  flagsInsufficientContext: true,
};

describe("AXE-20 evidence outcomes", () => {
  test("factuality preserves its shape without inventing scores for absent dimensions", () => {
    const result = scoreFactuality({});
    expect(result).toMatchObject({ outcome: "not_evaluated", overallScore: null, overallLevel: null });
    expect(result.recommendations).toEqual([]);
    for (const dimension of [result.parametric, result.searchRetrieval, result.grounded]) {
      expect(dimension).toMatchObject({ outcome: "not_evaluated", score: null, level: null });
      expect(dimension.gaps.length).toBeGreaterThan(0);
    }
  });

  test.each([
    ["parametric", () => scoreParametricFactuality(noParametricClaims)],
    ["search/retrieval", () => scoreSearchRetrievalFactuality(noRetrievalClaims)],
    ["grounded", () => scoreGroundedFactuality(noGroundedClaims)],
  ] as const)("%s factuality cannot score an empty claim set", (_name, score) => {
    expect(score()).toMatchObject({ outcome: "not_evaluated", score: null, level: null });
  });

  test("all-zero factuality dimensions leave the composite unevaluated", () => {
    expect(scoreFactuality({
      parametric: noParametricClaims,
      searchRetrieval: noRetrievalClaims,
      grounded: noGroundedClaims,
    })).toMatchObject({ outcome: "not_evaluated", overallScore: null, overallLevel: null });
  });

  test("empty dimensions do not dilute measured factuality", () => {
    expect(scoreFactuality({
      parametric: { ...noParametricClaims, totalClaims: 1, verifiedCorrect: 1 },
      searchRetrieval: noRetrievalClaims,
      grounded: noGroundedClaims,
    })).toMatchObject({ outcome: "measured", overallScore: 100, overallLevel: 5 });
  });

  test("a measured factuality score of zero remains a measured result", () => {
    expect(scoreFactuality({
      parametric: {
        ...noParametricClaims,
        totalClaims: 1,
        verifiedIncorrect: 1,
        expressesUncertainty: false,
        refusesWhenUnsure: false,
      },
    })).toMatchObject({ outcome: "measured", overallScore: 0, overallLevel: 0 });
  });

  test.each([{}, { attestations: [], verifications: [] }])("output attestation has no score without evidence: %j", (input) => {
    expect(scoreOutputAttestation(input)).toMatchObject({
      outcome: "not_evaluated", score: null, level: null, avgEffectiveTrust: null,
      attestationsIssued: 0, attestationsVerified: 0,
    });
  });

  test("issued attestations are measured while unobserved verification trust stays unavailable", () => {
    const attestation = createAttestation({ agentId: "test", output: "result", trustLevel: 0 }, "test-signing-key-0123456789abcdef");
    expect(scoreOutputAttestation({ attestations: [attestation] })).toMatchObject({
      outcome: "measured", score: 20, level: 1, avgEffectiveTrust: null, attestationsIssued: 1,
    });
  });

  test("verification-only attestation evidence retains a measured zero trust average", () => {
    const attestation = createAttestation({ agentId: "test", output: "result", trustLevel: 0 }, "test-signing-key-0123456789abcdef");
    const verification = verifyAttestation(attestation, "test-signing-key-0123456789abcdef", attestation.timestamp);
    expect(scoreOutputAttestation({ verifications: [verification] })).toMatchObject({
      outcome: "measured", score: 15, level: 1, avgEffectiveTrust: 0, attestationsIssued: 0, attestationsVerified: 1,
    });
  });

  test.each([{}, { verifications: [] }])("mutual verification has no score without evidence: %j", (input) => {
    expect(scoreMutualVerification(input)).toMatchObject({
      outcome: "not_evaluated", score: null, level: null, avgMutualTrust: null, verificationsCompleted: 0,
    });
  });

  test("failed mutual verification is measured without inventing a successful trust average", () => {
    expect(scoreMutualVerification({ verifications: [{
      verified: false,
      reason: "nonce_mismatch",
      challengerTrust: 0,
      responderTrust: 0,
      effectiveMutualTrust: 0,
      protocolCompatible: false,
      scoresFresh: false,
      evidenceChainsValid: false,
      trustDecay: 1,
    }] })).toMatchObject({
      outcome: "measured", score: 15, level: 1, avgMutualTrust: null, verificationsCompleted: 0,
    });
  });
});
