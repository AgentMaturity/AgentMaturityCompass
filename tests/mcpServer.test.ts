import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Command } from "commander";
import { MCP_TOOL_METADATA } from "../src/mcp/amcMcpServer.js";
import { registerMcpCommands } from "../src/mcp/mcpCli.js";
import { registerTransparencyReportCommands } from "../src/transparency/transparencyReportCli.js";
import { generateTransparencyReport } from "../src/transparency/transparencyReport.js";

beforeAll(() => {
  process.env.NODE_ENV = "test";
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) {
    rmSync(dir, { recursive: true, force: true });
  }
  cleanups.length = 0;
});

function tracked(ws: string): string {
  cleanups.push(ws);
  return ws;
}

// ---------------------------------------------------------------------------
// MCP_TOOL_METADATA tests
// ---------------------------------------------------------------------------

describe("MCP_TOOL_METADATA", () => {
  it("exports 10 tools", () => {
    expect(MCP_TOOL_METADATA).toHaveLength(10);
    const names = MCP_TOOL_METADATA.map((t) => t.name);
    expect(names).toContain("amc_list_agents");
    expect(names).toContain("amc_quickscore");
    expect(names).toContain("amc_get_guide");
    expect(names).toContain("amc_check_compliance");
    expect(names).toContain("amc_transparency_report");
    expect(names).toContain("amc_score_sector_pack");
    expect(names).toContain("amc_score_agent");
    expect(names).toContain("amc_list_evidence");
    expect(names).toContain("amc_query_diagnostic");
    expect(names).toContain("amc_get_recommendations");
  });

  it("all tool names start with amc_", () => {
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool.name).toMatch(/^amc_/);
    }
  });

  it("all tool descriptions include (read-only)", () => {
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool.description).toContain("(read-only)");
    }
  });

  it("tool metadata has required fields", () => {
    for (const tool of MCP_TOOL_METADATA) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("input");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.input).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.input.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// MCP config IDE entries (via CLI --json output)
// ---------------------------------------------------------------------------

describe("MCP config IDE entries", () => {
  it("config command outputs valid JSON with --json flag", async () => {
    const program = new Command();
    program.exitOverride();
    registerMcpCommands(program);

    const chunks: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      chunks.push(args.map(String).join(" "));
    };

    try {
      await program.parseAsync(["node", "test", "mcp", "config", "--json"]);
    } finally {
      console.log = origLog;
    }

    const output = chunks.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe("object");

    // Should contain at least Claude Code and Cursor entries
    expect(parsed["Claude Code"]).toBeDefined();
    expect(parsed["Cursor"]).toBeDefined();

    // Each entry should have file and config
    for (const [, entry] of Object.entries(parsed)) {
      const e = entry as { file: string; config: unknown };
      expect(e.file).toBeDefined();
      expect(typeof e.file).toBe("string");
      expect(e.config).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// validateWorkspace (tested indirectly via MCP tool behavior)
// ---------------------------------------------------------------------------

describe("validateWorkspace", () => {
  it("rejects non-AMC directory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "amc-noamc-"));
    tracked(tmpDir);

    // generateTransparencyReport calls loadAgentConfig which calls getAgentPaths,
    // and the agent config won't exist in a non-AMC directory
    expect(() => generateTransparencyReport("any-agent", tmpDir)).toThrow();
  });

  it("accepts valid AMC workspace", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "amc-valid-"));
    tracked(tmpDir);
    mkdirSync(join(tmpDir, ".amc"), { recursive: true });

    // A valid .amc dir exists, but no agent — should throw about agent config, not workspace
    expect(() => generateTransparencyReport("missing-agent", tmpDir)).toThrow(
      /not found/i
    );
  });
});

// ---------------------------------------------------------------------------
// Format normalization
// ---------------------------------------------------------------------------

describe("format normalization", () => {
  it("accepts md, markdown, and json as format values", () => {
    // The MCP server normalizes format: "json" → "json", anything else → "markdown"
    // We verify the tool metadata documents these formats
    const reportTool = MCP_TOOL_METADATA.find(
      (t) => t.name === "amc_transparency_report"
    );
    expect(reportTool).toBeDefined();
    expect(reportTool!.input).toContain("md");
    expect(reportTool!.input).toContain("json");
  });
});

// ---------------------------------------------------------------------------
// CLI registration
// ---------------------------------------------------------------------------

describe("CLI registration", () => {
  it("registerMcpCommands attaches to program without error", () => {
    const program = new Command();
    expect(() => registerMcpCommands(program)).not.toThrow();

    const mcpCmd = program.commands.find((c) => c.name() === "mcp");
    expect(mcpCmd).toBeDefined();

    // Should have subcommands: serve, config, list-tools
    const subNames = mcpCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("serve");
    expect(subNames).toContain("config");
    expect(subNames).toContain("list-tools");
  });

  it("registerTransparencyReportCommands attaches to existing transparency command", () => {
    const program = new Command();

    // Create a pre-existing transparency command
    program.command("transparency").description("Existing transparency command");

    expect(() => registerTransparencyReportCommands(program)).not.toThrow();

    const transpCmd = program.commands.find((c) => c.name() === "transparency");
    expect(transpCmd).toBeDefined();

    // Should have the "report" subcommand attached
    const subNames = transpCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("report");
  });

  it("registerTransparencyReportCommands creates transparency command if missing", () => {
    const program = new Command();

    expect(() => registerTransparencyReportCommands(program)).not.toThrow();

    const transpCmd = program.commands.find((c) => c.name() === "transparency");
    expect(transpCmd).toBeDefined();

    const subNames = transpCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("report");
  });
});
