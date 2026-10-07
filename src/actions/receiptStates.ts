/**
 * Receipt states of a consequential action (P1-03): the transition table, the intent committed before dispatch and
 * the state receipt appended for every transition. See docs/RECEIPTS.md and docs/adr/012-action-journal.md.
 */
import { z } from "zod";
import { authorizationRecordV1Schema } from "../contracts/v1/authorizationRecord.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export const RECEIPT_STATES = ["requested", "authorized", "started", "completed", "denied", "cancelled", "outcome_unknown"] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];
export type EffectState = "applied" | "not_applied";
/** Who settled an execution through reconciliation (P1-04): AMC asking the system of record, or an operator's statement. */
export const RESOLUTIONS = ["adapter", "operator"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export const ALLOWED_TRANSITIONS: Readonly<Record<ReceiptState | "none", readonly ReceiptState[]>> = {
  none: ["requested"],
  requested: ["authorized", "denied", "cancelled"],
  authorized: ["started", "denied", "cancelled"],
  started: ["completed", "outcome_unknown"], // never "cancelled" once dispatched
  outcome_unknown: ["completed"], // only through reconciliation (P1-04), never by replay
  completed: [], denied: [], cancelled: []
};

type TransitionFacts = Pick<ActionReceiptV1, "state" | "evidenceComplete"> & { readonly resolution?: Resolution | null };

/**
 * Whether `next` may follow `previous`. Reconciliation (P1-04, a non-null `resolution`) is the only way out of
 * `outcome_unknown`, to `completed`, and the only way to mark a `completed` execution's evidence complete again; a
 * resolution on any other transition is refused. Otherwise a receipt may repeat its predecessor's state for one reason
 * only: to mark the evidence incomplete (`evidenceComplete` true, then false), for example after the recorder failed.
 */
export function transitionAllowed(previous: TransitionFacts | null, next: TransitionFacts): boolean {
  const settles = previous?.state === "outcome_unknown" ? next.state === "completed"
    : previous?.state === "completed" && !previous.evidenceComplete && next.state === "completed" && next.evidenceComplete;
  const resolved = (next.resolution ?? null) !== null;
  if (resolved || settles) return resolved && settles;
  if (previous !== null && previous.state === next.state) return previous.evidenceComplete && !next.evidenceComplete;
  return ALLOWED_TRANSITIONS[previous?.state ?? "none"].includes(next.state);
}

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const nonEmpty = z.string().min(1);

/** Committed in the `started` transaction, before dispatch. Digests only: never the arguments. */
export const actionIntentV1Schema = z.strictObject({
  schema: z.literal("amc.action-intent/v1"),
  executionId: nonEmpty,
  authorizationId: nonEmpty,
  authorizationDigest: sha256,
  workspaceId: nonEmpty,
  agentId: nonEmpty,
  toolName: nonEmpty,
  adapterId: nonEmpty,
  actionClass: z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]),
  argumentsDigest: sha256,
  /** The protected facts the authorization record bound (P1-02), so reconciliation can compare what was observed. */
  bindings: authorizationRecordV1Schema.shape.bindings,
  idempotencyKey: nonEmpty.nullable(),
  parentExecutionId: nonEmpty.nullable(),
  sessionId: nonEmpty.nullable(),
  callId: nonEmpty,
  owner: z.strictObject({ pid: z.number().int(), hostname: z.string() }),
  startedAt: z.iso.datetime()
});
export type ActionIntentV1 = Readonly<z.infer<typeof actionIntentV1Schema>>;

/** One state of one execution, hash-linked to its predecessor. `at` is AMC's clock when the row was recorded. */
export const actionReceiptV1Schema = z.strictObject({
  schema: z.literal("amc.action-receipt/v1"),
  executionId: nonEmpty,
  workspaceId: nonEmpty,
  /** governedAs: the agent whose later journaled calls an unreconciled receipt blocks. */
  agentId: nonEmpty,
  seq: z.number().int().nonnegative(),
  state: z.enum(RECEIPT_STATES),
  previousState: z.enum(RECEIPT_STATES).nullable(),
  /** e.g. "recheck_failed:binding_changed:amount", "body_threw_ambiguous", "evidence_incomplete:recorder_failed". */
  reasonCode: nonEmpty,
  /** `completed` only; null means the adapter did not declare. */
  effect: z.enum(["applied", "not_applied"]).nullable(),
  evidenceComplete: z.boolean(),
  authorizationDigest: sha256.nullable(),
  /** From `started` on. */
  intentDigest: sha256.nullable(),
  /** AMC's key for this execution (P1-04), the same on every receipt of the chain; null for an unbound call. */
  idempotencyKey: nonEmpty.nullable(),
  /** Set only on a reconciliation receipt: `adapter` observed the system of record, `operator` is self-reported. */
  resolution: z.enum(RESOLUTIONS).nullable(),
  /** `completed` only. */
  outcomeDigest: sha256.nullable(),
  externalRef: z.string().nullable(),
  at: z.iso.datetime(),
  prevReceiptDigest: sha256.nullable()
});
export type ActionReceiptV1 = Readonly<z.infer<typeof actionReceiptV1Schema>>;

export const TERMINAL_STATES: ReadonlySet<ReceiptState> = new Set(["completed", "denied", "cancelled"]);

/** sha256 of the canonical bytes, which are also the evidence row's payload and the signed receipt's `body_sha256`. */
export function receiptDigest(value: ActionReceiptV1 | ActionIntentV1): string {
  return sha256Hex(canonicalize(value));
}

/** A transition outside `ALLOWED_TRANSITIONS`. Thrown before anything is written. */
export class TransitionRefused extends Error {
  constructor(readonly executionId: string, readonly from: ReceiptState | "none", readonly to: ReceiptState) {
    super(`action ${executionId}: ${from} -> ${to} is not an allowed transition`);
    this.name = "TransitionRefused";
  }
}

/** Why `start` refused: this agent has an unreconciled execution, or the same intent is already `outcome_unknown` (P1-04). */
export type BlockCode = "blocked_by_unreconciled" | "possible_duplicate_of";

/** The denial reason for a block, naming how an operator settles it. */
export function blockReason(code: BlockCode, blockedBy: string): string {
  return `${code}:${blockedBy}: ${code === "possible_duplicate_of" ? "the same tool and arguments are already outcome_unknown"
    : "an earlier action's outcome or evidence is unreconciled"}, and nothing is replayed automatically; settle it with reconcile() `
    + `or \`amc action resolve ${blockedBy}\``;
}

/** `started` refused by a block. Thrown before anything is written. */
export class ActionBlocked extends Error {
  constructor(readonly executionId: string, readonly blockedBy: string, readonly code: BlockCode = "blocked_by_unreconciled") {
    super(blockReason(code, blockedBy));
    this.name = "ActionBlocked";
  }
}

/** The journal could not durably record: the store, the keys or the durability setting failed. */
export class JournalUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`journal_unavailable: ${message}`, options);
    this.name = "JournalUnavailable";
  }
}

/** The receipt chain failed verification. An integrity failure, never "not found" and never a pass. */
export class ReceiptChainBroken extends Error {
  constructor(readonly executionId: string, readonly errors: readonly string[]) {
    super(`journal_integrity_failed: action ${executionId}: ${errors.join("; ")}`);
    this.name = "ReceiptChainBroken";
  }
}
