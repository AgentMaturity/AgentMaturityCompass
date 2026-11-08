import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { registerCredentialsCommands } from "../src/cli-credentials-commands.js";
import { buildCommandInventory, renderGroupedHelp } from "../src/cliUx.js";

function registry() {
  const output: string[] = [];
  const failures: number[] = [];
  const program = new Command().option("--agent <id>").exitOverride().configureOutput({ writeErr: () => {} });
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
    // A 33-character path still gets a space before its description.
    expect(renderGroupedHelp(program)).toContain("  amc agent-loop verify <sessionId> Verify recorded native task evidence");
  });

  // LIVE-UX-07: the README's one command (amc up), the first console account, amc down and the packs were absent.
  it("adds a Studio and first run block after Start with a task, each row only when its command exists", () => {
    const { program } = registry();
    program.command("up");
    program.command("down");
    program.command("user").command("init");
    program.command("domain").command("pack").command("list");
    const help = renderGroupedHelp(program);
    expect(help).toContain("Studio and first run:");
    expect(help).toContain("  amc up                           Start Studio and the Compass Console; first run scores the workspace");
    expect(help).toContain("  amc user init --username <you>   Create the first console account (new workspace only; see amc user add)");
    expect(help).toContain("  amc down                         Stop Studio");
    expect(help).toContain("  amc domain pack list             List the free Industry Packs (self-reported questionnaires)");
    expect(help.indexOf("Start with a task:")).toBeLessThan(help.indexOf("Studio and first run:"));
    expect(help.indexOf("Studio and first run:")).toBeLessThan(help.indexOf("Primary command groups:"));
    expect(help).not.toContain("amc user password");
  });

  it("leaves out a first-run row whose command is not registered, and the block when none is", () => {
    const { program } = registry();
    expect(renderGroupedHelp(program)).not.toContain("Studio and first run:");
    program.command("down");
    const help = renderGroupedHelp(program);
    expect(help).toContain("Studio and first run:");
    expect(help).toContain("  amc down ");
    expect(help).not.toContain("  amc up ");
    expect(help).not.toContain("amc user init");
  });

  it.each([
    ["--agent", "global-reviewer", "agent-loop", "guide", "--json"],
    ["agent-loop", "guide", "--agent", "global-reviewer", "--json"],
    ["--agent", "ignored-global", "agent-loop", "guide", "--agent", "global-reviewer", "--json"]
  ])("keeps the selected identity in the copyable native action: %j", async (...argv) => {
    const { program, output, failures } = registry();
    await program.parseAsync(argv, { from: "user" });
    const result = JSON.parse(output.join("\n"));
    expect(result.agentId).toBe("global-reviewer");
    expect(result.choices[0].action.argv.slice(0, 4)).toEqual(["amc", "--agent", "global-reviewer", "agent-loop"]);
    expect(failures).toEqual([]);
  });

  it("returns provider choices without prompting or silently selecting a stub", async () => {
    const { program, output, failures } = registry();
    await program.parseAsync(["agent-loop", "guide", "--json"], { from: "user" });
    const result = JSON.parse(output.join("\n"));
    expect(result.status).toBe("choose-provider");
    expect(result.provider).toBeNull();
    // SH-PROVIDERS-01: the OpenAI-compatible routes run and acp admit are offered too, before the stub.
    expect(result.choices.map((choice: { provider: string }) => choice.provider)).toEqual(["openai", "openai-responses", "anthropic", "deepseek", "gemini", "gemini-audio", "ollama",
      "groq", "mistral", "xai", "openrouter", "together", "fireworks", "lmstudio", "vllm", "llamacpp", "azure-openai", "stub"]);
    expect(result.nextAction).toBeNull();
    expect(failures).toEqual([]);
  });
});
