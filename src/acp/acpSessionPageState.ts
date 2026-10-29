import { projectNativeRunUsage, type NativeRunUsage } from "../agent/nativeRunUsage.js";
import { projectNativeValidation } from "../agent/nativeValidationProjection.js";
import { readApprovalAnswerMeta, readApprovalRequestMeta } from "../session/approvalEventMeta.js";
import { readTurnEndMeta, type TurnEndMeta } from "../session/turnLifecycleMeta.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import type { EvidenceEvent } from "../types.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";

export interface AcpSessionPageState {
  readonly validation: ReturnType<typeof projectNativeValidation>;
  /** Aggregate counts describe the snapshot; consumers replace, never sum, page snapshots. */
  readonly usage: Omit<NativeRunUsage, "requestReports" | "issues"> & { readonly issueCount: number };
  readonly turn: { readonly number: number | null; readonly lastEnd: TurnEndMeta | null; readonly lastSeal: AcpCommittedTurn | null; readonly cancellationRequested: boolean };
  readonly approvals: { readonly pending: number; readonly answered: number; readonly denied: number; readonly unavailable: number };
  readonly toolOutcomes: { readonly unknown: number; readonly unavailable: number };
}

export interface AcpCommittedTurn {
  readonly turn: number;
  readonly seq: number;
  readonly eventId: string;
  readonly eventHash: string;
}

/** References existing signed rows; the caller authenticates the snapshot first. */
export function projectAcpTurnState(rows: readonly EvidenceEvent[]): AcpSessionPageState["turn"] {
  let turn: number | null = null, lastEnd: TurnEndMeta | null = null, lastSeal: AcpCommittedTurn | null = null;
  let cancellationRequested = false;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (row.event_type === "turn/start") {
      const envelope = extractEnvelope(row.meta_json), meta = JSON.parse(row.meta_json) as { turn?: unknown };
      if (!envelope || envelope.turn === null || !Number.isSafeInteger(envelope.turn) || envelope.turn < 1
        || meta.turn !== envelope.turn || (turn !== null && lastSeal === null)) refuse("turn-start-invalid");
      turn = envelope.turn; lastEnd = null; lastSeal = null; cancellationRequested = false;
    } else if (row.event_type === "turn/end") {
      const ended = readTurnEndMeta(row.meta_json), envelope = extractEnvelope(row.meta_json);
      if (!ended || turn === null || lastEnd !== null || ended.turn !== turn || envelope?.turn !== turn) refuse("turn-ending-invalid");
      lastEnd = ended;
    } else if (row.event_type === "turn/seal") {
      const envelope = extractEnvelope(row.meta_json), meta = JSON.parse(row.meta_json) as { turn?: unknown };
      if (turn === null || !lastEnd || lastSeal !== null || lastEnd.turn !== turn || !envelope
        || envelope.turn !== turn || meta.turn !== turn || envelope.seq !== index
        || !row.id || !/^[a-f0-9]{64}$/.test(row.event_hash)) refuse("turn-seal-invalid");
      lastSeal = { turn, seq: envelope.seq, eventId: row.id, eventHash: row.event_hash };
    } else if (row.event_type === "loop/cancel") cancellationRequested = true;
  }
  return { number: turn, lastEnd, lastSeal, cancellationRequested };
}

/** Fold only the authenticated fixed snapshot. No extra history or journal is opened. */
export function projectAcpSessionPageState(workspace: string, sessionId: string, rows: readonly EvidenceEvent[]): AcpSessionPageState {
  const approvals = new Map<string, "pending" | "allow" | "deny" | "unavailable">();
  let unknown = 0, unavailable = 0;
  for (const row of rows) {
    if (row.event_type === "approval/request") {
      const request = readApprovalRequestMeta(row.meta_json);
      if (!request || approvals.has(request.approvalId)) refuse("approval-request-invalid");
      approvals.set(request.approvalId, "pending");
    } else if (row.event_type === "approval/answer") {
      const answer = readApprovalAnswerMeta(row.meta_json);
      if (!answer || approvals.get(answer.approvalId) !== "pending") refuse("approval-answer-invalid");
      approvals.set(answer.approvalId, answer.answer);
    } else if (row.event_type === "tool/result") {
      const meta = JSON.parse(row.meta_json) as { outcome?: unknown };
      if (meta.outcome === "TOOL_OUTCOME_UNKNOWN") unknown++;
      else if (!["OK", "ERROR", "DENIED", "CANCELLED"].includes(String(meta.outcome))) unavailable++;
    }
  }
  const usage = projectNativeRunUsage(rows, sessionId);
  const { requestReports: _reports, issues, ...aggregate } = usage;
  const outcomes = [...approvals.values()];
  return { validation: projectNativeValidation(workspace, rows), usage: { ...aggregate, issueCount: issues.length },
    turn: projectAcpTurnState(rows),
    approvals: { pending: outcomes.filter(value => value === "pending").length,
      answered: outcomes.filter(value => value !== "pending").length,
      denied: outcomes.filter(value => value === "deny").length,
      unavailable: outcomes.filter(value => value === "unavailable").length },
    toolOutcomes: { unknown, unavailable } };
}
function refuse(reason: string): never {
  throw new AcpFailure(ACP_ERROR.internal, "Committed session state cannot be faithfully projected.", { reason });
}
