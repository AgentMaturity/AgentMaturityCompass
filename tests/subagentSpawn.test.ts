import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { budgetForAgent, defaultBudgets } from "../src/budgets/budgets.js";
import {
  spawnSubagent,
  type SubagentRunContext,
  type SubagentRunResult
} from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * The spawn path, and the escape it exists to close (P6.1a).
 *
 * Both of AMC's per-agent mechanisms key on `agentId`, and both were measured
 * before this code was written: `budgetForAgent` falls back to `default` LIMITS
 * for an unknown id while usage is counted per id (so a fresh name means a full
 * unspent budget), and `ToolRegistry` resolves guard scopes with
 * `scopes.get(agentId)` (so a fresh name sheds every narrowing).
 *
 * Pass `runAs` to a toolset and "spawn a child" becomes how you reset a budget
 * and drop a restriction.
 */
const PASS = "subagent-spawn-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-spawn-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (record: LoopEventRecord) => { rows.push(record); return null; },
    recordProjectedEvidence: () => null };
}

const okRunner = async (): Promise<SubagentRunResult> => ({ ok: true, text: "the child's own words" });

function spawn(dir: string, over: Partial<Parameters<typeof spawnSubagent>[0]> = {}) {
  const session = over.session ?? recorder();
  return {
    session: session as ReturnType<typeof recorder>,
    promise: spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "summarise the ledger" },
      session,
      runner: okRunner,
      mintSessionId: () => "child-session-1",
      ...over
    })
  };
}

describe("the child is toolset-scoped as its root", () => {
  it("hands the runner governedAs, never runAs", async () => {
    // THE escape test. A future maintainer adding "the child gets its own
    // toolset so it can have a narrower filter" would naturally pass runAs,
    // because that reads more natural — and would silently reset the meter.
    const dir = workspace();
    let seen: SubagentRunContext | null = null;
    const { promise } = spawn(dir, {
      runner: async (ctx) => { seen = ctx; return { ok: true, text: "" }; }
    });
    await promise;

    expect(seen).not.toBeNull();
    expect(seen!.toolsetAgentId, "the root's id, not the child's name").toBe("payments-agent");
    expect(seen!.identity.runAs, "the child still knows its own name").toBe("researcher");
    expect(seen!.toolsetAgentId).not.toBe(seen!.identity.runAs);
  });

  it("means the child resolves the root's budget, not a fresh one", async () => {
    // The escape made concrete against the real budget resolver.
    const dir = workspace();
    const config = defaultBudgets("payments-agent");
    let seen: SubagentRunContext | null = null;
    const { promise } = spawn(dir, {
      runner: async (ctx) => { seen = ctx; return { ok: true, text: "" }; }
    });
    await promise;

    expect(budgetForAgent(config, seen!.toolsetAgentId)).toEqual(budgetForAgent(config, "payments-agent"));
    // Only meaningful because the two names really do resolve differently.
    expect(budgetForAgent(config, seen!.identity.runAs)).not.toEqual(budgetForAgent(config, "payments-agent"));
  });
});

describe("refuse, authorise, announce, run — in that order", () => {
  it("writes nothing at all when depth refuses the delegation", async () => {
    const dir = workspace();
    const { session, promise } = spawn(dir, { maxDepth: 0 });
    const outcome = await promise;

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.packetId, "nothing was authorised").toBeNull();
    expect(session.rows, "a refusal before the announcement writes no rows").toEqual([]);
    expect(listHandoffPackets(dir), "and no packet").toEqual([]);
  });

  it("writes no row when the packet cannot be signed", async () => {
    // An unsigned packet authorises nothing, so nothing may be announced.
    const dir = workspace();
    rmSync(join(dir, ".amc", "vault"), { recursive: true, force: true });
    rmSync(join(dir, ".amc", "keys"), { recursive: true, force: true });
    const { session, promise } = spawn(dir);
    const outcome = await promise;

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("refusing to authorise a delegation without a signed packet");
    expect(session.rows).toEqual([]);
    expect(listHandoffPackets(dir), "no orphan packet either").toEqual([]);
  });

  it("announces before the child runs", async () => {
    const dir = workspace();
    const order: string[] = [];
    const session = {
      ...recorder(),
      recordLoopEvent(record: LoopEventRecord) { order.push(record.kind); this.rows.push(record); return null; }
    };
    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session,
      runner: async () => { order.push("child-ran"); return { ok: true, text: "" }; },
      mintSessionId: () => "child-session-1"
    });

    expect(order).toEqual(["delegation-started", "child-ran", "delegation-completed"]);
  });
});

describe("an announced delegation is always accounted for", () => {
  it("records a completion when the child fails", async () => {
    // The cases that most need an account are the ones where the child never
    // got to report.
    const dir = workspace();
    const { session, promise } = spawn(dir, {
      runner: async () => ({ ok: false, text: "", reason: "token ceiling" })
    });
    await promise;

    const completed = session.rows.find((r) => r.kind === "delegation-completed");
    expect(completed).toBeDefined();
    expect(completed).toMatchObject({ settledAs: "failed", reason: "token ceiling" });
  });

  it("records a completion when the child throws", async () => {
    const dir = workspace();
    const { session, promise } = spawn(dir, {
      runner: async () => { throw new Error("worker died"); }
    });
    const outcome = await promise;

    expect(outcome.ok).toBe(false);
    const completed = session.rows.find((r) => r.kind === "delegation-completed");
    expect(completed, "announced means accounted for, even on a throw").toBeDefined();
    expect(String((completed as { reason: string }).reason)).toContain("worker died");
  });

  it("joins the pair by packetId", async () => {
    const dir = workspace();
    const { session, promise } = spawn(dir);
    await promise;

    const started = session.rows.find((r) => r.kind === "delegation-started") as { packetId: string };
    const completed = session.rows.find((r) => r.kind === "delegation-completed") as { packetId: string };
    expect(started.packetId).toBe(completed.packetId);
    expect(started.packetId.length).toBeGreaterThan(0);
  });
});

describe("the child's words stay the child's", () => {
  it("returns the child's text separately from the runtime's account", async () => {
    // Merging them would credit the child with a summary it never wrote.
    const dir = workspace();
    const { session, promise } = spawn(dir, {
      runner: async () => ({ ok: true, text: "I read 40 rows and found two anomalies." })
    });
    const outcome = await promise;

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.childText).toBe("I read 40 rows and found two anomalies.");

    const completed = session.rows.find((r) => r.kind === "delegation-completed") as { reason: string };
    expect(completed.reason, "the runtime's account, not the child's").toBe("child reported");
    expect(completed.reason).not.toContain("anomalies");
  });

  it("records the governance identity on the started row", async () => {
    const dir = workspace();
    const { session, promise } = spawn(dir);
    await promise;

    expect(session.rows[0]).toMatchObject({
      kind: "delegation-started",
      childRunAs: "researcher",
      governedAs: "payments-agent",
      depth: 1,
      childSessionId: "child-session-1"
    });
  });
});
