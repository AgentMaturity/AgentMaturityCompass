import { runGoalRounds } from "./goalRounds.js";
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
}

export interface ScheduleRunResult {
  readonly scheduleId: string;
  readonly ok: boolean;
  readonly rounds: number;
  readonly stoppedBy: string;
  readonly reason: string;
}

export async function runDueSchedules(init: RunDueSchedulesInit): Promise<ScheduleRunResult[]> {
  const results: ScheduleRunResult[] = [];

  for (const schedule of dueSchedules(init.workspace, init.now)) {
    const claim = claimDueRun(init.workspace, schedule.id, init.now);
    if (!claim.ok) {
      // Lost a race, or the store refused between the two calls. Not an error:
      // another process holding the claim is the mechanism working.
      results.push({
        scheduleId: schedule.id, ok: false, rounds: 0, stoppedBy: "not-claimed", reason: claim.reason
      });
      continue;
    }

    // The scope is validated HERE rather than trusted from the file. It is
    // signed, so it is authentic — but authentic is not the same as valid, and a
    // scope the runtime cannot read would otherwise reach `spawnSubagent` and be
    // refused there, after the claim was already spent.
    const scope = schedule.scope === undefined ? undefined : parseDelegationScope(schedule.scope);
    if (scope !== undefined && !scope.ok) {
      completeRun(init.workspace, schedule.id, { ok: false, summary: scope.reason });
      results.push({
        scheduleId: schedule.id, ok: false, rounds: 0, stoppedBy: "refused", reason: scope.reason
      });
      continue;
    }

    try {
      const outcome = await runGoalRounds({
        workspace: init.workspace,
        parent: init.parent,
        session: init.session,
        runner: init.runner,
        mintSessionId: init.mintSessionId,
        runAs: schedule.runAs,
        goal: schedule.goal,
        maxRounds: schedule.maxRounds,
        ...(scope === undefined || !scope.ok ? {} : { scope: scope.classes }),
        ...(init.signal === undefined ? {} : { signal: init.signal })
      });

      const ok = outcome.stoppedBy === "done" || outcome.stoppedBy === "max-rounds";
      completeRun(init.workspace, schedule.id, { ok, summary: outcome.reason });
      results.push({
        scheduleId: schedule.id,
        ok,
        rounds: outcome.rounds,
        stoppedBy: outcome.stoppedBy,
        reason: outcome.reason
      });
    } catch (error) {
      // THE CLAIM IS CLOSED EVEN HERE. A leaked claim wedges the schedule
      // permanently: nothing else can claim it and nothing would ever close it,
      // so one unhandled throw would silently retire a schedule an operator
      // believes is running.
      const reason = `the driver threw: ${error instanceof Error ? error.message : String(error)}`;
      completeRun(init.workspace, schedule.id, { ok: false, summary: reason });
      results.push({ scheduleId: schedule.id, ok: false, rounds: 0, stoppedBy: "failed", reason });
    }
  }

  return results;
}
