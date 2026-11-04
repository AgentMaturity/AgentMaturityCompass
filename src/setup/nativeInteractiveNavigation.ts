import { loadSessionEventHistory } from "../session/sessionEventHistory.js";
import { readSessionWriter } from "../session/sessionOwnership.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

/** Derived navigation only: selection never claims a writer or grants execution. */
export interface NativeInteractiveSessionSummary {
  readonly sessionId: string;
  readonly source: "native" | "imported";
  readonly agentId: string | null;
  readonly parentSessionId: string | null;
  readonly state: "released" | "active" | "sealed" | "interrupted" | "unknown";
  readonly headEventId: string;
  readonly headEventHash: string;
  readonly updatedAt: number;
  readonly turns: number;
  readonly canResume: boolean;
}

export function listNativeInteractiveSessions(workspace: string, agentId: string): NativeInteractiveSessionSummary[] {
  const history = loadSessionEventHistory({ workspace });
  const grouped = new Map<string, typeof history.events[number][]>();
  for (const event of history.events) {
    const rows = grouped.get(event.session_id) ?? [];
    rows.push(event); grouped.set(event.session_id, rows);
  }
  return history.sessions.flatMap(record => {
    const rows = grouped.get(record.session_id) ?? [];
    const head = rows.at(-1);
    if (!head) return [];
    const opened = rows.find(row => row.event_type === "session/open");
    // Operational audit sessions have no native conversation to select.
    if (!opened || !extractEnvelope(opened.meta_json)) return [];
    const meta = JSON.parse(opened.meta_json) as { agentId?: unknown; parentSession?: { sessionId?: unknown } };
    const source = opened.runtime === "amc" ? "native" : "imported";
    const owner = readSessionWriter(head);
    const starts = rows.filter(row => row.event_type === "turn/start").length;
    const seals = rows.filter(row => row.event_type === "turn/seal").length;
    const state = record.ended_ts !== null ? "sealed" : owner?.state === "active" ? "active"
      : starts > seals ? "interrupted" : owner?.state === "released" ? "released" : "unknown";
    const recordedAgent = typeof meta.agentId === "string" ? meta.agentId : null;
    return [{ sessionId: record.session_id, source, agentId: recordedAgent,
      parentSessionId: typeof meta.parentSession?.sessionId === "string" ? meta.parentSession.sessionId : null,
      state, headEventId: head.id, headEventHash: head.event_hash, updatedAt: head.ts, turns: starts,
      canResume: source === "native" && state === "released" && recordedAgent === agentId } satisfies NativeInteractiveSessionSummary];
  }).sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId)).slice(0, 20);
}

export function renderNativeInteractiveSession(row: NativeInteractiveSessionSummary): string {
  return escapeTerminalControls(`Session ${row.sessionId} · ${row.source} · ${row.state} · agent ${row.agentId ?? "unknown"} · ${row.turns} turns`
    + ` · parent ${row.parentSessionId ?? "none"} · head ${row.headEventId}`
    + ` · ${row.canResume ? "inspect, verify, resume or fork" : "inspect/verify; resume blocked (requires released native history for this agent)"}`);
}

/** Re-read authenticated metadata after inspection/confirmation and again before dispatch. */
export function assertNativeInteractiveSelection(workspace: string, agentId: string, selected: NativeInteractiveSessionSummary): NativeInteractiveSessionSummary {
  const current = listNativeInteractiveSessions(workspace, agentId).find(row => row.sessionId === selected.sessionId);
  if (!current || current.headEventHash !== selected.headEventHash) throw new Error("Session changed since selection. Use /resume to inspect it again; no task was sent.");
  if (current.source !== "native") throw new Error("Only native history may be resumed here; imported history remains browse-only.");
  if (current.agentId !== agentId) throw new Error("The session belongs to another agent; no writer was acquired.");
  if (!current.canResume) throw new Error("Resume selection requires released native history. Inspect the writer or recovery state; no writer was acquired.");
  return current;
}
