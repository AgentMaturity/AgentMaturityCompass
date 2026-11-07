import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { loadHandoffPacket, listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { SessionService } from "../src/session/sessionService.js";
import { runWorkflowPlan } from "../src/workflow/workflowRunner.js";
import { parseWorkflowPlan, type WorkflowNode } from "../src/workflow/workflowPlan.js";
import type { AgentDefinition } from "../src/agent/agentDefinitions.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";

/**
 * `delegate({agent})` and workflow `agent:` nodes (SH-ORCH-01): the model may
 * NAME a role; everything the role does to the child comes from the file the
 * operator reviewed, is applied before the packet is signed, and is recorded in
 * the packet's constraints. An unknown name is refused before anything is
 * announced.
 */
const PASS = "delegate-agent-definition-test-passphrase";
const dirs: string[] = [];
const sessions: SessionService[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.disposeWithoutClosing();
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegate-def-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  const ledger = openLedger(dir);
  ledger.startSession({ sessionId: "toolset-test-session", runtime: "amc", binaryPath: "test", binarySha256: "test" });
  ledger.close();
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, { ...config, tools: { ...config.tools,
    allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }] } });
  return dir;
}

const reviewer: AgentDefinition = { name: "reviewer", description: "reviews code", body: "Be strict.", sourcePath: "/w/.amc/agents/reviewer.md",
  sha256: "b".repeat(64), tools: ["fs.read"], scope: ["READ_ONLY"], timeoutMs: 4000, maxSteps: 2 };

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; }, recordProjectedEvidence: () => null };
}

function spyRunner() {
  const seen: SubagentRunContext[] = [];
  return { seen, runner: async (ctx: SubagentRunContext): Promise<SubagentRunResult> => { seen.push(ctx); return { ok: true, text: "done" }; } };
}

const call = (args: unknown) => ({ callId: "c1", toolName: "delegate", rawArguments: JSON.stringify(args), sessionId: "parent-session",
  turn: 1, step: 1, parentToken: null, dispatch: "native" as const, signal: new AbortController().signal });

describe("delegate({agent}) applies the operator's definition", () => {
  it("narrows the child, binds the role in its context and signs it into the packet", async () => {
    const dir = workspace();
    const spy = spyRunner();
    const session = recorder();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session, delegationScope: ["READ_ONLY", "WRITE_LOW"],
        stopConditions: ["timeout-ms:9000"], definitions: new Map([["reviewer", reviewer]]) } });

    const outcome = await toolset.seam.execute(call({ runAs: "r1", goal: "review the diff", agent: "reviewer" }));
    expect(String(outcome.content)).toBe("done");
    expect(spy.seen).toHaveLength(1);
    const ctx = spy.seen[0]!;
    expect(ctx.delegationScope).toEqual(["READ_ONLY"]);
    expect(ctx.stopConditions).toEqual(["timeout-ms:4000"]);
    expect(ctx.agentDefinition).toEqual({ name: "reviewer", sha256: "b".repeat(64), tools: ["fs.read"], maxSteps: 2 });
    expect(ctx.definitions?.get("reviewer")).toBe(reviewer);
    expect(ctx.goal).toContain("# Agent definition: reviewer");
    expect(ctx.goal.endsWith("# Task\nreview the diff")).toBe(true);
    const packet = loadHandoffPacket(dir, listHandoffPackets(dir)[0]!);
    expect(packet.constraints).toContain("agentDefinition=reviewer");
    expect(packet.constraints).toContain(`agentDefinitionSha256=${"b".repeat(64)}`);
    expect(packet.delegationScope).toEqual(["READ_ONLY"]);
    expect(packet.goal).toBe(ctx.goal);
    toolset.close();
  });

  it("refuses an unknown name before anything is announced", async () => {
    const dir = workspace();
    const spy = spyRunner();
    const session = recorder();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session, definitions: new Map([["reviewer", reviewer]]) } });
    const outcome = await toolset.seam.execute(call({ runAs: "r1", goal: "review", agent: "root" }));
    expect(String(outcome.content)).toMatch(/\[amc\] delegation refused: no agent definition named "root"; admitted: reviewer/);
    expect(spy.seen).toEqual([]);
    expect(session.rows).toEqual([]);
    expect(listHandoffPackets(dir)).toEqual([]);
    toolset.close();
  });

  it("refuses any name when no definitions are admitted, and says so", async () => {
    const dir = workspace();
    const spy = spyRunner();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session: recorder() } });
    const outcome = await toolset.seam.execute(call({ runAs: "r1", goal: "review", agent: "reviewer" }));
    expect(String(outcome.content)).toMatch(/no agent definitions are admitted/);
    expect(spy.seen).toEqual([]);
    toolset.close();
  });

  it("lists the admitted roles in the tool description as quoted data", () => {
    const dir = workspace();
    const toolset = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spyRunner().runner, session: recorder(), definitions: new Map([["reviewer", reviewer]]) } });
    const schema = (toolset.seam.schemas() ?? []).find(s => s.name === "delegate")!;
    expect(schema.description).toContain('reviewer: "reviews code"');
    toolset.close();
  });
});

describe("workflow nodes name a role the same way", () => {
  function workflowSession(dir: string) {
    const session = new SessionService(dir);
    sessions.push(session);
    session.open({ sessionId: `workflow-${sessions.length}`, agentId: "payments-agent", harnessVersion: "test", compositionDigest: "c", policyDigest: "p" });
    return session;
  }
  const plan = (raw: unknown): WorkflowNode => { const parsed = parseWorkflowPlan(raw); if (!parsed.ok) throw new Error(parsed.reason); return parsed.plan; };

  it("applies the definition to an agent node and fails a node naming an unknown role", async () => {
    const dir = workspace();
    const spy = spyRunner();
    let n = 0;
    const run = (node: WorkflowNode) => runWorkflowPlan({ workspace: dir, plan: node, parent: rootIdentity("payments-agent"),
      session: workflowSession(dir), runner: spy.runner, mintSessionId: () => `child-${(n += 1)}`, definitions: new Map([["reviewer", reviewer]]) });
    const ok = await run(plan({ kind: "agent", id: "a", runAs: "r", goal: "look", agent: "reviewer" }));
    expect(ok.ok, JSON.stringify(ok.failures)).toBe(true);
    expect(spy.seen[0]!.agentDefinition?.name).toBe("reviewer");
    expect(spy.seen[0]!.delegationScope).toEqual(["READ_ONLY"]);
    const bad = await run(plan({ kind: "agent", id: "b", runAs: "r", goal: "look", agent: "nobody" }));
    expect(bad.ok).toBe(false);
    expect(bad.failures[0]!.reason).toMatch(/no agent definition named "nobody"/);
    expect(bad.agentsRun).toBe(0);
  });

  it("refuses an agent name that is not a definition name as data", () => {
    const parsed = parseWorkflowPlan({ kind: "agent", id: "a", runAs: "r", goal: "g", agent: "Not A Name" });
    expect(!parsed.ok && parsed.reason).toMatch(/agent must be a definition name/);
  });
});
