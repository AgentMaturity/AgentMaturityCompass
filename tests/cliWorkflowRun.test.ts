import { mkdirSync, mkdtempSync, rmSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("refuses a --workflow-run-id the session never created instead of starting a new run under it, and needs --session", async () => {
    const file = planFile("resume-typo.json", { kind: "pipeline", id: "p", stages: [agent("a", "draft"), agent("b", "polish")] });
    const first = programWith();
    await run(first.program, [...base, "--delegate", "--workflow-plan", file, "--keep-open"]);
    expect(first.captured.failures, first.captured.errors.join("\n")).toEqual([]);
    const summary = lastJson(first.captured) as { sessionId: string; workflow: { runId: string } };

    const typo = programWith();
    await run(typo.program, [...base, "--delegate", "--workflow-plan", file, "--session", summary.sessionId, "--workflow-run-id", `${summary.workflow.runId}-typo`, "--keep-open"]);
    expect(typo.captured.failures).toEqual([1]);
    const refused = lastJson(typo.captured) as { workflow: { ok: boolean; agentsRun: number; failed: Array<{ reason: string }> } };
    expect(refused.workflow.ok).toBe(false);
    expect(refused.workflow.agentsRun, "no node was dispatched again").toBe(0);
    expect(refused.workflow.failed[0]?.reason).toMatch(/has no creation checkpoint in this session; nothing to resume/);

    const unsessioned = programWith();
    await run(unsessioned.program, [...base, "--delegate", "--workflow-plan", file, "--workflow-run-id", summary.workflow.runId]);
    expect(unsessioned.captured.failures).toEqual([1]);
    expect(unsessioned.captured.errors.at(-1)).toMatch(/add --session <id>/);
  });

  it("pins the reviewed plan bytes with --workflow-plan-sha256 and refuses any other bytes", async () => {
    const file = planFile("pinned.json", agent("a", "draft"));
    const probe = programWith();
    await run(probe.program, [...base, "--delegate", "--workflow-plan", file, "--workflow-plan-sha256", "0".repeat(64)]);
    expect(probe.captured.failures).toEqual([1]);
    const refusal = probe.captured.errors.at(-1) ?? "";
    expect(refusal).toMatch(/--workflow-plan-sha256 does not match .*pinned\.json: the file's sha256 is [a-f0-9]{64}/);
    expect(probe.captured.out, "no session was composed").toEqual([]);
    const digest = /sha256 is ([a-f0-9]{64})/.exec(refusal)![1]!;

    const pinned = programWith();
    await run(pinned.program, [...base, "--delegate", "--workflow-plan", file, "--workflow-plan-sha256", digest.toUpperCase()]);
    expect(pinned.captured.failures, pinned.captured.errors.join("\n")).toEqual([]);
    expect((lastJson(pinned.captured) as { workflow: { ok: boolean } }).workflow.ok).toBe(true);
    expect(pinned.captured.errors.some(line => line.includes("pinned)"))).toBe(true);

    const alone = programWith();
    await run(alone.program, [...base, "hello", "--delegate", "--workflow-plan-sha256", digest]);
    expect(alone.captured.failures).toEqual([1]);
    expect(alone.captured.errors.at(-1)).toMatch(/need --workflow-plan/);
  });

  it("accepts any in-workspace file name and a path through a symlinked directory prefix", async () => {
    const spaced = planFile("my plan (reviewed).json", agent("a", "draft"));
    const first = programWith();
    await run(first.program, [...base, "--delegate", "--workflow-plan", spaced]);
    expect(first.captured.failures, first.captured.errors.join("\n")).toEqual([]);
    expect((lastJson(first.captured) as { workflow: { ok: boolean } }).workflow.ok).toBe(true);

    mkdirSync(join(dir, "plans"));
    writeFileSync(join(dir, "plans", "p.json"), JSON.stringify(agent("a", "draft")), "utf8");
    symlinkSync(dir, join(home, "linked-workspace"));
    const linked = programWith();
    await run(linked.program, [...base, "--delegate", "--workflow-plan", join(home, "linked-workspace", "plans", "p.json")]);
    expect(linked.captured.failures, linked.captured.errors.join("\n")).toEqual([]);
    expect(linked.captured.errors.some(line => line.includes(`workflow plan ${join(dir, "plans", "p.json")}`))).toBe(true);

    // The file itself is never followed: a symlink inside the workspace to a plan outside it is refused.
    writeFileSync(join(home, "outside.json"), JSON.stringify(agent("a", "x")), "utf8");
    symlinkSync(join(home, "outside.json"), join(dir, "link.json"));
    const viaLink = programWith();
    await run(viaLink.program, [...base, "--delegate", "--workflow-plan", "link.json"]);
    expect(viaLink.captured.failures).toEqual([1]);
    expect(viaLink.captured.errors.at(-1)).toMatch(/not a regular file/);
  });

  it("runs a parallel node wider than --max-active-children within that bound instead of refusing nodes at admission", async () => {
    const file = planFile("par.json", { kind: "parallel", id: "p", children: [agent("a", "one"), agent("b", "two"), agent("c", "three")] });
    const { program, captured } = programWith();
    await run(program, [...base, "--delegate", "--workflow-plan", file, "--max-active-children", "1", "--think-ms", "300"]);
    expect(captured.failures, captured.errors.join("\n")).toEqual([]);
    const summary = lastJson(captured) as { workflow: { ok: boolean; agentsRun: number; outputs: Record<string, string> } };
    expect(summary.workflow.ok).toBe(true);
    expect(summary.workflow.agentsRun).toBe(3);
    expect(Object.keys(summary.workflow.outputs).sort()).toEqual(["a", "b", "c"]);
  }, 30_000);

  it("cancels the pass at --cancel-after", async () => {
    const file = planFile("slow.json", agent("a", "think"));
    const { program, captured } = programWith();
    const started = Date.now();
    await run(program, [...base, "--delegate", "--workflow-plan", file, "--think-ms", "4000", "--cancel-after", "300"]);
    expect(captured.failures).toEqual([1]);
    expect(Date.now() - started, "the pass did not wait out the child's thinking").toBeLessThan(3500);
    const summary = lastJson(captured) as { workflow: { ok: boolean; cancelled: boolean } };
    expect(summary.workflow.ok).toBe(false);
    expect(summary.workflow.cancelled).toBe(true);
    expect(captured.errors.some(line => line.includes("cancelling the workflow pass (cause: --cancel-after)"))).toBe(true);
  }, 30_000);

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

  it("does not load or announce definitions where no in-process workspace delegate can use them", async () => {
    mkdirSync(join(dir, ".amc", "agents"), { recursive: true });
    writeFileSync(join(dir, ".amc", "agents", "reviewer.md"), "---\nname: reviewer\ndescription: reviews\n---\nBe strict.\n", "utf8");
    const offered = (captured: Captured) => captured.errors.some(line => line.includes("agent definitions offered"));
    const echo = programWith();
    await run(echo.program, ["agent-loop", "run", "--credentials-home", home, "--json", "hello", "--delegate"]);
    expect(echo.captured.failures, echo.captured.errors.join("\n")).toEqual([]);
    expect(offered(echo.captured), "echo tools carry no delegate tool").toBe(false);

    const rounds = programWith();
    await run(rounds.program, [...base, "hello", "--delegate", "--goal-rounds", "1"]);
    expect(rounds.captured.failures, rounds.captured.errors.join("\n")).toEqual([]);
    expect(offered(rounds.captured), "goal-round children get no definitions").toBe(false);
  });
});
