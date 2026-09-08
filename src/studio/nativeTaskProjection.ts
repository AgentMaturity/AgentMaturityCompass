import { openLedger } from "../ledger/ledger.js";
import { validateAcpCommittedTail } from "../acp/acpCommittedUpdates.js";
import { projectSessionUpdates, type AcpSessionUpdate } from "../acp/acpProjection.js";
import { readApprovalRequestMeta, readApprovalAnswerMeta } from "../session/approvalEventMeta.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import { listApprovalRequests } from "../approvals/approvalChainStore.js";
import { getApprovalInboxItem } from "../approvals/approvalInbox.js";
import { redactSdkText } from "../sdk/amcEvidence.js";
import type { EvidenceEvent } from "../types.js";
import type { NativeTaskApproval, NativeTaskEvent } from "./nativeTaskTypes.js";
import { opendirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";

/** Bound the existing signed inbox reader before it loads request files. */
function assertInboxBound(workspace: string, agentId: string): void {
  const path = join(getAgentPaths(workspace, agentId).rootDir, "approvals", "requests");
  let dir: ReturnType<typeof opendirSync>;
  try { dir = opendirSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  let count = 0, bytes = 0;
  try {
    for (let file = dir.readSync(); file; file = dir.readSync()) {
      if (!file.name.endsWith(".json")) continue;
      const info = lstatSync(join(path, file.name));
      if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 || ++count > 4096 || (bytes += info.size) > 16 * 1024 * 1024) throw new Error("Signed approval inbox exceeds the native display bound");
    }
  } finally { dir.closeSync(); }
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function contentText(value: unknown): string {
  if (object(value) && value.type === "text" && typeof value.text === "string") return value.text;
  if (Array.isArray(value)) return value.map(item => object(item) ? contentText(item.content) : "").join("\n");
  return "";
}
function project(update: AcpSessionUpdate, cursor: number): NativeTaskEvent | null {
  const kind = update.sessionUpdate === "agent_message_chunk" ? "assistant" : update.sessionUpdate === "user_message_chunk" ? "user"
    : update.sessionUpdate === "tool_call" ? "tool" : update.sessionUpdate === "tool_call_update" ? "tool-update" : null;
  if (kind === null) return null;
  const text = redactSdkText(typeof update.title === "string" ? update.title : contentText(update.content));
  return { cursor, kind, text, evidence: "committed",
    ...(typeof update.toolCallId === "string" ? { toolCallId: `call_${sha256Hex(update.toolCallId)}` } : {}),
    ...(typeof update.status === "string" ? { status: update.status } : {}) };
}
export interface NativeTaskProjection {
  readonly events: readonly NativeTaskEvent[]; readonly nextCursor: number; readonly firstCursor: number;
  readonly droppedEvents: number; readonly ending: string | null; readonly closed: boolean;
  readonly endingId: string | null;
  readonly approvals: readonly NativeTaskApproval[]; readonly approvalError: string | null;
}

/** Authenticate before rendering. No summary or ACP stop code is promoted to a whole-ledger verdict. */
export function readNativeTaskProjection(workspace: string, sessionId: string, agentId: string): NativeTaskProjection {
  const ledger = openLedger(workspace, { readonly: true });
  let rows: EvidenceEvent[];
  try {
    const size = ledger.db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(length(meta_json)),0) AS bytes FROM evidence_events WHERE session_id = ?").get(sessionId) as { count: number; bytes: number };
    if (size.count > 100_000 || size.bytes > 16 * 1024 * 1024) throw new Error("Native session projection exceeded its bound.");
    rows = ledger.db.prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC").all(sessionId) as EvidenceEvent[];
  } finally { ledger.close(); }
  if (rows.length === 0) throw new Error("Native session has no committed opening.");
  validateAcpCommittedTail(workspace, sessionId, rows, 0, null);
  if (rows[0]?.event_type !== "session/open" || JSON.parse(rows[0].meta_json).agentId !== agentId) throw new Error("Native session belongs to a different agent.");
  const events: NativeTaskEvent[] = [];
  const requests = new Map<string, NonNullable<ReturnType<typeof readApprovalRequestMeta>>>();
  let bytes = 0, cursor = 0, droppedEvents = 0, ending: string | null = null, endingId: string | null = null, closed = false;
  for (const row of rows) {
    if (row.event_type === "approval/request") { const request = readApprovalRequestMeta(row.meta_json); if (request) requests.set(request.approvalId, request); }
    if (row.event_type === "approval/answer") { const answer = readApprovalAnswerMeta(row.meta_json); if (answer) requests.delete(answer.approvalId); }
    if (row.event_type === "turn/end") { ending = readTurnEndMeta(row.meta_json)?.reason ?? null; endingId = row.id; }
    if (row.event_type === "session/close") closed = true;
    for (const update of projectSessionUpdates(workspace, [row], 0, { includeUser: true }).updates) {
      const event = project(update, ++cursor);
      if (!event) { cursor--; continue; }
      const size = Buffer.byteLength(JSON.stringify(event));
      // Oversized individual blocks are withheld, never silently shortened into an apparently exact quote.
      if (size > 2 * 1024 * 1024) { droppedEvents++; continue; }
      events.push(event); bytes += size;
      while (events.length > 512 || bytes > 2 * 1024 * 1024) { bytes -= Buffer.byteLength(JSON.stringify(events.shift()!)); droppedEvents++; }
    }
  }
  const approvals: NativeTaskApproval[] = [];
  let approvalError: string | null = null;
  if (requests.size > 0) {
    try {
      if (requests.size > 32) throw new Error();
      assertInboxBound(workspace, agentId);
      const candidates = listApprovalRequests({ workspace, agentId });
      for (const candidate of candidates) {
        const native = requests.get(candidate.intentId);
        if (!native) continue;
        const item = getApprovalInboxItem({ workspace, agentId, approvalRequestId: candidate.approvalRequestId });
        if (item.request.agentId !== agentId || item.request.toolName !== native.toolName || item.request.actionClass !== native.actionClass
          || !item.requestIntegrity.valid || !item.chainIntegrity.valid || !item.contextIntegrity.valid) throw new Error();
        if (item.status !== "PENDING") continue;
        approvals.push({ approvalRequestId: item.request.approvalRequestId, requestDigestSha256: item.requestDigestSha256,
          toolName: item.request.toolName, actionClass: item.request.actionClass, riskTier: item.request.riskTier,
          status: item.status, required: item.quorum.required, received: item.quorum.received, expiresTs: item.request.expiresTs });
      }
    } catch { approvals.length = 0; approvalError = "Pending approval records could not be authenticated; use the signed approval inbox before deciding."; }
  }
  return { events, nextCursor: cursor, firstCursor: events[0]?.cursor ?? cursor + 1, droppedEvents, ending, endingId, closed, approvals, approvalError };
}
