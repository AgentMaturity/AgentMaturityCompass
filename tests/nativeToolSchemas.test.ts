import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NATIVE_BUILTIN_CAPABILITIES } from "../src/agent/nativeToolCapabilities.js";
import { registerToolsCommands } from "../src/cli-tools-commands.js";
import { nativeToolSchemas, SCHEMA_UNAVAILABLE } from "../src/tools/builtin/nativeToolSchemas.js";
import { formatToolSchemasText, toolSchemasReport } from "../src/toolhub/toolSchemasCli.js";

/**
 * Published tool schemas (SH-TOOLS-06a): every native capability is listed with a valid JSON Schema or named as
 * unavailable, digests are stable, and `amc tools list --schemas` reaches the listing without a session.
 */
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });
const scratch = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-tool-schemas-"))); dirs.push(dir); return dir; };

describe("nativeToolSchemas", () => {
  it("lists every native capability with its action class and a schema, or names it unavailable", () => {
    const listing = nativeToolSchemas(scratch());
    const byName = new Map(listing.tools.map((tool) => [tool.name, tool]));
    for (const capability of NATIVE_BUILTIN_CAPABILITIES) {
      if (SCHEMA_UNAVAILABLE.has(capability.name)) { expect(listing.unavailable).toContain(capability.name); continue; }
      const tool = byName.get(capability.name);
      expect(tool, `${capability.name} has a published schema`).toBeDefined();
      expect(tool!.actionClass).toBe(capability.actionClass);
      expect(tool!.parameters.type).toBe("object");
      expect(tool!.schemaDigestSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(listing.tools.map((tool) => tool.name)).toEqual([...listing.tools.map((tool) => tool.name)].sort((a, b) => a.localeCompare(b)));
    expect(listing.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["apply_patch", "ls", "fs.read", "grep", "web_fetch", "job_start"]));
    expect(listing.unavailable).toEqual(["delegate", "workflow"]);
  });

  it("gives the same digests on every call", () => {
    const [first, second] = [nativeToolSchemas(scratch()), nativeToolSchemas(scratch())];
    expect(second.documentDigestSha256).toBe(first.documentDigestSha256);
    expect(second.tools.map((tool) => tool.schemaDigestSha256)).toEqual(first.tools.map((tool) => tool.schemaDigestSha256));
  });
});

describe("amc tools list --schemas", () => {
  it("reports the grants of an unsigned workspace as none, filters by tool and refuses an unknown name", () => {
    const report = toolSchemasReport(scratch());
    expect(report.policy).toEqual({ signatureValid: false, grants: [] });
    expect(formatToolSchemasText(report)).toContain("Signed policy: not verifiable");
    const one = toolSchemasReport(scratch(), "apply_patch");
    expect(one.tools.map((tool) => tool.name)).toEqual(["apply_patch"]);
    expect(formatToolSchemasText(one)).toContain("apply_patch  [WRITE_LOW]  not granted  schema sha256 ");
    expect(() => toolSchemasReport(scratch(), "nope")).toThrow(/no built-in tool named "nope"/);
  });

  it("prints the listing as JSON through the commander program, and exits 1 for an unknown tool", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => { lines.push(String(line)); });
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => { errors.push(String(line)); });
    const program = new Command().exitOverride();
    registerToolsCommands(program);
    await program.parseAsync(["tools", "list", "--schemas", "--json"], { from: "user" });
    const report = JSON.parse(lines.join("\n")) as { tools: Array<{ name: string; schemaDigestSha256: string }>; documentDigestSha256: string; unavailable: string[] };
    expect(report.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(["apply_patch", "ls", "fs.edit", "bash"]));
    expect(report.unavailable).toEqual(["delegate", "workflow"]);
    expect(report.documentDigestSha256).toBe(nativeToolSchemas(process.cwd()).documentDigestSha256);
    const before = process.exitCode;
    try {
      await program.parseAsync(["tools", "list", "--schemas", "--tool", "nope"], { from: "user" });
      expect(process.exitCode).toBe(1);
      expect(errors.at(-1)).toContain("no built-in tool named");
    } finally {
      process.exitCode = before;
    }
  });
});
