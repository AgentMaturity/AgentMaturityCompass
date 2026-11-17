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
          summary: "240 questions scored",
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
      surfaceCoverage: { evaluated: 2, total: 8, pending: ["Enforce", "Vault", "Watch", "Comply", "Fleet", "Passport"], failed: [] },
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
    expect(output).toContain("Surface coverage");
    expect(output).toContain("Top fixes");
    expect(output.length).toBeGreaterThan(200);

    // Escapes follow chalk: none for a pipe, a log file, NO_COLOR or --no-color (level 0), colour in a terminal.
    const { default: chalk } = await import("chalk");
    const level = chalk.level;
    try {
      chalk.level = 0;
      const plain = renderUnifiedResult(result);
      expect(plain).not.toContain("\x1b");
      expect(plain).toContain("Overall Grade:  B-");
      chalk.level = 3;
      expect(renderUnifiedResult(result)).toContain("\x1b[");
    } finally {
      chalk.level = level;
    }
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
      surfaceCoverage: { evaluated: 2, total: 8, pending: [], failed: [] },
      topFixes: [],
    };
    const output = renderCIAnnotations(result);
    expect(output).toContain("::error title=AMC Shield::injection failed");
    expect(output).toContain("::error title=AMC Shield::exfiltration failed");
    expect(output).toContain("::warning title=AMC Watch::no alerting");
    expect(output).toContain("::notice title=AMC Overall Grade::D (63/100)");
  });

  // 2026-11-15: in a fresh folder amc run printed "Overall Grade: F (15/100)" with Vault "A+" while bare amc said the score was empty.
  test("shows no grade when AMC has seen nothing to assess", async () => {
    const { renderUnifiedResult, renderCIAnnotations } = await import("../src/unified/unifiedRenderer.js");
    const result = {
      agentId: "default",
      ts: Date.now(),
      modules: [
        { name: "Score", icon: "①", grade: "F" as LetterGrade, score: 0, summary: "235 questions scored, 235 below target", issues: ["Skills: 0.0/5.0"] },
        { name: "Vault", icon: "④", grade: "A+" as LetterGrade, score: 100, summary: "vault ready", issues: [] },
      ],
      overallGrade: "F" as LetterGrade,
      overallScore: 15,
      nothingToAssess: true,
      surfaceCoverage: { evaluated: 2, total: 8, pending: [], failed: [] },
      topFixes: [{ action: "Improve weakest dimensions", impact: "Score → F (+22.5 overall)", command: "amc improve" }],
    };
    const text = renderUnifiedResult(result).replace(/\x1b\[[0-9;]*m/g, "");
    expect(text).toContain("Overall Grade:  none yet");
    expect(text).toContain("nothing to grade");
    expect(text).not.toMatch(/15\/100|A\+|Grade:\s+F/);
    expect(text.match(/not graded yet/g)).toHaveLength(2);
    expect(text).toContain("amc improve");
    expect(text).not.toMatch(/\+22\.5|grade impact/);
    const ci = renderCIAnnotations(result);
    expect(ci).toContain("::notice title=AMC Overall Grade::none yet");
    expect(ci).not.toMatch(/::error|15\/100/);
    expect(renderUnifiedResult({ ...result, nothingToAssess: false }).replace(/\x1b\[[0-9;]*m/g, "")).toContain("(15/100)");
  });
});
