import { describe, expect, test } from "vitest";
import { getRapidQuestions, scoreRapidAssessment } from "../src/diagnostic/rapidQuickscore.js";

describe("rapidQuickscore", () => {
  test("uses exactly 5 rapid questions across 5 layers", () => {
    const questions = getRapidQuestions();
    expect(questions).toHaveLength(5);
    const uniqueIds = new Set(questions.map((q) => q.id));
    expect(uniqueIds.size).toBe(5);
    const uniqueLayers = new Set(questions.map((q) => q.layerName));
    expect(uniqueLayers.size).toBe(5);
  });

  test("computes L1 baseline and top recommendations for low scores", () => {
    const result = scoreRapidAssessment({});
    expect(result.totalScore).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.preliminaryLevel).toBe("L1");
    expect(result.recommendations).toHaveLength(3);
  });

  test("returns no recommendations when all rapid questions are >= L3", () => {
    const answers: Record<string, number> = {};
    for (const question of getRapidQuestions()) {
      answers[question.id] = 4;
    }
    const result = scoreRapidAssessment(answers);
    expect(result.preliminaryLevel).toBe("L4");
    expect(result.recommendations).toHaveLength(0);
  });

  test("prioritizes the lowest scored questions first", () => {
    const answers: Record<string, number> = {
      "AMC-1.1": 2,
      "AMC-2.1": 1,
      "AMC-3.1.1": 0,
      "AMC-4.1": 3,
      "AMC-5.1": 4
    };
    const result = scoreRapidAssessment(answers);
    expect(result.recommendations.map((r) => r.questionId)).toEqual([
      "AMC-3.1.1",
      "AMC-2.1",
      "AMC-1.1"
    ]);
    for (const recommendation of result.recommendations) {
      expect(recommendation.howToImprove.length).toBeGreaterThan(5);
      expect(recommendation.whyItMatters.length).toBeGreaterThan(10);
    }
  });
});

