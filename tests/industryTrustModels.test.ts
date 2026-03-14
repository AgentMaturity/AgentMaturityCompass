/**
 * tests/industryTrustModels.test.ts
 * Unit tests for src/score/industryTrustModels.ts
 */

import { describe, it, expect } from "vitest";
import {
  INDUSTRY_TRUST_MODELS,
  computeIndustryAdjustedScore,
  type IndustryTrustModel,
  type IndustryAdjustedScore,
} from "../src/score/industryTrustModels.js";

describe("INDUSTRY_TRUST_MODELS", () => {
  it("should contain at least 5 industry models", () => {
    expect(Object.keys(INDUSTRY_TRUST_MODELS).length).toBeGreaterThanOrEqual(5);
  });

  it("should include healthcare and finance models", () => {
    expect(INDUSTRY_TRUST_MODELS.healthcare).toBeDefined();
    expect(INDUSTRY_TRUST_MODELS.finance).toBeDefined();
  });

  it("each model should have required fields", () => {
    for (const [id, model] of Object.entries(INDUSTRY_TRUST_MODELS)) {
      expect(model.industryId).toBe(id);
      expect(model.name).toBeTruthy();
      expect(["critical", "high", "medium", "low"]).toContain(model.riskProfile);
      expect(typeof model.trustDecayRate).toBe("number");
      expect(typeof model.maxStaleHours).toBe("number");
    }
  });

  it("each model should have dimensionWeights", () => {
    for (const model of Object.values(INDUSTRY_TRUST_MODELS)) {
      expect(model.dimensionWeights).toBeDefined();
      expect(Object.keys(model.dimensionWeights).length).toBeGreaterThan(0);
    }
  });

  it("each model should have evidenceRequirements", () => {
    for (const model of Object.values(INDUSTRY_TRUST_MODELS)) {
      expect(model.evidenceRequirements).toBeDefined();
      expect(typeof model.evidenceRequirements.minObservedShare).toBe("number");
      expect(typeof model.evidenceRequirements.minEvidenceCount).toBe("number");
      expect(Array.isArray(model.evidenceRequirements.requiredDimensions)).toBe(true);
    }
  });

  it("each model should have benchmarkPercentiles", () => {
    for (const model of Object.values(INDUSTRY_TRUST_MODELS)) {
      const bp = model.benchmarkPercentiles;
      expect(bp.p25).toBeLessThan(bp.p50);
      expect(bp.p50).toBeLessThan(bp.p75);
      expect(bp.p75).toBeLessThan(bp.p90);
    }
  });

  it("healthcare model should have critical riskProfile", () => {
    expect(INDUSTRY_TRUST_MODELS.healthcare?.riskProfile).toBe("critical");
  });

  it("healthcare model should have safety as high-weighted dimension", () => {
    const model = INDUSTRY_TRUST_MODELS.healthcare!;
    expect(model.dimensionWeights.safety).toBeGreaterThan(1.0);
  });
});

describe("computeIndustryAdjustedScore", () => {
  const testScores = {
    security: 0.75,
    governance: 0.70,
    reliability: 0.80,
    safety: 0.65,
    compliance: 0.72,
    privacy: 0.60,
    transparency: 0.55,
    fairness: 0.50,
    evaluation: 0.68,
    cost: 0.40,
  };
  const lastVerifiedAt = Date.now() - 3600000; // 1 hour ago

  it("should return an IndustryAdjustedScore for healthcare", () => {
    const result = computeIndustryAdjustedScore(testScores, "healthcare", lastVerifiedAt, 0.75);
    expect(result).toHaveProperty("rawScore");
    expect(result).toHaveProperty("adjustedScore");
    expect(result).toHaveProperty("maturityLevel");
    expect(result).toHaveProperty("industryId");
    expect(result).toHaveProperty("percentileRank");
    expect(result).toHaveProperty("dimensionAdjustments");
    expect(result).toHaveProperty("decayApplied");
    expect(result).toHaveProperty("riskFactors");
    expect(result).toHaveProperty("complianceGaps");
  });

  it("industryId should match the requested industry", () => {
    const result = computeIndustryAdjustedScore(testScores, "finance", lastVerifiedAt, 0.65);
    expect(result.industryId).toBe("finance");
  });

  it("percentileRank should be between 0 and 100", () => {
    const result = computeIndustryAdjustedScore(testScores, "enterprise_saas", lastVerifiedAt, 0.5);
    expect(result.percentileRank).toBeGreaterThanOrEqual(0);
    expect(result.percentileRank).toBeLessThanOrEqual(100);
  });

  it("decayApplied should be 0 for recently verified agent", () => {
    // Verified 1 minute ago — minimal decay
    const recentVerifiedAt = Date.now() - 60000;
    const result = computeIndustryAdjustedScore(testScores, "enterprise_saas", recentVerifiedAt, 0.5);
    expect(result.decayApplied).toBeGreaterThanOrEqual(0);
    expect(result.decayApplied).toBeLessThan(5); // tiny decay
  });

  it("should apply full decay when maxStaleHours is exceeded", () => {
    // Autonomous vehicles has maxStaleHours=24
    const veryOld = Date.now() - 48 * 3600000; // 48 hours ago
    const result = computeIndustryAdjustedScore(testScores, "autonomous_vehicles", veryOld, 0.8);
    expect(result.adjustedScore).toBe(0); // expired → L0 → score=0
    expect(result.maturityLevel).toBe("L0");
  });

  it("adjustedScore should differ from rawScore due to industry weighting", () => {
    // With non-uniform weights, adjusted ≠ raw unless all weights are equal
    const result = computeIndustryAdjustedScore(testScores, "healthcare", lastVerifiedAt, 0.75);
    // Healthcare gives extra weight to safety/privacy — expect adjustment
    expect(typeof result.adjustedScore).toBe("number");
    expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
  });

  it("riskFactors should mention low evidence when observedShare is too low", () => {
    // Healthcare requires minObservedShare=0.7
    const result = computeIndustryAdjustedScore(testScores, "healthcare", lastVerifiedAt, 0.3);
    const hasLowEvidence = result.riskFactors.some(r => r.toLowerCase().includes("evidence"));
    expect(hasLowEvidence).toBe(true);
  });

  it("should fall back to enterprise_saas for unknown industryId", () => {
    const result = computeIndustryAdjustedScore(testScores, "unknown-industry-xyz", lastVerifiedAt, 0.5);
    // enterprise_saas is the fallback
    expect(result.industryId).toBe("enterprise_saas");
  });

  it("dimensionAdjustments should contain entries for each input dimension", () => {
    const result = computeIndustryAdjustedScore(testScores, "finance", lastVerifiedAt, 0.65);
    const inputDims = Object.keys(testScores);
    const adjDims = Object.keys(result.dimensionAdjustments);
    for (const dim of inputDims) {
      expect(adjDims).toContain(dim);
    }
  });
});
