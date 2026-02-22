import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

describe("question bank", () => {
  test("has exactly 97 questions", () => {
    expect(questionBank).toHaveLength(97);
  });

  test("has expected layer distribution 15/19/27/16/20", () => {
    const counts = questionBank.reduce<Record<string, number>>((acc, q) => {
      acc[q.layerName] = (acc[q.layerName] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      "Strategic Agent Operations": 15,
      "Leadership & Autonomy": 19,
      "Culture & Alignment": 27,
      Resilience: 16,
      Skills: 20
    });
  });

  test("each question has six options levels 0..5 and six gates", () => {
    for (const question of questionBank) {
      expect(question.options).toHaveLength(6);
      expect(question.gates).toHaveLength(6);

      const optionLevels = question.options.map((o) => o.level);
      const gateLevels = question.gates.map((g) => g.level);

      expect(optionLevels).toEqual([0, 1, 2, 3, 4, 5]);
      expect(gateLevels).toEqual([0, 1, 2, 3, 4, 5]);

      for (const gate of question.gates) {
        expect(gate.minEvents).toBeGreaterThanOrEqual(0);
        expect(gate.minSessions).toBeGreaterThanOrEqual(0);
        expect(gate.minDistinctDays).toBeGreaterThanOrEqual(0);
        expect((gate.acceptedTrustTiers ?? []).length).toBeGreaterThan(0);
        if (gate.level >= 4) {
          expect(gate.acceptedTrustTiers?.includes("SELF_REPORTED")).toBe(false);
        }
        if (gate.level === 5) {
          expect(gate.requiredTrustTier).toBe("OBSERVED");
        }
      }
    }
  });
});
