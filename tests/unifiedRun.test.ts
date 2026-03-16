import { describe, test, expect } from "vitest";
import { scoreToGrade, type LetterGrade } from "../src/unified/unifiedRun.js";

describe("unified run", () => {
  test("scoreToGrade maps correctly across full range", () => {
    const cases: Array<[number, LetterGrade]> = [
      [100, "A+"],
      [97, "A+"],
      [95, "A"],
      [93, "A"],
      [91, "A-"],
      [90, "A-"],
      [88, "B+"],
      [85, "B"],
      [83, "B"],
      [81, "B-"],
      [80, "B-"],
      [78, "C+"],
      [75, "C"],
      [73, "C"],
      [71, "C-"],
      [70, "C-"],
      [68, "D+"],
      [65, "D"],
      [63, "D"],
      [61, "D-"],
      [60, "D-"],
      [55, "F"],
      [0, "F"],
    ];
    for (const [score, expected] of cases) {
      expect(scoreToGrade(score), `score ${score} → ${expected}`).toBe(expected);
    }
  });

  test("scoreToGrade boundary values are correct", () => {
    // Just below each boundary
    expect(scoreToGrade(96)).toBe("A");
    expect(scoreToGrade(92)).toBe("A-");
    expect(scoreToGrade(89)).toBe("B+");
    expect(scoreToGrade(82)).toBe("B-");
    expect(scoreToGrade(76)).toBe("C");
    expect(scoreToGrade(72)).toBe("C-");
    expect(scoreToGrade(66)).toBe("D");
    expect(scoreToGrade(62)).toBe("D-");
    expect(scoreToGrade(59)).toBe("F");
  });

  test("renderUnifiedResult produces non-empty output", async () => {
    const { renderUnifiedResult } = await import("../src/unified/unifiedRenderer.js");
    const result = {
      agentId: "test-agent",
      ts: Date.now(),
      modules: [
        {
          name: "Score",
          icon: "①",
          grade: "B" as LetterGrade,
          score: 83,
          summary: "195 questions scored",
          issues: [],
        },
        {
          name: "Shield",
          icon: "②",
          grade: "C+" as LetterGrade,
          score: 77,
          summary: "119 packs: 92 passed, 27 failed",
          issues: ["injection: 2 scenarios failed"],
        },
      ],
      overallGrade: "B-" as LetterGrade,
      overallScore: 80,
      topFixes: [
        { action: "Fix injection defense", impact: "Shield → B+", command: "amc shield analyze" },
      ],
    };
    const output = renderUnifiedResult(result);
    expect(output).toContain("AMC Full Assessment");
    expect(output).toContain("test-agent");
    expect(output).toContain("Score");
    expect(output).toContain("Shield");
    expect(output).toContain("Overall Grade");
    expect(output).toContain("Top fixes");
    expect(output.length).toBeGreaterThan(200);
  });

  test("renderCIAnnotations produces GitHub-compatible annotations", async () => {
    const { renderCIAnnotations } = await import("../src/unified/unifiedRenderer.js");
    const result = {
      agentId: "test-agent",
      ts: Date.now(),
      modules: [
        {
          name: "Shield",
          icon: "②",
          grade: "F" as LetterGrade,
          score: 30,
          summary: "many failures",
          issues: ["injection failed", "exfiltration failed"],
        },
        {
          name: "Watch",
          icon: "⑤",
          grade: "C" as LetterGrade,
          score: 73,
          summary: "partial",
          issues: ["no alerting"],
        },
      ],
      overallGrade: "D" as LetterGrade,
      overallScore: 63,
      topFixes: [],
    };
    const output = renderCIAnnotations(result);
    expect(output).toContain("::error title=AMC Shield::injection failed");
    expect(output).toContain("::error title=AMC Shield::exfiltration failed");
    expect(output).toContain("::warning title=AMC Watch::no alerting");
    expect(output).toContain("::notice title=AMC Overall Grade::D (63/100)");
  });
});
