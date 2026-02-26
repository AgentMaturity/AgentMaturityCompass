import { describe, it, expect } from "vitest";
import {
  generateGuide,
  guideToHumanMarkdown,
  guideToAgentMarkdown,
  guideToGuardrails,
  guideToJSON,
  diffGuides,
  listSupportedFrameworks,
  detectFramework,
  applyGuardrails,
  KNOWN_AGENT_CONFIGS,
} from "../src/guide/guideGenerator.js";
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

  it("produces valid guardrails markdown", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToGuardrails(guide, "crewai");

    expect(md).toContain("# AMC Trust Guardrails");
    expect(md).toContain("Non-Negotiable Rules");
    expect(md).toContain("CrewAI");
    expect(md).toContain("Evidence Requirements");
    expect(md).toContain("Verification");
    expect(md).toContain("amc quickscore");
  });

  it("guardrails include prohibited behaviors for high targets", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 2));
    const guide = generateGuide({ overall: 2.0, questionScores: scores, targetLevel: 5 });
    const md = guideToGuardrails(guide);

    expect(md).toContain("Prohibited Behaviors");
  });

  it("applyGuardrails creates new file when none exists", () => {
    const files = new Map<string, string>();
    const result = applyGuardrails(
      "/test/AGENTS.md",
      "# Test guardrails",
      () => null,
      (p, c) => { files.set(p, c); },
    );

    expect(result.action).toBe("created");
    expect(files.get("/test/AGENTS.md")).toContain("AMC-GUARDRAILS-START");
    expect(files.get("/test/AGENTS.md")).toContain("Test guardrails");
    expect(files.get("/test/AGENTS.md")).toContain("AMC-GUARDRAILS-END");
  });

  it("applyGuardrails appends to existing file without guardrails", () => {
    const files = new Map<string, string>();
    const result = applyGuardrails(
      "/test/AGENTS.md",
      "# New guardrails",
      () => "# Existing content\nSome rules here.\n",
      (p, c) => { files.set(p, c); },
    );

    expect(result.action).toBe("appended");
    const content = files.get("/test/AGENTS.md")!;
    expect(content).toContain("Existing content");
    expect(content).toContain("New guardrails");
    expect(content).toContain("AMC-GUARDRAILS-START");
  });

  it("applyGuardrails replaces existing guardrails section", () => {
    const files = new Map<string, string>();
    const existing = [
      "# My Agent Rules",
      "",
      "<!-- AMC-GUARDRAILS-START -->",
      "# Old guardrails",
      "<!-- AMC-GUARDRAILS-END -->",
      "",
      "# Other stuff",
    ].join("\n");

    const result = applyGuardrails(
      "/test/AGENTS.md",
      "# Updated guardrails v2",
      () => existing,
      (p, c) => { files.set(p, c); },
    );

    expect(result.action).toBe("updated");
    const content = files.get("/test/AGENTS.md")!;
    expect(content).toContain("Updated guardrails v2");
    expect(content).not.toContain("Old guardrails");
    expect(content).toContain("Other stuff");
    expect(content).toContain("My Agent Rules");
  });

  it("KNOWN_AGENT_CONFIGS includes standard files", () => {
    const paths = KNOWN_AGENT_CONFIGS.map(c => c.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain(".cursorrules");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".kiro/steering/guide.md");
    expect(paths).toContain(".gemini/style.md");
    expect(paths).toContain(".openhands/instructions.md");
    expect(paths).toContain(".devin/guidelines.md");
    expect(paths.length).toBeGreaterThanOrEqual(12);
  });

  it("agent markdown includes framework-specific setup for langchain", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToAgentMarkdown(guide, "langchain");

    expect(md).toContain("LangChain");
    expect(md).toContain("Setup: Connect to AMC");
    expect(md).toContain("python");
    expect(md).toContain("Framework-Specific Notes");
  });

  it("agent markdown includes framework-specific setup for semantic kernel", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToAgentMarkdown(guide, "semantic-kernel");

    expect(md).toContain("Semantic Kernel");
    expect(md).toContain("csharp");
  });

  it("agent markdown works with unknown framework (no crash)", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToAgentMarkdown(guide, "some-unknown-framework");

    expect(md).toContain("some-unknown-framework");
    expect(md).not.toContain("Setup: Connect to AMC"); // No framework-specific section
  });

  it("guideToJSON produces valid structured output", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const json = guideToJSON(guide, "crewai");

    expect(json.version).toBe("1.0");
    expect(json.currentLevel).toBe(1);
    expect(json.targetLevel).toBe(3);
    expect(json.gapCount).toBeGreaterThan(0);
    expect(json.gaps.length).toBe(json.gapCount);
    expect(json.framework).toBe("crewai");
    expect(json.supportedFrameworks).toContain("langchain");
    expect(json.supportedFrameworks).toContain("crewai");
    expect(json.supportedFrameworks).toContain("claudecode");
    expect(json.supportedFrameworks.length).toBeGreaterThanOrEqual(10);

    for (const gap of json.gaps) {
      expect(gap.questionId).toBeTruthy();
      expect(gap.title).toBeTruthy();
      expect(gap.layer).toBeTruthy();
    }
  });

  it("diffGuides detects closed and new gaps", () => {
    const scores1 = [
      makeScore(questionBank[0]!.id, 1),
      makeScore(questionBank[1]!.id, 1),
      makeScore(questionBank[2]!.id, 1),
    ];
    const scores2 = [
      makeScore(questionBank[0]!.id, 3), // fixed
      makeScore(questionBank[1]!.id, 1), // unchanged
      makeScore(questionBank[3]!.id, 0), // new gap (different question)
    ];

    const guide1 = generateGuide({ overall: 1.0, questionScores: scores1, targetLevel: 3 });
    const guide2 = generateGuide({ overall: 1.5, questionScores: scores2, targetLevel: 3 });
    const diff = diffGuides(guide1, guide2);

    expect(diff.closedGaps.length).toBeGreaterThanOrEqual(1);
    expect(diff.closedGaps).toContain(questionBank[0]!.id);
    expect(diff.summary).toBeTruthy();
  });

  it("diffGuides detects level improvement", () => {
    const scores1 = questionBank.slice(0, 5).map(q => makeScore(q.id, 1));
    const scores2 = questionBank.slice(0, 5).map(q => makeScore(q.id, 3));

    const guide1 = generateGuide({ overall: 1.0, questionScores: scores1, targetLevel: 4 });
    const guide2 = generateGuide({ overall: 3.0, questionScores: scores2, targetLevel: 4 });
    const diff = diffGuides(guide1, guide2);

    expect(diff.levelChange).toBe("improved");
    expect(diff.previousLevel).toBe(1);
    expect(diff.currentLevel).toBe(3);
    expect(diff.summary).toContain("Improved");
  });

  it("listSupportedFrameworks returns all frameworks", () => {
    const fws = listSupportedFrameworks();
    const names = fws.map(f => f.name);

    expect(names).toContain("LangChain");
    expect(names).toContain("CrewAI");
    expect(names).toContain("AutoGen");
    expect(names).toContain("OpenAI Agents SDK");
    expect(names).toContain("LlamaIndex");
    expect(names).toContain("Semantic Kernel");
    expect(names).toContain("Claude Code");
    expect(names).toContain("Gemini");
    expect(names).toContain("Cursor");
    expect(names).toContain("Kiro");
    expect(fws.length).toBeGreaterThanOrEqual(10);

    for (const fw of fws) {
      expect(fw.language).toBeTruthy();
      expect(fw.configFile).toBeTruthy();
      expect(fw.aliases.length).toBeGreaterThan(0);
    }
  });

  it("guardrails include Quick Start section", () => {
    const scores = questionBank.slice(0, 10).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToGuardrails(guide);

    expect(md).toContain("Quick Start");
    expect(md).toContain("Top 3 Priorities");
  });

  it("agent instructions include prompt template context", () => {
    const scores = questionBank.slice(0, 3).map(q => makeScore(q.id, 1));
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });
    const md = guideToAgentMarkdown(guide);

    expect(md).toContain("AMC evaluates:");
  });

  it("guideToJSON uses dynamic question count", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 3));
    const guide = generateGuide({ overall: 3.0, questionScores: scores, targetLevel: 3 });
    const json = guideToJSON(guide);

    expect(json.totalQuestions).toBe(questionBank.length);
    expect(json.totalQuestions).toBeGreaterThanOrEqual(126);
  });

  it("diffGuides tracks per-question level improvements", () => {
    const scores1 = [
      makeScore(questionBank[0]!.id, 1),
      makeScore(questionBank[1]!.id, 1),
    ];
    const scores2 = [
      makeScore(questionBank[0]!.id, 2), // improved but still below target
      makeScore(questionBank[1]!.id, 1), // unchanged
    ];

    const guide1 = generateGuide({ overall: 1.0, questionScores: scores1, targetLevel: 4 });
    const guide2 = generateGuide({ overall: 1.5, questionScores: scores2, targetLevel: 4 });
    const diff = diffGuides(guide1, guide2);

    expect(diff.improvedGaps.length).toBeGreaterThanOrEqual(1);
    expect(diff.improvedGaps[0]!.from).toBe(1);
    expect(diff.improvedGaps[0]!.to).toBe(2);
    expect(diff.summary).toContain("partially improved");
  });

  it("cliCommands include over-compliance packs for AMC-OC questions", () => {
    const ocQuestion = questionBank.find(q => q.id.startsWith("AMC-OC"));
    if (ocQuestion) {
      const scores = [makeScore(ocQuestion.id, 0)];
      const guide = generateGuide({ overall: 0, questionScores: scores, targetLevel: 3 });
      const ocSection = guide.sections.find(s => s.questionId === ocQuestion.id);
      if (ocSection) {
        expect(ocSection.cliCommands.some(c => c.includes("overCompliance"))).toBe(true);
      }
    }
  });

  it("guide sections include severity levels", () => {
    const scores = [
      makeScore(questionBank[0]!.id, 0), // gap of 3 → critical
      makeScore(questionBank[1]!.id, 1), // gap of 2 → high
      makeScore(questionBank[2]!.id, 2), // gap of 1 → medium
    ];
    const guide = generateGuide({ overall: 1.0, questionScores: scores, targetLevel: 3 });

    const criticals = guide.sections.filter(s => s.severity === "critical");
    const highs = guide.sections.filter(s => s.severity === "high");
    const mediums = guide.sections.filter(s => s.severity === "medium");

    expect(criticals.length).toBeGreaterThanOrEqual(1);
    expect(highs.length).toBeGreaterThanOrEqual(1);
    expect(mediums.length).toBeGreaterThanOrEqual(1);
  });

  it("guardrails include severity indicators", () => {
    const scores = questionBank.slice(0, 5).map(q => makeScore(q.id, 0));
    const guide = generateGuide({ overall: 0, questionScores: scores, targetLevel: 3 });
    const md = guideToGuardrails(guide);

    // Should contain at least one severity indicator
    expect(md.includes("🔴") || md.includes("🟡") || md.includes("🔵")).toBe(true);
  });

  it("detectFramework finds langchain from pyproject.toml", () => {
    const result = detectFramework(
      (p) => p === "pyproject.toml",
      (p) => p === "pyproject.toml" ? '[tool.poetry.dependencies]\nlangchain = "^0.1"' : null,
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe("langchain");
    expect(result!.confidence).toBe("high");
  });

  it("detectFramework finds crewai from requirements.txt", () => {
    const result = detectFramework(
      (p) => p === "requirements.txt",
      (p) => p === "requirements.txt" ? "crewai>=0.28\nopenai" : null,
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe("crewai");
  });

  it("detectFramework finds cursor from .cursorrules", () => {
    const result = detectFramework(
      (p) => p === ".cursorrules",
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe("cursor");
  });

  it("detectFramework returns null when no framework detected", () => {
    const result = detectFramework(
      () => false,
      () => null,
    );
    expect(result).toBeNull();
  });
});
