/**
 * The approval seam's vocabulary (plan P3.3).
 *
 * Kept free of the engine it drives and of the session it writes to, so the
 * contract can be read — and implemented, by a UI or a bridge — without pulling
 * in `src/approvals/approvalChainStore.ts` or `SessionService`.
 *
 * THE ANSWER IS THREE-VALUED AND THAT IS THE WHOLE CONTRACT. `allow` is the only
 * grant. `deny` is a decision. `unavailable` means NOBODY DECIDED — the answerer
 * was missing, threw, timed out, returned something outside the union, or the
 * engine could not raise the question at all — and it FAILS CLOSED. The three
 * values are re-exported from the signed session spine rather than redeclared
 * here, so what the seam returns and what the log records are literally the same
 * union with no mapping table between them to get wrong.
 *
 * `allow_always` is deliberately absent. It was removed from the spine before
 * anything could record one: a standing grant belongs in the signed, scoped,
 * revocable approval policy, not in a per-answer flag that silently widens every
 * later request.
 */
import type { ActionClass, ExecutionMode } from "../../types.js";
import type { ApprovalAnswer } from "../../session/sessionTypes.js";

export type { ApprovalAnswer };

/** Every legal answer, for runtime normalization of what an answerer returns. */
export const APPROVAL_ANSWERS: readonly ApprovalAnswer[] = ["allow", "deny", "unavailable"];

export type ApprovalRiskTier = "low" | "medium" | "high" | "critical";

/** One permission question. */
export interface ApprovalAsk {
  /** The tool call being decided. Links the audit rows to the call already in the log. */
  readonly toolCallId: string;
  readonly toolName: string;
  /** Selects the signed approval-policy rule: how many approvers, which roles, what TTL. */
  readonly actionClass: ActionClass;
  readonly riskTier: ApprovalRiskTier;
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly question: string;
  /**
   * What is actually being asked about.
   *
   * Hashed into the engine request's `intentHash`, so a grant is bound to THESE
   * arguments: a caller that swaps the payload after the grant no longer matches
   * the approval it holds.
   */
  readonly intentPayload: Record<string, unknown>;
  /** Defaults to EXECUTE — a seam that asks permission is asking to act. */
  readonly mode?: ExecutionMode;
  readonly workOrderId?: string;
  /**
   * Withdraws the question. An aborted ask settles `unavailable` (fail closed)
   * and any approval already raised is cancelled, so an abandoned question does
   * not leave a live grant behind for something else to spend.
   */
  readonly signal?: AbortSignal;
}

/** What an answerer is shown: the ask, plus the id its answer will be paired under. */
export interface AnsweredQuestion extends ApprovalAsk {
  readonly approvalId: string;
}

/**
 * A pluggable answerer — a UI prompt, a bridge, a policy shortcut.
 *
 * ANSWERERS ABSTAIN, THEY DO NOT WRAP. There is no `next()`: an answerer either
 * claims the question by returning one of the three values, or returns `null` to
 * pass it along. That is a structural defence, not a style preference. With a
 * `next()` an answerer's containment timeout would also be running while the
 * approvals engine waited for a human — and clamping a genuine multi-approver
 * grant to `unavailable` because a wrapper's stopwatch ran out is exactly the
 * failure this seam exists to avoid. An answerer can only ever be timed out on
 * its OWN work.
 *
 * `null` is the ONLY abstention. A function that falls off its end and returns
 * `undefined` has not abstained — it has malfunctioned — and normalizes to
 * `unavailable`.
 */
export interface ApprovalAnswerer {
  /** Names this answerer in the signed `answeredBy` field. */
  readonly name: string;
  answer(question: AnsweredQuestion): Promise<ApprovalAnswer | null>;
}

/** How the seam waits, and what it thinks the time is. Injected so a test can pin both. */
export interface ApprovalWaitRuntime {
  now(): number;
  /** Resolves after `ms`, or EARLY (never throwing) when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/**
 * How often the seam re-reads the approvals engine while a question is pending.
 *
 * There is no total wait here on purpose — see engineAnswerer.ts for why the
 * bound is the signed request's own TTL and never a seam-local stopwatch.
 */
export interface ApprovalPollSchedule {
  readonly firstDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Fast first, cheap later.
 *
 * A machine answerer (the delivery webhook, the studio) settles in well under a
 * second, so the first re-reads must be quick or the seam adds latency nobody
 * asked for. A human takes minutes, and each poll verifies signatures over the
 * request and every decision file, so the ceiling keeps a long wait at roughly
 * twelve reads a minute instead of two hundred and forty.
 */
export const DEFAULT_POLL_SCHEDULE: ApprovalPollSchedule = Object.freeze({
  firstDelayMs: 250,
  maxDelayMs: 5_000
});

/**
 * How long ONE answerer may take before it is treated as absent.
 *
 * This bounds an in-process callback, not a human: a UI answerer that has not
 * come back in thirty seconds is wedged, and the question should fall through to
 * the engine rather than hang the tool call forever. The engine's own wait is
 * bounded by the approval policy's TTL instead.
 */
export const DEFAULT_ANSWERER_TIMEOUT_MS = 30_000;

/** How one question settled. */
export interface ApprovalDecision {
  /** Pairs the two signed audit rows, and is the approvals engine's `intentId`. */
  readonly approvalId: string;
  readonly answer: ApprovalAnswer;
  /**
   * DERIVED, never supplied: `answer === "allow"`.
   *
   * It exists so a caller cannot fail open by forgetting a branch. `if
   * (decision.proceed)` is correct for all three values; `if (decision.answer
   * !== "deny")` is the mistake this field makes unnecessary.
   */
  readonly proceed: boolean;
  /** Who answered — an answerer's name, or the approvals engine. */
  readonly answeredBy: string;
  /** Why, in words. The only place an `unavailable` explains itself. */
  readonly reason: string;
  /** The approvals-engine chain this came from, or null when none was raised. */
  readonly approvalRequestId: string | null;
  /** The two signed rows, so a caller can cite the pair without re-reading the log. */
  readonly requestEventId: string;
  readonly answerEventId: string;
}

/** A real clock and a real timer. */
export function realWaitRuntime(): ApprovalWaitRuntime {
  return {
    now: () => Date.now(),
    sleep: (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal?.aborted === true) {
          resolve();
          return;
        }
        // The timer is CLEARED on abort rather than left to fire: a poll that
        // was abandoned must not keep the process alive for the rest of its
        // backoff, and a seam that leaked timers would make every CLI command
        // that used it hang on exit.
        const done = (): void => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = (): void => {
          done();
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
      })
  };
}
