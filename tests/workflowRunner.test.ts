import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { runWorkflowPlan } from "../src/workflow/workflowRunner.js";
import { parseWorkflowPlan, type WorkflowNode } from "../src/workflow/workflowPlan.js";
import type { SubagentRunContext } from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * Running a declared plan (plan P6.1c).
 *
 * The property that matters more than any scheduling detail: every `agent` node
 * goes through `spawnSubagent`. A workflow that spawned agents any other way
 * would be a side channel around the depth refusal, the signed handoff packet,
 * the declared scope and the started/completed pair — every governance guarantee
 * P6.1a and P6.1b built.
 */
const PASS = "workflow-runner-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wf-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const plan = (raw: unknown): WorkflowNode => {
  const parsed = parseWorkflowPlan(raw);
  if (!parsed.ok) throw new Error(`test plan invalid: ${parsed.reason}`);
  return parsed.plan;
};

const agent = (id: string, goal = `goal-${id}`) => ({ kind: "agent", id, runAs: "researcher", goal });

function harness(dir: string, answer: (ctx: SubagentRunContext) => string = (c) => `answered ${c.goal}`) {
  const rows: LoopEventRecord[] = [];
  const seen: SubagentRunContext[] = [];
  let n = 0;
  return {
    rows,
    seen,
    run: (node: WorkflowNode, over: Record<string, unknown> = {}) =>
      runWorkflowPlan({
        workspace: dir,
        plan: node,
        parent: rootIdentity("payments-agent"),
        session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
        runner: async (ctx) => { seen.push(ctx); return { ok: true, text: answer(ctx) }; },
        mintSessionId: () => `child-${(n += 1)}`,
        ...over
      })
  };
}

describe("every agent node is a governed delegation", () => {
  it("mints a signed packet and an announced pair for each one", async () => {
    // Not "the workflow ran three agents" but "three delegations were
    // authorised and accounted for", which is the thing that can be audited.
    const dir = workspace();
    const h = harness(dir);
    const before = listHandoffPackets(dir).length;

    const result = await h.run(plan({
      kind: "parallel",
      id: "root",
      children: [agent("a"), agent("b"), agent("c")]
    }));

    expect(result.ok, result.ok ? "" : JSON.stringify(result.failures)).toBe(true);
    expect(listHandoffPackets(dir).length - before, "one packet per agent").toBe(3);
    expect(h.rows.filter((r) => r.kind === "delegation-started")).toHaveLength(3);
    expect(h.rows.filter((r) => r.kind === "delegation-completed")).toHaveLength(3);
  });

  it("carries a node's declared scope into its delegation", async () => {
    const dir = workspace();
    const h = harness(dir);

    await h.run(plan({ kind: "agent", id: "a", runAs: "researcher", goal: "g", scope: ["READ_ONLY"] }));

    expect(h.seen[0]!.delegationScope).toEqual(["READ_ONLY"]);
  });
});

describe("parallel and pipeline mean what they say", () => {
  it("runs parallel children concurrently", async () => {
    const dir = workspace();
    const rows: LoopEventRecord[] = [];
    let live = 0;
    let peak = 0;
    await runWorkflowPlan({
      workspace: dir,
      plan: plan({ kind: "parallel", id: "root", children: [agent("a"), agent("b"), agent("c")] }),
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 40));
        live -= 1;
        return { ok: true, text: "done" };
      },
      mintSessionId: (() => { let n = 0; return () => `child-${(n += 1)}`; })()
    });

    expect(peak, "all three were in flight at once").toBe(3);
  });

  it("feeds each pipeline stage the previous stage's answer", async () => {
    const dir = workspace();
    const h = harness(dir, (ctx) => `[${ctx.goal}]`);

    const result = await h.run(plan({
      kind: "pipeline",
      id: "root",
      stages: [agent("a", "first"), agent("b", "second")]
    }));

    expect(result.ok).toBe(true);
    // The second stage's goal carries the first's answer.
    expect(h.seen[1]!.goal).toContain("[first]");
  });

  it("stops a pipeline at the first failure, because later stages depend on it", async () => {
    const dir = workspace();
    const rows: LoopEventRecord[] = [];
    const seen: SubagentRunContext[] = [];
    let n = 0;

    const result = await runWorkflowPlan({
      workspace: dir,
      plan: plan({ kind: "pipeline", id: "root", stages: [agent("a"), agent("b")] }),
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: async (ctx) => {
        seen.push(ctx);
        return { ok: false, text: "", reason: "the first stage failed" };
      },
      mintSessionId: () => `child-${(n += 1)}`
    });

    expect(result.ok).toBe(false);
    expect(seen, "the second stage never ran on a missing input").toHaveLength(1);
    expect(result.failures[0]?.nodeId).toBe("a");
  });

  it("lets a parallel finish its siblings and reports every failure", async () => {
    // Unlike a pipeline: siblings do not depend on each other, so cancelling
    // the healthy ones would throw away work that was already paid for.
    const dir = workspace();
    const rows: LoopEventRecord[] = [];
    let n = 0;

    const result = await runWorkflowPlan({
      workspace: dir,
      plan: plan({ kind: "parallel", id: "root", children: [agent("a"), agent("b"), agent("c")] }),
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: async (ctx) =>
        ctx.goal === "goal-b"
          ? { ok: false, text: "", reason: "b failed" }
          : { ok: true, text: "fine" },
      mintSessionId: () => `child-${(n += 1)}`
    });

    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.nodeId)).toEqual(["b"]);
    expect(result.outputs.get("a"), "a's work is still reported").toBe("fine");
    expect(result.outputs.get("c")).toBe("fine");
  });
});

describe("a plan can be given up on", () => {
  it("stops starting new agents once the parent aborts", async () => {
    const dir = workspace();
    const controller = new AbortController();
    const rows: LoopEventRecord[] = [];
    let started = 0;
    let n = 0;

    const result = await runWorkflowPlan({
      workspace: dir,
      plan: plan({
        kind: "pipeline",
        id: "root",
        stages: [agent("a"), agent("b"), agent("c")]
      }),
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      // SUCCEEDS, deliberately. An earlier version returned `ok: false` here and
      // the test passed for the wrong reason: a pipeline stops at its first
      // failure anyway, so removing the abort check entirely left it green.
      // Only a succeeding runner isolates the cancellation.
      runner: async () => {
        started += 1;
        controller.abort();
        return { ok: true, text: "done before the parent gave up" };
      },
      mintSessionId: () => `child-${(n += 1)}`,
      signal: controller.signal
    });

    expect(started, "the later stages never reached a runner").toBe(1);
    // `started` alone does not prove the WORKFLOW stopped: `spawnSubagent`
    // refuses an aborted delegation before it ever calls the runner, so the
    // count would be 1 either way. `agentsRun` counts spawn ATTEMPTS, and is
    // what distinguishes stopping the plan from walking it and being refused
    // node by node.
    expect(result.agentsRun, "the plan stopped rather than being refused three times").toBe(1);
    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("is not ok when it was cancelled, even if everything that ran succeeded", async () => {
    // A single-node plan whose agent succeeds and whose parent gives up during
    // it. Without this the `&& !cancelled` is invisible: every multi-node plan
    // already fails for a different reason, so a build could report a partial
    // run as a complete one and no test would notice.
    const dir = workspace();
    const controller = new AbortController();
    const rows: LoopEventRecord[] = [];

    const result = await runWorkflowPlan({
      workspace: dir,
      plan: plan(agent("only")),
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      runner: async () => {
        controller.abort();
        return { ok: true, text: "finished anyway" };
      },
      mintSessionId: () => "child-1",
      signal: controller.signal
    });

    expect(result.outputs.get("only"), "the work really did complete").toBeUndefined();
    expect(result.cancelled).toBe(true);
    expect(result.ok, "a plan that did not finish is not a success").toBe(false);
  });
});
