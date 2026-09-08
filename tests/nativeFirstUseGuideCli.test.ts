import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerCredentialsCommands } from "../src/cli-credentials-commands.js";
import { buildCommandInventory, renderGroupedHelp } from "../src/cliUx.js";

function registry() {
  const output: string[] = [];
  const failures: number[] = [];
  const program = new Command().exitOverride().configureOutput({ writeErr: () => {} });
  const io = { log: (line: string) => output.push(line), error: (line: string) => output.push(line), fail: () => { failures.push(1); } };
  registerAgentCommands(program, io);
  registerCredentialsCommands(program, { ...io, readSecret: async () => { throw new Error("Guide must not read a secret"); } });
  program.command("connect");
  return { program, output, failures };
}

describe("native first-use CLI discovery", () => {
  it("publishes the native guide, run, verifier and existing credential commands", () => {
    const { program } = registry();
    const paths = buildCommandInventory(program).map(entry => entry.path);
    expect(paths).toEqual(expect.arrayContaining(["agent-loop guide", "agent-loop run", "agent-loop verify", "credentials set", "credentials describe"]));
    const native = program.commands.find(command => command.name() === "agent-loop")!;
    expect(native.helpInformation()).not.toContain("(internal)");
    expect(native.helpInformation()).toContain("guide");
    expect(renderGroupedHelp(program)).toContain("amc agent-loop guide");
    expect(renderGroupedHelp(program)).toContain("Assess existing evidence");
  });

  it("returns provider choices without prompting or silently selecting a stub", async () => {
    const { program, output, failures } = registry();
    await program.parseAsync(["agent-loop", "guide", "--json"], { from: "user" });
    const result = JSON.parse(output.join("\n"));
    expect(result.status).toBe("choose-provider");
    expect(result.provider).toBeNull();
    expect(result.choices.map((choice: { provider: string }) => choice.provider)).toEqual(["openai", "openai-responses", "anthropic", "stub"]);
    expect(result.nextAction).toBeNull();
    expect(failures).toEqual([]);
  });
});
