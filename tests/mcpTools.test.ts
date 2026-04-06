import { describe, expect, test } from "vitest";
import { MCP_TOOL_METADATA, resetRateLimiter } from "../src/mcp/amcMcpServer.js";

describe("MCP Tool Metadata", () => {
  test("contains all 10 tools", () => {
    expect(MCP_TOOL_METADATA.length).toBe(10);
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

  test("all tool descriptions include (read-only)", () => {
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool.description).toContain("read-only");
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
