import { describe, it, expect } from "vitest";
import { generateFrameworkGuide, listSupportedFrameworks } from "../../src/guide/frameworkGuide.js";

describe("frameworkGuide", () => {
  it("lists all supported frameworks", () => {
    const frameworks = listSupportedFrameworks();
    expect(frameworks.length).toBeGreaterThanOrEqual(9);
    const names = frameworks.map((f) => f.id);
    expect(names).toContain("langchain");
    expect(names).toContain("langgraph");
    expect(names).toContain("openai-agents");
    expect(names).toContain("vercel-ai");
  });

  it("generates LangChain guide with real patterns", () => {
    const guide = generateFrameworkGuide("langchain");
    expect(guide.displayName).toBe("LangChain");
    expect(guide.patterns.length).toBeGreaterThanOrEqual(5);
    // Check patterns have real code examples
    for (const p of guide.patterns) {
      expect(p.codeExample.length).toBeGreaterThan(50);
      expect(p.amcQuestionsAddressed.length).toBeGreaterThan(0);
    }
    expect(guide.quickWins.length).toBeGreaterThan(0);
    expect(guide.maturityRoadmap.length).toBe(5);
  });

  it("generates OpenAI Agents guide", () => {
    const guide = generateFrameworkGuide("openai-agents");
    expect(guide.patterns.length).toBeGreaterThanOrEqual(1);
    const guardrailPattern = guide.patterns.find((p) => p.id === "oai-guardrails");
    expect(guardrailPattern).toBeDefined();
    expect(guardrailPattern!.codeExample).toContain("InputGuardrail");
  });

  it("generates custom/generic guide as fallback", () => {
    const guide = generateFrameworkGuide("custom");
    expect(guide.patterns.length).toBeGreaterThanOrEqual(1);
    expect(guide.patterns[0]!.codeExample).toContain("init");
  });

  it("all patterns have required fields", () => {
    const frameworks = listSupportedFrameworks();
    for (const fw of frameworks) {
      const guide = generateFrameworkGuide(fw.id);
      for (const p of guide.patterns) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.codeExample).toBeTruthy();
        expect(["critical", "high", "medium", "low"]).toContain(p.priority);
      }
    }
  });
});
