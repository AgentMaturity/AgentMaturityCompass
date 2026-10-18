/**
 * P1-38 through the operator surface: `amc agent-loop run --provider pi-ai:<provider>` selects the pinned route,
 * runs a verifiable turn against a local fixture server, and lists pi routes apart from the native default.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { verifyAgentRun, type AgentRunSummary } from "../../src/agent/runReport.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../../src/cli-agent-commands.js";
import { PI_AI_ROUTES_HELP, registerNativeProviderCommands } from "../../src/cli-agent-options.js";
import { registerAcpCommands } from "../../src/acp/acpCli.js";
import { piAiRouteIds } from "../../src/llm/providers/piAi/piAiAdapter.js";
import { chatSse, fixtureServer, PI_FIXTURE_MODELS } from "../helpers/fixtureProviderHarness.js";

let dir: string, home: string, cwd: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "amc-pi-cli-"));
  home = mkdtempSync(join(tmpdir(), "amc-pi-cli-home-"));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  writeFileSync(join(home, ".credentials.yaml"), "GROQ_API_KEY: fixture-value-not-a-provider-key\n", { mode: 0o600 });
  chmodSync(home, 0o700);
  cwd = process.cwd();
});
afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function programWith() {
  const out: string[] = [], errors: string[] = [], failures: number[] = [];
  const io: AgentLoopCliIo = { log: (line) => out.push(line), error: (line) => errors.push(line), fail: () => failures.push(1) };
  const program = new Command();
  program.exitOverride();
  registerAgentCommands(program, io);
  return { program, out, errors, failures, run: (argv: string[]) => program.parseAsync(argv, { from: "user" }) };
}

describe("amc agent-loop run with a pi-ai route (P1-38)", () => {
  test("a pi route runs a verifiable turn; its request is reconstructed by the pinned library", async () => {
    const server = await fixtureServer([chatSse({ text: "Hello from the fixture." })]);
    process.chdir(dir);
    const cli = programWith();
    await cli.run(["agent-loop", "run", "hello", "--provider", "pi-ai:groq", "--model", PI_FIXTURE_MODELS.groq,
      "--base-url", `${server.origin}/openai/v1`, "--credentials-home", home, "--max-tokens", "64", "--json"]);
    expect(cli.errors.filter((line) => /pi-ai|refus|unknown provider/i.test(line))).toEqual([]);
    expect(cli.failures).toEqual([]);
    const summary = JSON.parse(cli.out[cli.out.length - 1]!) as AgentRunSummary;
    expect(server.received).toHaveLength(1);
    expect(server.received[0]!.url).toBe("/openai/v1/chat/completions");
    expect(JSON.parse(server.received[0]!.body.toString("utf8"))).toMatchObject({ model: PI_FIXTURE_MODELS.groq, max_completion_tokens: 64 });
    const report = await verifyAgentRun(dir, summary.sessionId);
    expect(report.requests.map((request) => request.status)).toEqual(["reconstructed"]);
  });

  test("an unreviewed pi route or a reasoning model is refused before any session exists", async () => {
    process.chdir(dir);
    for (const [argv, expected] of [
      [["--provider", "pi-ai:openai", "--model", "gpt-4o"], "reviewed pi-ai routes are pi-ai:groq, pi-ai:huggingface, pi-ai:together"],
      [["--provider", "pi-ai:groq", "--model", "openai/gpt-oss-120b"], "reasoning model"],
      [["--provider", "pi-ai:groq"], "--model is required for provider pi-ai:groq"]
    ] as const) {
      const cli = programWith();
      await cli.run(["agent-loop", "run", "hi", ...argv, "--credentials-home", home]);
      expect(cli.failures).toEqual([1]);
      expect(cli.errors.join("\n")).toContain(expected);
    }
  });

  test("help lists the pi routes apart from the native routes and names the pin", () => {
    expect(PI_AI_ROUTES_HELP).toContain(`Third-party library routes (agent-loop run only): ${piAiRouteIds().join(", ")}.`);
    expect(PI_AI_ROUTES_HELP).toContain("@earendil-works/pi-ai@1.3.0, an optional peer pinned to a reviewed version");
    const program = new Command(), quiet = { log: () => {}, error: () => {}, fail: () => {} };
    registerAgentCommands(program, quiet);
    registerAcpCommands(program);
    registerNativeProviderCommands(program, quiet);
    const run = program.commands.find((command) => command.name() === "agent-loop")!.commands.find((command) => command.name() === "run")!;
    let help = "";
    run.configureOutput({ writeOut: (text) => { help += text; } });
    run.outputHelp();
    expect(help).toContain("Native provider routes: stub, anthropic");
    expect(help).toContain(PI_AI_ROUTES_HELP.trim());
  });
});
