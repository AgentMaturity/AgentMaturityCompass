import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticQuestion } from "../src/types.js";

// Swap the question bank for one test at a time; every other call sees the real sets.
const override: { questions: DiagnosticQuestion[] | null } = { questions: null };
vi.mock("../src/diagnostic/questionSets.js", async importOriginal => {
  const real = await importOriginal<typeof import("../src/diagnostic/questionSets.js")>();
  return { ...real, getQuestionSet: (options?: Parameters<typeof real.getQuestionSet>[0]) => {
    const set = real.getQuestionSet(options);
    return override.questions === null ? set : { ...set, questions: override.questions };
  } };
});
const { getAllQuestions, getQuestionsByLayer, getTotalQuestionCount, scoreFullDiagnostic } = await import("../src/diagnostic/fullDiagnostic.js");

const question = (id: string, layerName: string, upgradeHints: string) =>
  ({ id, title: `Title ${id}`, layerName, upgradeHints }) as unknown as DiagnosticQuestion;

afterEach(() => { override.questions = null; });

describe("fullDiagnostic edge scoring", () => {
  it("counts the default and the lifecycle question sets, and refuses an unknown set", () => {
    expect(getTotalQuestionCount()).toBe(getAllQuestions().length);
    expect(getTotalQuestionCount("lifecycle")).toBeGreaterThan(getTotalQuestionCount());
    expect(() => getTotalQuestionCount("no-such-set")).toThrow(/Unknown question set "no-such-set"/);
  });

  it("scores a non-finite answer as level 0 and rounds and clamps the others", () => {
    const [a, b, c, d] = getAllQuestions();
    const result = scoreFullDiagnostic({ [a!.id]: Number.NaN, [b!.id]: Number.POSITIVE_INFINITY, [c!.id]: 9, [d!.id]: 2.6 }, 5);
    const level = (id: string) => result.questionScores.find(row => row.questionId === id)!.level;
    expect([level(a!.id), level(b!.id), level(c!.id), level(d!.id)]).toEqual([0, 0, 5, 3]);
    expect(result.totalScore).toBe(8);
  });

  it("appends a layer outside the canonical order after the known layers, with a generic marker", () => {
    override.questions = [question("Q-NEW", "Future Layer", "Add it. Then more."), question("Q-SKILL", "Skills", "Train the team.")];
    const groups = getQuestionsByLayer();
    expect(groups.map(group => [group.layerName, group.emoji, group.description])).toEqual([
      ["Skills", "⚡", "Team capability to operate, test, and improve the system"],
      ["Future Layer", "📋", ""]
    ]);
  });

  it("recommends a default action when a question has no upgrade hint, and the first sentence otherwise", () => {
    override.questions = [question("Q-A", "Skills", "   "), question("Q-B", "Skills", "Write  tests first! Then refactor.")];
    const result = scoreFullDiagnostic({ "Q-B": 1 }, 0);
    expect(result.recommendations.map(row => [row.questionId, row.currentLevel, row.targetLevel, row.howToImprove])).toEqual([
      ["Q-A", 0, 3, "Implement the control with repeatable evidence collection."],
      ["Q-B", 1, 3, "Write tests first."]
    ]);
    expect(result.overallLevel).toBe("L0");
    expect(result.percentage).toBe(10);
  });

  it("an empty question bank scores zero without dividing by zero", () => {
    override.questions = [];
    const result = scoreFullDiagnostic({}, 1);
    expect(result).toMatchObject({ questionCount: 0, totalScore: 0, maxScore: 0, percentage: 0, overallLevel: "L0", layerScores: [], recommendations: [] });
  });
});
