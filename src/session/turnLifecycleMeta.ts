/**
 * The wire shape of the two rows that CLOSE a turn and a step (plan P3.2).
 *
 * WHY THIS FILE EXISTS. Both `SessionService` (the live agent loop's writer) and
 * `sessionRecovery` (crash repair, a second writer that takes over after the
 * first one is gone) append `turn/end` and `step/end` rows. Two writers building
 * the same signed meta by hand is how two facts get collapsed into one: the
 * moment a live cancel can spell itself the way a crash spells itself, the log
 * stops being able to answer "was this agent stopped, or did it die?".
 *
 * So the rules live here, once, and both writers go through them:
 *
 *   - `reason: "cancelled"` is a LIVE cancel and MUST carry a `TurnCancelCause`.
 *     The cause is a meta field, so it is inside `event_hash`, so it is under
 *     `writer_sig`: who stopped the agent is signed, not annotated.
 *   - `reason: "interrupted"` is CRASH REPAIR and may only be written by the
 *     recovery path. A live writer cannot claim its agent died.
 *   - every other reason carries no cause at all. A cause attached to a
 *     `complete` turn would be a signed row implying a stop that never happened.
 *
 * `interrupted` is DERIVED from `reason` rather than accepted from the caller.
 * It used to be a caller-supplied boolean, which meant a row could say
 * `reason: "cancelled", interrupted: true` and let a later reader conclude the
 * process died. One fact, one field: `reason` says what happened, `interrupted`
 * is exactly `reason === "interrupted"`, and the two can never disagree.
 *
 * WHY THE LITERAL KEY ORDER MATTERS. `sanitizeMetaForHash` re-stringifies meta
 * in insertion order and `canonicalize()` never descends into meta_json, so meta
 * built in a different key order hashes differently. Fixing the order in one
 * builder is what keeps two writers producing the same pre-image shape — see
 * ./requestHeaderMeta.ts for the same note on the request path.
 */
import {
  isTurnCancelCause,
  type TokenUsage,
  type TurnCancelCause,
  type TurnEndReason
} from "./sessionTypes.js";

/**
 * Which writer is closing the turn.
 *
 * `"live"` is the agent loop itself; `"recovery"` is crash repair appending
 * synthetic closers under a won claim. It is not a field in the row — the
 * envelope's `synthetic` flag already records that, inside the hash. It exists
 * so the ONE rule that separates a stop from a death is checked at the point of
 * writing, by the only party that knows which it is.
 */
export type TurnCloserOrigin = "live" | "recovery";

/** The provenance a crash-repaired closer carries; null for a live one. */
export interface TurnEndRecoveryRef {
  /** The session head the recoverer observed when it claimed the session. */
  readonly lastObservedEventId: string;
  /** The `session/recovery-claim` row that authorised this append. */
  readonly recoveredBy: string;
}

export interface TurnEndMetaParams {
  readonly turn: number;
  readonly reason: TurnEndReason;
  /** REQUIRED when `reason` is `"cancelled"`; MUST be null otherwise. */
  readonly cancelCause: TurnCancelCause | null;
  readonly recovery: TurnEndRecoveryRef | null;
}

/** A `turn/end` row's meta, as read back out of the log. */
export interface TurnEndMeta {
  readonly turn: number;
  readonly reason: TurnEndReason;
  readonly interrupted: boolean;
  readonly cancelCause: TurnCancelCause | null;
}

/**
 * Rebuild a cause in canonical shape.
 *
 * Exported because the `loop/cancel` row the agent loop writes when a cancel is
 * REQUESTED carries the same cause the `turn/end` row later carries when the
 * turn actually closes. Two canonicalisations would be two chances for the same
 * cause to hash two ways, and an auditor joining the request to the closure
 * would have no way to tell a re-spelling from a re-attribution.
 *
 * Two reasons, both about the hash. `sanitizeMetaForHash` re-stringifies in
 * insertion order, so `{reason, kind}` and `{kind, reason}` are the same cause
 * with two different pre-images — a row that means the same thing hashing two
 * ways is a reconstructability bug waiting to be found by an auditor. And a
 * caller's object may carry keys nobody declared; copying it verbatim would sign
 * whatever it happened to contain. Only the declared fields survive, in a fixed
 * order.
 */
export function canonicalTurnCancelCause(cause: TurnCancelCause): TurnCancelCause {
  return cause.kind === "hook" ? { kind: "hook", reason: cause.reason } : { kind: cause.kind };
}

const TURN_END_REASONS: ReadonlySet<string> = new Set<TurnEndReason>([
  "complete",
  "cancelled",
  "error",
  "interrupted",
  "max_steps",
  "max_tokens",
  "blocked"
]);

/**
 * Build the type meta for a `turn/end` row, enforcing the cancel/crash split.
 *
 * Throws rather than normalising. A closer that cannot be spelled honestly must
 * not reach the log at all: writing a signed row and hoping a reader notices it
 * is inconsistent is the failure mode this whole spine exists to prevent.
 */
export function buildTurnEndMeta(
  params: TurnEndMetaParams,
  origin: TurnCloserOrigin
): Record<string, unknown> {
  if (params.reason === "cancelled") {
    if (!isTurnCancelCause(params.cancelCause)) {
      throw new Error(
        "turn/end: a cancelled turn must name who cancelled it (TurnCancelCause) — an unattributed cancel is not evidence"
      );
    }
  } else if (params.cancelCause !== null) {
    throw new Error(`turn/end: reason "${params.reason}" must not carry a cancel cause`);
  }

  // The rule that keeps "someone stopped this agent" separate from "this agent
  // died", in both directions: a live writer cannot claim a crash, and crash
  // repair does not describe anything else.
  if (params.reason === "interrupted" && origin !== "recovery") {
    throw new Error(
      'turn/end: reason "interrupted" is reserved for crash repair — a live cancel is reason "cancelled" with a cause'
    );
  }
  if (params.reason !== "interrupted" && origin === "recovery") {
    throw new Error(`turn/end: crash repair closes a turn as "interrupted", not "${params.reason}"`);
  }

  return {
    turn: params.turn,
    reason: params.reason,
    // Derived, never supplied: one fact, one field.
    interrupted: params.reason === "interrupted",
    cancelCause: params.cancelCause === null ? null : canonicalTurnCancelCause(params.cancelCause),
    ...(params.recovery === null
      ? {}
      : {
          lastObservedEventId: params.recovery.lastObservedEventId,
          recoveredBy: params.recovery.recoveredBy
        })
  };
}

/**
 * Read a `turn/end` row's meta back out of the log.
 *
 * Returns null for anything that is not a well-formed closer, so a caller can
 * tell "this turn was ended" from "this row claims to end a turn but does not
 * say how". Callers use it to distinguish a stopped turn from a dead one
 * WITHOUT re-deriving the rule: the projection reads what the writer signed.
 */
export function readTurnEndMeta(metaJson: string): TurnEndMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const meta = parsed as Record<string, unknown>;
  const turn = meta.turn;
  const reason = meta.reason;
  if (typeof turn !== "number" || typeof reason !== "string" || !TURN_END_REASONS.has(reason)) {
    return null;
  }
  const rawCause = meta.cancelCause;
  // Absent (a row written before the cause existed) and explicit null both read
  // as "no cause"; a PRESENT but malformed cause makes the row unreadable rather
  // than silently causeless — a broken attribution must not look like none.
  let cancelCause: TurnCancelCause | null = null;
  if (rawCause !== null && rawCause !== undefined) {
    if (!isTurnCancelCause(rawCause)) {
      return null;
    }
    cancelCause = rawCause;
  }
  return {
    turn,
    reason: reason as TurnEndReason,
    interrupted: meta.interrupted === true,
    cancelCause
  };
}

/** The (turn, step) a `step/start` or `step/end` row names. */
export interface StepBoundary {
  readonly turn: number;
  readonly step: number;
}

/**
 * Read the step a boundary row names. Null when either counter is missing, so a
 * malformed row is never matched against a real one.
 */
export function readStepBoundary(metaJson: string): StepBoundary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const meta = parsed as Record<string, unknown>;
  const turn = meta.turn;
  const step = meta.step;
  if (typeof turn !== "number" || typeof step !== "number") {
    return null;
  }
  return { turn, step };
}

export interface StepEndMetaParams {
  readonly turn: number;
  readonly step: number;
  readonly stopReason: string | null;
  /**
   * Token accounting, or null when the step ended without any.
   *
   * NULL IS A REAL ANSWER. A cancelled or aborted stream carries no usage, and
   * the alternative — writing four zeroes — puts a number nobody measured into a
   * signed row and into every cost projection that reads it. An unknown cost is
   * recorded as unknown.
   */
  readonly usage: TokenUsage | null;
  /** The `session/recovery-claim` row that authorised a synthetic close, else null. */
  readonly recoveredBy: string | null;
}

/** Build the type meta for a `step/end` row. Literal order is hash pre-image order. */
export function buildStepEndMeta(params: StepEndMetaParams): Record<string, unknown> {
  return {
    turn: params.turn,
    step: params.step,
    stopReason: params.stopReason,
    usage:
      params.usage === null
        ? null
        : {
            inputTokens: params.usage.inputTokens,
            outputTokens: params.usage.outputTokens,
            cacheRead: params.usage.cacheRead,
            cacheWrite: params.usage.cacheWrite
          },
    ...(params.recoveredBy === null ? {} : { recoveredBy: params.recoveredBy })
  };
}
