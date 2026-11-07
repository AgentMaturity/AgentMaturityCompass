/**
 * "The latest session I can continue" (SH-LOOP-01): one selector, shared by
 * `amc agent-loop run --continue`, `amc agent-loop chat --continue`,
 * `amc session latest` and the chat `/resume` picker.
 *
 * Derived navigation only: selecting a session never claims a writer and never
 * grants execution. The selector applies the same continuation controls resume
 * applies (src/session/sessionContinuationControls.ts): a delegated child, a
 * session a parent or hook stopped, or one with an unresolved child is not a
 * continuation candidate even when its writer is released. It does NOT know the
 * digests of the run that will resume, so a flag change since the original run
 * is still refused by resume itself (CONFIGURATION_MISMATCH), and the caller
 * reports that refusal naming the session it chose.
 *
 * Interrupted sessions (a `turn/start` without its seal) are deliberately not
 * eligible: continuing one runs crash recovery, which appends synthetic closers
 * and should be an explicit `--session <id>` decision, not the side effect of a
 * convenience flag.
 */
import { loadSessionEventHistory, type SessionEventHistory } from "./sessionEventHistory.js";
import { readSessionWriter } from "./sessionOwnership.js";
import { assertSessionContinuationControls, SessionContinuationControlRefused } from "./sessionContinuationControls.js";
import { extractEnvelope } from "./sessionTypes.js";

export type NativeSessionState = "released" | "active" | "sealed" | "interrupted" | "unknown";

/** One native session as navigation sees it. */
export interface NativeSessionSummary {
  readonly sessionId: string;
  readonly source: "native" | "imported";
  readonly agentId: string | null;
  readonly parentSessionId: string | null;
  readonly state: NativeSessionState;
  readonly headEventId: string;
  readonly headEventHash: string;
  readonly updatedAt: number;
  readonly turns: number;
  /** Native, released and recorded for this agent: the picker's rule. Continuation controls are checked separately. */
  readonly canResume: boolean;
}

/** Every session in the workspace, most recently updated first (ties by session id). Never capped here. */
export function summarizeNativeSessions(workspace: string, agentId: string, history: SessionEventHistory = loadSessionEventHistory({ workspace })): NativeSessionSummary[] {
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
    const state: NativeSessionState = record.ended_ts !== null ? "sealed" : owner?.state === "active" ? "active"
      : starts > seals ? "interrupted" : owner?.state === "released" ? "released" : "unknown";
    const recordedAgent = typeof meta.agentId === "string" ? meta.agentId : null;
    return [{ sessionId: record.session_id, source, agentId: recordedAgent,
      parentSessionId: typeof meta.parentSession?.sessionId === "string" ? meta.parentSession.sessionId : null,
      state, headEventId: head.id, headEventHash: head.event_hash, updatedAt: head.ts, turns: starts,
      canResume: source === "native" && state === "released" && recordedAgent === agentId } satisfies NativeSessionSummary];
  }).sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId));
}

export type LatestSessionResult =
  | { readonly ok: true; readonly session: NativeSessionSummary }
  | {
      readonly ok: false;
      readonly code: "NO_SESSION_TO_CONTINUE";
      readonly reason: string;
      /** Newest first: why each recent session was passed over, so an operator can pick one by id. */
      readonly skipped: readonly { readonly sessionId: string; readonly reason: string }[];
    };

/** Why a session the picker would show is still not a continuation candidate. */
function continuationBlocker(history: SessionEventHistory, row: NativeSessionSummary, agentId: string): string | null {
  if (row.source !== "native") return "imported history is browse-only";
  if (row.agentId !== agentId) return `recorded for agent ${row.agentId ?? "unknown"}`;
  if (row.state !== "released") return `writer state is ${row.state}${row.state === "interrupted" ? " (continue it explicitly with --session <id> to run recovery)" : ""}`;
  try { assertSessionContinuationControls(history, row.sessionId); }
  catch (error) { return error instanceof SessionContinuationControlRefused ? error.code : "continuation controls could not be read"; }
  return null;
}

/** The newest session this agent can continue in this workspace, or a refusal that names what was skipped. */
export function resolveLatestSession(params: { readonly workspace: string; readonly agentId: string }): LatestSessionResult {
  const history = loadSessionEventHistory({ workspace: params.workspace });
  const skipped: { sessionId: string; reason: string }[] = [];
  for (const row of summarizeNativeSessions(params.workspace, params.agentId, history)) {
    const blocker = continuationBlocker(history, row, params.agentId);
    if (blocker === null) return { ok: true, session: row };
    if (skipped.length < 10) skipped.push({ sessionId: row.sessionId, reason: blocker });
  }
  return { ok: false, code: "NO_SESSION_TO_CONTINUE",
    reason: `no released native session recorded for agent ${params.agentId} in this workspace; start one with amc agent-loop run --keep-open, or name a session with --session <id>`,
    skipped };
}
