import type { EvidenceEvent } from "../types.js";
import { readSessionTodo } from "../tools/builtin/todoTool.js";
import { readSessionPlan } from "../tools/builtin/planTool.js";
import { recordDigest } from "../tools/builtin/nativeToolBreadth/signedSessionRecords.js";
import { ACP_ERROR, AcpFailure } from "./acpErrors.js";
import type { AcpSessionUpdate } from "./acpProjection.js";

function metaOf(event: EvidenceEvent): Record<string, unknown> {
  try { return JSON.parse(event.meta_json) as Record<string, unknown>; } catch { return {}; }
}

/** The files keep current standing state, not immutable transcript revisions.
 * Call only for a negotiated live/current-state projection, never frozen pages.
 */
export function projectCurrentAcpPlan(workspace: string, event: EvidenceEvent, events: readonly EvidenceEvent[]): AcpSessionUpdate | null {
  if (event.event_type !== "audit") return null;
  const meta = metaOf(event);
  if ((meta.auditType !== "NATIVE_TODO" && meta.auditType !== "NATIVE_PLAN") || meta.decision !== "allow") return null;
  const latest = events.filter(row => row.session_id === event.session_id && row.event_type === "audit"
    && metaOf(row).auditType === meta.auditType && metaOf(row).decision === "allow").at(-1);
  if (latest?.id !== event.id) return null;
  const listKind = meta.auditType === "NATIVE_TODO" ? "todo" : "plan";
  const value: unknown = listKind === "todo" ? readSessionTodo(workspace, event.session_id) : readSessionPlan(workspace, event.session_id);
  if (!isRecord(value) || value.sessionId !== event.session_id || value.agentId !== meta.agentId || value.revision !== meta.revision || recordDigest(value) !== meta.recordSha256) {
    throw new AcpFailure(ACP_ERROR.internal, "Current native plan does not match its observed receipt; retry from a fresh verified snapshot.");
  }
  const raw = value[listKind === "todo" ? "items" : "steps"];
  const allowed = listKind === "todo" ? ["pending", "in_progress", "completed"] : ["pending", "in_progress", "done", "blocked"];
  if (!Array.isArray(raw) || raw.length > 100 || raw.some(item => !isRecord(item)
    || typeof item.id !== "string" || !item.id || item.id.length > 64
    || typeof item[listKind === "todo" ? "content" : "title"] !== "string"
    || !(item[listKind === "todo" ? "content" : "title"] as string).length
    || (item[listKind === "todo" ? "content" : "title"] as string).length > 500
    || typeof item.status !== "string" || !allowed.includes(item.status))
    || (value.summary !== undefined && (typeof value.summary !== "string" || value.summary.length > 2_000))) {
    throw new AcpFailure(ACP_ERROR.internal, "Current native plan has an unsupported shape; no partial plan was projected.");
  }
  return {
    sessionUpdate: "plan",
    entries: raw.map(item => ({ content: item[listKind === "todo" ? "content" : "title"], priority: "medium",
      status: item.status === "done" || item.status === "completed" ? "completed" : item.status === "in_progress" ? "in_progress" : "pending" })),
    _meta: { "dev.agentmaturity.amc": { listKind, revision: value.revision, recordSha256: meta.recordSha256, state: "current",
      ...(value.summary === undefined ? {} : { summary: value.summary }), sourceStatuses: raw.map(item => item.status) } }
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
