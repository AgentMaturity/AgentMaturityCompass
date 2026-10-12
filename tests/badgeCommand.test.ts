import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, CommanderError } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerLateStageCliCommands } from "../src/cli-late-stage-commands.js";

/**
 * P0-28: `amc badge --level/--score` rendered a maturity badge for any level the caller typed. A badge now shows only
 * what AMC recorded for the agent; no flag sets its level or score.
 */
function badgeProgram(): Command {
  const program = new Command("amc").exitOverride().configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerLateStageCliCommands({
    program, activeAgent: () => "default", demo: program.command("demo"), dashboard: program.command("dashboard"),
    watch: program.command("watch"), monitor: program.command("monitor"), integrations: program.command("integrations"),
    openExternalUrl: () => false
  });
  return program;
}

// Every case runs in an empty directory, so no path can read or write a workspace.
const cwd = process.cwd();
const dirs: string[] = [];
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "amc-badge-"));
  dirs.push(dir);
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(cwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("amc badge", () => {
  test.each([["--level", "5"], ["--score", "99"], ["--format", "svg"]])("refuses %s: a badge level or score is never typed in",
    async (flag, value) => {
      const error = await badgeProgram().parseAsync(["node", "amc", "badge", flag, value]).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CommanderError);
      expect((error as CommanderError).code).toBe("commander.unknownOption");
    });

  test("its help offers no override", () => {
    const badge = badgeProgram().commands.find((command) => command.name() === "badge")!;
    const help = badge.helpInformation();
    expect(help).not.toMatch(/--level|--score|override level|override score/);
    expect(badge.options.map((option) => option.long)).toEqual(["--agent"]);
  });

  test("without a recorded passport it prints no badge and points to an assessment, never to a typed level", async () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await badgeProgram().parseAsync(["node", "amc", "badge"]);
    expect(process.exitCode).toBe(1);
    expect(out).not.toHaveBeenCalled();
    const text = err.mock.calls.flat().join("\n");
    expect(text).toContain("amc run");
    expect(text).not.toMatch(/--level|--score/);
  });
});
