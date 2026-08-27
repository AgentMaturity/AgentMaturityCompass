import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";

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

const scheduleSchema = z.object({
  id: z.string().min(1),
  runAs: z.string().min(1),
  goal: z.string().min(1),
  /** The ceiling for this schedule's goal-rounds driver. */
  maxRounds: z.number().int().min(1),
  /** Cadence. The soonest a schedule may run again after being claimed. */
  everyMs: z.number().int().min(1_000),
  enabled: z.boolean().default(true),
  scope: z.array(z.string()).optional()
});

export type Schedule = z.infer<typeof scheduleSchema>;

const stateSchema = z.object({
  schedules: z.record(
    z.string(),
    z.object({
      /** When the last run was CLAIMED. The cadence counts from here. */
      lastClaimedTs: z.number().nullable().default(null),
      /** Set while a run is in flight; cleared on completion. */
      inFlightSince: z.number().nullable().default(null),
      consecutiveFailures: z.number().int().min(0).default(0)
    })
  ).default({})
});

type ScheduleState = z.infer<typeof stateSchema>;

export function schedulesPath(workspace: string): string {
  return join(workspace, ".amc", "schedules.yaml");
}

/** Mutable run state. NOT signed: it records what happened, it authorises nothing. */
function statePath(workspace: string): string {
  return join(workspace, ".amc", "schedule-state.json");
}

export function initSchedules(workspace: string): void {
  ensureDir(join(workspace, ".amc"));
  if (!pathExists(schedulesPath(workspace))) saveSchedules(workspace, []);
}

export function saveSchedules(workspace: string, schedules: readonly unknown[]): void {
  ensureDir(join(workspace, ".amc"));
  const parsed = schedules.map((one) => scheduleSchema.parse(one));
  writeFileAtomic(schedulesPath(workspace), YAML.stringify({ schedules: parsed }), 0o644);
  signFileWithAuditor(workspace, schedulesPath(workspace));
}

export type ReadSchedules =
  | { readonly ok: true; readonly schedules: readonly Schedule[] }
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
  if (!pathExists(path)) return { ok: true, schedules: [] };

  const signature = verifySignedFileWithAuditor(workspace, path);
  if (!signature.valid) {
    return {
      ok: false,
      reason: `${path} failed signature verification (${signature.reason ?? "unknown"}); refusing to run unattended agents it may authorise`
    };
  }
  try {
    const parsed = z.object({ schedules: z.array(scheduleSchema).default([]) })
      .parse(YAML.parse(readUtf8(path)) ?? {});
    return { ok: true, schedules: parsed.schedules };
  } catch (error) {
    return { ok: false, reason: `${path} could not be read: ${String(error)}` };
  }
}

function readState(workspace: string): ScheduleState {
  const path = statePath(workspace);
  if (!pathExists(path)) return { schedules: {} };
  try {
    return stateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
  } catch {
    // A state file that will not parse is treated as empty rather than fatal.
    // It records history, not authority: losing it costs a missed cadence, and
    // refusing to run on it would let a corrupt cache disable every schedule.
    return { schedules: {} };
  }
}

function writeState(workspace: string, state: ScheduleState): void {
  ensureDir(join(workspace, ".amc"));
  writeFileAtomic(statePath(workspace), JSON.stringify(state, null, 2), 0o600);
}

function entryFor(state: ScheduleState, id: string) {
  return state.schedules[id] ?? { lastClaimedTs: null, inFlightSince: null, consecutiveFailures: 0 };
}

/** The schedules that may be claimed now. Empty when the file does not verify. */
export function dueSchedules(workspace: string, now: number): readonly Schedule[] {
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
  | { readonly ok: true; readonly schedule: Schedule }
  | { readonly ok: false; readonly reason: string };

/**
 * Take a schedule's next run, exclusively.
 *
 * The cadence advances HERE — see the module note. Two processes polling the
 * same workspace must not both run one schedule, so a claim while another is in
 * flight is refused rather than queued.
 */
export function claimDueRun(workspace: string, scheduleId: string, now: number): ClaimResult {
  const read = readSchedules(workspace);
  if (!read.ok) return { ok: false, reason: read.reason };
  const schedule = read.schedules.find((one) => one.id === scheduleId);
  if (!schedule) return { ok: false, reason: `no schedule ${JSON.stringify(scheduleId)}` };
  if (!schedule.enabled) return { ok: false, reason: `schedule ${scheduleId} is disabled` };

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

  state.schedules[scheduleId] = {
    ...entry,
    lastClaimedTs: now,
    inFlightSince: now
  };
  writeState(workspace, state);
  return { ok: true, schedule };
}

/** Close a claimed run. A failure counts toward the consecutive-failure stop. */
export function completeRun(
  workspace: string,
  scheduleId: string,
  outcome: { readonly ok: boolean; readonly summary: string }
): void {
  const state = readState(workspace);
  const entry = entryFor(state, scheduleId);
  state.schedules[scheduleId] = {
    lastClaimedTs: entry.lastClaimedTs,
    inFlightSince: null,
    // One success clears the count: the stop is for a schedule that is broken
    // now, not for one that was broken once.
    consecutiveFailures: outcome.ok ? 0 : entry.consecutiveFailures + 1
  };
  writeState(workspace, state);
}

export interface InterruptedClaim {
  readonly scheduleId: string;
  readonly claimedTs: number;
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
    if (entry.inFlightSince !== null) open.push({ scheduleId, claimedTs: entry.inFlightSince });
  }
  return open;
}
