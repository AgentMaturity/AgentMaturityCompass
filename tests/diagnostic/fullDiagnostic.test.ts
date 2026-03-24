import { describe, expect, test } from "vitest";
import {
  getAllQuestions,
  getQuestionsByLayer,
  scoreFullDiagnostic,
  type FullDiagnosticResult,
} from "../../src/diagnostic/fullDiagnostic.js";

describe("fullDiagnostic", () => {
  test("getAllQuestions returns 235 questions", () => {
    const questions = getAllQuestions();
    expect(questions).toHaveLength(235);
  });

  test("getQuestionsByLayer returns 5 layers in canonical order", () => {
    const layers = getQuestionsByLayer();
    expect(layers).toHaveLength(5);
    expect(layers.map((l) => l.layerName)).toEqual([
      "Strategic Agent Operations",
      "Leadership & Autonomy",
      "Culture & Alignment",
      "Resilience",
      "Skills",
    ]);
  });

  test("layer question counts match expected totals", () => {
    const layers = getQuestionsByLayer();
    const counts: Record<string, number> = {};
    for (const l of layers) counts[l.layerName] = l.questions.length;
    expect(counts["Strategic Agent Operations"]).toBe(18);
    expect(counts["Leadership & Autonomy"]).toBe(23);
    expect(counts["Culture & Alignment"]).toBe(94);
    expect(counts["Resilience"]).toBe(53);
    expect(counts["Skills"]).toBe(47);
  });

  test("all layer questions sum to 235", () => {
    const layers = getQuestionsByLayer();
    const total = layers.reduce((s, l) => s + l.questions.length, 0);
    expect(total).toBe(235);
  });

  test("scoreFullDiagnostic returns L0 with empty answers", () => {
    const result = scoreFullDiagnostic({}, 1000);
    expect(result.questionCount).toBe(235);
    expect(result.totalScore).toBe(0);
    expect(result.maxScore).toBe(235 * 5);
    expect(result.percentage).toBe(0);
    expect(result.overallLevel).toBe("L0");
    expect(result.layerScores).toHaveLength(5);
    expect(result.durationMs).toBe(1000);
    // All questions should be scored at 0
    for (const qs of result.questionScores) {
      expect(qs.level).toBe(0);
    }
  });

  test("scoreFullDiagnostic returns L5 when all answers are 5", () => {
    const questions = getAllQuestions();
    const answers: Record<string, number> = {};
    for (const q of questions) answers[q.id] = 5;
    const result = scoreFullDiagnostic(answers, 5000);
    expect(result.totalScore).toBe(235 * 5);
    expect(result.percentage).toBe(100);
    expect(result.overallLevel).toBe("L5");
    expect(result.recommendations).toHaveLength(0);
  });

  test("scoreFullDiagnostic computes correct layer averages", () => {
    const layers = getQuestionsByLayer();
    // Set all Strategic Agent Operations questions to L3
    const answers: Record<string, number> = {};
    for (const q of layers[0]!.questions) answers[q.id] = 3;
    const result = scoreFullDiagnostic(answers, 2000);
    const saoLayer = result.layerScores.find(
      (l) => l.layerName === "Strategic Agent Operations"
    )!;
    expect(saoLayer.avgLevel).toBe(3);
    expect(saoLayer.totalScore).toBe(18 * 3);
    expect(saoLayer.maxScore).toBe(18 * 5);
  });

  test("recommendations are sorted by level ascending and capped at 5", () => {
    const result = scoreFullDiagnostic({}, 500);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i]!.currentLevel).toBeGreaterThanOrEqual(
        result.recommendations[i - 1]!.currentLevel
      );
    }
  });

  test("recommendations include howToImprove text", () => {
    const result = scoreFullDiagnostic({}, 500);
    for (const rec of result.recommendations) {
      expect(rec.howToImprove).toBeTruthy();
      expect(typeof rec.howToImprove).toBe("string");
    }
  });

  test("clamps out-of-range scores", () => {
    const questions = getAllQuestions();
    const answers: Record<string, number> = {};
    answers[questions[0]!.id] = 10; // over max
    answers[questions[1]!.id] = -3; // under min
    const result = scoreFullDiagnostic(answers, 100);
    const q0 = result.questionScores.find((q) => q.questionId === questions[0]!.id)!;
    const q1 = result.questionScores.find((q) => q.questionId === questions[1]!.id)!;
    expect(q0.level).toBe(5);
    expect(q1.level).toBe(0);
  });

  test("percentage thresholds map to correct levels", () => {
    const questions = getAllQuestions();

    // ~50% → L3
    const halfAnswers: Record<string, number> = {};
    let count = 0;
    for (const q of questions) {
      halfAnswers[q.id] = count < 118 ? 5 : 0; // 118*5 = 590; 590/1175 ≈ 50.2%
      count++;
    }
    const halfResult = scoreFullDiagnostic(halfAnswers, 100);
    expect(halfResult.overallLevel).toBe("L3");

    // ~85% → L5
    const highAnswers: Record<string, number> = {};
    for (const q of questions) highAnswers[q.id] = 4;
    // 235*4 = 940; 940/1175 = 80% → L4
    const highResult = scoreFullDiagnostic(highAnswers, 100);
    expect(highResult.overallLevel).toBe("L4");
  });

  test("result shape matches FullDiagnosticResult interface", () => {
    const result = scoreFullDiagnostic({}, 0);
    // Verify all top-level keys exist
    const keys: (keyof FullDiagnosticResult)[] = [
      "questionCount", "totalScore", "maxScore", "percentage",
      "overallLevel", "layerScores", "questionScores",
      "recommendations", "durationMs",
    ];
    for (const key of keys) {
      expect(result).toHaveProperty(key);
    }
  });
});
