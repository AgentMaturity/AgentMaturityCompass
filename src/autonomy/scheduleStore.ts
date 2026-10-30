import { join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, lstatSync, openSync, unlinkSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { parseDelegationScope } from "../agent/delegationScope.js";
import { getMode } from "../mode/mode.js";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, prepareOrgPairsAsync, OrgPairsPublicationError } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { assertSessionOwnerAvailable, readSessionWriter } from "../session/sessionOwnership.js";
import { MAX_GOAL_ROUNDS } from "./goalRounds.js";
import { calendarScheduleSchema, nextCalendarOccurrence } from "./scheduleCalendar.js";

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
const SCHEDULE_SCHEMA_VERSION = 2;

const scheduleIdSchema = z.string().min(1).max(128).refine(
  value => !["__proto__", "prototype", "constructor"].includes(value), "reserved schedule id"
);
const scheduleSchema = z.object({
  id: scheduleIdSchema,
  runAs: z.string().min(1).max(128),
  goal: z.string().min(1).max(65_536),
  /** The ceiling for this schedule's goal-rounds driver. */
  maxRounds: z.number().int().min(1).max(MAX_GOAL_ROUNDS),
  /** Cadence. The soonest a schedule may run again after being claimed. */
  everyMs: z.number().int().min(60_000).max(Number.MAX_SAFE_INTEGER).optional(),
  calendar: calendarScheduleSchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  maxConsecutiveExhausted: z.number().int().min(1).max(MAX_GOAL_ROUNDS).default(3),
  objective: z.object({
    version: z.literal(1),
    ownerPrincipal: z.string().trim().min(1).max(128),
    completionCheck: z.object({
      kind: z.literal("file-sha256"),
      path: z.string().min(1).max(4096).refine(value => value.split("/").every(part => /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,255}$/.test(part)), "completion path must use plain relative workspace path segments"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/)
    }).strict()
  }).strict().optional(),
  enabled: z.boolean().default(true),
  scope: z.array(z.string()).optional()
}).strict().refine(schedule => (schedule.everyMs === undefined) !== (schedule.calendar === undefined),
  "exactly one of everyMs or calendar is required").refine(schedule => schedule.scope === undefined || parseDelegationScope(schedule.scope).ok,
  "scope must name a nonempty set of valid action classes");

const schedulesSchema = z.array(scheduleSchema).max(256).refine(
  schedules => new Set(schedules.map(schedule => schedule.id)).size === schedules.length,
  "schedule ids must be unique"
);

export type Schedule = z.infer<typeof scheduleSchema>;

export function parseScheduleDefinition(input: unknown): Schedule { return scheduleSchema.parse(input); }

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
      consecutiveExhausted: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
      lastOutcome: z.object({ claimId: z.string(), ok: z.boolean(), summary: z.string(), sessionId: z.string().optional(),
        reason: z.literal("interrupted").optional(), auditPath: z.string().optional(),
        outcome: z.enum(["completed", "exhausted", "failed"]).optional() }).nullable().default(null)
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

export function withStoreLock<T>(workspace: string, operation: () => T): T {
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
  writeFileAtomic(schedulesPath(workspace), YAML.stringify({ version: SCHEDULE_SCHEMA_VERSION, schedules: parsed }), 0o644);
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
    const parsed = z.object({ version: z.literal(SCHEDULE_SCHEMA_VERSION).optional(), schedules: schedulesSchema.default([]) }).strict()
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
    : { lastClaimedTs: null, inFlightSince: null, claimId: null, consecutiveFailures: 0, consecutiveExhausted: 0, lastOutcome: null };
}

/** Same claim and signed policy must still authorize each next round and terminal transition. */
export function assertScheduleClaim(workspace: string, scheduleId: string, claimId: string, configDigest: string): Schedule {
  assertScheduleOwner(workspace);
  const read = readSchedules(workspace);
  if (!read.ok) throw new Error(read.reason);
  if (read.digest !== configDigest) throw new Error("Signed schedule authority changed during execution; no further round is authorized.");
  const schedule = read.schedules.find(item => item.id === scheduleId);
  const entry = entryFor(readState(workspace), scheduleId);
  if (!schedule?.enabled || entry.inFlightSince === null || entry.claimId !== claimId) throw new Error("No matching enabled schedule claim authorizes this round.");
  return schedule;
}

function calendarClockExceeded(schedule: Schedule, now: number): boolean {
  return schedule.calendar !== undefined && !Number.isFinite(new Date(now).getTime());
}

function nextDue(schedule: Schedule, lastClaimedTs: number | null): number | null {
  if (schedule.calendar !== undefined) return nextCalendarOccurrence(schedule.calendar,
    lastClaimedTs ?? Date.parse(schedule.calendar.startAt) - 1);
  const next = lastClaimedTs === null ? 0 : lastClaimedTs + schedule.everyMs!;
  return Number.isSafeInteger(next) ? next : null;
}

/** The schedules that may be claimed now. Empty when the file does not verify. */
export function dueSchedules(workspace: string, now: number): readonly Schedule[] {
  assertClock(now);
  const read = readSchedules(workspace);
  if (!read.ok) return [];
  const state = readState(workspace);

  return read.schedules.filter((schedule) => {
    if (!schedule.enabled || calendarClockExceeded(schedule, now)) return false;
    const entry = entryFor(state, schedule.id);
    if (entry.inFlightSince !== null) return false;
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return false;
    if (entry.consecutiveExhausted >= schedule.maxConsecutiveExhausted) return false;
    const next = nextDue(schedule, entry.lastClaimedTs);
    return next !== null && now >= next;
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
  if (calendarClockExceeded(schedule, now)) return { ok: false, reason: "Calendar clock range exceeds representable dates; no claim was created." };
  if (schedule.everyMs !== undefined && !Number.isSafeInteger(now + schedule.everyMs)) return { ok: false, reason: "Schedule cadence exceeds the representable clock range; no claim was created." };

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
  if (entry.consecutiveExhausted >= schedule.maxConsecutiveExhausted) {
    return { ok: false, reason: `schedule ${scheduleId} stopped after ${entry.consecutiveExhausted} consecutive exhausted occurrences; explicit operator reset required` };
  }
  const next = nextDue(schedule, entry.lastClaimedTs);
  if (next === null || now < next) {
    return { ok: false, reason: `schedule ${scheduleId} is not due${next === null ? "; no remaining occurrence" : ` until ${next}`}` };
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
  outcome: { readonly ok: boolean; readonly summary: string; readonly sessionId?: string; readonly reason?: "interrupted"; readonly auditPath?: string; readonly outcome?: "completed" | "exhausted" | "failed" },
  claimId: string
): void {
  withStoreLock(workspace, () => completeLocked(workspace, scheduleId, outcome, claimId));
}

function completeLocked(workspace: string, scheduleId: string, outcome: Parameters<typeof completeRun>[2], claimId: string): void {
  if (outcome.outcome !== undefined && outcome.ok !== (outcome.outcome === "completed")) throw new Error("Schedule success must agree with its completed/exhausted/failed outcome.");
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
      ...(outcome.sessionId === undefined ? {} : { sessionId: outcome.sessionId }),
      ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
      ...(outcome.auditPath === undefined ? {} : { auditPath: outcome.auditPath }),
      ...(outcome.outcome === undefined ? {} : { outcome: outcome.outcome }) },
    // One success clears the count: suspension is for a schedule broken now.
    consecutiveFailures: outcome.ok || outcome.outcome === "exhausted" ? 0 : entry.consecutiveFailures + 1,
    consecutiveExhausted: outcome.outcome === "exhausted" ? entry.consecutiveExhausted + 1 : 0
  };
  writeState(workspace, state);
}

/** Close only a verified dead native owner; mutable operational state cannot establish liveness. */
export async function closeInterruptedClaim(workspaceInput: string, scheduleId: string, claimId: string, expectedDigest: string): Promise<{ auditPath: string }> {
  const workspace = resolve(workspaceInput);
  const auditDirectory = join(workspace, ".amc", "schedule-closures");
  scheduleIdSchema.parse(scheduleId);
  if (typeof claimId !== "string" || claimId.length === 0) throw new Error("An exact nonempty claim id is required.");
  if (typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("An exact signed configuration digest is required.");
  const currentClaim = () => {
    assertScheduleOwner(workspace);
    const read = readSchedules(workspace);
    if (!read.ok) throw new Error(read.reason);
    if (read.digest !== expectedDigest) throw new Error("Schedule configuration digest changed. Review native-schedule list before closing an interrupted claim.");
    if (!read.schedules.some(schedule => schedule.id === scheduleId)) throw new Error("No signed schedule matches the requested claim.");
    const entry = entryFor(readState(workspace), scheduleId);
    if (entry.inFlightSince === null || entry.claimId !== claimId) throw new Error("No matching interrupted claim; its state was not changed.");
    return entry;
  };
  const authenticatedClaim = (entry: ReturnType<typeof currentClaim>) => {
    // ponytail: authenticate all available history; add a verified claim index only if recovery volume warrants it.
    const history = loadSessionEventHistory({ workspace });
    const claims = history.events.flatMap(event => {
      const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
      return event.event_type === "audit" && meta.type === "native_schedule_claimed" && meta.scheduleId === scheduleId
        ? [{ event, meta }] : [];
    });
    const selected = claims.at(-1);
    if (selected === undefined || selected.meta.claimId !== claimId || selected.meta.now !== entry.inFlightSince
      || selected.meta.parentSessionId !== selected.event.session_id
      || typeof selected.meta.schedulesDigest !== "string" || !/^[a-f0-9]{64}$/.test(selected.meta.schedulesDigest)
      || claims.filter(row => row.meta.claimId === claimId).length !== 1) {
      throw new Error("No unique latest authenticated native occurrence matches this claim; legacy or changed claims require evidence investigation.");
    }
    const owner = readSessionWriter(selected.event);
    if (owner === null || owner.state !== "active") throw new Error("The signed claim has no supported active owner; liveness cannot be established.");
    assertSessionOwnerAvailable(selected.event); // No expired-lease takeover: only demonstrably dead local owners.
    return { ...selected, owner };
  };
  const selected = withStoreLock(workspace, () => {
    const entry = currentClaim();
    return { entry, ...authenticatedClaim(entry) };
  });
  const assertCurrent = () => {
    try {
      if (!lstatSync(auditDirectory).isDirectory()) throw new Error("Schedule closure audit directory must be a real directory, not a link.");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (JSON.stringify(currentClaim()) !== JSON.stringify(selected.entry)) throw new Error("The interrupted claim changed while preparing its closure audit.");
    assertSessionOwnerAvailable(selected.event);
  };
  const auditPath = relative(workspace, join(auditDirectory, `${randomUUID()}.json`));
  const audit = { auditType: "NATIVE_SCHEDULE_CLOSE_INTERRUPTED", phase: "authorized", scheduleId, claimId,
    configDigest: expectedDigest, claimedConfigDigest: selected.meta.schedulesDigest,
    sourceEventId: selected.event.id, sourceEventHash: selected.event.event_hash, sessionId: selected.event.session_id,
    owner: selected.owner, authorizedTs: Date.now(), ok: false, reason: "interrupted",
    consecutiveFailures: selected.entry.consecutiveFailures + 1,
    boundary: "Signed closure authorization, published before the operational state write; inspect schedule status for settlement. No goal was re-run." };
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: join(workspace, auditPath), bytes: Buffer.from(JSON.stringify(audit, null, 2)) }],
    { beforePublish: assertCurrent });
  return withStoreLock(workspace, () => {
    assertCurrent();
    if (authenticatedClaim(currentClaim()).event.event_hash !== selected.event.event_hash) throw new Error("The authenticated occurrence changed while signing its closure audit.");
    prepared.publish();
    prepared.assertCurrent();
    // Audit publication must succeed before releasing the claim. A failed write leaves the signed authorization and open claim visible.
    completeLocked(workspace, scheduleId, { ok: false, summary: "interrupted: the owning process exited before closing this occurrence",
      reason: "interrupted", auditPath, sessionId: selected.event.session_id }, claimId);
    return { auditPath };
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

function updatedScheduleConfiguration(schedules: Schedule[], change: ScheduleChange, incoming: Schedule | undefined, id: string): Schedule[] {
    const index = schedules.findIndex(schedule => schedule.id === id);
    if (change.kind === "put") {
      if (index < 0) schedules.push(incoming!); else schedules[index] = incoming!;
    } else {
      if (index < 0) throw new Error(`No schedule ${JSON.stringify(id)}`);
      if (change.kind === "reset-failures") return schedules;
      if (change.kind === "remove") schedules.splice(index, 1);
      else schedules[index] = { ...schedules[index]!, enabled: change.kind === "enable" };
    }
    return schedules;
}

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
    const updated = updatedScheduleConfiguration(schedules, change, incoming, id);
    if (change.kind === "reset-failures") {
      state.schedules[id] = { ...entry, consecutiveFailures: 0, consecutiveExhausted: 0 };
      writeState(workspace, state); // Preserve cadence, claim history and last outcome.
      return;
    }
    writeSchedules(workspace, updated);
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
      const nextDueTs = nextDue(schedule, entry.lastClaimedTs);
      const clockRangeExceeded = calendarClockExceeded(schedule, now) || (schedule.everyMs !== undefined && entry.lastClaimedTs !== null
        && !Number.isSafeInteger(entry.lastClaimedTs + schedule.everyMs));
      return { ...schedule, ...entry, nextDueTs,
        clockRangeExceeded,
        due: !clockRangeExceeded && schedule.enabled && entry.inFlightSince === null && entry.consecutiveFailures < MAX_CONSECUTIVE_FAILURES
          && entry.consecutiveExhausted < schedule.maxConsecutiveExhausted && nextDueTs !== null && now >= nextDueTs };
    }),
    interrupted: interruptedClaims(workspace),
    boundary: "Operational state, not independent evidence verification. In-flight claims can be live or interrupted; no automatic retry or stale-owner takeover."
  };
}

export interface SchedulePublicationOptions { beforePublish?: () => void }
class SchedulePublicationError extends Error {
  readonly code = "SCHEDULE_CONFIG_PUBLICATION_INCOMPLETE";
  constructor(readonly phase: string, readonly nativeReturnedPaths: readonly string[], readonly publisherCompleted: boolean,
    readonly attemptedPath: string | null, cause: unknown) {
    super("schedule configuration did not finish; inspect returned members and nested publication/lock causes before retrying", { cause });
    this.name = "SchedulePublicationError";
  }
}
function assertScheduleSigningEnabled(): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize schedule configuration signing");
}
/** Same captured BUNDLE bytes and parser; historical admission is not a new execution permission. */
function capturedSchedules(workspace: string) {
  const path = schedulesPath(workspace), previous = captureOrgPairs([path]), body = orgPairBytes(previous, path), signature = orgPairBytes(previous, `${path}.sig`);
  const assertAdmission = () => {
    if (body !== null && (signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, signature).valid))
      throw new Error("the captured schedule configuration is not admitted for BUNDLE");
  };
  assertAdmission();
  const schedules = body === null ? [] : z.object({ version: z.literal(SCHEDULE_SCHEMA_VERSION).optional(), schedules: schedulesSchema.default([]) }).strict().parse(YAML.parse(body.toString("utf8")) ?? {}).schedules;
  return { previous, schedules, digest: body === null ? "absent" : createHash("sha256").update(body).digest("hex"), assertAdmission };
}
async function publishSchedulesAsync(workspace: string, selected: ReturnType<typeof capturedSchedules>, values: readonly unknown[],
  assertClaimsCurrent: () => void, options: SchedulePublicationOptions) {
  const caller = options.beforePublish, bytes = Buffer.from(YAML.stringify({ version: SCHEDULE_SCHEMA_VERSION, schedules: schedulesSchema.parse(values) }));
  const stable = () => {
    assertScheduleSigningEnabled(); caller?.(); assertScheduleOwner(workspace); assertScheduleSigningEnabled();
    selected.assertAdmission(); assertClaimsCurrent();
  };
  stable();
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: schedulesPath(workspace), bytes }], {
    beforePublish: stable, assertInputsCurrent() { stable(); assertOrgPairsCurrent(selected.previous); }
  }, selected.previous);
  let phase = "store-lock", completed = false, operationFailed = false, operationFailure: unknown;
  const returned: string[] = [];
  try {
    withStoreLock(workspace, () => {
      try {
        phase = "publication"; stable(); assertOrgPairsCurrent(selected.previous);
        const saved = prepared.publish(); returned.push(...saved.flatMap(row => [row.path, row.sigPath])); completed = true;
        phase = "final-current"; prepared.assertCurrent(); phase = "store-lock-cleanup";
      } catch (cause) { operationFailed = true; operationFailure = cause; throw cause; }
    });
    phase = "return"; prepared.assertCurrent();
  } catch (cause) {
    const nested = operationFailure instanceof OrgPairsPublicationError ? operationFailure : cause instanceof OrgPairsPublicationError ? cause : null;
    const failure = operationFailed && cause !== operationFailure
      ? new AggregateError([operationFailure, cause], "schedule publication and store-lock cleanup failed", { cause: operationFailure }) : cause;
    throw new SchedulePublicationError(phase, Object.freeze([...returned, ...(nested?.publishedPaths ?? [])]), completed,
      nested?.attemptedPath ?? null, failure);
  }
}
export async function manageScheduleAsync(workspaceInput: string, expectedDigest: string, supplied: ScheduleChange, options: SchedulePublicationOptions = {}): Promise<void> {
  const noSignAtEntry = process.env.AMC_NO_SIGN === "1";
  const workspace = resolve(workspaceInput), change = structuredClone(supplied), caller = options.beforePublish;
  if (change.kind !== "reset-failures") {
    if (noSignAtEntry) throw new Error("no-sign mode does not authorize schedule configuration signing");
    assertScheduleSigningEnabled();
  }
  caller?.(); assertScheduleOwner(workspace);
  // This existing operational-state-only branch needs no signing purpose or new await before its native write.
  if (change.kind === "reset-failures") { manageSchedule(workspace, expectedDigest, change); return; }
  assertScheduleSigningEnabled();
  let assertClaimsCurrent: () => void = () => {};
  const planned = withStoreLock(workspace, () => {
    const selected = capturedSchedules(workspace);
    if (selected.digest !== expectedDigest) throw new Error("Schedule configuration digest changed. Run native-schedule list and review before applying an update.");
    const incoming = change.kind === "put" ? scheduleSchema.parse(change.schedule) : undefined, id = incoming?.id ?? (change as { id: string }).id;
    scheduleIdSchema.parse(id);
    assertClaimsCurrent = () => {
      const entry = entryFor(readState(workspace), id);
      if (entry.inFlightSince !== null && change.kind !== "disable") throw new Error(`Schedule ${id} has an active or interrupted claim. No replacement, deletion, reset or enable was performed.`);
    };
    assertClaimsCurrent();
    return { selected, values: updatedScheduleConfiguration([...selected.schedules], change, incoming, id) };
  });
  await publishSchedulesAsync(workspace, planned.selected, planned.values, assertClaimsCurrent, { beforePublish: caller });
}
