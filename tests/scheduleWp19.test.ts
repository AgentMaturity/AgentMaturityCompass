import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import YAML from "yaml";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { initWorkspace } from "../src/workspace.js";
import { rootIdentity } from "../src/agent/delegationIdentity.js";
import * as store from "../src/autonomy/scheduleStore.js";
import { manageObjective, readObjective } from "../src/autonomy/objectiveStore.js";
import { runDueSchedules } from "../src/autonomy/scheduleRunner.js";

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function workspace() {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "wp19-regression-fixture-only");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-wp19-"))); dirs.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}
const schedule = (over: Record<string, unknown> = {}) => ({ id: "one", runAs: "reader", goal: "review only", maxRounds: 2,
  everyMs: 60_000, enabled: true, scope: ["READ_ONLY"], ...over });
function base(workspace: string) {
  let n = 0;
  return { workspace, parent: rootIdentity("default"), parentSessionId: "wp19-parent", now: 1_000_000,
    mintSessionId: () => `wp19-child-${++n}`,
    session: { recordLoopEvent: vi.fn(() => null), recordProjectedEvidence: vi.fn((_row: { meta: Record<string, unknown> }) => null) } };
}
function digest(dir: string) { const read = store.readSchedules(dir); if (!read.ok) throw new Error(read.reason); return read.digest; }

describe("WP19 signed schedule limits and truthful outcomes", () => {
  it.each([{ maxRounds: 257 }, { everyMs: 59_999 }, { title: "x".repeat(121) }])("refuses unsupported schedule authority before writing: %j", over => {
    const dir = workspace(); expect(() => store.saveSchedules(dir, [schedule(over)])).toThrow();
    expect(store.readSchedules(dir)).toMatchObject({ ok: true, digest: "absent" });
  });

  it.each([{ maxRounds: 257 }, { everyMs: 59_999 }])("refuses already-signed legacy authority beyond new limits: %j", over => {
    const dir = workspace(), path = store.schedulesPath(dir);
    writeFileSync(path, YAML.stringify({ schedules: [schedule(over)] })); signFileWithAuditor(dir, path);
    expect(store.readSchedules(dir)).toMatchObject({ ok: false });
    expect(store.dueSchedules(dir, 1_000_000)).toEqual([]);
    expect(store.parseScheduleDefinition(schedule({ maxRounds: 256 }))).toMatchObject({ maxRounds: 256, everyMs: 60_000 });
  });

  it("records exhausted separately and parks after its own configured threshold", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ maxConsecutiveExhausted: 2 })]);
    const owner = base(dir); let calls = 0;
    const runner = async () => ({ ok: true, text: `progress ${++calls}` });
    for (let exhausted = 1; exhausted <= 2; exhausted++) {
      const result = await runDueSchedules({ ...owner, now: owner.now + (exhausted - 1) * 60_000, runner });
      expect(result[0]).toMatchObject({ ok: false, outcome: "exhausted", stoppedBy: "max-rounds" });
      expect(store.scheduleStatus(dir, owner.now).schedules[0]).toMatchObject({ consecutiveFailures: 0, consecutiveExhausted: exhausted,
        lastOutcome: { ok: false, outcome: "exhausted" } });
      expect(owner.session.recordProjectedEvidence.mock.calls.at(-1)?.[0].meta).toMatchObject({ outcome: "exhausted" });
    }
    expect(await runDueSchedules({ ...owner, now: owner.now + 120_000, runner })).toEqual([]);
    expect(calls).toBe(4);
    expect(store.claimDueRun(dir, "one", owner.now + 120_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/exhausted/) });
    store.manageSchedule(dir, digest(dir), { kind: "reset-failures", id: "one" });
    expect(store.scheduleStatus(dir, owner.now + 120_000).schedules[0]).toMatchObject({ due: true, consecutiveExhausted: 0 });
  });

  it("rechecks signed revocation between rounds before another child effect", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const owner = base(dir);
    const runner = vi.fn(async () => {
      store.manageSchedule(dir, digest(dir), { kind: "disable", id: "one" });
      return { ok: true, text: "first round settled" };
    });
    const result = await runDueSchedules({ ...owner, runner });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result[0]?.ok).toBe(false); expect(store.interruptedClaims(dir)).toEqual([]);
  });

  it("refuses inconsistent success classification without clearing the exact active claim", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule()]); const claimed = store.claimDueRun(dir, "one", 1_000_000);
    if (!claimed.ok) throw new Error(claimed.reason);
    expect(() => store.completeRun(dir, "one", { ok: true, summary: "not done", outcome: "exhausted" } as Parameters<typeof store.completeRun>[2], claimed.claimId)).toThrow();
    expect(store.interruptedClaims(dir)[0]?.claimId).toBe(claimed.claimId);
  });
});


describe("WP19 calendar claims share existing occurrence ownership", () => {
  const calendar = { version: 1, kind: "daily", timeZone: "America/New_York", tzdbVersion: process.versions.tz,
    startAt: "2026-03-07T00:00:00Z", hour: 2, minute: 30, gap: "skip", fold: "earlier", missed: "skip" };
  it("skips a DST gap, retains interrupted ownership across restart, and does one pass after a jump", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ everyMs: undefined, calendar })]);
    expect(store.scheduleStatus(dir, Date.parse("2026-03-07T07:29:59Z")).schedules[0]).toMatchObject({ due: false, nextDueTs: Date.parse("2026-03-07T07:30:00Z") });
    const owned = store.claimDueRun(dir, "one", Date.parse("2026-03-07T07:30:00Z")); if (!owned.ok) throw new Error(owned.reason);
    expect(store.claimDueRun(dir, "one", Date.parse("2026-03-09T06:30:00Z"))).toMatchObject({ ok: false });
    expect(store.dueSchedules(dir, Date.parse("2026-03-09T06:30:00Z"))).toEqual([]);
    store.completeRun(dir, "one", { ok: true, summary: "owned completion" }, owned.claimId);
    expect(store.scheduleStatus(dir, Date.parse("2026-03-08T09:00:00Z")).schedules[0]).toMatchObject({ due: false, nextDueTs: Date.parse("2026-03-09T06:30:00Z") });
    const jump = Date.parse("2026-04-01T12:00:00Z");
    const result = await runDueSchedules({ ...base(dir), now: jump, runner: async () => ({ ok: true, text: "one late pass" }) });
    expect(result).toHaveLength(1); expect(store.dueSchedules(dir, jump)).toEqual([]);
    expect(store.dueSchedules(dir, Date.parse("2026-03-07T07:30:00Z"))).toEqual([]);
  });

  it("refuses a calendar clock beyond the Date range before consuming an occurrence", () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ everyMs: undefined, calendar })]);
    const now = Number.MAX_SAFE_INTEGER;
    expect(store.scheduleStatus(dir, now).schedules[0]).toMatchObject({ clockRangeExceeded: true, due: false });
    expect(store.dueSchedules(dir, now)).toEqual([]);
    expect(store.claimDueRun(dir, "one", now)).toMatchObject({ ok: false, reason: expect.stringMatching(/clock range/) });
    expect(store.interruptedClaims(dir)).toEqual([]);
  });

  it("refuses ambiguous interval/calendar definitions and changes timezone only through signed CAS", () => {
    const dir = workspace(); expect(() => store.saveSchedules(dir, [schedule({ calendar })])).toThrow(/exactly one/);
    store.saveSchedules(dir, [schedule({ everyMs: undefined, calendar })]);
    const old = digest(dir);
    store.manageSchedule(dir, old, { kind: "put", schedule: schedule({ everyMs: undefined, calendar: { ...calendar, timeZone: "UTC" } }) });
    expect(store.scheduleStatus(dir, Date.parse("2026-03-07T00:00:00Z")).schedules[0]?.nextDueTs).toBe(Date.parse("2026-03-07T02:30:00Z"));
    expect(() => store.manageSchedule(dir, old, { kind: "disable", id: "one" })).toThrow(/digest/);
  });
});

describe("WP19 objective status follows configured checks and exact round authority", () => {
  const objective = { version: 1, ownerPrincipal: "default", completionCheck: { kind: "file-sha256", path: "done.txt",
    sha256: createHash("sha256").update("verified result").digest("hex") } };
  async function prepared(over: Record<string, unknown> = {}) {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ objective, ...over })]);
    await manageObjective(dir, "one", "absent", digest(dir), "create"); return dir;
  }
  it("cannot execute an absent, paused or wrong-owner objective", async () => {
    const dir = workspace(); store.saveSchedules(dir, [schedule({ objective })]); const runner = vi.fn(async () => ({ ok: true, text: "done" }));
    expect((await runDueSchedules({ ...base(dir), runner }))[0]?.stoppedBy).toBe("not-claimed");
    await manageObjective(dir, "one", "absent", digest(dir), "create");
    expect((await runDueSchedules({ ...base(dir), parent: rootIdentity("other"), runner }))[0]?.stoppedBy).toBe("not-claimed");
    await manageObjective(dir, "one", 1, digest(dir), "pause");
    expect((await runDueSchedules({ ...base(dir), runner }))[0]?.stoppedBy).toBe("not-claimed");
    expect(runner).not.toHaveBeenCalled(); expect(store.interruptedClaims(dir)).toEqual([]);
  });

  it("records complete only when exact configured bytes verify, independent of model text", async () => {
    const dir = await prepared();
    const result = await runDueSchedules({ ...base(dir), runner: async () => { writeFileSync(join(dir, "done.txt"), "verified result"); return { ok: true, text: "still unsure" }; } });
    expect(result[0]).toMatchObject({ ok: true, outcome: "completed", rounds: 1, stoppedBy: "done" });
    expect(readObjective(dir, "one")).toMatchObject({ status: "complete", roundsUsed: 1, currentRound: null, lastCheckStatus: "complete",
      lastRound: { claimId: result[0]?.claimId, round: 1, sessionId: "wp19-child-1" } });
    expect(store.scheduleStatus(dir, 1_000_000).schedules[0]?.lastOutcome).toMatchObject({ ok: true, outcome: "completed" });
    expect((await runDueSchedules({ ...base(dir), now: 1_060_000, runner: vi.fn(async () => ({ ok: true, text: "unexpected extra dispatch" })) }))[0]?.stoppedBy).toBe("not-claimed");
  });

  it.each(["missing", "symlink", "mismatch"])("keeps %s completion evidence distinct from verified completion", async kind => {
    const dir = await prepared();
    if (kind === "symlink") { writeFileSync(join(dir, "target.txt"), "verified result"); symlinkSync("target.txt", join(dir, "done.txt")); }
    if (kind === "mismatch") writeFileSync(join(dir, "done.txt"), "wrong result");
    const result = await runDueSchedules({ ...base(dir), runner: async () => ({ ok: true, text: "I am complete" }) });
    expect(result[0]?.ok).toBe(false);
    expect(readObjective(dir, "one")).toMatchObject({ status: "blocked", lastCheckStatus: kind === "mismatch" ? "failed" : "unavailable" });
    expect(result[0]?.outcome).toBe(kind === "mismatch" ? "exhausted" : "failed");
  });

  it("does not infer resume from a later pass after an explicit in-flight human pause", async () => {
    const dir = await prepared(); const runner = vi.fn(async () => {
      const current = readObjective(dir, "one")!;
      await manageObjective(dir, "one", current.revision, digest(dir), "pause");
      writeFileSync(join(dir, "done.txt"), "verified result"); return { ok: true, text: "done after pause" };
    });
    const result = await runDueSchedules({ ...base(dir), runner });
    expect(result[0]?.ok).toBe(false); expect(runner).toHaveBeenCalledTimes(1);
    expect(readObjective(dir, "one")?.status).toBe("paused");
    expect((await runDueSchedules({ ...base(dir), now: 1_060_000, runner }))[0]?.stoppedBy).toBe("not-claimed");
  });
});
