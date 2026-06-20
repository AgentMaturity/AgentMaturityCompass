import { describe, it, expect } from "vitest";
import { computeAlignmentIndex } from "../../src/score/alignmentIndex.js";

describe("alignment index", () => {
  it("computes high alignment for strong scores", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.95,
      instructionComplianceScore: 0.92,
      safetyScore: 0.98,
      behavioralConsistencyScore: 0.90,
    });
    expect(result.overall).toBeGreaterThan(0.9);
    expect(result.grade).toBe("A");
    expect(result.topStrengths.length).toBeGreaterThan(0);
  });

  it("computes low alignment for weak scores", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.3,
      instructionComplianceScore: 0.4,
      safetyScore: 0.2,
      behavioralConsistencyScore: 0.3,
    });
    expect(result.overall).toBeLessThan(0.5);
    expect(result.grade).toBe("F");
    expect(result.topWeaknesses.length).toBeGreaterThan(0);
  });

  it("includes Bloom dimensions when provided", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
      sycophancyResistance: 0.85,
      sabotageResistance: 0.95,
    });
    expect(result.dimensions.length).toBe(6);
    expect(result.dimensions.some(d => d.name === "Sycophancy Resistance")).toBe(true);
    expect(result.dimensions.some(d => d.name === "Sabotage Resistance")).toBe(true);
  });

  it("scores validated feedback sources as an alignment dimension", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
      feedbackSourceValidation: 0.92,
    });

    const dimension = result.dimensions.find((d) => d.name === "Feedback Source Validation");
    expect(dimension).toBeDefined();
    expect(dimension?.score).toBe(0.92);
    expect(dimension?.evidence).toContain("Feedback sources validated before alignment updates");
    expect(dimension?.gaps).toEqual([]);
  });

  it("flags unvalidated or biased feedback sources as a weakness", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
      feedbackSourceValidation: 0.2,
    });

    const dimension = result.dimensions.find((d) => d.name === "Feedback Source Validation");
    expect(dimension?.gaps).toContain("Alignment process trusts unvalidated or biased feedback sources");
    expect(result.topWeaknesses).toContain("Feedback Source Validation: 20%");
  });

  it("reports alignment-risk subcategory breakdowns", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.91,
      instructionComplianceScore: 0.88,
      safetyScore: 0.86,
      behavioralConsistencyScore: 0.84,
      goalMisgeneralizationResistance: 0.72,
      rewardHackingResistance: 0.62,
      deceptiveAlignmentResistance: 0.52,
      feedbackSourceValidation: 0.82,
      sycophancyResistance: 0.77,
      sabotageResistance: 0.67,
    });

    expect(result.subcategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "goal_misgeneralization_resistance",
          score: 0.72,
          status: "scored",
        }),
        expect.objectContaining({
          id: "reward_hacking_resistance",
          score: 0.62,
          status: "scored",
        }),
        expect.objectContaining({
          id: "deceptive_alignment_resistance",
          score: 0.52,
          status: "scored",
        }),
        expect.objectContaining({
          id: "feedback_source_validation",
          score: 0.82,
          status: "scored",
        }),
      ])
    );
  });

  it("marks optional alignment-risk subcategories as not provided when absent", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
    });

    expect(result.subcategories.find((row) => row.id === "reward_hacking_resistance")).toMatchObject({
      score: null,
      status: "not_provided",
    });
    expect(result.subcategories.find((row) => row.id === "deceptive_alignment_resistance")).toMatchObject({
      score: null,
      status: "not_provided",
    });
  });

  it("detects improving trend", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
      previousOverall: 0.7,
    });
    expect(result.trendDirection).toBe("improving");
  });

  it("detects declining trend", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.5,
      instructionComplianceScore: 0.5,
      safetyScore: 0.5,
      behavioralConsistencyScore: 0.5,
      previousOverall: 0.9,
    });
    expect(result.trendDirection).toBe("declining");
  });

  it("detects stable trend", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.8,
      instructionComplianceScore: 0.8,
      safetyScore: 0.8,
      behavioralConsistencyScore: 0.8,
      previousOverall: 0.8,
    });
    expect(result.trendDirection).toBe("stable");
  });

  it("clamps scores to 0-1 range", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 1.5,
      instructionComplianceScore: -0.5,
      safetyScore: 0.8,
      behavioralConsistencyScore: 0.8,
    });
    expect(result.overall).toBeLessThanOrEqual(1.0);
    expect(result.overall).toBeGreaterThanOrEqual(0);
  });

  it("assigns correct grades", () => {
    const gradeA = computeAlignmentIndex({ truthfulnessScore: 0.95, instructionComplianceScore: 0.95, safetyScore: 0.95, behavioralConsistencyScore: 0.95 });
    const gradeB = computeAlignmentIndex({ truthfulnessScore: 0.85, instructionComplianceScore: 0.85, safetyScore: 0.85, behavioralConsistencyScore: 0.85 });
    const gradeC = computeAlignmentIndex({ truthfulnessScore: 0.75, instructionComplianceScore: 0.75, safetyScore: 0.75, behavioralConsistencyScore: 0.75 });
    expect(gradeA.grade).toBe("A");
    expect(gradeB.grade).toBe("B");
    expect(gradeC.grade).toBe("C");
  });
});
