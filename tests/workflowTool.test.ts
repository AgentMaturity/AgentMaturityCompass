import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { MAX_PLAN_NODES } from "../src/workflow/workflowPlan.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";

/**
 * `workflow` as a model-facing tool, under the same two-party grant as
 * `delegate` (plan P6.1c).
 *
 * One call can spawn up to `MAX_PLAN_NODES` delegations, so it is granted twice
 * over: the INTEGRATOR composes the capability into a toolset, and the OPERATOR
 * permits the tool in a signed allowlist. Either party alone is not enough --
 * the same reasoning `delegate` was built on, and more load-bearing here because
 * the fan-out is larger.
 */
const PASS = "workflow-tool-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wf-tool-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

function allow(dir: string, name: string): void {
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, {
    ...config,
    tools: {
      ...config.tools,
      allowedTools: [...config.tools.allowedTools, { name, actionClass: "READ_ONLY" }]
    }
  });
}

const recorder = () => {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; } };
};

function toolsetWith(dir: string, runner: (ctx: SubagentRunContext) => Promise<SubagentRunResult>) {
  return agentToolset({
    workspace: dir,
    agentId: "payments-agent",
    subagents: { identity: rootIdentity("payments-agent"), runner, session: recorder() }
  });
}

const call = (plan: unknown) => ({
  callId: "c1",
  toolName: "workflow",
  rawArguments: JSON.stringify({ plan }),
  sessionId: "parent-session",
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

const okRunner = async (ctx: SubagentRunContext): Promise<SubagentRunResult> =>
  ({ ok: true, text: `answer to ${ctx.goal}` });

const agent = (id: string, goal = `goal-${id}`) => ({ kind: "agent", id, runAs: "researcher", goal });

describe("two parties must agree before an agent can run a workflow", () => {
  it("is not offered unless the integrator composed the capability", () => {
    const dir = workspace();
    const without = agentToolset({ workspace: dir, agentId: "payments-agent" });
    expect((without.seam.schemas() ?? []).map((s) => s.name)).not.toContain("workflow");
    without.close();
  });

  it("is denied by the signed allowlist even when the capability is granted", async () => {
    // No `allow(dir, "workflow")`. One call fans out to many delegations, each
    // spending the operator's budget on agents they did not start.
    const dir = workspace();
    const toolset = toolsetWith(dir, okRunner);

    const outcome = await toolset.seam.execute(call(agent("a")));

    expect(outcome.denied, "the operator never permitted it").toBe(true);
    expect(String(outcome.content)).toContain("not in the signed tool allowlist");
    toolset.close();
  });

  it("runs once both parties have agreed", async () => {
    const dir = workspace();
    allow(dir, "workflow");
    const toolset = toolsetWith(dir, okRunner);

    const outcome = await toolset.seam.execute(call(agent("a", "check the ledger")));

    expect(outcome.denied).not.toBe(true);
    expect(String(outcome.content)).toContain("check the ledger");
    toolset.close();
  });
});

describe("the model gets its own structure back, labelled by its own ids", () => {
  it("returns each node's answer under the id the model chose", async () => {
    // Not a summary. A summary would be a claim no agent made; the node ids are
    // the MODEL's own labels, so echoing them is returning the shape it asked
    // for rather than adding runtime framing.
    const dir = workspace();
    allow(dir, "workflow");
    const toolset = toolsetWith(dir, okRunner);

    const outcome = await toolset.seam.execute(call({
      kind: "parallel",
      id: "root",
      children: [agent("a", "first"), agent("b", "second")]
    }));

    const parsed = JSON.parse(String(outcome.content)) as { outputs: Record<string, string> };
    expect(parsed.outputs["a"]).toContain("first");
    expect(parsed.outputs["b"]).toContain("second");
    toolset.close();
  });

  it("keeps answers and failures apart instead of concatenating them", async () => {
    // `delegate`'s rule, carried over: the runtime's account is never presented
    // as something an agent said. With several children the two are structurally
    // separate, so they stay in separate fields.
    const dir = workspace();
    allow(dir, "workflow");
    const toolset = toolsetWith(dir, async (ctx) =>
      ctx.goal.includes("bad")
        ? { ok: false, text: "", reason: "that one failed" }
        : { ok: true, text: "fine" });

    const outcome = await toolset.seam.execute(call({
      kind: "parallel",
      id: "root",
      children: [agent("a", "good"), agent("b", "bad")]
    }));

    const parsed = JSON.parse(String(outcome.content)) as {
      outputs: Record<string, string>;
      failed: Array<{ nodeId: string }>;
    };
    expect(parsed.outputs["a"], "work already paid for is still reported").toBe("fine");
    expect(parsed.failed.map((f) => f.nodeId)).toEqual(["b"]);
    toolset.close();
  });
});

describe("a plan the model got wrong is refused, not attempted", () => {
  it("refuses an invalid plan without spawning anything", async () => {
    const dir = workspace();
    allow(dir, "workflow");
    let spawned = 0;
    const toolset = toolsetWith(dir, async (ctx) => { spawned += 1; return okRunner(ctx); });

    const outcome = await toolset.seam.execute(call({ kind: "parallel", id: "root", children: [] }));

    // The reason reaches the model, not a bare "refused". A model told only that
    // it was refused re-emits the same plan; one told what was wrong with it can
    // fix the plan.
    expect(String(outcome.content)).toContain("workflow refused");
    expect(String(outcome.content), "and says what was wrong").toContain("would run nothing");
    expect(spawned, "nothing ran").toBe(0);
    toolset.close();
  });

  it("refuses a plan past the fan-out cap without spawning anything", async () => {
    const dir = workspace();
    allow(dir, "workflow");
    let spawned = 0;
    const toolset = toolsetWith(dir, async (ctx) => { spawned += 1; return okRunner(ctx); });

    const children = Array.from({ length: MAX_PLAN_NODES + 1 }, (_, i) => agent(`a${i}`));
    const outcome = await toolset.seam.execute(call({ kind: "parallel", id: "root", children }));

    expect(String(outcome.content)).toContain("workflow refused");
    expect(String(outcome.content), "and names the cap it exceeded").toContain(String(MAX_PLAN_NODES));
    expect(spawned).toBe(0);
    toolset.close();
  });

  it("refuses arguments that are not a plan at all", async () => {
    const dir = workspace();
    allow(dir, "workflow");
    const toolset = toolsetWith(dir, okRunner);

    const outcome = await toolset.seam.execute({ ...call(null), rawArguments: JSON.stringify({}) });

    expect(String(outcome.content)).toContain("workflow refused");
    toolset.close();
  });
});

describe("a workflow stops when the turn is cancelled", () => {
  it("gives up the plan on the turn's signal", async () => {
    // The reason `ToolExecution` carries a signal at all. One call can spawn up
    // to MAX_PLAN_NODES delegations, so a cancelled turn that left the plan
    // running would make the force-settle cancellation built for exactly this
    // case unreachable from the only surface that fans out.
    const dir = workspace();
    allow(dir, "workflow");
    const controller = new AbortController();
    let spawned = 0;
    const toolset = toolsetWith(dir, async (ctx) => {
      spawned += 1;
      controller.abort();
      return okRunner(ctx);
    });

    const outcome = await toolset.seam.execute({
      ...call({ kind: "pipeline", id: "root", stages: [agent("a"), agent("b"), agent("c")] }),
      signal: controller.signal
    });

    expect(spawned, "the later stages never reached a runner").toBe(1);
    expect(outcome.outcome, "the loop is told the call was cancelled").toBe("CANCELLED");

    // The partial answers do NOT reach the model, and that is the loop's
    // contract rather than a loss: `pipelineToolSeam` maps any aborted call to
    // CANCELLED with empty content, and special-casing `workflow` would put a
    // result into a turn the loop has already decided was cancelled. The work is
    // not lost from the RECORD — each delegation that ran wrote its own
    // started/completed pair and its own child session.
    expect(String(outcome.content)).toBe("");
    toolset.close();
  });
});
