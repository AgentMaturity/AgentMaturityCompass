/**
 * The wire shape of the approval AUDIT PAIR (plan P3.3).
 *
 * Two rows, one question: `approval/request` says what was asked, and
 * `approval/answer` says how it settled. They live in one module for the same
 * reason `loopEventMeta.ts` and `turnLifecycleMeta.ts` do — a signed row's meta
 * is a hash pre-image, so the KEY ORDER is part of what gets signed, and a shape
 * assembled ad hoc at a call site is a shape that drifts. `SessionService` owns
 * the append; this module owns what the append says.
 *
 * WHY BOTH ROWS CARRY turn AND step. The pair is evidence about a decision taken
 * DURING a step, and a row whose turn is null sits outside every turn window —
 * outside the Merkle leaf set a `turn/seal` commits to, and outside the window a
 * reader scans when it asks "what happened in turn 3". The answer row used to be
 * written with `turn: null, step: null`, which meant a grant could be read back
 * with no way to say which step it authorized. Stamping both halves puts the
 * whole pair inside one sealed window.
 *
 * WHY THE ANSWER ROW NAMES THE ENGINE REQUEST. AMC does not decide approvals
 * here: the approvals engine (src/approvals/) does, with its own hash-chained
 * request and decision files, its own quorum and its own signatures. The answer
 * row therefore carries `approvalRequestId`, the chain the verdict came from,
 * so an auditor holding only the session log can walk to the decisions that
 * produced it. The reverse direction is closed by the seam passing its
 * `approvalId` as the engine's `intentId`, so the two records name each other
 * without either schema learning about the other.
 *
 * `approvalRequestId` is NULLABLE and that is a fact, not a convenience: when the
 * question never reached the engine — an unsigned policy, an answerer that
 * claimed it first — there is no chain to point at, and inventing one would be
 * worse than admitting none exists.
 */
import type { ApprovalRecord } from "./sessionApiTypes.js";
import type { ApprovalAnswer } from "./sessionTypes.js";
import type { EvidenceEventType } from "../types.js";

/** One built row: the event type to append and the meta that goes under the signature. */
export interface ApprovalRow {
  readonly eventType: EvidenceEventType;
  readonly meta: Record<string, unknown>;
}

const ANSWERS: ReadonlySet<string> = new Set<ApprovalAnswer>(["allow", "deny", "unavailable"]);

/**
 * Build the row for one half of the pair.
 *
 * Total over the `phase` union by construction, so a third phase nobody taught
 * this builder about fails to compile rather than being appended as an
 * approval-shaped row with a meta the readers below cannot parse.
 */
export function buildApprovalRow(
  record: ApprovalRecord,
  turn: number,
  step: number | null
): ApprovalRow {
  if (record.phase === "request") {
    return {
      eventType: "approval/request",
      meta: {
        turn,
        step,
        approvalId: record.approvalId,
        toolCallId: record.toolCallId,
        toolName: record.toolName ?? null,
        actionClass: record.actionClass ?? null,
        question: record.question
      }
    };
  }
  return {
    eventType: "approval/answer",
    meta: {
      turn,
      step,
      approvalId: record.approvalId,
      answer: record.answer,
      answeredBy: record.answeredBy,
      approvalRequestId: record.approvalRequestId ?? null,
      reason: record.reason ?? null
    }
  };
}

/** An `approval/request` row's meta, as read back out of the log. */
export interface ApprovalRequestMeta {
  readonly turn: number;
  readonly step: number | null;
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly toolName: string | null;
  readonly actionClass: string | null;
  readonly question: string;
}

/** An `approval/answer` row's meta, as read back out of the log. */
export interface ApprovalAnswerMeta {
  readonly turn: number;
  readonly step: number | null;
  readonly approvalId: string;
  readonly answer: ApprovalAnswer;
  readonly answeredBy: string;
  readonly approvalRequestId: string | null;
  readonly reason: string | null;
}

function parseMeta(metaJson: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed as Record<string, unknown>;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

/**
 * Read an `approval/request` row back.
 *
 * Null for anything malformed rather than a guess: an approval surface that
 * rendered a half-understood question would be inventing the part it could not
 * read, and the part it could not read is what the human was asked.
 */
export function readApprovalRequestMeta(metaJson: string): ApprovalRequestMeta | null {
  const meta = parseMeta(metaJson);
  if (meta === null) return null;
  const { turn, step, approvalId, toolCallId, toolName, actionClass, question } = meta;
  if (!Number.isSafeInteger(turn) || (turn as number) < 1) return null;
  if (step !== null && (!Number.isSafeInteger(step) || (step as number) < 1)) return null;
  if (typeof approvalId !== "string" || approvalId.length === 0) return null;
  if (typeof toolCallId !== "string") return null;
  if (typeof question !== "string") return null;
  const name = optionalString(toolName);
  const klass = optionalString(actionClass);
  if (name === undefined || klass === undefined) return null;
  return {
    turn: turn as number,
    step: (step as number | null) ?? null,
    approvalId,
    toolCallId,
    toolName: name,
    actionClass: klass,
    question
  };
}

/** Read an `approval/answer` row back. Null for anything malformed — see above. */
export function readApprovalAnswerMeta(metaJson: string): ApprovalAnswerMeta | null {
  const meta = parseMeta(metaJson);
  if (meta === null) return null;
  const { turn, step, approvalId, answer, answeredBy, approvalRequestId, reason } = meta;
  if (!Number.isSafeInteger(turn) || (turn as number) < 1) return null;
  if (step !== null && (!Number.isSafeInteger(step) || (step as number) < 1)) return null;
  if (typeof approvalId !== "string" || approvalId.length === 0) return null;
  if (typeof answer !== "string" || !ANSWERS.has(answer)) return null;
  if (typeof answeredBy !== "string" || answeredBy.length === 0) return null;
  const requestId = optionalString(approvalRequestId);
  const why = optionalString(reason);
  if (requestId === undefined || why === undefined) return null;
  return {
    turn: turn as number,
    step: (step as number | null) ?? null,
    approvalId,
    answer: answer as ApprovalAnswer,
    answeredBy,
    approvalRequestId: requestId,
    reason: why
  };
}
