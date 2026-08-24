/**
 * Turn-boundary retry — which in AMC means a REQUEST boundary INSIDE one step.
 *
 * WHY IT LIVES HERE AND NOT IN THE TRANSPORT. `src/llm/retryPolicy.ts` decides
 * whether a failure class is worth repeating and says, in its own header, that
 * it will never execute a retry: a retry executor inside the transport could not
 * write the evidence a retry owes, because the transport has no turn, no step
 * and no session position to write it at. The loop has all three. So the policy
 * is read here, from the route the failed call PINNED, and the loop is what
 * sleeps, re-dispatches, and records.
 *
 * WHY THE STEP NUMBER DOES NOT ADVANCE. A step is "one model request plus the
 * tool calls it asked for" — that is the unit the crash-loss bound is stated in
 * (ADR-0009) and the unit `step/end` closes. A retried request is the SAME
 * question asked again, not a new step: advancing the counter would make a
 * transient 429 indistinguishable in the log from the model having taken another
 * turn of thought, and would inflate `maxStepsPerTurn` against a bound the
 * operator set for model steps.
 *
 * WHAT THE LOG THEREFORE HOLDS FOR A RETRIED STEP.
 *
 *   step/start(turn, step)
 *     request/header  … request/failure     ← attempt 1, settled by the seam
 *     loop/retry {attempt: 1, decision: "retry", delayMs, delaySource}
 *     request/header  … request/response    ← attempt 2, SAME step number
 *   step/end(turn, step)
 *
 * Two headers in one step is a shape a reader would otherwise have to guess at.
 * The `loop/retry` row between them is what makes it self-explaining, and it is
 * signed and hash-chained like everything else the loop writes.
 *
 * WHAT IS NOT RETRIED, AND WHY EACH ONE IS DELIBERATE.
 *
 *   - A CANCELLED dispatch. The signal aborting is not a provider failure; the
 *     turn is on its way to `cancelled` and re-asking the model would be the
 *     loop overriding the person who pressed stop.
 *   - A PROTOCOL violation (`AMC_LLM_STREAM_*`). That is AMC's own bug, it is in
 *     no policy's retryable set by construction, and repeating it repeats the
 *     bug.
 *   - Anything that is not an {@link LlmError}. An unclassified throw has no
 *     provider facts for a policy to read, and guessing one is how a terminal
 *     failure retries forever.
 *
 * WHY AN UNWRITABLE `loop/retry` IS FATAL TO THE STEP. If the row cannot be
 * committed, the log cannot explain the second header that is about to appear —
 * so the second request is not sent. The throw propagates, the step closes in
 * its `finally`, and the turn ends `error` with exactly one request in it.
 * Evidence first: AMC does not take an action it cannot record.
 */
import type { SettledStream } from "../llm/adapter/streamRecorder.js";
import { isLlmError } from "../llm/llmFailure.js";
import type { LlmFailure } from "../llm/llmFailure.js";
import { isRetryableFailure } from "../llm/retryPolicy.js";
import type { ResolvedRetryPolicy } from "../llm/retryPolicy.js";
import type { ToolSchema } from "../llm/request/requestSpec.js";
import type { SessionService } from "../session/sessionService.js";
import type { LoopNotification, LoopRetryRuntime } from "./loopTypes.js";
import type { LoopLlm, LoopRoute } from "./stepRunner.js";

/**
 * The default wait and jitter.
 *
 * `unref()` is not used: a pending retry is work the process owes, and letting
 * Node exit through it would end a turn with no `turn/end` — the exact shape
 * this loop exists to never produce.
 */
export const DEFAULT_RETRY_RUNTIME: LoopRetryRuntime = Object.freeze({
  sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted || ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      function onAbort(): void {
        clearTimeout(timer);
        resolve();
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  },
  random(): number {
    return Math.random();
  }
});

/** What the loop decided to do after one failed dispatch. */
export interface RetryVerdict {
  readonly decision: "retry" | "give-up";
  readonly reason: string;
  /** The wait taken before re-dispatching. Null exactly when the decision is `give-up`. */
  readonly delayMs: number | null;
  readonly delaySource: "provider" | "backoff" | null;
  /** Retries still permitted under the policy after this decision; null when unbounded. */
  readonly attemptsRemaining: number | null;
}

/**
 * Decide, from the frozen policy and the failure's own facts, what happens next.
 *
 * Pure: it takes the randomness as an argument and returns a delay rather than
 * taking one. That is what makes the recorded `delayMs` assertable — a test pins
 * `random` and the signed row has to contain the number the schedule computes.
 *
 * ORDER MATTERS. Retryability is checked BEFORE the budget, because "AUTH is not
 * retryable" is the useful sentence and "budget exhausted" would be a misleading
 * one for a failure that was never eligible.
 *
 * @param policy the policy frozen when the failed call pinned its route.
 * @param failure provider facts from the typed error.
 * @param attempt 1-based index of the dispatch that just failed.
 * @param random uniform [0,1) source for the jitter.
 */
export function decideRetry(
  policy: ResolvedRetryPolicy,
  failure: LlmFailure,
  attempt: number,
  random: () => number
): RetryVerdict {
  // `maxRetries` counts retries AFTER the first request, so attempt 1 has the
  // whole budget still in hand.
  const remaining = policy.mode === "always" ? null : policy.maxRetries - (attempt - 1);

  if (!isRetryableFailure(policy, failure)) {
    return {
      decision: "give-up",
      reason: `failure code ${failure.code} is not retryable under this route's ${policy.mode} policy`,
      delayMs: null,
      delaySource: null,
      attemptsRemaining: remaining
    };
  }
  if (policy.mode === "normal" && remaining !== null && remaining <= 0) {
    return {
      decision: "give-up",
      reason: `retry budget of ${policy.maxRetries} is exhausted after ${attempt} attempts`,
      delayMs: null,
      delaySource: null,
      attemptsRemaining: 0
    };
  }

  const wait = retryDelay(policy, failure, attempt, random);
  return {
    decision: "retry",
    reason:
      wait.source === "provider"
        ? `retryable ${failure.code}; the provider asked for ${wait.ms}ms`
        : `retryable ${failure.code}; local backoff of ${wait.ms}ms`,
    delayMs: wait.ms,
    delaySource: wait.source,
    attemptsRemaining: remaining === null ? null : remaining - 1
  };
}

/**
 * How long to wait before asking again.
 *
 * A provider that named a delay gets that delay VERBATIM (clamped to the
 * policy's ceiling, because an unbounded remote-controlled sleep is a remote
 * denial of service). No jitter is added to it: `Retry-After: 2` means the
 * provider will not serve this caller for two seconds, and jittering downward
 * would produce a second refusal that the operator then pays for twice.
 *
 * Otherwise: bounded exponential backoff with symmetric jitter, which is the
 * shape `resolveRetryPolicy` already validates its inputs for.
 */
function retryDelay(
  policy: ResolvedRetryPolicy,
  failure: LlmFailure,
  attempt: number,
  random: () => number
): { readonly ms: number; readonly source: "provider" | "backoff" } {
  const asked = failure.providerRetryAfterMs;
  if (asked !== undefined) {
    return { ms: Math.min(Math.round(asked), policy.maxDelayMs), source: "provider" };
  }
  // Exponent capped before the multiply: `initialDelayMs * 2 ** 40` overflows to
  // Infinity, and `setTimeout(Infinity)` fires immediately — a backoff that
  // becomes a hot loop at exactly the moment the provider is struggling.
  const doublings = Math.min(attempt - 1, 30);
  const base = Math.min(policy.initialDelayMs * 2 ** doublings, policy.maxDelayMs);
  const jitter = 1 + (random() * 2 - 1) * policy.jitterRatio;
  const ms = Math.round(base * jitter);
  return { ms: Math.max(0, Math.min(ms, policy.maxDelayMs)), source: "backoff" };
}

/** Everything one step's model request needs, minus the turn machine. */
export interface StepRequestInit {
  readonly session: SessionService;
  readonly llm: LoopLlm;
  readonly route: LoopRoute;
  /** The `system/prompt` row this run's requests cite. */
  readonly systemPromptEventId: string;
  /**
   * The schemas to offer, read ONCE for the whole step.
   *
   * Deliberately not re-read per attempt. A retry is the same question asked
   * again; if the registry changed underneath it, re-encoding would make the two
   * headers in one step commit to different bytes and a reader could no longer
   * tell a retry from a different request that happened to share a step.
   */
  readonly tools: readonly ToolSchema[] | null;
  readonly retry: LoopRetryRuntime;
  readonly notify: (notification: LoopNotification) => void;
}

/**
 * Dispatch one step's request, retrying at the request boundary.
 *
 * Returns the settlement of the attempt that succeeded. Throws the typed error
 * of the last attempt when the policy stops retrying — the caller's `finally`
 * closes the step, and the turn machine turns the throw into `error` or, if the
 * signal aborted, into `cancelled`.
 */
export async function dispatchStepRequest(
  init: StepRequestInit,
  turn: number,
  step: number,
  signal: AbortSignal
): Promise<SettledStream> {
  for (let attempt = 1; ; attempt += 1) {
    signal.throwIfAborted();
    const call = init.llm.prepare({
      providerId: init.route.providerId,
      model: init.route.model,
      params: init.route.params,
      systemPromptEventId: init.systemPromptEventId,
      tools: init.tools,
      signal
    });

    try {
      // The chunks are folded and recorded inside the seam; the loop pulls them
      // only to drive the stream and to notice a cancellation between frames.
      for await (const _chunk of call.stream()) {
        signal.throwIfAborted();
      }
    } catch (error: unknown) {
      // Cancellation is not a provider failure and must not consume a retry.
      if (signal.aborted) throw error;
      if (!isLlmError(error)) throw error;
      const settled = call.settled;
      if (settled === null) {
        // Unreachable: the seam settles on every exit from a dispatch. Stated
        // rather than assumed, because retrying without a settlement row would
        // leave a header in the log that nothing ever answered.
        throw error;
      }
      const verdict = decideRetry(call.route.retryPolicy, error.failure, attempt, init.retry.random);
      // Recorded BEFORE the wait: if the process dies during a backoff, the log
      // still says a retry was decided rather than showing an unexplained gap.
      init.session.recordLoopEvent({
        kind: "retry",
        attempt,
        headerEventId: call.headerEventId,
        outcomeEventId: settled.outcomeEventId,
        decision: verdict.decision,
        reason: verdict.reason,
        delayMs: verdict.delayMs,
        delaySource: verdict.delaySource,
        attemptsRemaining: verdict.attemptsRemaining
      });
      init.notify({ kind: "retry", turn, step, attempt, decision: verdict.decision, delayMs: verdict.delayMs });
      if (verdict.decision === "give-up") throw error;
      await init.retry.sleep(verdict.delayMs ?? 0, signal);
      // A cancel that landed during the wait ends the turn here rather than
      // spending another request on an agent somebody already stopped.
      signal.throwIfAborted();
      continue;
    }

    const settled = call.settled;
    if (settled === null) {
      throw new Error(`agent loop: step ${turn}.${step} finished with no settled request`);
    }
    return settled;
  }
}
