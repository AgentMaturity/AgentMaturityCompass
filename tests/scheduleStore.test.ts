import { mkdtempSync, rmSync, realpathSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import { runDueSchedules } from "../src/autonomy/scheduleRunner.js";
import {
  MAX_CONSECUTIVE_FAILURES,
  claimDueRun,
  completeRun,
  dueSchedules,
  initSchedules,
  interruptedClaims,
  readSchedules,
  saveSchedules,
  schedulesPath
} from "../src/autonomy/scheduleStore.js";

/**
 * Durable schedules (plan P6.1d).
 *
 * A schedule authorises an agent to run UNATTENDED on a timer, which makes the
 * file that defines them a policy surface -- signed like `.amc/tools.yaml` and
 * `.amc/adapters.yaml`, and fail-closed when the signature does not verify.
 * Otherwise anyone who can write a file can schedule agents.
 *
 * The property the whole thing turns on is that a restart must not re-run work
 * that already ran.
 */
const PASS = "schedule-store-test-passphrase";
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(): string {
  process.env["AMC_VAULT_PASSPHRASE"] = PASS;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-sched-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initSchedules(dir);
  return dir;
}

const nightly = (over: Record<string, unknown> = {}) => ({
  id: "nightly",
  runAs: "linter",
  goal: "check the ledger",
  maxRounds: 2,
  everyMs: 60_000,
  enabled: true,
  ...over
});

describe("the file that authorises unattended runs is signed", () => {
  it("reads schedules from a signed file", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    const read = readSchedules(dir);

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.schedules.map((s) => s.id)).toEqual(["nightly"]);
  });

  it("runs NOTHING when the signature does not verify", () => {
    // Fail closed. An unsigned or edited schedule file is an unattended agent
    // somebody could have added, and the safe reading of "I cannot verify who
    // authorised this" is not "run it anyway".
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    const path = schedulesPath(dir);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n# tampered\n`, "utf8");

    const read = readSchedules(dir);

    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toMatch(/signature/i);
    expect(dueSchedules(dir, Date.now())).toEqual([]);
  });
});

describe("what is due, and what is not", () => {
  it("treats a schedule that has never run as due", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    expect(dueSchedules(dir, 1_000_000).map((s) => s.id)).toEqual(["nightly"]);
  });

  it("is not due again until the cadence has elapsed", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    const claimed = claimDueRun(dir, "nightly", 1_000_000);
    expect(claimed.ok).toBe(true);
    completeRun(dir, "nightly", { ok: true, summary: "done" });

    expect(dueSchedules(dir, 1_030_000), "half a cadence later").toEqual([]);
    expect(dueSchedules(dir, 1_070_000).map((s) => s.id), "a cadence later").toEqual(["nightly"]);
  });

  it("skips a disabled schedule", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly({ enabled: false })]);
    expect(dueSchedules(dir, 1_000_000)).toEqual([]);
  });

  it("runs once after a long outage, not once per missed occurrence", () => {
    // Catch-up would be a thundering herd of unattended agents. A daily job that
    // missed three days has one thing to do, not three.
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    claimDueRun(dir, "nightly", 1_000_000);
    completeRun(dir, "nightly", { ok: true, summary: "done" });

    const muchLater = 1_000_000 + 60_000 * 500;
    expect(dueSchedules(dir, muchLater).map((s) => s.id)).toEqual(["nightly"]);
    claimDueRun(dir, "nightly", muchLater);
    completeRun(dir, "nightly", { ok: true, summary: "done" });
    expect(dueSchedules(dir, muchLater + 1), "one run, not five hundred").toEqual([]);
  });
});

describe("a restart must not re-run work that already ran", () => {
  it("advances the schedule when the run is CLAIMED, not when it completes", () => {
    // The load-bearing choice. If the clock advanced on completion, a crash
    // mid-run would leave the schedule due and the next start would repeat an
    // agent that may already have had side effects. Advancing at claim time
    // means a crash MISSES an occurrence instead of repeating one -- recoverable
    // in a way a duplicate side effect is not.
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    claimDueRun(dir, "nightly", 1_000_000);
    // No completeRun: this is the crash.

    expect(dueSchedules(dir, 1_010_000), "not due again immediately").toEqual([]);
  });

  it("shows an interrupted run rather than assuming it finished", () => {
    // The same honesty as an unmatched `delegation-started`: a claim with no
    // completion is a run nobody closed, and that is what an operator needs to
    // see. It is not silently retried and not silently counted as a success.
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    claimDueRun(dir, "nightly", 1_000_000);

    const open = interruptedClaims(dir);

    expect(open.map((c) => c.scheduleId)).toEqual(["nightly"]);
    expect(open[0]?.claimedTs).toBe(1_000_000);
  });

  it("refuses a second claim while one is in flight", () => {
    // Two processes polling the same workspace must not both run the schedule.
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    expect(claimDueRun(dir, "nightly", 1_000_000).ok).toBe(true);
    const second = claimDueRun(dir, "nightly", 1_000_001);

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toMatch(/in flight|already/i);
  });

  it("clears the claim once the run completes", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    claimDueRun(dir, "nightly", 1_000_000);
    completeRun(dir, "nightly", { ok: true, summary: "done" });

    expect(interruptedClaims(dir)).toEqual([]);
  });
});

describe("a schedule that keeps failing stops rather than hammering", () => {
  it("disables itself after repeated consecutive failures", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    let now = 1_000_000;
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      expect(claimDueRun(dir, "nightly", now).ok, `claim ${i}`).toBe(true);
      completeRun(dir, "nightly", { ok: false, summary: "broke again" });
      now += 60_001;
    }

    expect(dueSchedules(dir, now), "stopped asking").toEqual([]);
    const claim = claimDueRun(dir, "nightly", now);
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.reason).toMatch(/consecutive failures/i);
  });

  it("forgets the failures after one succeeds", () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    // Taken to ONE BELOW the limit before the success, then failed again.
    // Anything shallower cannot tell a real reset from a count that merely has
    // not reached the limit yet -- mutation testing found exactly that: removing
    // the reset left an earlier version of this test green.
    let now = 1_000_000;
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      claimDueRun(dir, "nightly", now);
      completeRun(dir, "nightly", { ok: false, summary: "broke" });
      now += 60_001;
    }
    claimDueRun(dir, "nightly", now);
    completeRun(dir, "nightly", { ok: true, summary: "fine" });
    now += 60_001;

    // One more failure. With the reset the count is 1 and it keeps going;
    // without it the count would have reached the limit and stopped.
    claimDueRun(dir, "nightly", now);
    completeRun(dir, "nightly", { ok: false, summary: "broke once more" });
    now += 60_001;

    expect(dueSchedules(dir, now).map((s) => s.id)).toEqual(["nightly"]);
  });
});

describe("running what is due", () => {
  const base = (dir: string) => ({
    workspace: dir,
    parent: rootIdentity("payments-agent"),
    session: { recordLoopEvent: () => null, recordProjectedEvidence: () => null },
    mintSessionId: (() => { let n = 0; return () => `child-${(n += 1)}`; })()
  });

  it("claims, runs the goal, and closes the claim", async () => {
    const dir = workspace();
    saveSchedules(dir, [nightly({ maxRounds: 2 })]);
    let rounds = 0;

    const results = await runDueSchedules({
      ...base(dir),
      now: 1_000_000,
      runner: async () => { rounds += 1; return { ok: true, text: "worked" }; }
    });

    expect(results.map((r) => r.scheduleId)).toEqual(["nightly"]);
    expect(results[0]?.ok).toBe(true);
    expect(rounds, "the driver's ceiling applied").toBe(2);
    expect(interruptedClaims(dir), "the claim was closed").toEqual([]);
    // The cadence really advanced. Without this a runner that never CLAIMED
    // would pass everything above -- the claim it never took cannot be left in
    // flight, and the run it never registered still completes.
    expect(dueSchedules(dir, 1_000_001), "not due again straight away").toEqual([]);
  });

  it("closes the claim when the agent fails, rather than leaving it in flight", async () => {
    // A leaked claim would wedge the schedule forever: nothing else can claim it
    // and nothing would ever close it.
    //
    // NOTE ON WHAT THIS DOES NOT REACH. The runner here throws, but
    // `spawnSubagent` catches a throwing SubagentRunner (subagentSpawn.ts:343)
    // and returns `{ok: false}`, so the failure arrives through the NORMAL path
    // and `runDueSchedules`'s own try/catch never fires. Mutation testing showed
    // that: deleting its `completeRun` left this green. That catch is defence
    // against `runGoalRounds` itself throwing — an unexpected failure the
    // current stack cannot produce on demand — and is kept as defence for an
    // unknown, not claimed as tested.
    const dir = workspace();
    saveSchedules(dir, [nightly()]);

    const results = await runDueSchedules({
      ...base(dir),
      now: 1_000_000,
      runner: async () => { throw new Error("the driver exploded"); }
    });

    expect(results[0]?.ok).toBe(false);
    expect(interruptedClaims(dir), "not left in flight").toEqual([]);
  });

  it("runs nothing when the schedule file does not verify", async () => {
    const dir = workspace();
    saveSchedules(dir, [nightly()]);
    const path = schedulesPath(dir);
    writeFileSync(path, `${readFileSync(path, "utf8")}\n# tampered\n`, "utf8");
    let ran = 0;

    const results = await runDueSchedules({
      ...base(dir),
      now: 1_000_000,
      runner: async () => { ran += 1; return { ok: true, text: "x" }; }
    });

    expect(results).toEqual([]);
    expect(ran).toBe(0);
  });
});
