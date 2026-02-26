import { describe, it, expect } from "vitest";
import { generateGuide, guideToHumanMarkdown, guideToAgentMarkdown } from "../src/guide/guideGenerator.js";
import type { QuestionScore } from "../src/types.js";
import { questionBank } from "../src/diagnostic/questionBank.js";

function makeScore(questionId: string, level: number): QuestionScore {
  return {
    questionId,
    claimedLevel: level,
    supportedMaxLevel: level,
    finalLevel: level,
    confidence: 1,
    evidenceEventIds: [],
    flags: [],
    narrative: "",
  };
}

describe("guideGenerator", () => {
  it("generates a guide with gaps for low-scoring agent", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });

    expect(guide.currentLevel).toBe(1);
    expect(guide.targetLevel).toBe(3);
    expect(guide.sections.length).toBeGreaterThan(0);
    expect(guide.summary).toContain("gap");

    for (const s of guide.sections) {
      expect(s.currentLevel).toBeLessThan(3);
      expect(s.targetLevel).toBe(3);
      expect(s.questionId).toBeTruthy();
      expect(s.agentInstruction).toContain("What you must do");
    }
  });

  it("generates empty guide when agent meets target", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 4));
    const guide = generateGuide({ overall: 4.0, questionScores: scores, targetLevel: 4 });

    expect(guide.sections.length).toBe(0);
    expect(guide.summary).toContain("meets all requirements");
  });

  it("defaults target to current + 1", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 2));
    const guide = generateGuide({ overall: 2.5, questionScores: scores });

    expect(guide.targetLevel).toBe(3);
  });

  it("produces valid human markdown", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToHumanMarkdown(guide);

    expect(md).toContain("# AMC Improvement Guide");
    expect(md).toContain("Priority Fixes");
    expect(md).toContain("How to fix:");
    expect(md).toContain("```bash");
  });

  it("produces valid agent markdown", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToAgentMarkdown(guide, "langchain");

    expect(md).toContain("# AMC Trust Improvement Instructions");
    expect(md).toContain("Required Behavioral Changes");
    expect(md).toContain("What you must do");
    expect(md).toContain("langchain");
    expect(md).toContain("How to Verify");
    expect(md).toContain("amc quickscore");
  });

  it("includes CLI commands in guide sections", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 0));
    const guide = generateGuide({ overall: 0, questionScores: scores, targetLevel: 3 });

    const withCmds = guide.sections.filter(s => s.cliCommands.length > 0);
    expect(withCmds.length).toBeGreaterThan(0);

    // L0 agents should get evidence collect as first command
    for (const s of withCmds) {
      expect(s.cliCommands[0]).toContain("amc");
    }
  });

  it("sorts sections by impact (biggest gap first)", () => {
    const scores = [
      makeScore(questionBank[0]!.id, 4),  // small gap
      makeScore(questionBank[1]!.id, 0),  // big gap
      makeScore(questionBank[2]!.id, 2),  // medium gap
    ];
    const guide = generateGuide({ overall: 2.0, questionScores: scores, targetLevel: 5 });

    if (guide.sections.length >= 2) {
      // First section should have the biggest gap
      const firstGap = guide.sections[0]!.targetLevel - guide.sections[0]!.currentLevel;
      const secondGap = guide.sections[1]!.targetLevel - guide.sections[1]!.currentLevel;
      expect(firstGap).toBeGreaterThanOrEqual(secondGap);
    }
  });

  it("caps target at L5", () => {
    const scores = questionBank.slice(0, 3).map(q => makeScore(q.id, 3));
    const guide = generateGuide({ overall: 3.0, questionScores: scores, targetLevel: 99 });

    expect(guide.targetLevel).toBe(5);
  });
});
