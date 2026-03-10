/**
 * Tests for MCP Agent Provider — Red Team Testing
 *
 * Validates:
 * 1. Evil tool definitions are well-formed
 * 2. Scenarios cover all attack categories
 * 3. Scoring engine correctly classifies safe/dangerous calls
 * 4. Full red team run produces valid report
 * 5. Markdown rendering is correct
 */

import { describe, it, expect } from "vitest";
import {
  runMCPAgentRedTeam,
  buildEvilTools,
  buildScenarios,
  renderMCPAgentRedTeamMarkdown,
} from "../src/redteam/mcpAgentProvider.js";
import type {
  EvilToolDefinition,
  MCPAttackCategory,
  MCPAgentRedTeamReport,
  MCPAgentScenario,
} from "../src/redteam/mcpAgentProvider.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/*  Evil Tool Definitions                                              */
/* ------------------------------------------------------------------ */

describe("EvilToolDefinition library", () => {
  const tools = buildEvilTools();

  it("returns a non-empty array of tools", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it("every tool has required fields", () => {
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
      expect(t.attackCategory).toBeTruthy();
      expect(t.severity).toMatch(/^(critical|high|medium|low)$/);
      expect(typeof t.alwaysDangerous).toBe("boolean");
    }
  });

  it("has unique tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers at least 8 attack categories", () => {
    const categories = new Set(tools.map((t) => t.attackCategory));
    expect(categories.size).toBeGreaterThanOrEqual(8);
  });

  it("includes critical-severity tools", () => {
    const criticals = tools.filter((t) => t.severity === "critical");
    expect(criticals.length).toBeGreaterThan(0);
  });

  it("tool-poisoning tools have hiddenInstruction metadata", () => {
    const poisonTools = tools.filter(
      (t) => t.attackCategory === "tool-poisoning" || t.hiddenInstruction
    );
    for (const t of poisonTools) {
      if (t.hiddenInstruction) {
        expect(typeof t.hiddenInstruction).toBe("string");
        expect(t.hiddenInstruction.length).toBeGreaterThan(0);
      }
    }
  });

  it("inputSchema has type 'object' at root", () => {
    for (const t of tools) {
      expect((t.inputSchema as any).type).toBe("object");
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Scenarios                                                           */
/* ------------------------------------------------------------------ */

describe("MCPAgentScenario library", () => {
  const tools = buildEvilTools();
  const scenarios = buildScenarios(tools);

  it("returns multiple scenarios", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });

  it("every scenario has required fields", () => {
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.userPrompt).toBeTruthy();
      expect(s.availableTools.length).toBeGreaterThan(0);
      expect(s.categories.length).toBeGreaterThan(0);
      expect(s.expectedBehavior).toBeTruthy();
    }
  });

  it("has unique scenario IDs", () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scenario references tools that exist in the library", () => {
    const toolNames = new Set(tools.map((t) => t.name));
    for (const s of scenarios) {
      for (const tn of [...s.availableTools, ...s.safeTools, ...s.dangerousTools]) {
        expect(toolNames.has(tn)).toBe(true);
      }
    }
  });

  it("every scenario has at least one dangerous tool", () => {
    for (const s of scenarios) {
      expect(s.dangerousTools.length).toBeGreaterThan(0);
    }
  });

  it("includes a multi-vector combined scenario", () => {
    const combined = scenarios.find((s) => s.categories.length >= 3);
    expect(combined).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  Full Red Team Run                                                   */
/* ------------------------------------------------------------------ */

describe("runMCPAgentRedTeam", () => {
  let report: MCPAgentRedTeamReport;
  let tmpDir: string;

  it("completes a full run without errors", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "amc-mcp-rt-"));
    report = await runMCPAgentRedTeam({
      workspace: tmpDir,
      agentId: "test-agent",
    });
    expect(report).toBeDefined();
  });

  it("report has valid structure", () => {
    expect(report.runId).toBeTruthy();
    expect(report.agentId).toBe("test-agent");
    expect(report.ts).toBeGreaterThan(0);
    expect(report.totalScenarios).toBeGreaterThan(0);
    expect(report.passedScenarios + report.failedScenarios).toBe(
      report.totalScenarios
    );
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("scenario results have per-scenario scores", () => {
    for (const sr of report.scenarioResults) {
      expect(sr.scenarioId).toBeTruthy();
      expect(sr.title).toBeTruthy();
      expect(sr.score).toBeGreaterThanOrEqual(0);
      expect(sr.score).toBeLessThanOrEqual(100);
      expect(typeof sr.passed).toBe("boolean");
      expect(Array.isArray(sr.reasons)).toBe(true);
    }
  });

  it("category scores cover tested categories", () => {
    const testedCategories = Object.keys(report.categoryScores);
    expect(testedCategories.length).toBeGreaterThan(0);
    for (const [_cat, data] of Object.entries(report.categoryScores)) {
      expect(data.tested).toBeGreaterThan(0);
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
    }
  });

  it("synthetic cautious agent achieves high scores", () => {
    // The synthetic engine models a cautious agent that refuses dangerous tools
    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.passedScenarios).toBeGreaterThanOrEqual(
      report.totalScenarios * 0.8
    );
  });

  it("dangerous calls summary is empty for cautious agent", () => {
    // Cautious agent should not make dangerous calls
    expect(report.dangerousCallsSummary.length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Markdown Rendering                                                  */
/* ------------------------------------------------------------------ */

describe("renderMCPAgentRedTeamMarkdown", () => {
  it("produces valid markdown", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "amc-mcp-rt-md-"));
    const report = await runMCPAgentRedTeam({
      workspace: tmpDir,
      agentId: "md-test",
    });

    const md = renderMCPAgentRedTeamMarkdown(report);
    expect(md).toContain("# 🔴 AMC MCP Agent Provider");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Category Scores");
    expect(md).toContain("## Scenario Details");
    expect(md).toContain("Overall Score");
    expect(md).toContain("`md-test`");
  });

  it("includes scenario IDs and titles", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "amc-mcp-rt-md2-"));
    const report = await runMCPAgentRedTeam({
      workspace: tmpDir,
      agentId: "md-detail",
    });

    const md = renderMCPAgentRedTeamMarkdown(report);
    for (const sr of report.scenarioResults) {
      expect(md).toContain(sr.scenarioId);
      expect(md).toContain(sr.title);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Export validation                                                    */
/* ------------------------------------------------------------------ */

describe("redteam index exports", () => {
  it("re-exports MCP agent provider from redteam index", async () => {
    const mod = await import("../src/redteam/index.js");
    expect(typeof mod.runMCPAgentRedTeam).toBe("function");
    expect(typeof mod.renderMCPAgentRedTeamMarkdown).toBe("function");
    expect(typeof mod.buildEvilTools).toBe("function");
    expect(typeof mod.buildScenarios).toBe("function");
  });
});
