import { runGoalRounds } from "./goalRounds.js";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { readContainedOrNull } from "../utils/containedFs.js";
import { join, resolve } from "node:path";
import { assertObjectiveSchedule, beginObjectiveRound, finishObjectiveRound, readObjective, stopObjective,
  type ObjectiveRecord, type ObjectiveRoundAuthority } from "./objectiveStore.js";
import { assertScheduleClaim, claimDueRun, completeRun, dueSchedules, type Schedule } from "./scheduleStore.js";
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
  readonly outcome?: "completed" | "exhausted" | "failed";
  readonly answerHashes?: readonly string[];
}

export async function runDueSchedules(init: RunDueSchedulesInit): Promise<ScheduleRunResult[]> {
  const results: ScheduleRunResult[] = [];

  for (const candidate of dueSchedules(init.workspace, init.now)) {
    if (init.signal?.aborted) break; // Do not spend the next occurrence after cancellation.
    if (candidate.objective !== undefined) {
      try { admitObjective(init, candidate); }
      catch (error) {
        results.push({ scheduleId: candidate.id, ok: false, rounds: 0, stoppedBy: "not-claimed",
          reason: error instanceof Error ? error.message : String(error), outcome: "failed" });
        continue;
      }
    }
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

    let objective: ObjectiveRecord | undefined;
    let authority: ObjectiveRoundAuthority | undefined;
    let checkStatus: "complete" | "failed" | "unavailable" = "unavailable";
    let currentRound = 0;
    const active = new Set<Promise<unknown>>();
    const childSessionIds: string[] = [];
    // spawnSubagent may settle cancellation before an uncooperative runner exits.
    // A scheduler must retain the claim and its owning operation until the actual
    // runner settles, not mistake an abort request for process closure.
    const ownedRunner: SubagentRunner = async (ctx) => {
      assertScheduleClaim(init.workspace, schedule.id, claim.claimId, claim.configDigest);
      if (objective !== undefined) {
        const current = readObjective(init.workspace, schedule.id);
        if (current === null || current.revision !== objective.revision || current.status !== "active"
          || current.currentRound?.sessionId !== ctx.childSessionId) throw new Error("Objective round authority changed before dispatch.");
      }
      childSessionIds.push(ctx.childSessionId);
      const operation = Promise.resolve().then(() => init.runner({ ...ctx, getGoal: () => {
        assertScheduleClaim(init.workspace, schedule.id, claim.claimId, claim.configDigest);
        const current = schedule.objective === undefined ? undefined : readObjective(init.workspace, schedule.id);
        if (current === null) throw new Error("Configured objective record is unavailable; no active status is implied.");
        return { scheduleId: schedule.id, claimId: claim.claimId, round: current?.roundsUsed ?? currentRound,
          maxRounds: schedule.maxRounds, status: current?.status ?? "active", stopReason: current?.lastStopReason ?? null,
          revision: current?.revision ?? null, sessionId: ctx.childSessionId };
      } }));
      active.add(operation);
      try { return await operation; } finally { active.delete(operation); }
    };
    let result: ScheduleRunResult;
    try {
      objective = schedule.objective === undefined ? undefined : admitObjective(init, schedule);
      const remaining = objective === undefined ? schedule.maxRounds : objective.maxRounds - objective.roundsUsed;
      const outcome = await runGoalRounds({
        workspace: init.workspace,
        parent: init.parent,
        session: init.session,
        runner: ownedRunner,
        mintSessionId: init.mintSessionId,
        runAs: schedule.runAs,
        goal: schedule.goal,
        maxRounds: remaining,
        beforeRound: async ({ round, sessionId }) => {
          assertScheduleClaim(init.workspace, schedule.id, claim.claimId, claim.configDigest);
          currentRound = round;
          if (objective !== undefined) {
            authority = { claimId: claim.claimId, configDigest: claim.configDigest, round: objective.roundsUsed + 1, sessionId };
            objective = await beginObjectiveRound(init.workspace, schedule.id, objective.revision, authority);
          }
          assertScheduleClaim(init.workspace, schedule.id, claim.claimId, claim.configDigest);
        },
        ...(schedule.objective === undefined ? {} : { afterRound: async () => {
          assertScheduleClaim(init.workspace, schedule.id, claim.claimId, claim.configDigest);
          checkStatus = objectiveCompletionCheck(init.workspace, schedule.objective!.completionCheck);
          objective = await finishObjectiveRound(init.workspace, schedule.id, objective!.revision, authority!,
            checkStatus === "complete" ? "complete" : checkStatus === "unavailable" ? "blocked" : "active",
            `Configured completion check: ${checkStatus}`, checkStatus);
          return checkStatus === "complete" ? "complete" as const : checkStatus === "unavailable" ? "unavailable" as const : "continue" as const;
        } }),
        ...(scope === undefined || !scope.ok ? {} : { scope: scope.classes }),
        ...(init.signal === undefined ? {} : { signal: init.signal }),
        ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
      });

      const ok = outcome.stoppedBy === "done" && outcome.completionVerified;
      const classification = ok ? "completed" : outcome.stoppedBy === "max-rounds" ? "exhausted" : "failed";
      result = {
        scheduleId: schedule.id,
        ok,
        rounds: outcome.rounds,
        stoppedBy: outcome.stoppedBy,
        reason: outcome.reason,
        claimId: claim.claimId,
        childSessionIds,
        outcome: classification,
        answerHashes: outcome.answerHashes
      };
    } catch (error) {
      // THE CLAIM IS CLOSED EVEN HERE. A leaked claim wedges the schedule
      // permanently: nothing else can claim it and nothing would ever close it,
      // so one unhandled throw would silently retire a schedule an operator
      // believes is running.
      const reason = `the driver threw: ${error instanceof Error ? error.message : String(error)}`;
      result = { scheduleId: schedule.id, ok: false, rounds: currentRound, stoppedBy: "failed", reason, claimId: claim.claimId, childSessionIds, outcome: "failed" };
    } finally {
      await Promise.allSettled([...active]);
    }
    if (objective !== undefined && authority !== undefined && objective.status === "active" && !result.ok) {
      // A refused terminal write leaves a signed unresolved round. The next
      // occurrence cannot turn that uncertainty into permission for more work.
      try {
        objective = objective.currentRound === null
          ? await stopObjective(init.workspace, schedule.id, objective.revision, authority, result.reason, checkStatus)
          : await finishObjectiveRound(init.workspace, schedule.id, objective.revision, authority, "blocked", result.reason, "unavailable");
      } catch (error) {
        result = { ...result, ok: false, outcome: "failed", reason: `${result.reason}; objective settlement unavailable: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    // A failed state closer throws and leaves the claim visible. Never catch it
    // as a driver failure and attempt a second, different completion.
    init.session.recordProjectedEvidence({ eventType: "audit", payload: "Native schedule execution settled; operational claim closure follows",
      meta: { ...evidence, type: "native_schedule_execution_settled", ok: result.ok, rounds: result.rounds,
        stoppedBy: result.stoppedBy, outcome: result.outcome, answerHashes: result.answerHashes ?? [], childSessionIds } });
    completeRun(init.workspace, schedule.id, { ok: result.ok, summary: result.reason, outcome: result.outcome ?? "failed",
      ...(init.parentSessionId === undefined ? {} : { sessionId: init.parentSessionId }) }, claim.claimId);
    results.push(result);
  }

  return results;
}

function admitObjective(init: RunDueSchedulesInit, schedule: Schedule): ObjectiveRecord {
  if (schedule.objective?.ownerPrincipal !== init.parent.governedAs) throw new Error("Signed objective owner differs from the governing root principal.");
  const record = readObjective(init.workspace, schedule.id);
  if (record === null) throw new Error("Objective is absent; an owner must explicitly create its signed record.");
  assertObjectiveSchedule(record, schedule);
  if (record.status !== "active" || record.currentRound !== null || record.roundsUsed >= record.maxRounds)
    throw new Error("Objective is paused, terminal, exhausted or has an unresolved round; explicit owner reconciliation is required.");
  return record;
}

/** A configured exact-byte check is separate from any model completion claim. */
function objectiveCompletionCheck(workspace: string, check: NonNullable<Schedule["objective"]>["completionCheck"]): "complete" | "failed" | "unavailable" {
  try {
    const path = join(resolve(workspace), check.path), before = lstatSync(path);
    const bytes = readContainedOrNull(resolve(workspace), check.path, 1_048_576), after = lstatSync(path);
    if (bytes === null || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.size !== bytes.length || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return "unavailable";
    return createHash("sha256").update(bytes).digest("hex") === check.sha256 ? "complete" : "failed";
  } catch { return "unavailable"; }
}
