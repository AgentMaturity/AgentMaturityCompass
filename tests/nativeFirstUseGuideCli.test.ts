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
    const help = renderGroupedHelp(program);
    expect(help).toContain("  amc agent-loop chat              Chat with a model; every turn is recorded");
    expect(help).toContain("  amc connect                      Connect an existing agent");
    // The native guide stays one `amc help agent-loop` away; the short list names the chat, not every native command.
    expect(help).not.toContain("amc agent-loop guide");
  });

  // LIVE-UX-07 kept: the README's one command (amc up), the first console account, amc down and the packs, now in one short list.
  it("lists the start-here tasks, each row only when its command exists", () => {
    const { program } = registry();
    program.command("up");
    program.command("down");
    program.command("user").command("init");
    program.command("domain").command("pack").command("list");
    program.command("login").command("status");
    program.command("doctor");
    const help = renderGroupedHelp(program);
    expect(help).toContain("  amc                              Pick what to do: watch Claude Code or Codex, chat, or open the console");
    expect(help).toContain("  amc up / amc down                Start or stop AMC and its console in your browser");
    expect(help).toContain("  amc login status                 Show whether Claude Code and Codex are signed in");
    expect(help).toContain("  amc doctor                       Check this folder and name each fix");
    expect(help).toContain("  amc user init                    Create your console account (new workspace only; see amc user add)");
    expect(help).toContain("  amc domain pack list             List the free Industry Packs (self-reported questionnaires)");
    expect(help.indexOf("Start here:")).toBeLessThan(help.indexOf("More:"));
    expect(help).toContain("amc --help --all");
    expect(help).not.toContain("amc user password");
    expect(help).not.toContain("Primary command groups:");
  });

  it("leaves out a row whose command is not registered", () => {
    const { program } = registry();
    const help = renderGroupedHelp(program);
    expect(help).not.toContain("amc up ");
    expect(help).not.toContain("amc user init");
    expect(help).toContain("Start here:");
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
