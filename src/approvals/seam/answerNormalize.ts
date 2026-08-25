/**
 * Containment for ONE answerer (plan P3.3).
 *
 * The rule the whole seam rests on: an answerer may decide a question, but it may
 * never break one. Every way a callback can misbehave — throwing synchronously,
 * rejecting, returning a value outside the union, returning nothing, never
 * settling at all — collapses to `unavailable`, which fails closed.
 *
 * WHAT THIS MODULE MUST NEVER BE POINTED AT. It clamps ANSWERERS. It does not
 * clamp the approvals engine's verdict, and nothing may make it do so. An
 * earlier design ran the entire waterfall — engine included — through one
 * containment wrapper with a stopwatch on it, and a genuine two-approver
 * QUORUM_MET grant that took longer than the stopwatch came back `unavailable`.
 * That does not merely lose a grant; it makes real human approval IMPOSSIBLE,
 * because the one thing humans reliably do is take longer than a timeout. The
 * normalizer below is therefore the identity function on all three legal values
 * and fires only on inputs that are not answers at all.
 */
import {
  APPROVAL_ANSWERS,
  type AnsweredQuestion,
  type ApprovalAnswer,
  type ApprovalAnswerer,
  type ApprovalWaitRuntime
} from "./approvalSeamTypes.js";

/**
 * Coerce whatever an answerer returned into the closed union.
 *
 * `null` — and only `null` — means "not mine, pass it on". Every other
 * non-answer, `undefined` included, is a malfunction: a function that fell off
 * its end did not abstain, it failed, and a failed answerer must not be able to
 * hand its question to somebody more permissive by looking like an abstention.
 */
export function normalizeAnswer(value: unknown): ApprovalAnswer | null {
  if (value === null) return null;
  if (typeof value === "string" && (APPROVAL_ANSWERS as readonly string[]).includes(value)) {
    return value as ApprovalAnswer;
  }
  return "unavailable";
}

/** One answerer's contained result: its answer (or an abstention) and why. */
export interface ContainedAnswer {
  readonly answer: ApprovalAnswer | null;
  readonly reason: string;
}

type Settled =
  | { readonly kind: "returned"; readonly value: unknown }
  | { readonly kind: "threw"; readonly error: unknown }
  | { readonly kind: "timeout" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Put one question to one answerer, contained.
 *
 * @param timeoutMs bounds this answerer's OWN work only. It is not a bound on
 * the question: a fall-through still reaches the engine, which waits as long as
 * the signed approval policy's TTL allows.
 */
export async function askAnswerer(
  answerer: ApprovalAnswerer,
  question: AnsweredQuestion,
  runtime: ApprovalWaitRuntime,
  timeoutMs: number
): Promise<ContainedAnswer> {
  const guard = new AbortController();
  // Enter the promise chain BEFORE calling. An answerer that throws
  // SYNCHRONOUSLY (before its first await) has to land in the same containment
  // as an async one; calling it bare would let that throw escape past every
  // handler below and fail the CALLER's tool call open instead of failing the
  // QUESTION closed.
  const settled: Promise<Settled> = Promise.resolve()
    .then(() => answerer.answer(question))
    .then(
      (value): Settled => ({ kind: "returned", value }),
      (error): Settled => ({ kind: "threw", error })
    );
  const expiry: Promise<Settled> = runtime
    .sleep(timeoutMs, guard.signal)
    .then((): Settled => ({ kind: "timeout" }));

  const outcome = await Promise.race([settled, expiry]);
  // Releases the timer whichever side won. A never-settling answerer's promise
  // is simply abandoned — it already has both handlers attached, so it can never
  // surface later as an unhandled rejection.
  guard.abort();

  if (outcome.kind === "timeout") {
    return {
      answer: "unavailable",
      reason: `answerer "${answerer.name}" did not answer within ${timeoutMs}ms`
    };
  }
  if (outcome.kind === "threw") {
    return {
      answer: "unavailable",
      reason: `answerer "${answerer.name}" threw: ${messageOf(outcome.error)}`
    };
  }
  const normalized = normalizeAnswer(outcome.value);
  if (normalized === null) {
    return { answer: null, reason: `answerer "${answerer.name}" abstained` };
  }
  if (normalized === "unavailable" && outcome.value !== "unavailable") {
    // Named distinctly from an honest `unavailable`, because "the answerer said
    // it could not decide" and "the answerer returned garbage" are different
    // operational problems and only one of them is a bug to go fix.
    return {
      answer: "unavailable",
      reason: `answerer "${answerer.name}" returned a value outside the approval vocabulary: ${JSON.stringify(outcome.value) ?? String(outcome.value)}`
    };
  }
  return { answer: normalized, reason: `answerer "${answerer.name}" answered ${normalized}` };
}
