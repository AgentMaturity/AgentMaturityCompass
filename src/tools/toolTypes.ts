import type { AuthorizationRecordV1 } from "../actions/authorizationRecord.js";
import type { ReceiptState } from "../actions/receiptStates.js";
import type { ActionClass } from "../types.js";

/**
 * The tool-execution contract (P4.1, ADR-4).
 *
 * Two properties in this file are load-bearing and everything else follows
 * from them:
 *
 * 1. `ToolGuard` returns a denial reason or nothing. There is no allow
 *    inhabitant, so no ordering of guards can turn a denial back into
 *    permission. Monotonicity is a property of the TYPE, not of a rule the
 *    pipeline has to remember to apply — which is the only version of it that
 *    survives someone adding a guard later.
 *
 * 2. `ToolOutcome` keeps its failure facts in separate fields. A process that
 *    exceeded its deadline AND exited 143 reports both; a denial is not
 *    encoded as a magic exit code. Collapsing these into one status enum is
 *    how "it was denied" and "it failed" become indistinguishable in evidence
 *    six months later.
 */

/** Simulation runs the tool's shape without its effect. */
export type ToolMode = "SIMULATE" | "EXECUTE";

/**
 * A call as the pipeline sees it.
 *
 * `arguments` is deep-frozen before any listener or guard observes it. A guard
 * that could edit arguments would be deciding on one call and running another,
 * and the evidence would describe the first.
 */
export interface ToolExecution {
  /** Correlation token minted by the registry when the call enters. */
  readonly token: string;
  readonly callId: string;
  /** The originating call, for sub-calls dispatched from inside a tool. */
  readonly rootCallId: string;
  readonly name: string;
  readonly agentId: string;
  readonly workspace: string;
  readonly actionClass: ActionClass;
  readonly requestedMode: ToolMode;
  readonly effectiveMode: ToolMode;
  readonly arguments: Readonly<Record<string, unknown>>;
  /** Token of the enclosing call, or null at the top of a chain. */
  readonly parentToken: string | null;
  /**
   * Guard labels composed for this call (P5.2a evidence binding). Optional so
   * a pipeline built without a registry — every existing test fixture — stays
   * valid; absent means "unknown", never "none applied".
   */
  readonly appliedGuards?: readonly string[];
  /**
   * The turn's cancellation signal, when the caller had one.
   *
   * Most tool bodies finish fast enough not to care. `workflow` does: one call
   * can spawn up to MAX_PLAN_NODES delegations, and without this a cancelled
   * turn would leave a whole plan running with nothing able to stop it -- which
   * would make the force-settle cancellation built for exactly that case
   * unreachable from the only surface that fans out.
   */
  readonly signal?: AbortSignal;
  /**
   * The authorization record bound for this call (P1-02), present for an authorized class once it binds. Rechecked
   * after the guards; the body and the recorder see the same record, its id and its digest.
   */
  readonly authorization?: {
    readonly authorizationId: string;
    readonly digest: string;
    readonly record: AuthorizationRecordV1;
  };
}

/**
 * A monotonic execution guard, evaluated after pre-execute policy (including
 * approval) and immediately before the tool body.
 *
 * Returning a string denies the call. Returning `undefined` leaves it
 * unchanged — NOT "allows" it, which is the distinction that makes ordering
 * irrelevant. A guard is the last word: an approval already granted upstream
 * cannot overturn a guard denial, because approval is a pre-execute concern
 * and this is not.
 */
export type ToolGuard = (execution: ToolExecution) => string | undefined;

/** A named guard, so a denial can say which rule produced it. */
export interface LabelledToolGuard {
  readonly label: string;
  readonly guard: ToolGuard;
}

/** Where a denial came from. Kept distinct so evidence can tell them apart. */
export type ToolDenialStage = "visibility" | "approval" | "guard" | "authorization";

export interface ToolDenial {
  readonly stage: ToolDenialStage;
  readonly reason: string;
  /** The guard that denied, when the stage is "guard". */
  readonly guardLabel: string | null;
}

/**
 * The result of a call, with orthogonal failure facts.
 *
 * `exitCode` is null for tools that have no such concept; it is NOT overloaded
 * to mean denial or timeout. `timedOut` is independent of `exitCode` because a
 * killed process reports both. `denied` is independent of both because a call
 * that never ran has neither.
 */
export interface ToolOutcome {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly denied: ToolDenial | null;
  readonly output: string;
  readonly bytes: number;
  /**
   * A journaled call's receipt state (P1-03), absent for a call outside the journaled classes. `started` means the
   * outcome could not be recorded: the execution stays in the journal for recovery and blocks this agent's journaled
   * calls. Reported state, not a claim the effect did or did not happen.
   */
  readonly action?: { readonly executionId: string; readonly state: ReceiptState; readonly evidenceComplete: boolean };
}

/** What a tool body receives and returns. */
export interface ToolBodyResult {
  /** Explicit application result, independent of exitCode/timedOut. Omitted preserves legacy resolved-body success. */
  readonly ok?: boolean;
  readonly output: string;
  readonly bytes?: number;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  /**
   * What the adapter knows about the effect (P1-03). `unknown` records `outcome_unknown`. Undeclared is `completed`
   * with no effect stated, except for FINANCIAL, DATA_EXPORT and IDENTITY, where it is `outcome_unknown`.
   */
  readonly effect?: "applied" | "not_applied" | "unknown";
  /** The system of record's reference for the effect, e.g. a payment id. Recorded as given. */
  readonly externalRef?: string;
}

/**
 * Thrown by a body that PROVED no effect happened (the system of record refused the request, say). Any other throw
 * from a journaled body is `outcome_unknown`, because the effect may have happened before the throw.
 */
export class DefiniteFailureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DefiniteFailureError";
  }
}

export type ToolBody = (execution: ToolExecution) => Promise<ToolBodyResult> | ToolBodyResult;

export interface ToolDefinition {
  readonly name: string;
  readonly actionClass: ActionClass;
  readonly description: string;
  /**
   * JSON Schema for the arguments, as published to the model.
   *
   * Optional in the type and NOT optional in practice for anything a model
   * should be able to call: a tool with no published schema cannot be invoked
   * correctly, so `agentToolSeam` omits it from the catalogue rather than
   * offering something the model has no way to call. Omitting it is therefore
   * a deliberate way to register a tool that only other code dispatches.
   */
  readonly parameters?: Record<string, unknown>;
  readonly body: ToolBody;
}

/**
 * A visibility mask over the registry.
 *
 * `deny` wins over `allow` — a mask can only ever narrow what a scope sees, for
 * the same reason guards can only deny. Two restrictions combine by
 * intersection, never by union.
 */
export interface ToolRestriction {
  readonly allow?: ReadonlySet<string>;
  readonly deny?: ReadonlySet<string>;
}
