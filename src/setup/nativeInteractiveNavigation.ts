import { summarizeNativeSessions, type NativeSessionSummary } from "../session/latestSession.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

/** Derived navigation only: selection never claims a writer or grants execution. */
export type NativeInteractiveSessionSummary = NativeSessionSummary;

/** The 20 most recent sessions for the chat picker. The selector itself lives in src/session/latestSession.ts. */
export function listNativeInteractiveSessions(workspace: string, agentId: string): NativeInteractiveSessionSummary[] {
  return summarizeNativeSessions(workspace, agentId).slice(0, 20);
}

export function renderNativeInteractiveSession(row: NativeInteractiveSessionSummary): string {
  return escapeTerminalControls(`Session ${row.sessionId} · ${row.source} · ${row.state} · agent ${row.agentId ?? "unknown"} · ${row.turns} turns`
    + ` · parent ${row.parentSessionId ?? "none"} · head ${row.headEventId}`
    + ` · ${row.canResume ? "inspect, verify, resume or fork" : "inspect/verify; resume blocked (requires released native history for this agent)"}`);
}

/**
 * `amc sessions list` (smoke M-6): this agent's native agent-loop sessions, newest first, each with how to resume or
 * inspect it. Read-only derived navigation, like the chat picker.
 */
export function renderNativeSessionList(workspace: string, agentId: string, limit: number): string[] {
  return summarizeNativeSessions(workspace, agentId).filter(row => row.source === "native" && row.agentId === agentId).slice(0, limit)
    .map(row => escapeTerminalControls(`${row.sessionId} · updated ${new Date(row.updatedAt).toISOString()} · ${row.state} · ${row.turns} turns · `
      + (row.canResume ? `resume: amc agent-loop chat --session ${row.sessionId} (with the original --provider/--model)`
        : `inspect: amc session show ${row.sessionId} · continue in a fork: amc agent-loop chat --fork-from ${row.sessionId}`)));
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
