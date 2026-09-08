import { describe, expect, it } from "vitest";
import { JobRegistry } from "../src/jobs/jobRegistry.js";
import { JobAccessError } from "../src/jobs/jobTypes.js";

/**
 * P4.2 VERIFY criterion 3: a background job settles once with an owner-fenced
 * wake.
 *
 * Both halves are about identity rather than scheduling. The fence decides who
 * may touch a job; settle-once decides how many times one piece of work can be
 * reported finished — and reporting it twice is not a cosmetic bug, because a
 * wake opens a turn.
 */
const ALICE = "session-alice";
const BOB = "session-bob";

const never = () => new Promise<{ ok: boolean; summary: string }>(() => undefined);
const immediately = (summary: string) => async () => ({ ok: true, summary });

describe("the owner fence", () => {
  it("refuses another session's job", () => {
    const jobs = new JobRegistry();
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "build", run: never });

    expect(() => jobs.get(id, BOB)).toThrow(JobAccessError);
    expect(() => jobs.kill(id, BOB)).toThrow(JobAccessError);
    expect(jobs.get(id, ALICE).label, "the owner still reaches it").toBe("build");
  });

  it("cannot be used to discover whether a job exists", () => {
    // Ids are `bash-1`, `bash-2`, ... by design, so a caller who could tell
    // "not yours" from "no such job" could count another session's jobs by
    // enumeration. The two must be indistinguishable.
    const jobs = new JobRegistry();
    jobs.start({ kind: "bash", owner: ALICE, label: "secret work", run: never });

    // Normalise out the id the caller itself supplied: what must not differ
    // is everything else.
    const shapeOf = (id: string): string => {
      try {
        jobs.get(id, BOB);
        return "NO ERROR";
      } catch (error) {
        return `${(error as Error).name}: ${(error as Error).message.split(id).join("<id>")}`;
      }
    };

    expect(shapeOf("bash-1"), "an existence oracle over predictable ids")
      .toBe(shapeOf("bash-999"));
    expect(shapeOf("bash-1")).not.toContain("secret work");
  });

  it("filters list() rather than throwing from it", () => {
    const jobs = new JobRegistry();
    jobs.start({ kind: "bash", owner: ALICE, label: "alice work", run: never });
    jobs.start({ kind: "bash", owner: BOB, label: "bob work", run: never });

    expect(jobs.list(ALICE).map((j) => j.label)).toEqual(["alice work"]);
    expect(jobs.list(BOB).map((j) => j.label)).toEqual(["bob work"]);
  });

  it("does not deliver one session's settlement to another's listener", () => {
    // The same leak list() filters to avoid, reached through a different door.
    const jobs = new JobRegistry();
    const bobSaw: string[] = [];
    jobs.onSettled(BOB, (snapshot) => bobSaw.push(snapshot.label));
    jobs.start({ kind: "bash", owner: ALICE, label: "alice private", run: immediately("done") });

    return new Promise<void>((resolve) => setTimeout(() => {
      expect(bobSaw).toEqual([]);
      resolve();
    }, 30));
  });
});

describe("settling exactly once", () => {
  it("keeps the FIRST cause when a kill races completion", async () => {
    // A job killed while finishing was killed. Taking the later cause would
    // report a clean completion for work someone stopped.
    const jobs = new JobRegistry();
    const completion: { finish?: (r: { ok: boolean; summary: string }) => void } = {};
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const id = jobs.start({
      kind: "bash", owner: ALICE, label: "racy",
      run: () => new Promise((resolve) => { completion.finish = resolve; entered(); })
    });

    await started;
    jobs.kill(id, ALICE);
    completion.finish!({ ok: true, summary: "finished anyway" });

    const outcome = await jobs.wait(id, ALICE);
    expect(outcome.cause).toBe("killed");
    expect(outcome.summary).not.toBe("finished anyway");
  });

  it("notifies a listener once even when several paths end the job", async () => {
    const jobs = new JobRegistry();
    const seen: string[] = [];
    jobs.onSettled(ALICE, (s) => seen.push(s.outcome?.cause ?? "?"));
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "j", run: never });

    jobs.kill(id, ALICE);
    jobs.kill(id, ALICE);
    jobs.disposeOwner(ALICE);
    await new Promise((r) => setTimeout(r, 30));

    // A wake opens a turn, so a second notice is a second turn for one job.
    expect(seen, "one job, one settlement").toEqual(["killed"]);
  });

  it("resolves every waiter, and later waiters get the recorded outcome", async () => {
    const jobs = new JobRegistry();
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "j", run: immediately("all good") });

    const [first, second] = await Promise.all([jobs.wait(id, ALICE), jobs.wait(id, ALICE)]);
    expect(first).toEqual(second);
    const afterwards = await jobs.wait(id, ALICE);
    expect(afterwards.summary, "waiting after settlement is not waiting forever").toBe("all good");
  });

  it("aborts the work when killed, so the job stops rather than just being marked", async () => {
    const jobs = new JobRegistry();
    let aborted = false;
    const id = jobs.start({
      kind: "bash", owner: ALICE, label: "j",
      run: (signal) => new Promise((resolve) => {
        signal.addEventListener("abort", () => { aborted = true; resolve({ ok: false, summary: "stopped" }); });
      })
    });

    jobs.kill(id, ALICE);
    await jobs.wait(id, ALICE);
    expect(aborted, "marking a job settled without stopping it leaks the work").toBe(true);
  });

  it("settles a disposed owner's jobs with their own cause", async () => {
    const jobs = new JobRegistry();
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "j", run: never });
    jobs.disposeOwner(ALICE);
    expect((await jobs.wait(id, ALICE)).cause).toBe("owner-disposed");
  });
});

describe("the wake budget", () => {
  it("stops opening turns after the budget is spent", () => {
    // The chain is self-exciting: a turn opened by a completion notice can
    // start the very job whose completion opens the next one.
    const jobs = new JobRegistry(2);
    expect(jobs.claimWake(ALICE)).toBe(true);
    expect(jobs.claimWake(ALICE)).toBe(true);
    expect(jobs.claimWake(ALICE), "the third wake is the loop").toBe(false);
  });

  it("is per owner", () => {
    const jobs = new JobRegistry(1);
    expect(jobs.claimWake(ALICE)).toBe(true);
    expect(jobs.claimWake(ALICE)).toBe(false);
    expect(jobs.claimWake(BOB), "one busy session must not silence another").toBe(true);
  });

  it("refills only when a host says a human spoke", () => {
    // Deliberately not automatic. Every heuristic for "a human spoke" is
    // defeatable by another producer posting to the same inbox, and a budget
    // that refills on something an agent can cause is not a budget.
    const jobs = new JobRegistry(1);
    expect(jobs.claimWake(ALICE)).toBe(true);
    expect(jobs.claimWake(ALICE)).toBe(false);
    jobs.acknowledge(ALICE);
    expect(jobs.claimWake(ALICE)).toBe(true);
  });
});
