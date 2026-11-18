/**
 * What the console shows an auditor and an approver about native agent sessions (UX-04, UX-05): the sessions a CLI chat
 * or run wrote, each with the actions it took, an export of one session for an auditor, and, for an approval still
 * waiting, the exact call it would let run. Read-only: nothing here writes, signs or seals.
 *
 * The call shown for an approval is the one the session recorded before the person was asked, and only when its
 * arguments hash to the digest the signed request binds (`callMatchesRequest`); otherwise it says why it is not shown.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import type { ApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { buildSessionExport } from "../observability/sessionExport.js";
import { renderSessionExportHtml } from "../observability/sessionExportHtml.js";
import { readEventPayload } from "../session/eventPayload.js";
import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { summarizeNativeSessions } from "../session/latestSession.js";
import { callMatchesRequest, describeReportedCall } from "../setup/nativeApprovalPreview.js";
import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

/** A native session id as AMC mints them; anything else is refused before it reaches a file name or a store. */
export const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const MAX_SESSIONS = 50;
const MAX_ACTIONS = 20;

export interface AuditAction {
  readonly tool: string;
  readonly outcome: string;
  readonly approvedBy: string | null;
  readonly at: number;
}

export interface AuditSession {
  readonly sessionId: string;
  readonly agentId: string | null;
  readonly sealed: boolean;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly turns: number;
  readonly actions: readonly AuditAction[];
  readonly moreActions: number;
}

function meta(row: EvidenceEvent): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.meta_json);
    return parsed !== null && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

/** Each tool call of one session, in order, with its recorded outcome and who approved it (when a person did). */
function actionsOf(rows: readonly EvidenceEvent[]): AuditAction[] {
  const answers = new Map<string, string>();
  const asked = new Map<string, string>();
  for (const row of rows) {
    const m = meta(row);
    if (row.event_type === "approval/request" && text(m.approvalId) && text(m.toolCallId)) asked.set(m.approvalId as string, m.toolCallId as string);
    if (row.event_type === "approval/answer" && m.answer === "allow" && text(m.approvalId)) {
      const call = asked.get(m.approvalId as string);
      if (call !== undefined) answers.set(call, text(m.answeredBy) ?? "a person");
    }
  }
  const calls = new Map<string, AuditAction>();
  for (const row of rows) {
    const m = meta(row);
    const id = text(m.toolCallId);
    if (id === null) continue;
    if (row.event_type === "tool/call") calls.set(id, { tool: text(m.toolName) ?? "a tool", outcome: "no result recorded", approvedBy: null, at: row.ts });
    if (row.event_type === "tool/result" && calls.has(id)) calls.set(id, { ...calls.get(id)!, outcome: text(m.outcome) ?? "unknown", approvedBy: answers.get(id) ?? null });
  }
  return [...calls.values()];
}

/** The workspace's native sessions, newest first, with what each one did. */
export function listAuditSessions(workspace: string, agentId = "default"): { readonly sessions: readonly AuditSession[]; readonly total: number } {
  const history = loadSessionEventHistory({ workspace });
  const rowsBy = new Map<string, EvidenceEvent[]>();
  for (const row of history.events) rowsBy.set(row.session_id, [...(rowsBy.get(row.session_id) ?? []), row]);
  const native = summarizeNativeSessions(workspace, agentId, history).filter((summary) => summary.source === "native");
  return { total: native.length, sessions: native.slice(0, MAX_SESSIONS).map((summary) => {
    const rows = rowsBy.get(summary.sessionId) ?? [];
    const actions = actionsOf(rows);
    return { sessionId: summary.sessionId, agentId: summary.agentId, sealed: summary.state === "sealed", startedAt: rows[0]?.ts ?? summary.updatedAt,
      updatedAt: summary.updatedAt, turns: summary.turns, actions: actions.slice(-MAX_ACTIONS), moreActions: Math.max(0, actions.length - MAX_ACTIONS) };
  }) };
}

/**
 * One session as a file for an auditor: the signed record (`json`, what `amc-verify` and `amc session verify-export`
 * read) or the readable page (`html`). Record only: message and tool text are not embedded, so the file holds what the
 * console already shows any signed-in reader (tool names, outcomes, approval questions and answers) plus digests.
 */
export function sessionAuditExport(workspace: string, sessionId: string, format: "json" | "html"):
  { readonly status: 200; readonly fileName: string; readonly contentType: string; readonly body: string } | { readonly status: 400 | 404; readonly error: string } {
  if (!SESSION_ID.test(sessionId)) return { status: 400, error: "not a session id" };
  if (!loadSessionEventHistory({ workspace }).sessions.some((record) => record.session_id === sessionId)) return { status: 404, error: "no such session in this workspace" };
  const doc = buildSessionExport({ workspace, sessionId, includeContent: false });
  const fileName = `amc-session-${sessionId.slice(0, 8)}.${format}`;
  return format === "json"
    ? { status: 200, fileName, contentType: "application/json; charset=utf-8", body: JSON.stringify(doc, null, 2) }
    : { status: 200, fileName, contentType: "text/html; charset=utf-8", body: renderSessionExportHtml(doc) };
}

/** The approval's own session row, then the tool call it asked about; null when no session recorded it. */
function recordedCall(workspace: string, request: ApprovalRequestRecord): { toolName: string; rawArguments: string } | { unavailable: string } {
  const events = loadSessionEventHistory({ workspace }).events;
  const asked = events.find((row) => row.event_type === "approval/request" && meta(row).approvalId === request.intentId);
  const callId = asked === undefined ? null : text(meta(asked).toolCallId);
  const call = callId === null ? undefined
    : events.find((row) => row.session_id === asked!.session_id && row.event_type === "tool/call" && meta(row).toolCallId === callId);
  if (call === undefined) return { unavailable: "no agent session recorded this call, so its arguments cannot be shown here" };
  const payload = readEventPayload(workspace, call);
  if (payload.status !== "ok") return { unavailable: "the recorded arguments cannot be read here (the vault may be locked)" };
  if (sha256Hex(payload.bytes) !== call.payload_sha256) return { unavailable: "the recorded arguments failed their digest check, so they are not shown" };
  return { toolName: text(meta(call).toolName) ?? request.toolName, rawArguments: payload.bytes.toString("utf8") };
}

/**
 * What a person deciding this request is approving: the call, shown as text (a diff, a command and its folder, a host),
 * only when it is the call the signed request binds. Shown for a request still waiting; a decided one points to its
 * session record, because a diff against today's files would not be what was approved then.
 */
export function approvalCallFor(workspace: string, request: ApprovalRequestRecord, status: string):
  ShownCall | { readonly unavailable: string } {
  if (status !== "PENDING") return { unavailable: "this request is decided; what ran is in the session's record (Records, Agent sessions)" };
  try {
    const call = recordedCall(workspace, request);
    if ("unavailable" in call) return call;
    if (!callMatchesRequest(workspace, request, call)) return { unavailable: "the recorded call does not match what the signed request binds, so it is not shown" };
    // Redact every argument value whole BEFORE it is split into lines or cut for display, so a secret spanning lines
    // (a private key body) or one a cut would split is never partly shown.
    const redacted = redactArguments(call.rawArguments);
    const shown = shareable(workspace, describeReportedCall(workspace, redacted.call === null ? call : { toolName: call.toolName, arguments: redacted.call }));
    return redacted.count > 0 || redacted.call === null ? { ...shown, complete: false } : shown;
  } catch (error) {
    return { unavailable: `the call could not be shown: ${error instanceof Error ? error.message : String(error)}` };
  }
}

type ShownCall = { readonly title: string; readonly lines: readonly string[]; readonly complete: boolean; readonly folder: string };

/**
 * The call as it may leave this machine's process for a browser: host paths (the workspace, the home folder) written
 * relative, and secrets redacted as `amc session export` redacts them; anything redacted marks the call incomplete.
 */
function shareable(workspace: string, call: { title: string; lines: readonly string[]; complete: boolean }): ShownCall {
  let real = workspace;
  try { real = realpathSync(workspace); } catch { /* the given path is all there is */ }
  const hosts: Array<[string, string]> = [[real, "."], [workspace, "."], [homedir(), "~"]];
  let redactions = 0;
  const clean = (text: string): string => {
    let out = text;
    for (const [host, shown] of hosts) if (host.length > 1) out = out.split(host).join(shown);
    const redacted = redactSecrets(out, (type) => `[REDACTED:${type}]`);
    redactions += redacted.findings.length;
    return redacted.redacted;
  };
  const lines = call.lines.map(clean);
  return { title: clean(call.title), lines, complete: call.complete && redactions === 0, folder: "." };
}

/** Roles that record approval decisions at all (Studio's decide route), before the request's own rolesAllowed. */
const DECIDING_ROLES = ["APPROVER", "OWNER", "AUDITOR"];

/**
 * The `call` field of one approval request, only for someone who may decide THIS request (a deciding role the signed
 * request allows, or the admin token, as the decide route admits) or who raised it; everyone else gets nothing.
 */
export function approvalCallField(workspace: string, request: ApprovalRequestRecord, status: string,
  viewer: { readonly isAdmin: boolean; readonly userId: string | null; readonly roles: Iterable<string> }): { readonly call?: ShownCall | { readonly unavailable: string } } {
  const roles = [...viewer.roles];
  const decides = viewer.isAdmin || roles.some((role) => DECIDING_ROLES.includes(role) && (request.rolesAllowed as readonly string[]).includes(role));
  const raised = viewer.userId !== null && request.initiator !== undefined && (request.initiator === viewer.userId || request.initiator.endsWith(`:${viewer.userId}`));
  return decides || raised ? { call: approvalCallFor(workspace, request, status) } : {};
}

/** Each string in the parsed arguments, redacted whole; null (shown as unreadable) when they are not a JSON object. */
function redactArguments(raw: string): { readonly call: Record<string, unknown> | null; readonly count: number } {
  let parsed: unknown;
  try { parsed = JSON.parse(raw === "" ? "{}" : raw); } catch { return { call: null, count: 0 }; }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { call: null, count: 0 };
  let count = 0;
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const result = redactSecrets(value, (type) => `[REDACTED:${type}]`);
      count += result.findings.length;
      return result.redacted;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]));
    return value;
  };
  return { call: walk(parsed) as Record<string, unknown>, count };
}
