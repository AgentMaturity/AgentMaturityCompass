import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { runGoalRounds } from "../src/autonomy/goalRounds.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";

/**
 * Goal rounds: the autonomy driver, and the one place nobody is watching
 * (plan P6.1d).
 *
 * Everything AMC governs matters more here. A driver runs an agent repeatedly
 * with no human in the turn, so the bounds cannot be advice — they have to be the
 * kind a model cannot talk its way past. The plan's verify line for this is "a
 * goal round yields to human input", and a yield that proceeds when nobody
 * answers is not a yield.
 */
const PASS = "goal-rounds-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-rounds-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function harness(dir: string) {
  const rows: LoopEventRecord[] = [];
  const seen: SubagentRunContext[] = [];
  let n = 0;
  return {
    rows,
    seen,
    base: {
      workspace: dir,
      parent: rootIdentity("payments-agent"),
      session: { recordLoopEvent: (r: LoopEventRecord) => { rows.push(r); return null; },
    recordProjectedEvidence: () => null },
      mintSessionId: () => `child-${(n += 1)}`,
      runAs: "worker",
      goal: "make the tests pass"
    },
    spy: (answer: (i: number) => SubagentRunResult) => {
      let i = 0;
      return async (ctx: SubagentRunContext): Promise<SubagentRunResult> => {
        seen.push(ctx);
        return answer((i += 1));
      };
    }
  };
}

describe("the round cap is mechanical, and nothing can extend it", () => {
  it("stops at maxRounds even when the agent keeps working", async () => {
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "still going" })),
      maxRounds: 3
    });

    expect(result.rounds).toBe(3);
    expect(h.seen).toHaveLength(3);
    expect(result.stoppedBy).toBe("max-rounds");
  });

  it("lets a judged stop END EARLY, but never extend", async () => {
    // `isDone` is the agent's CLAIM that the work is finished. A claim may
    // shorten a run -- believing it costs nothing but a missed round -- and must
    // never lengthen one, or the bound would be whatever the model says it is.
    const dir = workspace();
    const h = harness(dir);

    const early = await runGoalRounds({
      ...h.base,
      runner: h.spy((i) => ({ ok: true, text: i === 2 ? "DONE" : "working" })),
      maxRounds: 5,
      isDone: (text) => text.includes("DONE")
    });

    expect(early.rounds, "stopped early on the claim").toBe(2);
    expect(early.stoppedBy).toBe("done");

    const capped = await runGoalRounds({
      ...harness(dir).base,
      runner: harness(dir).spy(() => ({ ok: true, text: "never done" })),
      maxRounds: 2,
      isDone: () => false
    });
    expect(capped.rounds, "a never-satisfied claim cannot buy a fourth round").toBe(2);
  });

  it("refuses a plan with no round cap at all", async () => {
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "x" })),
      maxRounds: 0
    });

    expect(result.stoppedBy).toBe("refused");
    expect(result.rounds).toBe(0);
    expect(h.seen, "nothing ran").toHaveLength(0);
  });
});

describe("a round yields to human input, or it does not claim to", () => {
  it("stops when the human says stop", async () => {
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "working" })),
      maxRounds: 10,
      checkpointEvery: 1,
      checkpoint: async () => "stop"
    });

    expect(result.rounds).toBe(1);
    expect(result.stoppedBy).toBe("human");
  });

  it("continues only when the human says continue", async () => {
    const dir = workspace();
    const h = harness(dir);
    const asked: number[] = [];

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "working" })),
      maxRounds: 4,
      checkpointEvery: 2,
      checkpoint: async (summary) => { asked.push(summary.round); return "continue"; }
    });

    // Round 2 only, not [2, 4]: the ceiling ends the run after round 4, so a
    // checkpoint there would be asking a person to authorise nothing. An
    // interruption an operator cannot act on trains them to stop reading the
    // ones they can.
    expect(asked, "asked when there was something to continue to").toEqual([2]);
    expect(result.rounds).toBe(4);
  });

  it("refuses to start when a checkpoint is declared with nobody to ask", async () => {
    // Declaring a yield and having no answerer is worse than declaring none: the
    // configuration says a human is in the loop and no human is.
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "x" })),
      maxRounds: 3,
      checkpointEvery: 1
    });

    expect(result.stoppedBy).toBe("refused");
    expect(h.seen).toHaveLength(0);
  });

  it("stops when the checkpoint fails, rather than carrying on unattended", async () => {
    // Fail closed. A checkpoint that threw is a human who was not asked, and
    // continuing would turn an attended run into an unattended one silently.
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "working" })),
      maxRounds: 5,
      checkpointEvery: 1,
      checkpoint: async () => { throw new Error("the console went away"); }
    });

    expect(result.rounds).toBe(1);
    expect(result.stoppedBy).toBe("human");
    expect(result.reason).toContain("console went away");
  });
});

describe("each round is a governed delegation", () => {
  it("announces and accounts for every round", async () => {
    const dir = workspace();
    const h = harness(dir);

    await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: true, text: "working" })),
      maxRounds: 3
    });

    expect(h.rows.filter((r) => r.kind === "delegation-started")).toHaveLength(3);
    expect(h.rows.filter((r) => r.kind === "delegation-completed")).toHaveLength(3);
  });

  it("carries the previous round's answer into the next", async () => {
    const dir = workspace();
    const h = harness(dir);

    await runGoalRounds({
      ...h.base,
      runner: h.spy((i) => ({ ok: true, text: `answer ${i}` })),
      maxRounds: 2
    });

    expect(h.seen[1]!.goal, "round two sees round one").toContain("answer 1");
  });

  it("stops on a failed round rather than looping on a broken agent", async () => {
    const dir = workspace();
    const h = harness(dir);

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => ({ ok: false, text: "", reason: "the agent broke" })),
      maxRounds: 5
    });

    expect(result.rounds).toBe(1);
    expect(result.stoppedBy).toBe("failed");
  });

  it("stops when the parent gives up", async () => {
    const dir = workspace();
    const h = harness(dir);
    const controller = new AbortController();

    const result = await runGoalRounds({
      ...h.base,
      runner: h.spy(() => { controller.abort(); return { ok: true, text: "working" }; }),
      maxRounds: 5,
      signal: controller.signal
    });

    expect(result.rounds).toBe(1);
    expect(result.stoppedBy).toBe("cancelled");
  });
});
