/**
 * The wire shape of the agent loop's own control rows (plan P3.2).
 *
 * Six event types, one builder, for the same reason `turnLifecycleMeta.ts`
 * exists: a signed row's meta is a hash pre-image, so the key ORDER is part of
 * what gets signed, and a shape assembled ad hoc at a call site is a shape that
 * drifts. `SessionService` owns the append; this module owns what the append
 * says.
 *
 * WHAT THE FOUR ROWS ARE FOR.
 *
 *   `loop/inbox` — one normalized mutation of the agent's pending-message lists.
 *     Every insert, every claim, every cancellation is durable BEFORE the live
 *     projection moves, so the queue is a fold over signed rows rather than a
 *     process's memory. An INSERT carries the message text as its payload. That
 *     duplication (the text is written again as a `user/message` row when a step
 *     claims it) is the mechanism, not the cost: the two rows' `payload_sha256`
 *     are equal exactly when the model was shown what the sender actually wrote,
 *     so a pre-step listener that rewrites a claimed batch is visible as a
 *     digest that no longer joins. It also means a steer that was queued and
 *     then cancelled still has its content in the log — "what did the operator
 *     try to tell the agent, and was it delivered verbatim" is answerable.
 *
 *   `loop/cancel` — a cancellation was REQUESTED: by whom, with which cause, and
 *     against which observed head. Written first, before any unwinding, because
 *     if the process dies while unwinding this is the only row that will ever
 *     say who stopped the agent; the `turn/end` would then be written by crash
 *     repair, which knows nothing about the request.
 *
 *   `loop/retry` — the loop re-dispatched (or stopped re-dispatching) a model
 *     request INSIDE one step. A retry is a request-boundary event, not a turn
 *     one: the step number does not advance, so a retried step holds two
 *     `request/header` rows and this row is the only thing that says why. It
 *     records what the LOOP DID — the attempt, the wait, and where the wait came
 *     from — and deliberately does NOT restate the provider's facts, which are
 *     already signed on the `request/failure` row it names. Two accounts of one
 *     failure is exactly the drift this repository keeps refusing to create.
 *
 *   `loop/veto` — a pre-step listener refused to enter a step. The turn then
 *     ends `blocked`, and this row names the vetoing party and the messages the
 *     veto consumed. The claim is durable before the waterfall runs (dsh's
 *     ordering, kept), so a veto BURNS the input it was handed; recording which
 *     ids were burned is what keeps that from being a silent loss.
 *
 * All four carry surface op `none`. A queued message is not model-visible until
 * a step claims it — projecting it earlier would show the model a steer nobody
 * had yet decided to deliver.
 */
import { canonicalTurnCancelCause } from "./turnLifecycleMeta.js";
import { isTurnCancelCause, type TurnCancelCause } from "./sessionTypes.js";
import type { EvidenceEventType } from "../types.js";

/** One of the two ordered pending-message lists an agent owns. */
export type InboxTarget = "next-turn" | "next-step";

/** How a queued message arrived. Recorded so a fold can tell the three apart. */
export type InboxOrigin =
  /** `followup` — its own turn, wakes an idle driver. */
  | "followup"
  /** `steer` — the nearest step boundary, wakes an idle driver. */
  | "steer"
  /** `inject` — the nearest step boundary, silent; never starts a turn. */
  | "inject"
  /** Context a tool asked to hand back to the model. */
  | "tool";

/** What a splice did to a pending list. */
export type InboxSpliceOp =
  /** One message was queued. Carries its text as the row's payload. */
  | "insert"
  /** A step boundary consumed messages. A pure deletion, and NOT a cancellation. */
  | "claim"
  /** A cancel dropped pending work. A pure deletion, and marked as such. */
  | "cancel";

/**
 * Neither the inbox nor the cancel row carries `turn`/`step` in its meta. The
 * envelope already records the position the row was written at, INSIDE the hash,
 * so a second copy would be a field that can disagree with the row it sits in.
 * `loop/veto` is the exception, and says why below.
 */
export interface LoopInboxRecord {
  readonly kind: "inbox";
  readonly op: InboxSpliceOp;
  readonly target: InboxTarget;
  /** Normalized splice position, already clamped to the list. */
  readonly start: number;
  readonly removedCount: number;
  /**
   * The ids this splice inserted (`insert`) or removed (`claim`/`cancel`).
   *
   * Recorded even though replaying the ordered splices would recover them,
   * because an auditor asking "which messages did this claim consume" should not
   * have to re-run a fold to find out.
   */
  readonly messageIds: readonly string[];
  /** Present on `insert` only; null otherwise. */
  readonly origin: InboxOrigin | null;
  /** The text being queued. Present on `insert` only. */
  readonly text: string | null;
  /** Whether this insertion was allowed to wake an idle driver. */
  readonly wake: boolean;
  /**
   * The target the sender ASKED for, when a waking send arrived against an
   * already-aborted activity and was therefore demoted to `next-turn`. Null when
   * the message landed where it was aimed. Without this a demoted steer would be
   * indistinguishable in the log from a follow-up nobody sent.
   */
  readonly demotedFrom: InboxTarget | null;
}

export interface LoopCancelRecord {
  readonly kind: "cancel";
  readonly cause: TurnCancelCause;
  readonly keepInbox: boolean;
  /** Who asked. Free text, because the requester is not always an AMC principal. */
  readonly requestedBy: string;
  /** The last session event this driver had committed when the cancel arrived. */
  readonly observedHeadEventId: string | null;
  /** The driver's phase at the moment of the request. */
  readonly phase: string;
}

export interface LoopVetoRecord {
  readonly kind: "veto";
  /**
   * The step the veto REFUSED. It never started, so the envelope's step is null
   * — this is the one control row whose meta knows a position the envelope
   * cannot record.
   */
  readonly turn: number;
  readonly step: number;
  /** Which listener refused. */
  readonly by: string;
  /** The claimed messages this veto consumed without ever showing the model. */
  readonly claimedMessageIds: readonly string[];
}

/**
 * One request-boundary retry decision, taken inside a step that is still open.
 *
 * Neither the failure's code nor its status appears here. Both are already
 * signed on the `request/failure` row this record names, and a second copy is a
 * second thing that can disagree. What is here is what only the loop knows: how
 * many times it has now asked, how long it waited, and whether the wait was the
 * provider's instruction or AMC's own backoff.
 */
export interface LoopRetryRecord {
  readonly kind: "retry";
  /** Which attempt just failed. 1 is the first dispatch of this step. */
  readonly attempt: number;
  /** The `request/header` row of the attempt that failed. */
  readonly headerEventId: string;
  /** The `request/failure` row that settled it. Join here for the provider facts. */
  readonly outcomeEventId: string;
  /** What the loop did next. An ACTION this process took, never a property of the failure. */
  readonly decision: "retry" | "give-up";
  /** Why, in one phrase, under the policy that was frozen when the route was pinned. */
  readonly reason: string;
  /** How long the loop waited before re-dispatching. Null exactly when it gave up. */
  readonly delayMs: number | null;
  /** Whether the provider asked for the wait, or local backoff computed it. */
  readonly delaySource: "provider" | "backoff" | null;
  /** Retries still permitted after this decision, or null under an unbounded policy. */
  readonly attemptsRemaining: number | null;
}

/**
 * One delegation announced (P6.1a).
 *
 * Written BEFORE the child runs, so an unmatched `started` with no `completed`
 * is the honest signature of a parent that died mid-delegation. Crash repair
 * already synthesises step ends; it must not synthesise one of these, because a
 * delegation whose outcome nobody observed is exactly what a reader needs to see.
 */
export interface LoopDelegationStartedRecord {
  readonly kind: "delegation-started";
  /** The child's own name. Evidence only — never a governance key. */
  readonly childRunAs: string;
  /** The child's OWN session. A child is never a second writer on the parent's. */
  readonly childSessionId: string;
  /** What BOTH ends are metered and restricted as: the root's id. */
  readonly governedAs: string;
  readonly depth: number;
  /** The signed packet that authorised this child to exist. */
  readonly packetId: string;
}

/**
 * The runtime's account of how a delegation ended (P6.1a).
 *
 * `settledAs` and `reason` are the RUNTIME's words, never the child's. The
 * child's own output reaches the parent through the inbox as a separate row with
 * its own provenance; merging the two here would credit the child with a summary
 * it never wrote.
 *
 * Emitted unconditionally, including when the child already reported. The cases
 * that most need an account — a refusal, a failure, a cancellation — are exactly
 * the ones where the child never got to report, so a "do not duplicate"
 * optimisation would drop the account precisely in the failure modes it exists
 * for.
 */
export interface LoopDelegationCompletedRecord {
  readonly kind: "delegation-completed";
  readonly childRunAs: string;
  readonly childSessionId: string;
  /** Joins this row to its `delegation-started`. */
  readonly packetId: string;
  /** How the runtime saw it end. */
  readonly settledAs: "reported" | "refused" | "failed" | "cancelled";
  /** One phrase, from the runtime. */
  readonly reason: string;
}

/** Every control row the loop may write. Closed: a new one is a deliberate change. */
export type LoopEventRecord =
  | LoopInboxRecord
  | LoopCancelRecord
  | LoopVetoRecord
  | LoopRetryRecord
  | LoopDelegationStartedRecord
  | LoopDelegationCompletedRecord;

/** A built row: what to append, what its meta says, and what its payload is. */
export interface LoopEventRow {
  readonly eventType: EvidenceEventType;
  readonly meta: Record<string, unknown>;
  /** Null for every row that carries no payload. */
  readonly payload: string | null;
}

/**
 * Build one control row.
 *
 * Throws rather than normalising, for the same reason the turn closers do: a row
 * that cannot be spelled honestly must not reach the log at all. The two rules
 * enforced here both protect a join that a reader will later rely on —
 * an `insert` without text would leave a queued message whose content the log
 * cannot produce, and a non-`insert` WITH text would sign content that no
 * message was ever queued from.
 */
export function buildLoopEventRow(record: LoopEventRecord): LoopEventRow {
  switch (record.kind) {
    case "inbox":
      return buildInboxRow(record);
    case "delegation-started":
      if (record.depth < 1) {
        throw new Error("agent_delegation_started: a delegate is at depth 1 or deeper");
      }
      return {
        eventType: "agent_delegation_started",
        // LITERAL ORDER BELOW IS THE HASH PRE-IMAGE ORDER.
        meta: {
          childRunAs: record.childRunAs,
          childSessionId: record.childSessionId,
          governedAs: record.governedAs,
          depth: record.depth,
          packetId: record.packetId
        },
        payload: null
      };
    case "delegation-completed":
      if (record.reason.trim().length === 0) {
        throw new Error("agent_delegation_completed: an outcome with no reason is not auditable");
      }
      return {
        eventType: "agent_delegation_completed",
        // LITERAL ORDER BELOW IS THE HASH PRE-IMAGE ORDER.
        meta: {
          childRunAs: record.childRunAs,
          childSessionId: record.childSessionId,
          packetId: record.packetId,
          settledAs: record.settledAs,
          reason: record.reason
        },
        payload: null
      };
    case "cancel":
      return {
        eventType: "loop/cancel",
        // LITERAL ORDER BELOW IS THE HASH PRE-IMAGE ORDER.
        meta: {
          cause: canonicalTurnCancelCause(assertCause(record.cause)),
          keepInbox: record.keepInbox,
          requestedBy: record.requestedBy,
          observedHeadEventId: record.observedHeadEventId,
          phase: record.phase
        },
        payload: null
      };
    case "retry":
      return {
        eventType: "loop/retry",
        // LITERAL ORDER BELOW IS THE HASH PRE-IMAGE ORDER.
        meta: {
          attempt: record.attempt,
          headerEventId: record.headerEventId,
          outcomeEventId: record.outcomeEventId,
          decision: assertRetryDecision(record).decision,
          reason: record.reason,
          delayMs: record.delayMs,
          delaySource: record.delaySource,
          attemptsRemaining: record.attemptsRemaining
        },
        payload: null
      };
    case "veto":
      return {
        eventType: "loop/veto",
        meta: {
          turn: record.turn,
          step: record.step,
          by: record.by,
          claimedMessageIds: [...record.claimedMessageIds]
        },
        payload: null
      };
  }
}

/**
 * A retry that names no wait, or a give-up that names one, is a row that cannot
 * be read honestly: the delay fields are how a reader distinguishes "AMC waited
 * and asked again" from "AMC stopped asking". Refuse the row rather than sign a
 * shape whose two halves contradict each other.
 */
function assertRetryDecision(record: LoopRetryRecord): LoopRetryRecord {
  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1) {
    throw new Error("loop/retry: attempt must be a positive integer naming the dispatch that failed");
  }
  const waited = record.delayMs !== null && record.delaySource !== null;
  if (record.decision === "retry" && !waited) {
    throw new Error("loop/retry: a retry must record the wait it took and where the wait came from");
  }
  if (record.decision === "give-up" && (record.delayMs !== null || record.delaySource !== null)) {
    throw new Error("loop/retry: a give-up did not wait, so it must not record a delay");
  }
  return record;
}

function assertCause(cause: TurnCancelCause): TurnCancelCause {
  if (!isTurnCancelCause(cause)) {
    throw new Error("loop/cancel: a cancellation must name its cause (TurnCancelCause)");
  }
  return cause;
}

function buildInboxRow(record: LoopInboxRecord): LoopEventRow {
  if (record.op === "insert") {
    if (record.text === null || record.messageIds.length !== 1 || record.origin === null) {
      throw new Error(
        "loop/inbox: an insert carries exactly one message id, its origin, and its text as the payload"
      );
    }
  } else if (record.text !== null || record.origin !== null) {
    throw new Error(`loop/inbox: a "${record.op}" splice removes messages and carries no text or origin`);
  }
  return {
    eventType: "loop/inbox",
    meta: {
      op: record.op,
      target: record.target,
      start: record.start,
      removedCount: record.removedCount,
      messageIds: [...record.messageIds],
      origin: record.origin,
      // A claim and a cancellation are both pure deletions; this field is the
      // ONLY thing that separates "a turn consumed this" from "a cancel dropped
      // it" when folding the log, so it is never omitted.
      outcome: record.op === "cancel" ? "cancelled" : null,
      wake: record.wake,
      demotedFrom: record.demotedFrom
    },
    payload: record.text
  };
}

/** A `loop/inbox` row's meta, as read back out of the log. */
export interface LoopInboxMeta {
  readonly op: InboxSpliceOp;
  readonly target: InboxTarget;
  readonly start: number;
  readonly removedCount: number;
  readonly messageIds: readonly string[];
  readonly origin: InboxOrigin | null;
}

const INBOX_OPS: ReadonlySet<string> = new Set<InboxSpliceOp>(["insert", "claim", "cancel"]);
const INBOX_TARGETS: ReadonlySet<string> = new Set<InboxTarget>(["next-turn", "next-step"]);
const INBOX_ORIGINS: ReadonlySet<string> = new Set<InboxOrigin>(["followup", "steer", "inject", "tool"]);

/**
 * Read a `loop/inbox` row back.
 *
 * Returns null for anything malformed rather than guessing, so a replay can
 * refuse a log it cannot reconstruct instead of silently starting with a queue
 * that is missing entries.
 */
export function readLoopInboxMeta(metaJson: string): LoopInboxMeta | null {
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
  const { op, target, start, removedCount, messageIds, origin } = meta;
  if (typeof op !== "string" || !INBOX_OPS.has(op)) return null;
  if (typeof target !== "string" || !INBOX_TARGETS.has(target)) return null;
  if (!Number.isSafeInteger(start) || (start as number) < 0) return null;
  if (!Number.isSafeInteger(removedCount) || (removedCount as number) < 0) return null;
  if (!Array.isArray(messageIds) || messageIds.some((id) => typeof id !== "string")) return null;
  if (origin !== null && (typeof origin !== "string" || !INBOX_ORIGINS.has(origin))) return null;
  return {
    op: op as InboxSpliceOp,
    target: target as InboxTarget,
    start: start as number,
    removedCount: removedCount as number,
    messageIds: messageIds as readonly string[],
    origin: (origin as InboxOrigin | null) ?? null
  };
}

/** A `loop/retry` row's meta, as read back out of the log. */
export interface LoopRetryMeta {
  readonly attempt: number;
  readonly headerEventId: string;
  readonly outcomeEventId: string;
  readonly decision: "retry" | "give-up";
  readonly reason: string;
  readonly delayMs: number | null;
  readonly delaySource: "provider" | "backoff" | null;
  readonly attemptsRemaining: number | null;
}

/**
 * Read a `loop/retry` row back.
 *
 * Null for anything malformed, for the same reason {@link readLoopInboxMeta}
 * refuses to guess: an operator surface that rendered a half-understood retry
 * row would be inventing the part it could not read.
 */
export function readLoopRetryMeta(metaJson: string): LoopRetryMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const meta = parsed as Record<string, unknown>;
  const { attempt, headerEventId, outcomeEventId, decision, reason, delayMs, delaySource, attemptsRemaining } =
    meta;
  if (!Number.isSafeInteger(attempt) || (attempt as number) < 1) return null;
  if (typeof headerEventId !== "string" || typeof outcomeEventId !== "string") return null;
  if (decision !== "retry" && decision !== "give-up") return null;
  if (typeof reason !== "string") return null;
  if (delayMs !== null && (!Number.isFinite(delayMs) || (delayMs as number) < 0)) return null;
  if (delaySource !== null && delaySource !== "provider" && delaySource !== "backoff") return null;
  if (attemptsRemaining !== null && !Number.isSafeInteger(attemptsRemaining)) return null;
  return {
    attempt: attempt as number,
    headerEventId,
    outcomeEventId,
    decision,
    reason,
    delayMs: (delayMs as number | null) ?? null,
    delaySource: (delaySource as "provider" | "backoff" | null) ?? null,
    attemptsRemaining: (attemptsRemaining as number | null) ?? null
  };
}
