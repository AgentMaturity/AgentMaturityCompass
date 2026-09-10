import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, openSync, unlinkSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { parseDelegationScope } from "../agent/delegationScope.js";
import { getMode } from "../mode/mode.js";

/**
 * Durable schedules (plan P6.1d).
 *
 * A schedule authorises an agent to run UNATTENDED on a timer. That makes the
 * file defining them a policy surface, signed and verified like `.amc/tools.yaml`
 * and `.amc/adapters.yaml` — otherwise anyone who can write a file can schedule
 * agents, and nothing would say who authorised them.
 *
 * THE PROPERTY THE WHOLE THING TURNS ON: a restart must not re-run work that
 * already ran.
 *
 * The choice that delivers it is where the clock advances. A run is claimed
 * BEFORE it executes and the schedule's next-due time moves then, not on
 * completion. So a crash mid-run MISSES an occurrence rather than repeating one.
 * That is the right way round: a missed occurrence of a periodic job is
 * recoverable by waiting or by an operator running it, while a repeated
 * side-effecting agent run may not be recoverable at all.
 *
 * The cost is stated rather than hidden — a crashed run does not happen. What
 * makes that honest instead of merely convenient is that the claim REMAINS, and
 * `interruptedClaims` surfaces it: a claim with no completion is a run nobody
 * closed, exactly as an unmatched `delegation-started` is a delegation nobody
 * closed. It is not silently retried and not silently counted as a success.
 *
 * NO CATCH-UP. A daily job that missed three days has one thing to do, not
 * three; running the backlog would be a thundering herd of unattended agents.
 */

/** Consecutive failures after which a schedule stops asking to run. */
export const MAX_CONSECUTIVE_FAILURES = 3;

const scheduleIdSchema = z.string().min(1).max(128).refine(
  value => !["__proto__", "prototype", "constructor"].includes(value), "reserved schedule id"
);
const scheduleSchema = z.object({
  id: scheduleIdSchema,
  runAs: z.string().min(1).max(128),
  goal: z.string().min(1).max(65_536),
  /** The ceiling for this schedule's goal-rounds driver. */
  maxRounds: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  /** Cadence. The soonest a schedule may run again after being claimed. */
  everyMs: z.number().int().min(1_000).max(Number.MAX_SAFE_INTEGER),
  enabled: z.boolean().default(true),
  scope: z.array(z.string()).optional()
}).strict().refine(schedule => schedule.scope === undefined || parseDelegationScope(schedule.scope).ok,
  "scope must name a nonempty set of valid action classes");

const schedulesSchema = z.array(scheduleSchema).max(256).refine(
  schedules => new Set(schedules.map(schedule => schedule.id)).size === schedules.length,
  "schedule ids must be unique"
);

export type Schedule = z.infer<typeof scheduleSchema>;

const stateSchema = z.object({
  schedules: z.record(
    z.string(),
    z.object({
      /** When the last run was CLAIMED. The cadence counts from here. */
      lastClaimedTs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
      /** Set while a run is in flight; cleared on completion. */
      inFlightSince: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
      claimId: z.string().min(1).nullable().default(null),
      consecutiveFailures: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      lastOutcome: z.object({ claimId: z.string(), ok: z.boolean(), summary: z.string(), sessionId: z.string().optional() }).nullable().default(null)
    }).strict()
  )
}).strict();

type ScheduleState = z.infer<typeof stateSchema>;

export function schedulesPath(workspace: string): string {
  return join(workspace, ".amc", "schedules.yaml");
}

/** Mutable run state. NOT signed: it records what happened, it authorises nothing. */
function statePath(workspace: string): string {
  return join(workspace, ".amc", "schedule-state.json");
}

/** Short transaction lock, never stolen by age or PID. A crash requires operator investigation. */
export function scheduleLockPath(workspace: string): string {
  return join(workspace, ".amc", "schedule-store.lock");
}

class ScheduleStoreBusyError extends Error {}

function withStoreLock<T>(workspace: string, operation: () => T): T {
  ensureDir(join(workspace, ".amc"));
  let fd: number;
  try { fd = openSync(scheduleLockPath(workspace), "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new ScheduleStoreBusyError(`Schedule store is locked at ${scheduleLockPath(workspace)} by another transaction or an interrupted owner. Stop competing owners and investigate the lock; it is never automatically stolen.`);
    }
    throw error;
  }
  try { return operation(); }
  finally { try { closeSync(fd); } finally { unlinkSync(scheduleLockPath(workspace)); } }
}

export function assertScheduleOwner(workspace: string): void {
  if (getMode(workspace) !== "owner") throw new Error("Native schedule mutation/execution is blocked in agent mode. An operator must deliberately select amc mode owner.");
}

function assertClock(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Schedule clock must be a non-negative safe integer in Unix milliseconds.");
}

function writeSchedules(workspace: string, schedules: readonly unknown[]): void {
  const parsed = schedulesSchema.parse(schedules);
  writeFileAtomic(schedulesPath(workspace), YAML.stringify({ schedules: parsed }), 0o644);
  signFileWithAuditor(workspace, schedulesPath(workspace));
}

export function initSchedules(workspace: string): void {
  assertScheduleOwner(workspace);
  withStoreLock(workspace, () => {
    const existing = readSchedules(workspace);
    if (!existing.ok) throw new Error(existing.reason);
    if (existing.digest === "absent") writeSchedules(workspace, []);
  });
}

export function saveSchedules(workspace: string, schedules: readonly unknown[]): void {
  assertScheduleOwner(workspace);
  withStoreLock(workspace, () => {
    const existing = readSchedules(workspace);
    if (!existing.ok) throw new Error(existing.reason);
    assertNoActiveClaims(workspace);
    writeSchedules(workspace, schedules);
  });
}

export type ReadSchedules =
  | { readonly ok: true; readonly schedules: readonly Schedule[]; readonly digest: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Read the signed schedule file, or refuse it.
 *
 * Fail closed on a bad signature: an unsigned or edited schedule file is an
 * unattended agent somebody could have added, and the safe reading of "I cannot
 * verify who authorised this" is not "run it anyway".
 */
export function readSchedules(workspace: string): ReadSchedules {
  const path = schedulesPath(workspace);
  if (!pathExists(path)) return { ok: true, schedules: [], digest: "absent" };

  try {
    const bytes = readUtf8(path);
    const signature = verifySignedFileWithAuditor(workspace, path);
    if (!signature.valid) {
      return {
        ok: false,
        reason: `${path} failed signature verification (${signature.reason ?? "unknown"}); refusing to run unattended agents it may authorise`
      };
    }
    if (bytes !== readUtf8(path)) throw new Error("schedule configuration changed during verification");
    const parsed = z.object({ schedules: schedulesSchema.default([]) }).strict()
      .parse(YAML.parse(bytes) ?? {});
    return { ok: true, schedules: parsed.schedules, digest: createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    return { ok: false, reason: `${path} could not be read: ${String(error)}` };
  }
}

function readState(workspace: string): ScheduleState {
  const path = statePath(workspace);
  if (!pathExists(path)) return { schedules: {} };
  try {
    const raw: unknown = JSON.parse(readUtf8(path));
    const rawSchedules = (raw as { schedules?: unknown } | null)?.schedules;
    if (rawSchedules !== null && typeof rawSchedules === "object") {
      for (const id of Object.keys(rawSchedules)) scheduleIdSchema.parse(id);
    }
    const state = stateSchema.parse(raw);
    for (const [id, entry] of Object.entries(state.schedules)) {
      scheduleIdSchema.parse(id);
      if ((entry.inFlightSince === null && entry.claimId !== null)
        || (entry.inFlightSince !== null && entry.lastClaimedTs !== entry.inFlightSince)) {
        throw new Error("inconsistent claim state");
      }
    }
    return state;
  } catch {
    // Empty history would make completed work due again, or lose an active owner.
    throw new Error(`${path} is unreadable or inconsistent; unattended execution is refused. Preserve it and reconcile the interrupted/last claimed runs before recovery.`);
  }
}

function writeState(workspace: string, state: ScheduleState): void {
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(statePath(workspace), JSON.stringify(state, null, 2), 0o600);
}

function entryFor(state: ScheduleState, id: string) {
  return Object.hasOwn(state.schedules, id) ? state.schedules[id]!
    : { lastClaimedTs: null, inFlightSince: null, claimId: null, consecutiveFailures: 0, lastOutcome: null };
}

/** The schedules that may be claimed now. Empty when the file does not verify. */
export function dueSchedules(workspace: string, now: number): readonly Schedule[] {
  assertClock(now);
  const read = readSchedules(workspace);
  if (!read.ok) return [];
  const state = readState(workspace);

  return read.schedules.filter((schedule) => {
    if (!schedule.enabled) return false;
    const entry = entryFor(state, schedule.id);
    if (entry.inFlightSince !== null) return false;
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return false;
    if (entry.lastClaimedTs === null) return true;
    return now - entry.lastClaimedTs >= schedule.everyMs;
  });
}

export type ClaimResult =
  | { readonly ok: true; readonly schedule: Schedule; readonly claimId: string; readonly configDigest: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Take a schedule's next run, exclusively.
 *
 * The cadence advances HERE — see the module note. Two processes polling the
 * same workspace must not both run one schedule, so a claim while another is in
 * flight is refused rather than queued.
 */
export function claimDueRun(workspace: string, scheduleId: string, now: number, expectedDigest?: string): ClaimResult {
  assertClock(now);
  try {
    assertScheduleOwner(workspace);
    return withStoreLock(workspace, () => claimLocked(workspace, scheduleId, now, expectedDigest));
  }
  catch (error) {
    if (error instanceof ScheduleStoreBusyError) return { ok: false, reason: error.message };
    // An I/O/cleanup failure can occur after writing the claim. It is not an
    // ordinary lost race and must never be reported as definitely not claimed.
    throw error;
  }
}

function claimLocked(workspace: string, scheduleId: string, now: number, expectedDigest?: string): ClaimResult {
  const read = readSchedules(workspace);
  if (!read.ok) return { ok: false, reason: read.reason };
  if (expectedDigest !== undefined && read.digest !== expectedDigest) return { ok: false, reason: "Signed schedules changed since admission; review the new configuration and restart explicitly." };
  const schedule = read.schedules.find((one) => one.id === scheduleId);
  if (!schedule) return { ok: false, reason: `no schedule ${JSON.stringify(scheduleId)}` };
  if (!schedule.enabled) return { ok: false, reason: `schedule ${scheduleId} is disabled` };
  if (!Number.isSafeInteger(now + schedule.everyMs)) return { ok: false, reason: "Schedule cadence exceeds the representable clock range; no claim was created." };

  const state = readState(workspace);
  const entry = entryFor(state, scheduleId);
  if (entry.inFlightSince !== null) {
    return { ok: false, reason: `schedule ${scheduleId} already has a run in flight since ${entry.inFlightSince}` };
  }
  if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return {
      ok: false,
      reason: `schedule ${scheduleId} stopped after ${entry.consecutiveFailures} consecutive failures; it will not run again until one succeeds or an operator resets it`
    };
  }
  if (entry.lastClaimedTs !== null && now - entry.lastClaimedTs < schedule.everyMs) {
    return { ok: false, reason: `schedule ${scheduleId} is not due until ${entry.lastClaimedTs + schedule.everyMs}` };
  }

  const claimId = randomUUID();
  state.schedules[scheduleId] = {
    ...entry,
    lastClaimedTs: now,
    inFlightSince: now,
    claimId
  };
  writeState(workspace, state);
  return { ok: true, schedule, claimId, configDigest: read.digest };
}

/** Close a claimed run. A failure counts toward the consecutive-failure stop. */
export function completeRun(
  workspace: string,
  scheduleId: string,
  outcome: { readonly ok: boolean; readonly summary: string; readonly sessionId?: string },
  claimId: string
): void {
  withStoreLock(workspace, () => {
    const state = readState(workspace);
    const entry = entryFor(state, scheduleId);
    if (entry.inFlightSince === null || !claimId || entry.claimId !== claimId) {
      throw new Error(`Refusing completion of schedule ${scheduleId}: no matching owned claim; its state was not changed.`);
    }
    state.schedules[scheduleId] = {
      lastClaimedTs: entry.lastClaimedTs,
      inFlightSince: null,
      claimId: null,
      lastOutcome: { claimId, ok: outcome.ok, summary: outcome.summary.slice(0, 4096),
        ...(outcome.sessionId === undefined ? {} : { sessionId: outcome.sessionId }) },
      // One success clears the count: suspension is for a schedule broken now.
      consecutiveFailures: outcome.ok ? 0 : entry.consecutiveFailures + 1
    };
    writeState(workspace, state);
  });
}

export interface InterruptedClaim {
  readonly scheduleId: string;
  readonly claimedTs: number;
  /** Null identifies a legacy claim; no new owner may silently complete it. */
  readonly claimId: string | null;
}

/**
 * Runs that were claimed and never closed.
 *
 * The honest signature of a process that died mid-run, and the reason advancing
 * the clock at claim time is not simply losing work quietly: the claim stays,
 * and an operator can see exactly which schedule stopped and when.
 */
export function interruptedClaims(workspace: string): readonly InterruptedClaim[] {
  const state = readState(workspace);
  const open: InterruptedClaim[] = [];
  for (const [scheduleId, entry] of Object.entries(state.schedules)) {
    if (entry.inFlightSince !== null) open.push({ scheduleId, claimedTs: entry.inFlightSince, claimId: entry.claimId });
  }
  return open;
}

function assertNoActiveClaims(workspace: string): void {
  if (interruptedClaims(workspace).length > 0) throw new Error("Schedule configuration cannot be replaced while claims are active or interrupted. Stop the owner and reconcile its closure first.");
}

export type ScheduleChange =
  | { kind: "put"; schedule: unknown }
  | { kind: "enable" | "disable" | "remove" | "reset-failures"; id: string };

/** Explicit owner operation. Neither a reader nor a running timer can sign policy. */
export function manageSchedule(workspace: string, expectedDigest: string, change: ScheduleChange): void {
  assertScheduleOwner(workspace);
  withStoreLock(workspace, () => {
    const read = readSchedules(workspace);
    if (!read.ok) throw new Error(read.reason);
    if (read.digest !== expectedDigest) throw new Error("Schedule configuration digest changed. Run native-schedule list and review before applying an update.");
    const schedules = [...read.schedules];
    const incoming = change.kind === "put" ? scheduleSchema.parse(change.schedule) : undefined;
    const id = incoming?.id ?? (change as { id: string }).id;
    scheduleIdSchema.parse(id);
    const state = readState(workspace);
    const entry = entryFor(state, id);
    // Disable is a future-admission change only; it does not pretend to cancel a live owner.
    if (entry.inFlightSince !== null && change.kind !== "disable") throw new Error(`Schedule ${id} has an active or interrupted claim. No replacement, deletion, reset or enable was performed.`);
    const index = schedules.findIndex(schedule => schedule.id === id);
    if (change.kind === "put") {
      if (index < 0) schedules.push(incoming!); else schedules[index] = incoming!;
    } else {
      if (index < 0) throw new Error(`No schedule ${JSON.stringify(id)}`);
      if (change.kind === "reset-failures") {
        state.schedules[id] = { ...entry, consecutiveFailures: 0 };
        writeState(workspace, state); // Preserve cadence, claim history and last outcome.
        return;
      }
      if (change.kind === "remove") schedules.splice(index, 1);
      else schedules[index] = { ...schedules[index]!, enabled: change.kind === "enable" };
    }
    writeSchedules(workspace, schedules);
  });
}

/** Status is operational metadata, not signed execution proof or independent verification. */
export function scheduleStatus(workspace: string, now: number) {
  assertClock(now);
  const read = readSchedules(workspace);
  if (!read.ok) throw new Error(read.reason);
  const state = readState(workspace);
  return {
    configDigest: read.digest, now,
    schedules: read.schedules.map(schedule => {
      const entry = entryFor(state, schedule.id);
      const nextDue = entry.lastClaimedTs === null ? null : entry.lastClaimedTs + schedule.everyMs;
      const nextDueTs = nextDue === null || Number.isSafeInteger(nextDue) ? nextDue : null;
      return { ...schedule, ...entry, nextDueTs,
        clockRangeExceeded: nextDue !== null && !Number.isSafeInteger(nextDue),
        due: schedule.enabled && entry.inFlightSince === null && entry.consecutiveFailures < MAX_CONSECUTIVE_FAILURES
          && (entry.lastClaimedTs === null || now - entry.lastClaimedTs >= schedule.everyMs) };
    }),
    interrupted: interruptedClaims(workspace),
    boundary: "Operational state, not independent evidence verification. In-flight claims can be live or interrupted; no automatic retry or stale-owner takeover."
  };
}
