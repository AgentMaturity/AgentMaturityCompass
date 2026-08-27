import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { spawnSubagent, type SubagentRunContext } from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * Force-settle cancellation for a delegation (plan P6.1c).
 *
 * `DelegationSettlement` has named `"cancelled"` since it was written, and
 * nothing in src/ could ever produce it: there was no cancellation channel
 * anywhere on the path. `SubagentRunContext` carried no signal, so a runner had
 * no way to learn its parent had given up and a parent had no way to say so.
 *
 * The honesty problem this has to solve is the one the continuable child already
 * posed: settling a delegation while its child is still running would make the
 * log say it ended when it had not. So cancellation asks the runner to stop,
 * waits a bounded time, and records which of those two things actually happened.
 */
const PASS = "subagent-cancel-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-cancel-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

const recorder = () => {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; } };
};

const settlementOf = (rows: LoopEventRecord[]): string | null => {
  const done = rows.find((r) => r.kind === "delegation-completed");
  return done && "settledAs" in done ? (done.settledAs as string) : null;
};

describe("a parent can give up on a delegation", () => {
  it("hands the runner the signal, so a child can learn it was abandoned", async () => {
    const dir = workspace();
    const controller = new AbortController();
    let seen: SubagentRunContext | null = null;

    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session: recorder(),
      runner: async (ctx) => { seen = ctx; return { ok: true, text: "done" }; },
      mintSessionId: () => "child-1",
      signal: controller.signal
    });

    expect(seen!.signal, "a runner that cannot see the signal cannot honour it").toBeDefined();
  });

  it("settles as cancelled when the child stops on the signal", async () => {
    const dir = workspace();
    const controller = new AbortController();
    const session = recorder();

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session,
      runner: async (ctx) => {
        controller.abort();
        // A well-behaved runner notices and returns.
        return { ok: false, text: "", reason: ctx.signal?.aborted === true ? "stopped on request" : "other" };
      },
      mintSessionId: () => "child-2",
      signal: controller.signal
    });

    expect(outcome.ok).toBe(false);
    expect(settlementOf(session.rows), "cancelled, not failed").toBe("cancelled");
  });

  it("refuses before authorising when the parent has already given up", async () => {
    // Nothing announced, so nothing to account for -- the same posture as a
    // depth refusal. Minting a signed packet for a delegation that was already
    // abandoned would leave an authorisation for work nobody asked for.
    const dir = workspace();
    const controller = new AbortController();
    controller.abort();
    const session = recorder();
    const before = listHandoffPackets(dir).length;

    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session,
      runner: async () => ({ ok: true, text: "should not run" }),
      mintSessionId: () => "child-3",
      signal: controller.signal
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.packetId, "no authorisation was minted").toBeNull();
    expect(listHandoffPackets(dir).length).toBe(before);
    expect(session.rows, "and nothing was announced").toEqual([]);
  });
});

describe("a child that will not stop is recorded as abandoned, not as ended", () => {
  it("settles within the grace window and says the child was not confirmed stopped", async () => {
    // The force-settle case. A runner that ignores its signal would otherwise
    // hold the parent open forever; settling silently would make the log claim
    // the child ended. It settles, and the reason says which of those happened.
    const dir = workspace();
    const controller = new AbortController();
    const session = recorder();

    const started = Date.now();
    const outcome = await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session,
      runner: async () => {
        controller.abort();
        // Deliberately ignores the signal, and outlives the grace window.
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return { ok: true, text: "too late" };
      },
      mintSessionId: () => "child-4",
      signal: controller.signal,
      cancelGraceMs: 300
    });

    expect(Date.now() - started, "did not wait for the child").toBeLessThan(3_000);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/abandoned|did not stop/i);
    expect(settlementOf(session.rows)).toBe("cancelled");
  }, 20_000);

  it("writes exactly one completion even when the child returns afterwards", async () => {
    // The late return must not produce a second row. A delegation that ended
    // twice in the log is worse than one recorded as abandoned.
    const dir = workspace();
    const controller = new AbortController();
    const session = recorder();

    await spawnSubagent({
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      request: { runAs: "researcher", goal: "g" },
      session,
      runner: async () => {
        controller.abort();
        await new Promise((resolve) => setTimeout(resolve, 600));
        return { ok: true, text: "late" };
      },
      mintSessionId: () => "child-5",
      signal: controller.signal,
      cancelGraceMs: 150
    });

    await new Promise((resolve) => setTimeout(resolve, 1_200));

    expect(session.rows.filter((r) => r.kind === "delegation-completed")).toHaveLength(1);
  }, 20_000);
});
