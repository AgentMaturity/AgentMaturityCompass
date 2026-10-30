import { LoopInbox } from "../agent/inbox.js";
import { readLoopInboxMeta } from "../session/loopEventMeta.js";
import { snapshotReleasedSession, withReleasedNativeWriter } from "../session/sessionCompactionWorkflow.js";
import type { EvidenceEvent } from "../types.js";

interface NativeQueuedSubmission { readonly messageId: string; readonly target: string; readonly origin: string }
type Fate = "pending" | "dispatched" | "withdrawn";
export type NativeWithdrawOutcome =
  | { readonly status: "withdrawn"; readonly messageId: string }
  /** Claimed by a turn whose ending is recorded: delivered, never withdrawn. */
  | { readonly status: "dispatched"; readonly messageId: string }
  /** Claimed by a turn with no recorded ending: TOOL_OUTCOME_UNKNOWN, never withdrawn. */
  | { readonly status: "in-flight"; readonly messageId: string }
  | { readonly status: "already-withdrawn" | "unknown"; readonly messageId: string };

/** Fold this session's signed inbox rows: which IDs are still queued, and what became of the rest. */
function foldInbox(rows: readonly EvidenceEvent[]) {
  const lanes: Record<string, NativeQueuedSubmission[]> = { "next-turn": [], "next-step": [] };
  const fates = new Map<string, Fate>();
  for (const row of rows) {
    if (row.event_type !== "loop/inbox") continue;
    const meta = readLoopInboxMeta(row.meta_json);
    const lane = meta === null ? undefined : lanes[meta.target];
    if (meta === null || lane === undefined || meta.start + meta.removedCount > lane.length) throw new Error(`Unreadable queued-submission row ${row.id}; nothing was withdrawn.`);
    const inserted = meta.op === "insert" ? [{ messageId: meta.messageIds[0]!, target: meta.target, origin: meta.origin ?? "unknown" }] : [];
    for (const removed of lane.splice(meta.start, meta.removedCount, ...inserted)) fates.set(removed.messageId, meta.op === "claim" ? "dispatched" : "withdrawn");
    for (const added of inserted) fates.set(added.messageId, "pending");
  }
  return { pending: [...lanes["next-turn"]!, ...lanes["next-step"]!], fates };
}

/** Read-only: verified rows, no writer. The head pins a later withdrawal to what was shown. */
export function listNativeQueuedSubmissions(workspace: string, sessionId: string) {
  const source = snapshotReleasedSession(workspace, sessionId, undefined, false);
  return { headEventId: source.head.id, pending: foldInbox(source.rows).pending };
}

/**
 * Withdraw one still-queued submission through the inbox's signed one-element
 * cancel splice. A dispatched submission is never reported as withdrawn.
 */
export function withdrawNativeQueuedSubmission(workspace: string, sessionId: string, messageId: string, expectedHeadEventId: string): NativeWithdrawOutcome {
  const source = snapshotReleasedSession(workspace, sessionId, undefined, false);
  const fate = foldInbox(source.rows).fates.get(messageId);
  // Claimed into a turn that has not sealed: the turn may still be running or may have died; its outcome is unknown.
  if (fate === "dispatched") return { status: source.interrupted ? "in-flight" : "dispatched", messageId };
  if (fate !== "pending") return { status: fate === "withdrawn" ? "already-withdrawn" : "unknown", messageId };
  if (source.backend !== "sqlite") throw new Error("Withdrawal through a resumed writer requires the native SQLite session store; nothing was withdrawn.");
  if (source.record.ended_ts !== null || source.record.session_seal_sig !== null) throw new Error("Closed sessions are immutable; nothing was withdrawn.");
  if (source.interrupted) throw new Error("This session has an unsealed turn whose outcome is unknown (TOOL_OUTCOME_UNKNOWN). Recover it explicitly before withdrawing; nothing was withdrawn.");
  if (source.head.id !== expectedHeadEventId) throw new Error("Session head changed since the queued list was shown; list it again. Nothing was withdrawn.");
  return withReleasedNativeWriter(workspace, sessionId, source.rows, source.head.id, "nothing was withdrawn; list it again", service =>
    new LoopInbox(service, () => {}).withdraw(messageId) ? { status: "withdrawn", messageId } : { status: "unknown", messageId });
}
