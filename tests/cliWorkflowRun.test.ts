import { mkdirSync, mkdtempSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { registerAgentCommands, type AgentLoopCliIo } from "../src/cli-agent-commands.js";

/**
 * `amc agent-loop run --workflow-plan <file>` and `--list-agents` (SH-ORCH-01/03),
 * end to end on the stub provider: a reviewed plan runs headless as in-process
 * children, the result and exit status come from the plan's outcome, and the
 * refusals are said before any session exists.
 */
const PASS = "cli-workflow-run-test-passphrase";
let dir = "";
let home = "";
const cwd = process.cwd();

beforeEach(() => {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-workflow-")));
  home = realpathSync(mkdtempSync(join(tmpdir(), "amc-cli-workflow-home-")));
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(dir, "default");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools, allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

interface Captured { readonly out: string[]; readonly errors: string[]; readonly failures: number[] }
function programWith(): { program: Command; captured: Captured } {
  const out: string[] = [], errors: string[] = [], failures: number[] = [];
  const io: AgentLoopCliIo = { log: line => out.push(line), error: line => errors.push(line), fail: () => failures.push(1) };
  const program = new Command();
  program.exitOverride();
  registerAgentCommands(program, io);
  return { program, captured: { out, errors, failures } };
}
const run = (program: Command, argv: string[]): Promise<unknown> => program.parseAsync(argv, { from: "user" });
const base = ["agent-loop", "run", "--credentials-home", home, "--tools", "workspace", "--json"];
const lastJson = (captured: Captured): Record<string, unknown> => JSON.parse(captured.out.at(-1) ?? "{}") as Record<string, unknown>;

const agent = (id: string, goal: string) => ({ kind: "agent", id, runAs: "worker", goal });
function planFile(name: string, plan: unknown): string {
  writeFileSync(join(dir, name), JSON.stringify(plan), "utf8");
  return name;
}

describe("agent-loop run --workflow-plan", () => {
  it("runs a reviewed pipeline headless and reports every node's output", async () => {
    const file = planFile("plan.json", { kind: "pipeline", id: "p", stages: [agent("a", "draft"), agent("b", "polish")] });
    const { program, captured } = programWith();
    await run(program, [...base, "--delegate", "--workflow-plan", file]);
    expect(captured.failures, captured.errors.join("\n")).toEqual([]);
    const summary = lastJson(captured) as { workflow?: { ok: boolean; outputs: Record<string, string>; agentsRun: number; runId: string } };
    expect(summary.workflow?.ok).toBe(true);
    expect(Object.keys(summary.workflow!.outputs).sort()).toEqual(["a", "b"]);
    expect(summary.workflow!.agentsRun).toBe(2);
    expect(summary.workflow!.outputs["b"]).toContain("stub provider");
    expect(captured.errors.some(line => line.includes("workflow plan") && line.includes("sha256"))).toBe(true);
  });

  it("fails the command when a verify node cannot read a verdict", async () => {
    const file = planFile("verify.json", { kind: "pipeline", id: "p", stages: [agent("a", "draft"),
      { kind: "verify", id: "v", runAs: "checker", goal: "Is it acceptable?", of: "a" }] });
    const { program, captured } = programWith();
    await run(program, [...base, "--delegate", "--workflow-plan", file]);
    expect(captured.failures).toEqual([1]);
    const summary = lastJson(captured) as { workflow?: { ok: boolean; failed: Array<{ nodeId: string; reason: string }> } };
    expect(summary.workflow?.ok).toBe(false);
    expect(summary.workflow?.failed[0]?.nodeId).toBe("v");
    expect(summary.workflow?.failed[0]?.reason).toMatch(/verify verdict (missing|ambiguous)/);
  });

  it("resumes a durable run in a session left unsealed, without dispatching again", async () => {
    const file = planFile("resume.json", agent("a", "draft"));
    const first = programWith();
    await run(first.program, [...base, "--delegate", "--workflow-plan", file, "--keep-open"]);
    expect(first.captured.failures, first.captured.errors.join("\n")).toEqual([]);
    const summary = lastJson(first.captured) as { sessionId: string; workflow: { runId: string } };
    const again = programWith();
    await run(again.program, [...base, "--delegate", "--workflow-plan", file, "--session", summary.sessionId, "--workflow-run-id", summary.workflow.runId]);
    expect(again.captured.failures, again.captured.errors.join("\n")).toEqual([]);
    const resumed = lastJson(again.captured) as { workflow: { ok: boolean; agentsRun: number; outputs: Record<string, string> } };
    expect(resumed.workflow.ok).toBe(true);
    expect(resumed.workflow.agentsRun).toBe(0);
    expect(Object.keys(resumed.workflow.outputs)).toEqual(["a"]);
  });

  it("refuses without --delegate, with a plan outside the workspace, with an unparseable plan and with a prompt", async () => {
    const file = planFile("p.json", agent("a", "draft"));
    const without = programWith();
    await run(without.program, [...base, "--workflow-plan", file]);
    expect(without.captured.failures).toEqual([1]);
    expect(without.captured.errors.at(-1)).toMatch(/needs --delegate/);

    const outside = programWith();
    writeFileSync(join(home, "outside.json"), JSON.stringify(agent("a", "x")), "utf8");
    await run(outside.program, [...base, "--delegate", "--workflow-plan", join(home, "outside.json")]);
    expect(outside.captured.failures).toEqual([1]);
    expect(outside.captured.errors.at(-1)).toMatch(/inside the workspace/);

    const bad = programWith();
    await run(bad.program, [...base, "--delegate", "--workflow-plan", planFile("bad.json", { kind: "agent", id: "a" })]);
    expect(bad.captured.failures).toEqual([1]);
    expect(bad.captured.errors.at(-1)).toMatch(/--workflow-plan refused: node a: runAs/);

    const prompted = programWith();
    await expect(run(prompted.program, [...base, "hello", "--delegate", "--workflow-plan", file])).rejects.toThrow(/takes no prompt/);
  });
});

describe("agent-loop run --list-agents", () => {
  it("lists admitted definitions with their digests and withholds broken ones", async () => {
    mkdirSync(join(dir, ".amc", "agents"), { recursive: true });
    writeFileSync(join(dir, ".amc", "agents", "reviewer.md"), "---\nname: reviewer\ndescription: reviews\ntools: fs.read\n---\nBe strict.\n", "utf8");
    writeFileSync(join(dir, ".amc", "agents", "broken.md"), "---\nname: broken\ndescription: x\nmodel: gpt\n---\n", "utf8");
    const { program, captured } = programWith();
    await run(program, ["agent-loop", "run", "--credentials-home", home, "--list-agents", "--json"]);
    const listed = lastJson(captured) as { ok: boolean; agents: Array<{ name: string; tools: string[] | null; sha256: string }>; problems: Array<{ name: string }> };
    expect(listed.ok).toBe(false);
    expect(listed.agents.map(one => one.name)).toEqual(["reviewer"]);
    expect(listed.agents[0]!.tools).toEqual(["fs.read"]);
    expect(listed.problems.map(one => one.name)).toEqual(["broken"]);
    expect(captured.failures).toEqual([1]);

    const named = programWith();
    await run(named.program, ["agent-loop", "run", "--credentials-home", home, "--list-agents", "reviewer", "--json"]);
    expect((lastJson(named.captured) as { agent: { body: string } }).agent.body.trim()).toBe("Be strict.");
  });

  it("offers the definitions to a --delegate run and says so", async () => {
    mkdirSync(join(dir, ".amc", "agents"), { recursive: true });
    writeFileSync(join(dir, ".amc", "agents", "reviewer.md"), "---\nname: reviewer\ndescription: reviews\n---\nBe strict.\n", "utf8");
    const { program, captured } = programWith();
    await run(program, [...base, "hello", "--delegate"]);
    expect(captured.failures, captured.errors.join("\n")).toEqual([]);
    expect(captured.errors.some(line => line.includes("agent definitions offered to delegates: reviewer"))).toBe(true);
  });
});
