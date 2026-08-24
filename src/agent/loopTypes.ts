/**
 * The agent loop's vocabulary (plan P3.2).
 *
 * Kept free of every service it drives, so the machine can be read — and
 * driven, in a test — without a composed runtime. That is deliberate: the
 * repository's architecture check forbids anything outside `src/kernel/**` from
 * importing the vendored cordis package, so the loop's extension points are a
 * plain interface here and only the kernel facade knows what a waterfall is.
 *
 * The endings below are NOT a parallel vocabulary. `TurnEnding.reason` is
 * literally `TurnEndReason` from the signed session spine, so what the machine
 * decides and what the log records are the same string with no mapping table
 * between them to get wrong.
 */
import type { TurnEndParams } from "../session/sessionApiTypes.js";
import type { InboxOrigin, InboxSpliceOp, InboxTarget } from "../session/loopEventMeta.js";
import type { TurnCancelCause } from "../session/sessionTypes.js";

export type { InboxOrigin, InboxSpliceOp, InboxTarget } from "../session/loopEventMeta.js";

/** One queued message, with the identity that follows it through the log. */
export interface InboxMessage {
  readonly messageId: string;
  readonly text: string;
  readonly origin: InboxOrigin;
}

/**
 * What a caller gets back from `send`.
 *
 * The `eventId` is the signed `loop/inbox` row. A caller holding a receipt holds
 * PROOF that its message was committed before the driver could act on it, which
 * is what makes "the steer arrived mid-turn" assertable from outside the loop
 * rather than only inferable from the log afterwards.
 */
export interface InboxReceipt {
  readonly eventId: string;
  readonly messageId: string;
  /** Where the message actually landed, which is not always where it was aimed. */
  readonly target: InboxTarget;
  /** Set when a waking send against an aborted activity was demoted to `next-turn`. */
  readonly demotedFrom: InboxTarget | null;
}

/** The driver's externally visible state. */
export type AgentStatus =
  /** No driver is running. Waking input starts one. */
  | "idle"
  /** A turn is in progress. */
  | "running"
  /**
   * Terminal. The spine refused a `turn/end` or a `turn/seal`, so the log has an
   * open turn that this process must not build on. Recovery closes it.
   */
  | "failed";

/** Why a turn ended. `reason` is the string the signed `turn/end` row carries. */
export type TurnEnding =
  | { readonly reason: "complete" }
  | { readonly reason: "max_tokens" }
  | { readonly reason: "max_steps" }
  | { readonly reason: "blocked" }
  | { readonly reason: "error"; readonly error: unknown }
  | { readonly reason: "cancelled"; readonly cause: TurnCancelCause };

/**
 * Translate an ending into the spine's close parameters.
 *
 * Total over the union by construction, so a new ending that nobody taught the
 * writer about fails to compile here rather than closing a turn as something
 * else. `"interrupted"` is unreachable: the live writer refuses it, because a
 * loop that could spell a crash could disguise a cancellation as one.
 */
export function toTurnEndParams(ending: TurnEnding): TurnEndParams {
  return ending.reason === "cancelled"
    ? { reason: "cancelled", cause: ending.cause }
    : { reason: ending.reason };
}

export interface PreStepInput {
  readonly turn: number;
  readonly step: number;
  /** Which lane this boundary claimed from. */
  readonly target: InboxTarget;
  /** The batch this step boundary claimed — already durably spliced out. */
  readonly messages: readonly InboxMessage[];
  readonly signal: AbortSignal;
}

/**
 * Whether the loop enters the proposed step, and with which messages.
 *
 * A `reject` VETOES the turn: it ends `blocked` with no model call. The claimed
 * batch has already been consumed by the time a listener sees it — that is dsh's
 * ordering and it is kept, because re-inserting on the reject path creates a
 * veto/re-insert loop with no termination. What AMC adds is that the loss is
 * recorded: the `loop/veto` row names the vetoing party and every message id the
 * veto burned.
 */
export type PreStepDecision =
  | { readonly kind: "enter"; readonly messages: readonly InboxMessage[] }
  | { readonly kind: "reject"; readonly by: string };

export interface TurnStoppingInput {
  readonly turn: number;
  readonly signal: AbortSignal;
}

/**
 * How the loop waits, and how it jitters.
 *
 * Injected rather than reached for, and both halves for the same reason: a
 * retry test that actually slept would be a test of `setTimeout`, and a jitter
 * drawn from a global `Math.random` would make the recorded delay unassertable.
 * Neither is a policy — the policy is the frozen {@link
 * import("../llm/retryPolicy.js").ResolvedRetryPolicy} on the pinned route.
 */
export interface LoopRetryRuntime {
  /**
   * Wait `ms`, returning EARLY (never throwing) when the signal aborts.
   *
   * Returning rather than rejecting keeps cancellation on one path: the caller
   * checks the signal after every await already, so a second, throwing
   * cancellation path here would be a second place to get the ending wrong.
   */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** Uniform in [0, 1). */
  random(): number;
}

/** Live-only observation. Never a veto, never load-bearing for the log. */
export type LoopNotification =
  | { readonly kind: "status"; readonly status: AgentStatus }
  | { readonly kind: "turn-start"; readonly turn: number }
  | { readonly kind: "turn-end"; readonly turn: number; readonly ending: TurnEnding }
  | { readonly kind: "step-start"; readonly turn: number; readonly step: number }
  | { readonly kind: "step-end"; readonly turn: number; readonly step: number }
  | {
      readonly kind: "inbox";
      readonly op: InboxSpliceOp;
      readonly target: InboxTarget;
      readonly messageIds: readonly string[];
    }
  /**
   * A request-boundary retry decision, mirrored live.
   *
   * Carries no failure facts: the signed `loop/retry` row and the
   * `request/failure` row it names are the account of record, and a
   * notification that restated them would be a second one nobody signs.
   */
  | {
      readonly kind: "retry";
      readonly turn: number;
      readonly step: number;
      readonly attempt: number;
      readonly decision: "retry" | "give-up";
      readonly delayMs: number | null;
    }
  | { readonly kind: "error"; readonly turn: number; readonly step: number; readonly error: unknown };

/**
 * The loop's extension points.
 *
 * `preStep` is a waterfall — a listener either decides or delegates to `next()`.
 * `turnStopping` is serial and DATA-DRIVEN: a listener that objects to the turn
 * ending calls `steer(...)`, the machine re-reads its inbox, and fresh steering
 * runs another step. Listener order therefore cannot change the outcome, which
 * is the property that lets later phases register guards here without turning
 * registration order into policy.
 */
export interface LoopHooks {
  preStep(input: PreStepInput, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>;
  turnStopping(input: TurnStoppingInput): Promise<void>;
  notify(notification: LoopNotification): void;
}

/** The hooks a driver runs under when nothing is registered. */
export const NO_HOOKS: LoopHooks = Object.freeze({
  preStep: (_input: PreStepInput, next: () => Promise<PreStepDecision>): Promise<PreStepDecision> => next(),
  turnStopping: (): Promise<void> => Promise.resolve(),
  notify: (): void => {
    // A driver with no observer is a normal configuration, not an error.
  }
});

export interface AgentLoopConfig {
  /**
   * How many steps one turn may take before the loop stops it.
   *
   * dsh has no such cap, which means a model that keeps requesting tools runs
   * until something external intervenes. A bounded run is a governance
   * requirement here, so the cap exists and its breach is a distinct signed
   * ending (`max_steps`) rather than a silent stop.
   */
  readonly maxStepsPerTurn: number;
  /** How many parallel-safe tool calls may be in flight at once within a step. */
  readonly maxParallelToolCalls: number;
  /**
   * How long a stopping step waits for a tool that is still running, in ms.
   *
   * THIS IS THE HANG POLICY, AND IT IS DELIBERATELY NOT A TOOL DEADLINE. The
   * loop puts no wall clock on a running tool: it does not know what "too long"
   * means for a compile, a fetch, or a human-in-the-loop approval, and the seam
   * that does already has `ToolCallOutcome.timedOut` to say so. A loop-level
   * deadline would either kill legitimate long work or be set so high it never
   * fires, and either way it would be the loop overruling the only party with
   * the information.
   *
   * What the loop does own is the escape hatch. Once a step has a reason to stop
   * — it was cancelled, or the tool seam threw — anything still in flight gets
   * this long to honour it. After that the pool STOPS WAITING: those calls are
   * recorded `TOOL_OUTCOME_UNKNOWN` (dispatched, outcome never learned) and the
   * turn closes. The tool keeps running, because nothing in this process can
   * stop a function that will not return; what changes is that a tool which
   * ignores cancellation can no longer veto it.
   *
   * Zero is legal and means "do not wait at all".
   */
  readonly toolAbandonGraceMs: number;
}

export const DEFAULT_AGENT_LOOP_CONFIG: AgentLoopConfig = Object.freeze({
  maxStepsPerTurn: 64,
  maxParallelToolCalls: 10,
  // Long enough that a well-behaved tool unwinding its own work (killing a child
  // process, rolling back a transaction) reports a real outcome rather than
  // being recorded as unknown; short enough that a human who pressed stop sees
  // the turn close.
  toolAbandonGraceMs: 5_000
});

/** Options for a cancellation. */
export interface CancelOptions {
  /**
   * Keep queued and steering work instead of dropping it. The live turn is still
   * aborted; the un-started work survives for a later turn and no cancelled
   * splice is logged.
   */
  readonly keepInbox?: boolean;
  /** Who asked, recorded on the `loop/cancel` row. */
  readonly by?: string;
}
