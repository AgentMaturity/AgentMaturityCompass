import { Command } from "commander";
import { describe, expect, test } from "vitest";
import { registerFixCommand } from "../../src/guide/fixCli.js";

describe("amc fix CLI registration", () => {
  test("registers a friendly fix command with safe defaults", () => {
    const program = new Command();
    registerFixCommand(program);

    const fix = program.commands.find((command) => command.name() === "fix");
    expect(fix).toBeDefined();
    expect(fix?.description()).toContain("plain language");

    const flags = (fix?.options ?? []).map((option) => option.flags);
    expect(flags.some((f) => f.includes("--yes"))).toBe(true);
    expect(flags.some((f) => f.includes("--dry-run"))).toBe(true);
    expect(flags.some((f) => f.includes("--interactive"))).toBe(true);
    expect(flags.some((f) => f.includes("--target"))).toBe(true);
    expect(flags.some((f) => f.includes("--file"))).toBe(true);
    expect(flags.some((f) => f.includes("--json"))).toBe(true);
  });
});
