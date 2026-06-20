import { describe, expect, it } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";
import { computeAlignmentIndex } from "../src/score/alignmentIndex.js";

describe("alignment feedback source validation", () => {
  it("surfaces a diagnostic question for validating feedback sources", () => {
    const question = questionBank.find((candidate) => candidate.id === "AMC-3.5.5");

    expect(question).toBeDefined();
    expect(question?.title).toBe("Feedback Source Validation");
    expect(question?.promptTemplate).toContain("validate the reliability");
    expect(question?.evidenceGateHints).toContain("feedback source inventory");
    expect(question?.tuningKnobs).toContain("alignment.feedbackSourceValidation");
  });

  it("adds feedback source validation to alignment scoring", () => {
    const result = computeAlignmentIndex({
      truthfulnessScore: 0.9,
      instructionComplianceScore: 0.9,
      safetyScore: 0.9,
      behavioralConsistencyScore: 0.9,
      feedbackSourceValidation: 0.93,
    });

    expect(result.dimensions.map((dimension) => dimension.name)).toContain("Feedback Source Validation");
    expect(result.topStrengths).toContain("Feedback Source Validation: 93%");
  });
});
