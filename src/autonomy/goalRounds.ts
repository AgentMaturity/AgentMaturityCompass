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
 * THE TWO KINDS OF STOP, and why they are not interchangeable:
 *
 *   - MECHANICAL — `maxRounds`, a failed round, cancellation. These are facts
 *     about what happened, and they bind by construction.
 *   - JUDGED — `isDone`, which reads the agent's own claim that the work is
 *     finished. A claim may only SHORTEN a run. Believing one early costs a
 *     missed round; letting one extend a run would make the bound whatever the
 *     model says it is, which is not a bound.
 *
 * A delegated request's `stopConditions` are enforced by spawnSubagent for
 * that child's invocation count and lifetime. They are separate from this
 * driver's round ceiling: a round is one distinct delegation, while a retained
 * child may accept several continuation invocations inside its own lifetime.
 */

export type RoundStop = "max-rounds" | "done" | "human" | "failed" | "cancelled" | "refused";

export interface RoundSummary {
  /** 1-based. The round that just finished. */
  readonly round: number;
  readonly text: string;
}

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
}

export async function runGoalRounds(init: GoalRoundsInit): Promise<GoalRoundsResult> {
  if (!Number.isSafeInteger(init.maxRounds) || init.maxRounds < 1) {
    return {
      rounds: 0,
      stoppedBy: "refused",
      reason: `maxRounds must be a positive integer, got ${String(init.maxRounds)}; an autonomy driver without a ceiling is not one`,
      lastText: ""
    };
  }
  if (init.checkpointEvery !== undefined && init.checkpoint === undefined) {
    // Declaring a yield with nobody to ask is worse than declaring none: the
    // configuration says a human is in the loop, and no human is.
    return {
      rounds: 0,
      stoppedBy: "refused",
      reason: "checkpointEvery was set with no checkpoint to answer it; that configuration claims a human is in the loop when none is",
      lastText: ""
    };
  }

  let lastText = "";
  for (let round = 1; round <= init.maxRounds; round += 1) {
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
        ...(init.scope === undefined ? {} : { delegationScope: init.scope })
      },
      session: init.session,
      runner: init.runner,
      mintSessionId: init.mintSessionId,
      ...(init.maxDepth === undefined ? {} : { maxDepth: init.maxDepth }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
      ...(init.cancelGraceMs === undefined ? {} : { cancelGraceMs: init.cancelGraceMs })
    });

    if (!outcome.ok) {
      // Cancellation and failure are different stories about the same stop, and
      // an operator reading the log needs to tell "I stopped this" from "it
      // broke". `spawnSubagent` has already settled the row correctly either
      // way; this only decides what the driver reports.
      const cancelled = init.signal?.aborted === true;
      return {
        rounds: round,
        stoppedBy: cancelled ? "cancelled" : "failed",
        reason: outcome.reason,
        lastText
      };
    }

    lastText = outcome.childText;

    // The judged stop, checked BEFORE the human one: an agent that says it is
    // finished should not cost a person an interruption to confirm it.
    if (init.isDone?.(lastText) === true) {
      return { rounds: round, stoppedBy: "done", reason: "the agent reported the work finished", lastText };
    }

    const due = init.checkpointEvery !== undefined && round % init.checkpointEvery === 0;
    if (due && init.checkpoint !== undefined && round < init.maxRounds) {
      let answer: "continue" | "stop";
      try {
        answer = await init.checkpoint({ round, text: lastText });
      } catch (error) {
        // FAIL CLOSED. A checkpoint that threw is a human who was not asked, and
        // carrying on would turn an attended run into an unattended one with
        // nothing announcing the change.
        return {
          rounds: round,
          stoppedBy: "human",
          reason: `the checkpoint could not be answered: ${error instanceof Error ? error.message : String(error)}`,
          lastText
        };
      }
      if (answer === "stop") {
        return { rounds: round, stoppedBy: "human", reason: "a human stopped the run", lastText };
      }
    }
  }

  return {
    rounds: init.maxRounds,
    stoppedBy: "max-rounds",
    reason: `reached the ${init.maxRounds}-round ceiling`,
    lastText
  };
}
