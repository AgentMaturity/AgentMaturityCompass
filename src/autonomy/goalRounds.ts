import { createHash } from "node:crypto";
import { spawnSubagent } from "../agent/subagentSpawn.js";
import type { DelegationRecorder, SubagentRunner } from "../agent/subagentSpawn.js";
import type { DelegationIdentity } from "../agent/delegationIdentity.js";
import type { ActionClass } from "../types.js";

/**
 * Goal rounds — the autonomy driver (plan P6.1d).
 *
 * Run one agent repeatedly toward a goal, each round seeing the last round's
 * answer. This is the "ralph loop" shape: progress by repetition rather than by
 * a single long turn.
 *
 * THIS IS THE PLACE NOBODY IS WATCHING, and every design choice below follows
 * from that. A driver runs an agent with no human in the turn, so its bounds
 * cannot be advice — they have to be the kind a model cannot talk its way past,
 * and the failures have to close rather than open.
 *
 * THE KINDS OF STOP, and why they are not interchangeable:
 *
 *   - MECHANICAL — `maxRounds`, repeated answers, a failed round, cancellation. These are facts
 *     about what happened, and they bind by construction.
 *   - JUDGED — `isDone`, which reads the agent's own claim that the work is
 *     finished. A claim may only SHORTEN a run. Believing one early costs a
 *     missed round; letting one extend a run would make the bound whatever the
 *     model says it is, which is not a bound.
 *
 *   - VERIFIED — a configured `afterRound` check, evaluated outside the agent's
 *     completion claim. Missing or failed checks cannot prove completion.
 *
 * A delegated request's `stopConditions` are enforced by spawnSubagent for
 * that child's invocation count and lifetime. They are separate from this
 * driver's round ceiling: a round is one distinct delegation, while a retained
 * child may accept several continuation invocations inside its own lifetime.
 */

export const MAX_GOAL_ROUNDS = 256;

export type RoundStop = "max-rounds" | "done" | "blocked" | "human" | "failed" | "cancelled" | "refused"
  | "check-failed" | "check-unavailable";

export interface RoundIdentity {
  /** 1-based. The round being admitted or just finished. */
  readonly round: number;
  /** Minted once before admission and used by the actual child delegation. */
  readonly sessionId: string;
}

export interface RoundSummary extends RoundIdentity {
  readonly text: string;
  /** SHA-256 of the answer after trimming and collapsing whitespace. */
  readonly answerHash: string;
}

type RoundCheck = "complete" | "failed" | "unavailable" | "continue";

export interface GoalRoundsInit {
  readonly workspace: string;
  readonly parent: DelegationIdentity;
  readonly session: DelegationRecorder;
  readonly runner: SubagentRunner;
  readonly mintSessionId: () => string;
  readonly runAs: string;
  readonly goal: string;
  /** The hard ceiling. Nothing extends it. */
  readonly maxRounds: number;
  readonly scope?: readonly ActionClass[];
  /** The operator's signed child stop conditions, applied to every round's delegation. */
  readonly stopConditions?: readonly string[];
  readonly maxDepth?: number;
  /** Ask a human every N rounds. Requires `checkpoint`. */
  readonly checkpointEvery?: number;
  /**
   * The human. Awaited, with no default answer and no timeout.
   *
   * A yield that proceeds when nobody answers is not a yield, so there is
   * deliberately no way to configure one: an unanswered checkpoint is an
   * unfinished promise, and the loop simply does not advance.
   */
  readonly checkpoint?: (summary: RoundSummary) => Promise<"continue" | "stop">;
  /** Persist and re-admit this exact round before any delegation effect. Throws refuse dispatch. */
  readonly beforeRound?: (identity: RoundIdentity) => void | Promise<void>;
  /** A configured trusted check, distinct from the agent's own completion claim. */
  readonly afterRound?: (summary: RoundSummary) => RoundCheck | Promise<RoundCheck>;
  readonly isDone?: (text: string) => boolean;
  readonly signal?: AbortSignal;
  readonly cancelGraceMs?: number;
}

export interface GoalRoundsResult {
  readonly rounds: number;
  readonly stoppedBy: RoundStop;
  readonly reason: string;
  /** The last answer produced. Empty when no round completed. */
  readonly lastText: string;
  /** All successful round answers, including the answer that caused a stop. */
  readonly answerHashes: readonly string[];
  /** The exact most recently admitted or attempted round identity, when one was minted. */
  readonly lastRound?: RoundIdentity;
  /** True only when the configured trusted check reported complete. */
  readonly completionVerified: boolean;
}

export async function runGoalRounds(init: GoalRoundsInit): Promise<GoalRoundsResult> {
  // Keep the admitted ceiling stable across asynchronous hooks and runner calls.
  const maxRounds = init.maxRounds;
  let lastText = "";
  let lastRound: RoundIdentity | undefined;
  const answerHashes: string[] = [];
  let identicalAnswers = 0;
  const isCancelled = (): boolean => init.signal?.aborted === true;
  const stop = (rounds: number, stoppedBy: RoundStop, reason: string, completionVerified = false): GoalRoundsResult => ({
    rounds, stoppedBy, reason, lastText, answerHashes, completionVerified,
    ...(lastRound === undefined ? {} : { lastRound })
  });

  if (!Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > MAX_GOAL_ROUNDS) {
    return stop(0, "refused",
      `maxRounds must be an integer between 1 and ${MAX_GOAL_ROUNDS}, got ${String(maxRounds)}; an autonomy driver without a ceiling is not one`);
  }
  if (init.checkpointEvery !== undefined && init.checkpoint === undefined) {
    // Declaring a yield with nobody to ask is worse than declaring none: the
    // configuration says a human is in the loop, and no human is.
    return stop(0, "refused",
      "checkpointEvery was set with no checkpoint to answer it; that configuration claims a human is in the loop when none is");
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    if (isCancelled()) {
      return stop(round - 1, "cancelled", "parent gave up before the round was admitted");
    }
    let identity: RoundIdentity;
    try {
      identity = Object.freeze({ round, sessionId: init.mintSessionId() });
      lastRound = identity;
      await init.beforeRound?.(identity);
    } catch (error) {
      return stop(round - 1, "refused",
        `the round could not be admitted: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (isCancelled()) {
      return stop(round - 1, "cancelled", "parent gave up while the round was being admitted");
    }
    const outcome = await spawnSubagent({
      workspace: init.workspace,
      parent: init.parent,
      request: {
        runAs: init.runAs,
        // A delegate sees none of this loop, so the previous answer has to
        // travel in the goal or it does not travel at all.
        goal: round === 1
          ? init.goal
          : `${init.goal}\n\nWhat the previous round produced:\n${lastText}`,
        ...(init.scope === undefined ? {} : { delegationScope: init.scope }),
        ...(init.stopConditions === undefined ? {} : { stopConditions: init.stopConditions })
      },
      session: init.session,
      runner: init.runner,
      mintSessionId: () => identity.sessionId,
      ...(init.maxDepth === undefined ? {} : { maxDepth: init.maxDepth }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
      ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
    });

    if (!outcome.ok) {
      // spawnSubagent already settled the delegation; report why the driver stops.
      return stop(round, isCancelled() ? "cancelled" : "failed", outcome.reason);
    }

    lastText = outcome.childText;
    const answerHash = createHash("sha256").update(lastText.trim().replace(/\s+/gu, " ")).digest("hex");
    identicalAnswers = answerHashes.at(-1) === answerHash ? identicalAnswers + 1 : 1;
    answerHashes.push(answerHash);
    const summary: RoundSummary = Object.freeze({ ...identity, text: lastText, answerHash });

    // Trusted checks run even on the final/repeated answer, so the durable owner
    // can record the exact round before the driver makes any terminal decision.
    if (init.afterRound !== undefined) {
      let checked: RoundCheck;
      try {
        checked = await init.afterRound(summary);
      } catch (error) {
        return stop(round, "check-unavailable",
          `the configured completion check was unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (checked === "complete") {
        return stop(round, "done", "the configured completion check passed", true);
      }
      if (checked === "failed") {
        return stop(round, "check-failed", "the configured completion check failed");
      }
      if (checked !== "continue") {
        return stop(round, "check-unavailable", "the configured completion check was unavailable or returned an unknown result");
      }
    }

    if (identicalAnswers >= 3) {
      return stop(round, "blocked", "three consecutive rounds produced the same normalized answer");
    }

    // A judged claim only shortens the run; it cannot prove objective completion.
    if (init.isDone?.(lastText) === true) {
      return stop(round, "done", "the agent reported the work finished");
    }

    const due = init.checkpointEvery !== undefined && round % init.checkpointEvery === 0;
    if (due && init.checkpoint !== undefined && round < maxRounds) {
      let answer: "continue" | "stop";
      try {
        answer = await init.checkpoint(summary);
      } catch (error) {
        // An unanswered human checkpoint must never become unattended authority.
        return stop(round, "human",
          `the checkpoint could not be answered: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (answer === "stop") {
        return stop(round, "human", "a human stopped the run");
      }
    }
  }

  return stop(maxRounds, "max-rounds", `reached the ${maxRounds}-round ceiling`);
}
