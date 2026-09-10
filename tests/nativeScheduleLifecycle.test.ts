// AMC-1548 / task11: AUTHORED UNEXECUTED. Source, package and platform qualification are deferred.
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import type { SubagentRunContext, SubagentRunResult } from "../src/agent/subagentSpawn.js";
import * as store from "../src/autonomy/scheduleStore.js";
import { runDueSchedules } from "../src/autonomy/scheduleRunner.js";
import { assertNativeScheduleAdmission, startNativeScheduleService } from "../src/autonomy/scheduleService.js";
import { loadVerifiedToolsConfigSnapshot } from "../src/toolhub/toolhubValidators.js";
import { setMode } from "../src/mode/mode.js";

const dirs: string[] = [];
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-schedule-lifecycle-fixture-only");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-native-schedule-")));
  dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  store.initSchedules(dir);
  return dir;
}
const schedule = (over: Record<string, unknown> = {}) => ({ id: "one", runAs: "reader", goal: "review only",
  maxRounds: 1, everyMs: 1_000, enabled: true, scope: ["READ_ONLY"], ...over });
function digest(dir: string) {
  const read = store.readSchedules(dir);
  if (!read.ok) throw new Error(read.reason);
  return read.digest;
}
function claim(dir: string, now = 1_000_000) {
  const result = store.claimDueRun(dir, "one", now, digest(dir));
  if (!result.ok) throw new Error(result.reason);
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function runnerBase(dir: string) {
  let id = 0;
  return { workspace: dir, parent: rootIdentity("default"), parentSessionId: "parent-fixture",
    session: { recordLoopEvent: vi.fn((_record: unknown) => null),
      recordProjectedEvidence: vi.fn((_row: { eventType: "audit" | "metric" | "stdout"; payload: string; meta: Record<string, unknown> }) => null) },
    mintSessionId: () => `scheduled-child-${++id}`, now: 1_000_000 };
}

describe("exclusive, accountable schedule occurrence ownership", () => {
  it("rejects a competing transaction without deleting its lock or consuming a claim", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    const lock = store.scheduleLockPath(dir);
    const fd = openSync(lock, "wx", 0o600);
    try {
      expect(store.claimDueRun(dir, "one", 1_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/locked/) });
      expect(existsSync(lock)).toBe(true);
      expect(store.interruptedClaims(dir)).toEqual([]);
    } finally { closeSync(fd); unlinkSync(lock); }
    expect(claim(dir).ok).toBe(true);
    expect(existsSync(lock), "only the transaction's own lock was released").toBe(false);
  });

  it("refuses wrong, repeated and stale completions without changing the current owner", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    const first = claim(dir);
    const before = readFileSync(join(dir, ".amc", "schedule-state.json"), "utf8");
    expect(() => store.completeRun(dir, "one", { ok: true, summary: "forged" }, "other-owner")).toThrow(/matching owned claim/);
    expect(readFileSync(join(dir, ".amc", "schedule-state.json"), "utf8")).toBe(before);
    store.completeRun(dir, "one", { ok: true, summary: "actual", sessionId: "parent-one" }, first.claimId);
    expect(() => store.completeRun(dir, "one", { ok: false, summary: "duplicate" }, first.claimId)).toThrow(/matching owned claim/);
    expect(store.scheduleStatus(dir, 1_000_001).schedules[0]?.lastOutcome).toMatchObject({ claimId: first.claimId, ok: true, sessionId: "parent-one" });
    const second = claim(dir, 1_001_000);
    expect(second.claimId).not.toBe(first.claimId);
    expect(() => store.completeRun(dir, "one", { ok: true, summary: "late" }, first.claimId)).toThrow(/matching owned claim/);
    expect(store.interruptedClaims(dir)[0]?.claimId).toBe(second.claimId);
  });

  it.each(["{", "{}", "[]", '{"schedules":{"one":{}}}', '{"schedules":{},"unexpected":true}'])("preserves malformed state rather than erasing history: %s", bytes => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    const path = join(dir, ".amc", "schedule-state.json"); writeFileSync(path, bytes);
    expect(() => store.dueSchedules(dir, 1_000_000)).toThrow(/unreadable|inconsistent/);
    expect(() => store.claimDueRun(dir, "one", 1_000_000)).toThrow(/unreadable|inconsistent/);
    expect(readFileSync(path, "utf8")).toBe(bytes);
  });

  it("keeps legacy interrupted claims visible and never invents an owner for them", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    writeFileSync(join(dir, ".amc", "schedule-state.json"), JSON.stringify({ schedules: {
      one: { lastClaimedTs: 1_000_000, inFlightSince: 1_000_000, consecutiveFailures: 0 }
    } }));
    expect(store.interruptedClaims(dir)).toEqual([{ scheduleId: "one", claimedTs: 1_000_000, claimId: null }]);
    expect(store.dueSchedules(dir, 9_000_000)).toEqual([]);
    expect(() => store.completeRun(dir, "one", { ok: true, summary: "guess" }, "guessed")).toThrow();
  });

  it("honors the exact cadence boundary, rollback and one-run catch-up", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const owned = claim(dir);
    store.completeRun(dir, "one", { ok: true, summary: "done" }, owned.claimId);
    expect(store.dueSchedules(dir, 999_000)).toEqual([]);
    expect(store.dueSchedules(dir, 1_000_999)).toEqual([]);
    expect(store.dueSchedules(dir, 1_001_000)).toHaveLength(1);
    const late = claim(dir, 9_000_000);
    store.completeRun(dir, "one", { ok: true, summary: "one catch-up" }, late.claimId);
    expect(store.dueSchedules(dir, 9_000_001)).toEqual([]);
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid clocks without claiming: %s", now => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    expect(() => store.claimDueRun(dir, "one", now)).toThrow(/clock/);
    expect(store.interruptedClaims(dir)).toEqual([]);
  });
});

describe("signed management does not widen or reset live authority", () => {
  it("uses config pins; disabling is not a fake cancel and remove/re-add preserves cadence", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const old = digest(dir); const owned = claim(dir);
    expect(() => store.manageSchedule(dir, old, { kind: "remove", id: "one" })).toThrow(/active|interrupted/);
    expect(() => store.manageSchedule(dir, old, { kind: "reset-failures", id: "one" })).toThrow(/active|interrupted/);
    store.manageSchedule(dir, old, { kind: "disable", id: "one" });
    expect(store.interruptedClaims(dir)[0]?.claimId).toBe(owned.claimId);
    expect(() => store.manageSchedule(dir, old, { kind: "enable", id: "one" })).toThrow(/digest changed/);
    store.completeRun(dir, "one", { ok: true, summary: "stopped owner" }, owned.claimId);
    store.manageSchedule(dir, digest(dir), { kind: "remove", id: "one" });
    store.manageSchedule(dir, digest(dir), { kind: "put", schedule: schedule() });
    expect(store.dueSchedules(dir, 1_000_001)).toEqual([]);
  });

  it("refuses duplicate IDs, reserved IDs, invalid scopes and unsigned replacements before writing", () => {
    const dir = workspace(); const before = readFileSync(store.schedulesPath(dir), "utf8");
    for (const invalid of [[schedule(), schedule()], [schedule({ id: "__proto__" })],
      [schedule({ scope: ["UNKNOWN"] })], [schedule({ unsignedOverride: true })]]) {
      expect(() => store.saveSchedules(dir, invalid)).toThrow();
      expect(readFileSync(store.schedulesPath(dir), "utf8")).toBe(before);
    }
    const reviewedDigest = digest(dir);
    writeFileSync(store.schedulesPath(dir), before + "\n# tampered\n");
    expect(() => store.manageSchedule(dir, reviewedDigest, { kind: "put", schedule: schedule() })).toThrow(/signature/);
    expect(readFileSync(store.schedulesPath(dir), "utf8")).toBe(before + "\n# tampered\n");
  });

  it("only resets failure suspension explicitly, without moving the cadence", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    for (let i = 0; i < store.MAX_CONSECUTIVE_FAILURES; i++) {
      const owned = claim(dir, 1_000_000 + i * 1_000);
      store.completeRun(dir, "one", { ok: false, summary: "refused" }, owned.claimId);
    }
    const before = store.scheduleStatus(dir, 1_100_000).schedules[0]!;
    expect(before.due).toBe(false);
    store.manageSchedule(dir, digest(dir), { kind: "reset-failures", id: "one" });
    const after = store.scheduleStatus(dir, 1_100_000).schedules[0]!;
    expect(after.lastClaimedTs).toBe(before.lastClaimedTs);
    expect(after.lastOutcome).toEqual(before.lastOutcome);
    expect(after.due).toBe(true);
  });

  it("requires the root's signed tools pin and matching approval scope, including for owner mode", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    const tools = loadVerifiedToolsConfigSnapshot(dir);
    const admission = { workspace: dir, expectedSchedulesDigest: digest(dir), expectedToolsDigest: tools.digestSha256!, approvalClass: "READ_ONLY" as const };
    expect(() => assertNativeScheduleAdmission(admission)).not.toThrow();
    expect(() => assertNativeScheduleAdmission({ ...admission, expectedToolsDigest: "0".repeat(64) })).toThrow(/tools policy/);
    store.saveSchedules(dir, [schedule({ scope: undefined })]);
    expect(() => assertNativeScheduleAdmission({ ...admission, expectedSchedulesDigest: digest(dir) })).toThrow(/signed scope/);
    setMode(dir, "agent");
    expect(() => store.manageSchedule(dir, digest(dir), { kind: "disable", id: "one" })).toThrow(/agent mode/);
  });
});

describe("one native due pass owns its real child lifetimes", () => {
  it("does not run a duplicate pass; emitted audit pairs bind claim and actual child IDs", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]);
    const entered = deferred<void>(); const finish = deferred<SubagentRunResult>(); const base = runnerBase(dir);
    const runner = vi.fn(async () => { entered.resolve(); return finish.promise; });
    const first = runDueSchedules({ ...base, runner }); await entered.promise;
    expect(await runDueSchedules({ ...base, runner })).toEqual([]);
    finish.resolve({ ok: true, text: "actual child text" }); const result = await first;
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result[0]?.childSessionIds).toEqual(["scheduled-child-1"]);
    const audits = base.session.recordProjectedEvidence.mock.calls.map(call => (call[0] as { meta: Record<string, unknown> }).meta)
      .filter(meta => String(meta.type).startsWith("native_schedule_"));
    expect(audits.map(meta => meta.type)).toEqual(["native_schedule_claimed", "native_schedule_execution_settled"]);
    expect(audits[0]?.claimId).toBe(result[0]?.claimId);
    expect(audits[1]?.childSessionIds).toEqual(result[0]?.childSessionIds);
    expect(store.scheduleStatus(dir, base.now).schedules[0]?.lastOutcome?.sessionId).toBe("parent-fixture");
  });

  it("executes the admitted schedule, not a stale enumeration snapshot", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ goal: "old goal" })]);
    const actualClaim = store.claimDueRun;
    vi.spyOn(store, "claimDueRun").mockImplementationOnce((...args) => {
      store.saveSchedules(dir, [schedule({ goal: "new admitted goal" })]); return actualClaim(...args);
    });
    const runner = vi.fn(async (_ctx: SubagentRunContext) => ({ ok: true, text: "finished" }));
    await runDueSchedules({ ...runnerBase(dir), runner });
    expect(runner.mock.calls[0]?.[0]).toMatchObject({ goal: "new admitted goal" });
  });

  it("does not claim any job when already cancelled or when its reviewed config pin changed", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const old = digest(dir);
    const controller = new AbortController(); controller.abort();
    const runner = vi.fn(async () => ({ ok: true, text: "unexpected" }));
    expect(await runDueSchedules({ ...runnerBase(dir), runner, signal: controller.signal })).toEqual([]);
    store.saveSchedules(dir, [schedule({ goal: "changed" })]);
    expect((await runDueSchedules({ ...runnerBase(dir), runner, expectedSchedulesDigest: old }))[0]?.stoppedBy).toBe("not-claimed");
    expect(runner).not.toHaveBeenCalled(); expect(store.interruptedClaims(dir)).toEqual([]);
  });

  it("retains the claim past cancellation grace until actual work settles, and leaves later jobs unclaimed", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule(), schedule({ id: "two" })]);
    vi.useFakeTimers(); const controller = new AbortController(); const entered = deferred<void>(); const finish = deferred<SubagentRunResult>();
    const base = runnerBase(dir); let settled = false;
    const operation = runDueSchedules({ ...base, signal: controller.signal, cancelGraceMs: 0,
      runner: async () => { entered.resolve(); return finish.promise; } });
    void operation.then(() => { settled = true; }); await entered.promise;
    controller.abort(); await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false); expect(store.interruptedClaims(dir)).toHaveLength(1);
    finish.resolve({ ok: true, text: "late result is not permission to run the next job" });
    const result = await operation;
    expect(result).toHaveLength(1); expect(result[0]?.stoppedBy).toBe("cancelled");
    expect(store.interruptedClaims(dir)).toEqual([]);
    expect(store.scheduleStatus(dir, base.now).schedules.find(item => item.id === "two")?.lastClaimedTs).toBeNull();
  });

  it("leaves a visible claim when the signed settlement recorder refuses; it does not report a successful close", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const base = runnerBase(dir);
    const recordProjectedEvidence = (row: { meta: Record<string, unknown> }) => {
      if (row.meta.type === "native_schedule_execution_settled") throw new Error("recorder refused settlement");
      return null;
    };
    await expect(runDueSchedules({ ...base, session: { ...base.session, recordProjectedEvidence }, runner: async () => ({ ok: true, text: "done" }) })).rejects.toThrow(/recorder refused/);
    expect(store.interruptedClaims(dir)).toHaveLength(1);
    expect(store.dueSchedules(dir, base.now + 100_000)).toEqual([]);
  });
});

describe("explicit foreground service lifecycle", () => {
  it("never overlaps passes and waits for the active pass on stop", async () => {
    vi.useFakeTimers(); const finish = deferred<number>(); let activeSignal: AbortSignal | undefined;
    const runPass = vi.fn((signal: AbortSignal) => { activeSignal = signal; return finish.promise; });
    const onResult = vi.fn(); const service = startNativeScheduleService({ pollMs: 1000, runPass, onResult });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runPass).toHaveBeenCalledTimes(1);
    let closed = false; const stop = service.stop().then(() => { closed = true; });
    await Promise.resolve(); expect(activeSignal?.aborted).toBe(true); expect(closed).toBe(false);
    finish.resolve(1); await stop;
    expect(onResult).toHaveBeenCalledWith(1); expect(vi.getTimerCount()).toBe(0);
    await service.stop(); await vi.advanceTimersByTimeAsync(10_000); expect(runPass).toHaveBeenCalledTimes(1);
  });

  it("polls only after a settled pass, clears idle timers and does not swallow a failed owner", async () => {
    vi.useFakeTimers(); const runPass = vi.fn(async () => 1);
    const service = startNativeScheduleService({ pollMs: 1000, runPass, onResult: () => {} });
    await vi.advanceTimersByTimeAsync(999); expect(runPass).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(runPass).toHaveBeenCalledTimes(2);
    await service.stop(); expect(vi.getTimerCount()).toBe(0);
    const broken = startNativeScheduleService({ pollMs: 1000, runPass: async () => { throw new Error("owner failed"); }, onResult: () => {} });
    await expect(broken.closed).rejects.toThrow("owner failed"); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not run when pre-cancelled and rejects invalid polling delays before ownership", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); controller.abort(); const runPass = vi.fn(async () => 1);
    await startNativeScheduleService({ pollMs: 1000, runPass, onResult: () => {}, signal: controller.signal }).closed;
    for (const pollMs of [0, 999, Infinity, NaN, 2_147_483_648]) expect(() => startNativeScheduleService({ pollMs, runPass, onResult: () => {} })).toThrow(/poll-ms/);
    expect(runPass).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
