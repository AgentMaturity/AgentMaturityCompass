import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { listHandoffPackets } from "../src/fleet/handoffPacket.js";
import { spawnSubagent, type SubagentRunResult } from "../src/agent/subagentSpawn.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";

/**
 * What an OUT-OF-PROCESS child hits first (plan P6.1b).
 *
 * `spawnSubagent` is the single delegation chokepoint: depth, the signed packet,
 * and the started/completed rows are all decided here, so every provider — the
 * in-process driver and any future foreign CLI or ACP runner — inherits whatever
 * this function guarantees. These are the guarantees that were missing, each one
 * reachable only by a runner that behaves in a way `createDriverRunner` never
 * does, which is why the in-process suite stayed green over them.
 */
const PASS = "subagent-foreign-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-foreign-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function recorder() {
  const rows: LoopEventRecord[] = [];
  return { rows, recordLoopEvent: (record: LoopEventRecord) => { rows.push(record); return null; },
    recordProjectedEvidence: () => null };
}

const spawn = (dir: string, over: Partial<Parameters<typeof spawnSubagent>[0]>) =>
  spawnSubagent({
    workspace: dir,
    parent: rootIdentity("payments-agent"),
    request: { runAs: "researcher", goal: "summarise the ledger" },
    session: recorder(),
    runner: async (): Promise<SubagentRunResult> => ({ ok: true, text: "words" }),
    mintSessionId: () => "child-session-1",
    ...over
  });

describe("a child that said nothing did not report", () => {
  it("refuses to settle an empty answer as a report", async () => {
    // THE most likely way a foreign provider ships green and empty. A runner
    // folds the child's answer out of the log; if the fold is wrong it yields
    // "" — and an empty fold was indistinguishable from a well-behaved silent
    // child, settling `reported` and handing the model an empty string as though
    // the delegate had answered.
    const dir = workspace();
    const session = recorder();

    const outcome = await spawn(dir, {
      session,
      runner: async () => ({ ok: true, text: "   " })
    });

    expect(outcome.ok, "an empty answer is not a report").toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("no output");
    const completed = session.rows.find((r) => r.kind === "delegation-completed");
    expect(completed && "settledAs" in completed ? completed.settledAs : null).toBe("failed");
  });

  it("still accepts a real answer", async () => {
    const dir = workspace();
    const outcome = await spawn(dir, { runner: async () => ({ ok: true, text: "40 rows" }) });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.childText).toBe("40 rows");
  });
});

describe("a failed child is released, not leaked", () => {
  it("closes a continuation that arrives alongside a failure", async () => {
    // In-process this is unreachable: `createDriverRunner` returns early when
    // its first drain fails, so it never pairs a continuation with `ok: false`.
    // An out-of-process runner reaches it the moment a child starts, holds a
    // process, and then reports a failure — and the process was silently
    // dropped, never closed, with the delegation accounted for as if finished.
    const dir = workspace();
    let closed = 0;

    const outcome = await spawn(dir, {
      runner: async () => ({
        ok: false,
        text: "",
        reason: "the child could not start its session",
        continuation: {
          continue: async () => ({ ok: false, text: "", reason: "gone" }),
          close: () => { closed += 1; }
        }
      })
    });

    expect(outcome.ok).toBe(false);
    expect(closed, "the live child was released").toBe(1);
  });
});

describe("an announcement that cannot be written leaves no authorisation behind", () => {
  it("removes the packet when the started row cannot be recorded", async () => {
    // `spawnSubagent` promises that a delegation which never got announced
    // writes nothing at all — no packet, no row. The packet is minted BEFORE the
    // announcement, so a parent session that refuses the row (closed mid-turn,
    // which is exactly what a long-running foreign child makes likely) left a
    // signed authorisation on disk for a delegation the log never mentions.
    const dir = workspace();
    const before = listHandoffPackets(dir).length;

    await expect(spawn(dir, {
      session: { recordLoopEvent: () => { throw new Error("SessionService used after close()"); }, recordProjectedEvidence: () => null }
    })).rejects.toThrow(/after close/i);

    expect(listHandoffPackets(dir).length, "no authorisation for an unannounced delegation")
      .toBe(before);
  });
});
