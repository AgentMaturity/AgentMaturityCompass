import { describe, expect, test } from "vitest";
import { questionBank } from "../src/diagnostic/questionBank.js";

describe("question bank", () => {
  test("has exactly 48 questions", () => {
    expect(questionBank).toHaveLength(48);
  });

  test("has expected layer distribution 9/5/16/7/5", () => {
    const counts = {
      L1: questionBank.filter((q) => q.id.startsWith("AMC-1.")).length,
      L2: questionBank.filter((q) => q.id.startsWith("AMC-2.")).length,
      L3: questionBank.filter((q) => q.id.startsWith("AMC-3.")).length,
      L4: questionBank.filter((q) => q.id.startsWith("AMC-4.")).length,
      L5: questionBank.filter((q) => q.id.startsWith("AMC-5.")).length
    };

    expect(counts).toEqual({ L1: 11, L2: 5, L3: 16, L4: 9, L5: 7 });
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
