import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { agentToolset } from "../src/agent/agentToolset.js";
import { initToolsConfig, loadToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { delegateTo, rootIdentity } from "../src/agent/delegationIdentity.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";

/**
 * `ctx.subagents`, in AMC's idiom (P6.1a).
 *
 * There is no `ctx` in the agent loop and there cannot be one — only
 * `src/kernel/**` may import Cordis. What AMC has is closure capture at
 * registration, which `agentToolset` already uses for its registry, pipeline and
 * ledger. Delegation arrives the same way: a `delegate` tool the caller's toolset
 * closes over.
 */
const PASS = "delegate-tool-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-delegate-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, agentId: "payments-agent", trustBoundaryMode: "isolated" });
  initBudgets(dir, "payments-agent");
  writeRuntimeFirewallPolicy({ workspace: dir, mode: "observe" });
  return dir;
}

/**
 * Grant `delegate` in the workspace's SIGNED tool allowlist.
 *
 * Deliberately not a default. Registering the tool and permitting it are granted
 * by different parties: the integrator composes the capability into a toolset,
 * and the OPERATOR signs a policy that permits it. Delegation spawns agents that
 * spend the operator's budget, so it is not something a library switch should
 * turn on — which is why the first run of these tests met
 * `"delegate" is not in the signed tool allowlist`, correctly.
 */
function allowDelegate(dir: string): void {
  const config = loadToolsConfig(dir);
  initToolsConfig(dir, {
    ...config,
    tools: {
      ...config.tools,
      allowedTools: [...config.tools.allowedTools, { name: "delegate", actionClass: "READ_ONLY" }]
    }
  });
}

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null };
}

const call = (args: unknown) => ({
  callId: "c1",
  toolName: "delegate",
  rawArguments: JSON.stringify(args),
  sessionId: "parent-session",
  turn: 1,
  step: 1,
  parentToken: null,
  dispatch: "native" as const,
  signal: new AbortController().signal
});

/** A runner that records what it was handed and answers in the child's voice. */
function spyRunner(answer = "the delegate's own answer") {
  const seen: SubagentRunContext[] = [];
  const runner = async (ctx: SubagentRunContext): Promise<SubagentRunResult> => {
    seen.push(ctx);
    return { ok: true, text: answer };
  };
  return { seen, runner };
}

describe("an agent can delegate from inside its own toolset", () => {
  it("offers `delegate` only when both its implementation capability and signed grant are present", () => {
    const dir = workspace();

    const without = agentToolset({ workspace: dir, agentId: "payments-agent", sessionId: "toolset-test-session"});
    const withCap = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spyRunner().runner, session: recorder() }
    });

    const names = (t: ReturnType<typeof agentToolset>) =>
      (t.seam.schemas() ?? []).map((s) => s.name);
    expect(names(without), "delegation is granted, not assumed").not.toContain("delegate");
    expect(names(withCap), "composition alone does not grant signed authority").not.toContain("delegate");
    allowDelegate(dir);
    expect(names(without), "policy alone does not provide an implementation").not.toContain("delegate");
    expect(names(withCap)).toContain("delegate");
    without.close();
    withCap.close();
  });

  it("returns the child's own words, and nothing of the runtime's", async () => {
    // On success the runtime's account lives in the delegation-completed row,
    // not in front of the model. Mixing them would put a runtime summary before
    // the model as though the child had written it.
    const dir = workspace();
    allowDelegate(dir);
    const session = recorder();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: {
        identity: rootIdentity("payments-agent"),
        runner: spyRunner("I checked 40 rows.").runner,
        session
      }
    });

    const outcome = await toolset.seam.execute(call({ runAs: "researcher", goal: "check the ledger" }));

    expect(String(outcome.content)).toBe("I checked 40 rows.");
    expect(String(outcome.content), "no runtime account mixed in").not.toContain("[amc]");
    expect(session.rows.map((r) => r.kind))
      .toEqual(["delegation-started", "delegation-completed"]);
    toolset.close();
  });

  it("hands the child the ROOT's id, through the tool path too", async () => {
    const dir = workspace();
    allowDelegate(dir);
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session: recorder() }
    });

    await toolset.seam.execute(call({ runAs: "researcher", goal: "g" }));

    expect(spy.seen).toHaveLength(1);
    expect(spy.seen[0]!.toolsetAgentId).toBe("payments-agent");
    expect(spy.seen[0]!.identity.runAs).toBe("researcher");
    toolset.close();
  });
});

describe("depth is read from the identity, not from agentId", () => {
  it("refuses when the CALLER is already at the limit", async () => {
    // Every run in a chain shares `governedAs`, so `agentId` cannot say how deep
    // this one is. A capability carrying a depth-3 caller must refuse.
    const dir = workspace();
    allowDelegate(dir);
    let deep = rootIdentity("payments-agent");
    for (const name of ["a", "b", "c"]) {
      const step = delegateTo(deep, name);
      if (!step.ok) throw new Error("setup delegation failed");
      deep = step.identity;
    }
    expect(deep.depth).toBe(3);

    const session = recorder();
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: deep, runner: spy.runner, session }
    });

    const outcome = await toolset.seam.execute(call({ runAs: "one-too-many", goal: "g" }));

    expect(String(outcome.content)).toContain("delegation refused");
    expect(String(outcome.content)).toContain("exceeds maxDepth");
    expect(spy.seen, "the child never ran").toHaveLength(0);
    expect(session.rows, "and nothing was announced").toEqual([]);
    toolset.close();
  });

  it("allows a caller below the limit", async () => {
    const dir = workspace();
    allowDelegate(dir);
    const first = delegateTo(rootIdentity("payments-agent"), "a");
    if (!first.ok) throw new Error("setup failed");
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: first.identity, runner: spy.runner, session: recorder() }
    });

    await toolset.seam.execute(call({ runAs: "b", goal: "g" }));

    expect(spy.seen[0]!.identity.depth, "a grandchild is at depth 2").toBe(2);
    toolset.close();
  });
});

describe("the model's arguments are not trusted", () => {
  it("refuses an empty goal rather than delegating nothing", async () => {
    // A child asked to do nothing still costs a turn and still writes a
    // delegation to the log.
    const dir = workspace();
    allowDelegate(dir);
    const session = recorder();
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session }
    });

    const outcome = await toolset.seam.execute(call({ runAs: "researcher", goal: "   " }));

    expect(String(outcome.content)).toContain("goal must be a non-empty string");
    expect(spy.seen).toHaveLength(0);
    expect(session.rows).toEqual([]);
    toolset.close();
  });

  it("refuses a missing runAs", async () => {
    const dir = workspace();
    allowDelegate(dir);
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session: recorder() }
    });

    const outcome = await toolset.seam.execute(call({ goal: "do a thing" }));

    expect(String(outcome.content)).toContain("runAs must be a non-empty string");
    expect(spy.seen).toHaveLength(0);
    toolset.close();
  });
});

describe("two parties must agree before an agent can delegate", () => {
  it("is denied by the signed allowlist even when the capability is granted", async () => {
    // Found by running these tests before granting anything: the first version
    // met `"delegate" is not in the signed tool allowlist`, which is correct.
    // Composing the capability into a toolset is the INTEGRATOR's decision;
    // permitting the tool is the OPERATOR's, in a signed policy. Delegation
    // spends the operator's budget on agents they did not start, so one party
    // enabling it is not enough.
    const dir = workspace();
    // NOTE: no allowDelegate(dir) here — that is the point.
    const session = recorder();
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session }
    });

    const outcome = await toolset.seam.execute(call({ runAs: "researcher", goal: "check the ledger" }));

    expect(outcome.denied, "the operator never permitted it").toBe(true);
    expect(String(outcome.content)).toContain("not in the signed tool allowlist");
    expect(spy.seen, "no child ran").toHaveLength(0);
    expect(session.rows, "and no delegation was announced").toEqual([]);
    toolset.close();
  });
});

describe("the operator names the scope, not the model", () => {
  it("uses the capability's scope and ignores anything the model sends", async () => {
    // A model that could name its own delegation scope could name WRITE_HIGH,
    // which is not a control at all -- it is a request form.
    const dir = workspace();
    allowDelegate(dir);
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: {
        identity: rootIdentity("payments-agent"),
        runner: spy.runner,
        session: recorder(),
        delegationScope: ["READ_ONLY"]
      }
    });

    await toolset.seam.execute(call({
      runAs: "researcher",
      goal: "g",
      // The model asking for more than it was granted.
      delegationScope: ["WRITE_HIGH", "FINANCIAL"]
    }));

    expect(spy.seen).toHaveLength(1);
    expect(spy.seen[0]!.delegationScope, "the operator's scope stands").toEqual(["READ_ONLY"]);
    toolset.close();
  });

  it("leaves a child unscoped when the capability names no scope", async () => {
    const dir = workspace();
    allowDelegate(dir);
    const spy = spyRunner();
    const toolset = agentToolset({
      workspace: dir,
      agentId: "payments-agent",
      sessionId: "toolset-test-session",
      subagents: { identity: rootIdentity("payments-agent"), runner: spy.runner, session: recorder() }
    });

    await toolset.seam.execute(call({ runAs: "researcher", goal: "g" }));

    expect(spy.seen[0]!.delegationScope).toBeUndefined();
    toolset.close();
  });
});
