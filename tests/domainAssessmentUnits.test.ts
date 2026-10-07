import { describe, expect, test } from "vitest";
import { assessDomain } from "../src/domains/domainAssessmentEngine.js";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import type { Level0to5, Likert1to5 } from "../src/score/units.js";

/** Raw numbers as an untyped caller (JSON, a cast) would pass them; the engine must validate them itself. */
function input(base: number, answer: number) {
  const baseScores = { "AMC-1.1": base, "AMC-1.2": 3 } as unknown as Record<string, Level0to5>;
  const domainQuestionScores = Object.fromEntries(
    getDomainPackQuestions("health").map((question) => [question.id, 3])
  ) as unknown as Record<string, Likert1to5>;
  const first = getDomainPackQuestions("health")[0]!.id;
  return {
    agentId: "agent-units",
    domain: "health" as const,
    baseScores,
    domainQuestionScores: { ...domainQuestionScores, [first]: answer } as Record<string, Likert1to5>
  };
}

describe("domain engine takes typed units (P0-21)", () => {
  test("a raw 6 in domainQuestionScores throws instead of scoring 6%", () => {
    expect(() => assessDomain(input(3, 6))).toThrow(new RangeError("Likert answer must be an integer 1-5, got 6"));
  });

  test("a percentage passed as a Likert answer throws", () => {
    expect(() => assessDomain(input(3, 80))).toThrow(RangeError);
  });

  test("a base level of 7 throws", () => {
    expect(() => assessDomain(input(7, 3))).toThrow(new RangeError("Level must be an integer 0-5, got 7"));
  });

  test("valid units convert explicitly: base levels via levelToPercent, answers via likertToPercent", () => {
    const result = assessDomain(input(3, 3));
    expect(result.baseScore).toBe(60); // L3 -> 60%
    expect(result.domainScore).toBe(50); // Likert 3 -> 50%
    expect(result.compositeScore).toBe(56);
    expect(result.level).toBe("L3"); // the one level table: 55 <= 56 < 75
  });
});
