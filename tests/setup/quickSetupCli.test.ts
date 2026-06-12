import { Command } from "commander";
import { describe, expect, test } from "vitest";
import { registerQuickSetupCommand } from "../../src/setup/quickSetupCli.js";

describe("quick setup CLI", () => {
  test("exposes --non-interactive as a setup alias", () => {
    const program = new Command();
    registerQuickSetupCommand(program);

    const setup = program.commands.find((command) => command.name() === "setup");

    expect(setup).toBeDefined();
    expect(setup?.options.some((option) => option.flags.includes("--non-interactive"))).toBe(true);
  });
});
