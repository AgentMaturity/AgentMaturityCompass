import { describe, test, expect } from "vitest";
import { detectFromContent } from "../src/scanner/autoDetect.js";

describe("scanner: auto-detect frameworks", () => {
  test("detects LangChain from Python imports", () => {
    const result = detectFromContent([
      { path: "agent.py", content: "from langchain.agents import AgentExecutor\nfrom langchain.chat_models import ChatOpenAI" },
    ]);
    expect(result.framework).toBe("langchain");
    expect(result.confidence).toBeGreaterThan(0);
  });

  test("detects CrewAI from Python imports", () => {
    const result = detectFromContent([
      { path: "crew.py", content: "from crewai import Agent, Crew, Task\nfrom crewai.tools import tool" },
    ]);
    expect(result.framework).toBe("crewai");
  });

  test("returns low confidence for unrecognizable content", () => {
    const result = detectFromContent([
      { path: "readme.md", content: "# My Project\nJust a readme with no agent code." },
    ]);
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  test("handles empty file list", () => {
    const result = detectFromContent([]);
    expect(result.framework).toBeDefined();
    expect(result.confidence).toBeDefined();
  });

  test("provides signals array", () => {
    const result = detectFromContent([
      { path: "app.py", content: "from langchain.agents import AgentExecutor" },
    ]);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  test("detects security posture field", () => {
    const result = detectFromContent([
      { path: "agent.py", content: "from langchain.agents import AgentExecutor" },
    ]);
    expect(["strong", "moderate", "weak", "unknown"]).toContain(result.securityPosture);
  });

  test("detects tool usage", () => {
    const result = detectFromContent([
      { path: "agent.py", content: "from langchain.agents import AgentExecutor\ntool = Tool(name='search')" },
    ]);
    expect(Array.isArray(result.toolUsage)).toBe(true);
  });
});
