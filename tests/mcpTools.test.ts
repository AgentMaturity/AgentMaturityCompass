import { describe, expect, test } from "vitest";
import { MCP_TOOL_METADATA, resetRateLimiter } from "../src/mcp/amcMcpServer.js";

describe("MCP Tool Metadata", () => {
  test("contains all 11 tools", () => {
    expect(MCP_TOOL_METADATA.length).toBe(11);
    expect(MCP_TOOL_METADATA.map((t) => t.name)).toContain("amc_incident_clocks");
  });

  test("includes original 6 tools", () => {
    const names = MCP_TOOL_METADATA.map((t) => t.name);
    expect(names).toContain("amc_list_agents");
    expect(names).toContain("amc_quickscore");
    expect(names).toContain("amc_get_guide");
    expect(names).toContain("amc_check_compliance");
    expect(names).toContain("amc_transparency_report");
    expect(names).toContain("amc_score_sector_pack");
  });

  test("includes 4 new tools", () => {
    const names = MCP_TOOL_METADATA.map((t) => t.name);
    expect(names).toContain("amc_score_agent");
    expect(names).toContain("amc_list_evidence");
    expect(names).toContain("amc_query_diagnostic");
    expect(names).toContain("amc_get_recommendations");
  });

  test("all tools have name, description, and input", () => {
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input).toBeTruthy();
    }
  });

  test("all tool descriptions include (read-only), except the named write tools, which say what they write", () => {
    const writeTools = new Set(["amc_a4_comment"]); // AMC_A4_PREVIEW=1; posts a self-reported comment through Studio
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool.description).toMatch(writeTools.has(tool.name) ? /\(writes [^)]+\)/ : /\(read-only\)/);
    }
  });

  test("no duplicate tool names", () => {
    const names = MCP_TOOL_METADATA.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe("Rate Limiter", () => {
  test("resetRateLimiter does not throw", () => {
    expect(() => resetRateLimiter()).not.toThrow();
  });
});
