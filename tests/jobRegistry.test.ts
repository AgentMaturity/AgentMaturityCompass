import { describe, expect, it } from "vitest";
import { JobRegistry } from "../src/jobs/jobRegistry.js";
import { JobAccessError, type JobResult } from "../src/jobs/jobTypes.js";

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
    // Registry-scoped ids do not replace authorization. A caller who has
    // learned an id still must not distinguish "not yours" from "no such job".
    const jobs = new JobRegistry();
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "secret work", run: never });

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

    expect(shapeOf(id), "an existence oracle over a learned id")
      .toBe(shapeOf("missing-job"));
    expect(shapeOf(id)).not.toContain("secret work");
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

describe("registry incarnation", () => {
  it("refuses transcript ids from an earlier registry even for the same owner and kind", async () => {
    const previous = new JobRegistry();
    const staleId = previous.start({ kind: "bash", owner: ALICE, label: "old task", run: never });
    const current = new JobRegistry();
    let currentSignal!: AbortSignal;
    const currentId = current.start({ kind: "bash", owner: ALICE, label: "new task", run: signal => {
      currentSignal = signal;
      return never();
    } });

    expect(currentId).not.toBe(staleId);
    expect(() => current.get(staleId, ALICE)).toThrow(JobAccessError);
    expect(() => current.kill(staleId, ALICE)).toThrow(JobAccessError);
    await expect(current.wait(staleId, ALICE)).rejects.toThrow(JobAccessError);
    expect(() => previous.get(currentId, ALICE)).toThrow(JobAccessError);
    expect(currentSignal.aborted).toBe(false);
    expect(current.get(currentId, ALICE).label).toBe("new task");
    expect(current.list(ALICE).map(job => job.id)).toEqual([currentId]);
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


function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

describe("WP16 observed job cleanup", () => {
  it("keeps one logical cause while separately observing late physical cleanup", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 5 });
    const cleanup = deferred<boolean>();
    const work = deferred<JobResult>();
    const notices: string[] = [];
    jobs.onSettled(ALICE, snapshot => notices.push(snapshot.outcome!.cause));
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "race", run: () => work.promise, cleanup: cleanup.promise });
    jobs.kill(id, ALICE, "first stop");
    const disposal = jobs.disposeOwner(ALICE);
    jobs.kill(id, ALICE, "second stop");
    expect(jobs.get(id, ALICE)).toMatchObject({ stopRequested: true, cleanup: "pending", status: "stopping",
      outcome: { cause: "killed", summary: "first stop", outcome: "TOOL_OUTCOME_UNKNOWN", ok: false } });
    expect((await disposal)[0]!.cleanup).toBe("unknown");
    cleanup.resolve(true);
    work.resolve({ ok: true, summary: "finished later", cleanupConfirmed: true });
    await flush();
    expect(jobs.get(id, ALICE)).toMatchObject({ cleanup: "confirmed", status: "settled",
      outcome: { cause: "killed", summary: "first stop", outcome: "TOOL_OUTCOME_UNKNOWN" } });
    expect(notices).toEqual(["killed"]);
    expect(jobs.hasOwnedWork(ALICE)).toBe(false);
  });

  it("does not abort or rewrite work whose completion and tree exit were observed first", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 5 });
    let signal!: AbortSignal;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "complete", run: async ownedSignal => {
      signal = ownedSignal;
      return { ok: true, summary: "done", cleanupConfirmed: true, exitCode: 0 };
    } });
    expect(await jobs.wait(id, ALICE)).toMatchObject({ ok: true, cause: "completed", outcome: "OK", exitCode: 0 });
    jobs.kill(id, ALICE);
    await jobs.disposeOwner(ALICE);
    expect(signal.aborted).toBe(false);
    expect(jobs.get(id, ALICE).outcome!.cause).toBe("completed");
  });

  it("records a deadline before a synchronously acknowledged cancellation can complete", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 20 });
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "deadline", timeoutMs: 5,
      run: signal => new Promise(resolve => signal.addEventListener("abort", () => resolve({
        ok: false, summary: "tree exited", cleanupConfirmed: true
      }), { once: true })) });
    expect(await jobs.wait(id, ALICE)).toMatchObject({ cause: "timeout", timedOut: true, outcome: "TOOL_OUTCOME_UNKNOWN" });
    expect(await jobs.waitForCleanup(id, ALICE)).toMatchObject({ cleanup: "confirmed", stopRequested: true });
  });

  it("retains unknown jobs in the active quota and refuses a successor before invoking its producer", async () => {
    const jobs = new JobRegistry({ maxActivePerOwner: 1, cleanupGraceMs: 5 });
    const cleanup = deferred<boolean>();
    let starts = 0;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "noncooperative", cleanup: cleanup.promise,
      run: () => { starts++; return never(); } });
    jobs.kill(id, ALICE);
    expect((await jobs.waitForCleanup(id, ALICE)).cleanup).toBe("unknown");
    const start = () => jobs.start({ kind: "bash", owner: ALICE, label: "successor", run: async () => {
      starts++; return { ok: true, summary: "done", cleanupConfirmed: true };
    } });
    expect(start).toThrow(/quota/);
    expect(starts).toBe(1);
    expect(jobs.hasOwnedWork(ALICE)).toBe(true);
    cleanup.resolve(true);
    await flush();
    const successor = start();
    expect((await jobs.wait(successor, ALICE)).ok).toBe(true);
    expect(starts).toBe(2);
  });

  it("does not release a producer slot solely because a separate cleanup promise resolved", async () => {
    const jobs = new JobRegistry({ maxActivePerOwner: 1, cleanupGraceMs: 5 });
    const cleanup = deferred<boolean>();
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "still executing", cleanup: cleanup.promise, run: never });
    cleanup.resolve(true); await flush();
    expect(jobs.hasOwnedWork(ALICE)).toBe(true);
    expect(() => jobs.start({ kind: "bash", owner: ALICE, label: "overlap", run: never })).toThrow(/quota/);
    jobs.kill(id, ALICE);
  });

  it("bounds live UTF-8 output, preserves its head and real tail, and authenticates before cursor checks", () => {
    const jobs = new JobRegistry({ maxOutputBytes: 128 });
    const text = "HEAD🙂" + "m".repeat(4096) + "終TAIL";
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "flood", run: (_signal, output) => {
      output(text); return never();
    } });
    const page = jobs.readOutput(id, ALICE, { maxBytes: 128 });
    const retained = page.segments.map(segment => segment.text).join("");
    expect(Buffer.byteLength(retained)).toBeLessThanOrEqual(128);
    expect(retained).toContain("HEAD🙂"); expect(retained).toContain("終TAIL");
    expect(retained).not.toContain("�");
    expect(page.totalBytes).toBe(Buffer.byteLength(text));
    expect(page.droppedBytes).toBeGreaterThan(0);
    expect(page.segments).toHaveLength(2);
    expect(page.segments[1]!.offset).toBeGreaterThan(Buffer.byteLength(page.segments[0]!.text));
    expect(page.nextCursor).toBe(page.totalBytes);
    const tail = jobs.readOutput(id, ALICE, { cursor: 100, maxBytes: 12 });
    expect(tail.segments[0]!.offset).toBeGreaterThan(100);
    expect(Buffer.byteLength(tail.segments[0]!.text)).toBeLessThanOrEqual(12);
    const error = (handle: string): string => {
      try { jobs.readOutput(handle, BOB, { cursor: Number.NaN }); return "unfenced"; }
      catch (caught) { return (caught as Error).message.replace(handle, "<id>"); }
    };
    expect(error(id)).toBe(error("missing"));
    expect(() => jobs.readOutput(id, ALICE, { cursor: page.totalBytes + 1 })).toThrow(/cursor/);
    expect(() => jobs.readOutput(id, ALICE, { maxBytes: 3 })).toThrow(/cursor/);
  });

  it("retains only the configured number of fully cleaned outcomes per owner", async () => {
    const jobs = new JobRegistry({ maxRetainedPerOwner: 2 });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = jobs.start({ kind: "bash", owner: ALICE, label: String(i), run: async () => ({ ok: true, summary: "done", cleanupConfirmed: true }) });
      ids.push(id); await jobs.wait(id, ALICE);
    }
    expect(jobs.list(ALICE).map(job => job.id)).toEqual(ids.slice(-2));
    expect(() => jobs.get(ids[0]!, ALICE)).toThrow(JobAccessError);
  });

  it("bounds and cancels output waits without killing or settling the job", async () => {
    const jobs = new JobRegistry();
    let signal!: AbortSignal;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "waiting", run: ownedSignal => {
      signal = ownedSignal; return never();
    } });
    expect(await jobs.waitFor(id, ALICE, 5)).toMatchObject({ status: "running", outcome: null });
    const cancelled = new AbortController();
    const waiting = jobs.waitFor(id, ALICE, 30_000, cancelled.signal);
    cancelled.abort();
    expect(await waiting).toMatchObject({ status: "running", stopRequested: false, outcome: null });
    expect(signal.aborted).toBe(false);
    await expect(jobs.waitFor(id, ALICE, 30_001)).rejects.toThrow(/deadline/);
  });

  it("closes all-owner admission synchronously and never refills a disposed wake owner", async () => {
    const jobs = new JobRegistry({ cleanupGraceMs: 5, wakeBudget: 1 });
    const cleanup = deferred<boolean>();
    jobs.start({ kind: "bash", owner: ALICE, label: "old session", run: never, cleanup: cleanup.promise });
    jobs.start({ kind: "bash", owner: BOB, label: "rotated session", run: never, cleanup: cleanup.promise });
    const disposal = jobs.disposeAll();
    expect(() => jobs.start({ kind: "bash", owner: "new-session", label: "late", run: never })).toThrow(/disposed/);
    jobs.acknowledge(ALICE);
    expect(jobs.claimWake(ALICE)).toBe(false);
    cleanup.resolve(true);
    expect((await disposal).map(job => job.cleanup)).toEqual(["confirmed", "confirmed"]);
  });

  it("copies the starting step and caps outcome text without splitting UTF-8", async () => {
    const jobs = new JobRegistry();
    const ownerStep = { sessionId: ALICE, turn: 1, step: 2, callId: "original-call" };
    const id = jobs.start({ kind: "bash", owner: ALICE, ownerStep, label: "step owned",
      run: async () => ({ ok: true, summary: "🙂".repeat(10_000), cleanupConfirmed: true }) });
    ownerStep.step = 999;
    ownerStep.callId = "rewritten";
    expect(jobs.get(id, ALICE).ownerStep).toEqual({ sessionId: ALICE, turn: 1, step: 2, callId: "original-call" });
    const outcome = await jobs.wait(id, ALICE);
    expect(Buffer.byteLength(outcome.summary)).toBeLessThanOrEqual(512);
    expect(outcome.summary).not.toContain("�");
    expect(() => jobs.start({ kind: "bash", owner: BOB, ownerStep, label: "forged", run: never })).toThrow(/ownership/);
  });

  it("isolates a throwing listener and stops completion-driven wake chains at the trusted budget", async () => {
    const jobs = new JobRegistry();
    let completions = 0;
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    jobs.onSettled(ALICE, () => { throw new Error("faulty observer"); });
    const start = () => jobs.start({ kind: "bash", owner: ALICE, label: "wake", run: async () => ({ ok: true, summary: "done", cleanupConfirmed: true }) });
    jobs.onSettled(ALICE, () => {
      completions++;
      if (jobs.claimWake(ALICE)) start(); else finish();
    });
    start(); await done;
    expect(completions).toBe(4);
    expect(jobs.claimWake(ALICE)).toBe(false);
  });
});


describe("WP16 whole-registry bounds across session rotation", () => {
  it("keeps an unknown old-owner job in the global active quota before invoking a rotated-owner successor", async () => {
    const jobs = new JobRegistry({ maxActiveTotal: 1, maxActivePerOwner: 1, cleanupGraceMs: 5 });
    const cleanup = deferred<boolean>();
    let starts = 0;
    const id = jobs.start({ kind: "bash", owner: ALICE, label: "old owner", run: () => { starts++; return never(); }, cleanup: cleanup.promise });
    jobs.kill(id, ALICE);
    expect((await jobs.waitForCleanup(id, ALICE)).cleanup).toBe("unknown");
    const successor = () => jobs.start({ kind: "bash", owner: BOB, label: "rotated owner", run: async () => {
      starts++; return { ok: true, summary: "done", cleanupConfirmed: true };
    } });
    expect(successor).toThrow(/global active job quota/);
    expect(starts).toBe(1);
    cleanup.resolve(true); await flush();
    expect((await jobs.wait(successor(), BOB)).ok).toBe(true);
    expect(starts).toBe(2);
  });

  it("bounds retained owner namespaces even after old work has cleaned up", async () => {
    const jobs = new JobRegistry({ maxOwners: 2, cleanupGraceMs: 5 });
    const old = jobs.start({ kind: "bash", owner: ALICE, label: "old", run: async () => ({ ok: true, summary: "done", cleanupConfirmed: true }) });
    await jobs.wait(old, ALICE);
    await jobs.disposeOwner(ALICE);
    const rotated = jobs.start({ kind: "bash", owner: BOB, label: "rotated", run: async () => ({ ok: true, summary: "done", cleanupConfirmed: true }) });
    await jobs.wait(rotated, BOB);
    await jobs.disposeOwner(BOB);
    let started = false;
    expect(() => jobs.start({ kind: "bash", owner: "third-owner", label: "too many owners", run: async () => {
      started = true; return { ok: true, summary: "unexpected", cleanupConfirmed: true };
    } })).toThrow(/owner quota/);
    expect(started).toBe(false);
    expect(jobs.claimWake("third-owner")).toBe(false);
    expect(() => jobs.onSettled("third-owner", () => undefined)).toThrow(/owner quota/);
    for (let i = 0; i < 100; i++) await jobs.disposeOwner(`extra-${i}`);
    // Tombstones are intentionally not public; inspect retained collection sizes to catch otherwise invisible growth.
    expect((Reflect.get(jobs, "owners") as Set<string>).size).toBeLessThanOrEqual(2);
    expect((Reflect.get(jobs, "closedOwners") as Set<string>).size).toBeLessThanOrEqual(2);
    expect(jobs.list(ALICE)).toHaveLength(1);
    expect(() => jobs.start({ kind: "bash", owner: "third-owner", label: "still refused", run: never })).toThrow(/owner quota/);
  });

  it.each([{ maxOwners: 0 }, { maxOwners: Number.NaN }, { maxActiveTotal: 0 }, { maxActiveTotal: Number.POSITIVE_INFINITY }])(
    "rejects invalid whole-registry limits %j", config => {
      expect(() => new JobRegistry(config)).toThrow(RangeError);
    }
  );
});
