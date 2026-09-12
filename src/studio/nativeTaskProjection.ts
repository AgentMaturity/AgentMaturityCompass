import { projectNativeValidation } from "../agent/nativeValidationProjection.js";
import type { NativeValidationResult } from "../agent/nativeValidation.js";
import { readNativeTaskValidationOutputs } from "./nativeTaskValidation.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { validateAcpCommittedTail } from "../acp/acpCommittedUpdates.js";
import { validateAcpOrderedHistory } from "../acp/acpHistoryContinuity.js";
import { projectSessionUpdates, type AcpSessionUpdate } from "../acp/acpProjection.js";
import { readApprovalRequestMeta, readApprovalAnswerMeta } from "../session/approvalEventMeta.js";
import { readTurnEndMeta } from "../session/turnLifecycleMeta.js";
import { listApprovalRequests } from "../approvals/approvalChainStore.js";
import { getApprovalInboxItem } from "../approvals/approvalInbox.js";
import { redactSdkText } from "../sdk/amcEvidence.js";
import type { NativeTaskApproval, NativeTaskEvent, NativeTaskValidationOutput, NativeTaskHistory } from "./nativeTaskTypes.js";
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
  // ACP has already checked the complete signed source sequence and original bytes.
  // Return a bounded receipt, not another base64 copy or a fabricated original filename.
  if (kind === "user" && object(update.content) && (update.content.type === "image" || update.content.type === "audio")) {
    const type = update.content.type, content = update.content;
    if (typeof content.data !== "string" || typeof content.mimeType !== "string") throw new Error("Native attachment projection is incomplete.");
    const bytes = Buffer.from(content.data, "base64");
    if (bytes.toString("base64") !== content.data) throw new Error("Native attachment projection is not canonical.");
    return { cursor, kind, text: `[Committed ${type}: ${content.mimeType}, ${bytes.length} bytes]`, evidence: "committed",
      attachment: { type, mimeType: content.mimeType, byteLength: bytes.length, sha256: sha256Hex(bytes) } };
  }
  const text = redactSdkText(typeof update.title === "string" ? update.title : contentText(update.content));
  return { cursor, kind, text, evidence: "committed",
    ...(typeof update.toolCallId === "string" ? { toolCallId: `call_${sha256Hex(update.toolCallId)}` } : {}),
    ...(typeof update.status === "string" ? { status: update.status } : {}) };
}
export interface NativeTaskProjection {
  readonly history: NativeTaskHistory;
  readonly storeHeadEventHash: string;
  readonly validation: NativeValidationResult;
  readonly validationOutputs: readonly NativeTaskValidationOutput[];
  readonly events: readonly NativeTaskEvent[]; readonly nextCursor: number; readonly firstCursor: number;
  readonly droppedEvents: number; readonly ending: string | null; readonly closed: boolean;
  readonly endingId: string | null;
  readonly approvals: readonly NativeTaskApproval[]; readonly approvalError: string | null;
}

/** Authenticate before rendering. No summary or ACP stop code is promoted to a whole-ledger verdict. */
export function readNativeTaskProjection(workspace: string, sessionId: string, agentId: string): NativeTaskProjection {
  const history = loadSessionEventHistory({ workspace, sessionId, agentId });
  const rows = history.events;
  if (rows.length > 100_000 || rows.reduce((bytes, row) => bytes + Buffer.byteLength(row.meta_json), 0) > 16 * 1024 * 1024) {
    throw new Error("Native session projection exceeded its bound.");
  }
  if (rows.length === 0) throw new Error("Native session has no committed opening.");
  validateAcpCommittedTail(workspace, sessionId, rows, 0, null);
  if (rows[0]?.event_type !== "session/open" || JSON.parse(rows[0].meta_json).agentId !== agentId) throw new Error("Native session belongs to a different agent.");
  validateAcpOrderedHistory(workspace, rows);
  // Provenance is a cross-row contract. Projecting [row] loses the signed audio
  // source and can neither authenticate its complete sequence nor reject a missing suffix.
  const projected = projectSessionUpdates(workspace, rows, 0, { includeUser: true });
  if (projected.unsigned !== 0) throw new Error("Native history contains unsigned output.");
  const events: NativeTaskEvent[] = [];
  const requests = new Map<string, NonNullable<ReturnType<typeof readApprovalRequestMeta>>>();
  let bytes = 0, cursor = 0, droppedEvents = 0, ending: string | null = null, endingId: string | null = null, closed = false;
  for (const row of rows) {
    if (row.event_type === "approval/request") { const request = readApprovalRequestMeta(row.meta_json); if (request) requests.set(request.approvalId, request); }
    if (row.event_type === "approval/answer") { const answer = readApprovalAnswerMeta(row.meta_json); if (answer) requests.delete(answer.approvalId); }
    if (row.event_type === "turn/end") { ending = readTurnEndMeta(row.meta_json)?.reason ?? null; endingId = row.id; }
    if (row.event_type === "session/close") closed = true;
  }
  for (const update of projected.updates) {
    const event = project(update, ++cursor);
    if (!event) { cursor--; continue; }
    const size = Buffer.byteLength(JSON.stringify(event));
    // Oversized individual blocks are withheld, never silently shortened into an apparently exact quote.
    if (size > 2 * 1024 * 1024) { droppedEvents++; continue; }
    events.push(event); bytes += size;
    while (events.length > 512 || bytes > 2 * 1024 * 1024) { bytes -= Buffer.byteLength(JSON.stringify(events.shift()!)); droppedEvents++; }
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
  const validation = projectNativeValidation(workspace, rows);
  return { history: { status: "authenticated", backend: history.backend, headEventHash: history.headEventHash,
      eventCount: rows.length, message: "Persisted session metadata authenticated. Displayed payloads are checked separately; full run verification remains a separate action." },
    storeHeadEventHash: history.storeHeadEventHash, validation, validationOutputs: readNativeTaskValidationOutputs(workspace, rows, validation),
    events, nextCursor: cursor, firstCursor: events[0]?.cursor ?? cursor + 1, droppedEvents, ending, endingId, closed, approvals, approvalError };
}
