import { runGoalRounds } from "./goalRounds.js";
import { createHash } from "node:crypto";
import { claimDueRun, completeRun, dueSchedules } from "./scheduleStore.js";
import { parseDelegationScope } from "../agent/delegationScope.js";
import type { DelegationRecorder, SubagentRunner } from "../agent/subagentSpawn.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";

/**
 * Run whatever is due (plan P6.1d).
 *
 * The join between the signed schedule file and the goal-rounds driver, and
 * deliberately the only place the two meet: everything about WHETHER a run may
 * happen lives in `./scheduleStore.ts`, and everything about how far it may go
 * lives in `./goalRounds.ts`. This decides neither.
 *
 * ONE PASS, NOT A LOOP. There is no daemon here and no polling. A caller decides
 * when to ask — a cron entry, a supervisor, a CLI invocation — and each ask runs
 * what is due at that instant. A long-lived poller is a separate surface with its
 * own failure modes, and building one behind this function would hide them.
 */

export interface RunDueSchedulesInit {
  readonly workspace: string;
  readonly parent: DelegationIdentity;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  readonly mintSessionId: () => string;
  readonly now: number;
  readonly signal?: AbortSignal;
  /** Public owners pin reviewed policy; a changed file cannot silently expand a running pass. */
  readonly expectedSchedulesDigest?: string;
  readonly parentSessionId?: string;
  /** Cancellation settlement grace is not permission to release a still-active claim. */
  readonly cancelGraceMs?: number;
}

export interface ScheduleRunResult {
  readonly scheduleId: string;
  readonly ok: boolean;
  readonly rounds: number;
  readonly stoppedBy: string;
  readonly reason: string;
  readonly claimId?: string;
  readonly childSessionIds?: readonly string[];
}

export async function runDueSchedules(init: RunDueSchedulesInit): Promise<ScheduleRunResult[]> {
  const results: ScheduleRunResult[] = [];

  for (const candidate of dueSchedules(init.workspace, init.now)) {
    if (init.signal?.aborted) break; // Do not spend the next occurrence after cancellation.
    const claim = claimDueRun(init.workspace, candidate.id, init.now, init.expectedSchedulesDigest);
    if (!claim.ok) {
      // Lost a race, or the store refused between the two calls. Not an error:
      // another process holding the claim is the mechanism working.
      results.push({
        scheduleId: candidate.id, ok: false, rounds: 0, stoppedBy: "not-claimed", reason: claim.reason
      });
      continue;
    }

    const schedule = claim.schedule; // Use the configuration actually admitted under the lock.
    const evidence = { agentId: init.parent.governedAs, scheduleId: schedule.id, claimId: claim.claimId,
      schedulesDigest: claim.configDigest, parentSessionId: init.parentSessionId ?? null };
    init.session.recordProjectedEvidence({ eventType: "audit", payload: "Native schedule occurrence claimed before dispatch",
      meta: { ...evidence, type: "native_schedule_claimed", now: init.now, runAs: schedule.runAs,
        goalSha256: createHash("sha256").update(schedule.goal).digest("hex"), maxRounds: schedule.maxRounds,
        scope: schedule.scope ?? null } });
    // The scope is validated HERE rather than trusted from the file. It is
    // signed, so it is authentic — but authentic is not the same as valid, and a
    // scope the runtime cannot read would otherwise reach `spawnSubagent` and be
    // refused there, after the claim was already spent.
    const scope = schedule.scope === undefined ? undefined : parseDelegationScope(schedule.scope);
    if (scope !== undefined && !scope.ok) {
      completeRun(init.workspace, schedule.id, { ok: false, summary: scope.reason }, claim.claimId);
      results.push({
        scheduleId: schedule.id, ok: false, rounds: 0, stoppedBy: "refused", reason: scope.reason
      });
      continue;
    }

    const active = new Set<Promise<unknown>>();
    const childSessionIds: string[] = [];
    // spawnSubagent may settle cancellation before an uncooperative runner exits.
    // A scheduler must retain the claim and its owning operation until the actual
    // runner settles, not mistake an abort request for process closure.
    const ownedRunner: SubagentRunner = async (ctx) => {
      const operation = Promise.resolve().then(() => init.runner(ctx));
      active.add(operation);
      try { return await operation; } finally { active.delete(operation); }
    };
    let result: ScheduleRunResult;
    try {
      const outcome = await runGoalRounds({
        workspace: init.workspace,
        parent: init.parent,
        session: init.session,
        runner: ownedRunner,
        mintSessionId: () => { const id = init.mintSessionId(); childSessionIds.push(id); return id; },
        runAs: schedule.runAs,
        goal: schedule.goal,
        maxRounds: schedule.maxRounds,
        ...(scope === undefined || !scope.ok ? {} : { scope: scope.classes }),
        ...(init.signal === undefined ? {} : { signal: init.signal }),
        ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
      });

      const ok = outcome.stoppedBy === "done" || outcome.stoppedBy === "max-rounds";
      result = {
        scheduleId: schedule.id,
        ok,
        rounds: outcome.rounds,
        stoppedBy: outcome.stoppedBy,
        reason: outcome.reason,
        claimId: claim.claimId,
        childSessionIds
      };
    } catch (error) {
      // THE CLAIM IS CLOSED EVEN HERE. A leaked claim wedges the schedule
      // permanently: nothing else can claim it and nothing would ever close it,
      // so one unhandled throw would silently retire a schedule an operator
      // believes is running.
      const reason = `the driver threw: ${error instanceof Error ? error.message : String(error)}`;
      result = { scheduleId: schedule.id, ok: false, rounds: 0, stoppedBy: "failed", reason, claimId: claim.claimId, childSessionIds };
    } finally {
      await Promise.allSettled([...active]);
    }
    // A failed state closer throws and leaves the claim visible. Never catch it
    // as a driver failure and attempt a second, different completion.
    init.session.recordProjectedEvidence({ eventType: "audit", payload: "Native schedule execution settled; operational claim closure follows",
      meta: { ...evidence, type: "native_schedule_execution_settled", ok: result.ok, rounds: result.rounds,
        stoppedBy: result.stoppedBy, childSessionIds } });
    completeRun(init.workspace, schedule.id, { ok: result.ok, summary: result.reason,
      ...(init.parentSessionId === undefined ? {} : { sessionId: init.parentSessionId }) }, claim.claimId);
    results.push(result);
  }

  return results;
}
