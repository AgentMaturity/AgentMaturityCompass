import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { budgetMeta, NATIVE_BUDGET_RESERVATION, projectBudgetUsage, readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { assertJsonlWriterAvailable } from "../persistence/jsonl/jsonlWriterLock.js";
import { jsonlEventsPath, jsonlLockPath, jsonlSessionsPath } from "../persistence/jsonl/jsonlEventLog.js";
import type { SessionEventStore } from "../persistence/sessionEventStore.js";
import type { EvidenceEvent, RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { loadSessionEventHistory, SessionHistoryRefused, type SessionEventHistory } from "./sessionEventHistory.js";
import { exactHistoryId } from "./sessionHistoryReader.js";
import { assertSessionOwnerAvailable, SessionWriterRefused } from "./sessionOwnership.js";
import { SESSION_EVENT_TYPES, extractEnvelope } from "./sessionTypes.js";
import { readTurnEndMeta } from "./turnLifecycleMeta.js";

export class JsonlContinuationRefused extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "JsonlContinuationRefused"; }
}
function refuse(code: string, message: string): never { throw new JsonlContinuationRefused(code, message); }
function meta(row: EvidenceEvent): Record<string, unknown> { return JSON.parse(row.meta_json) as Record<string, unknown>; }

export interface JsonlContinuationOptions {
  readonly workspace: string;
  readonly sessionId: string;
  readonly agentId?: string;
  readonly compositionDigest?: string;
  readonly policyDigest?: string;
  readonly runtime?: RuntimeName;
  readonly expectedHeadEventHash?: string;
  readonly expectedMonitorFingerprint?: string;
  readonly allowSealed?: boolean;
  readonly verifyPayloads?: boolean;
  readonly store?: SessionEventStore;
}
export interface AuthenticatedJsonlContinuation {
  readonly history: SessionEventHistory;
  readonly rows: EvidenceEvent[];
  readonly needsRecovery: boolean;
  readonly pendingInputIds: readonly string[];
  readonly unknownToolCallIds: readonly string[];
  readonly unsettledRequestIds: readonly string[];
}

/** Do not normalize even a fully parseable tail: original bytes are immutable. */
function completeAppendBoundaries(workspace: string): void {
  for (const path of [jsonlEventsPath(workspace), jsonlSessionsPath(workspace)]) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) refuse("UNSAFE_STORAGE", "The original history files are not safe append targets. Restore the original local workspace before resuming.");
    const bytes = readFileSync(path);
    if (bytes.length && bytes[bytes.length - 1] !== 10) refuse("INCOMPLETE_TAIL", "The history ends in an incomplete record. Restore complete original evidence; resume will not trim or rewrite it.");
  }
}

function recoveryState(history: SessionEventHistory, rows: readonly EvidenceEvent[], sessionId: string) {
  const known = new Set([...SESSION_EVENT_TYPES, "session/resume", "session/release", "loop/retry"]);
  const pending = new Set<string>(), calls = new Set<string>(), results = new Set<string>(), seenResults = new Set<string>();
  const headers = new Set<string>(), settled = new Set<string>(), turns = new Set<number>(), ended = new Set<number>();
  let lastSeal = -1, lastTurn = 0;
  for (const [index, row] of rows.entries()) {
    const value = meta(row);
    if (!extractEnvelope(row.meta_json) || (row.event_type.includes("/") && !known.has(row.event_type))) {
      refuse("UNSUPPORTED_FORMAT", "This history contains an unsupported native event. Use a compatible AMC writer; signed records are not rewritten.");
    }
    if (row.event_type === "session/open" && index !== 0) refuse("INCOMPATIBLE_STATE", "The history has more than one session opening.");
    if (row.event_type === "turn/start") {
      if (!Number.isSafeInteger(value.turn) || Number(value.turn) !== lastTurn + 1 || (lastTurn && !ended.has(lastTurn))) {
        refuse("INCOMPATIBLE_STATE", "The recorded turn sequence cannot be safely reconstructed.");
      }
      lastTurn = Number(value.turn); turns.add(lastTurn);
    }
    if (row.event_type === "turn/end") {
      const ending = readTurnEndMeta(row.meta_json);
      if (!ending || !turns.has(ending.turn) || ended.has(ending.turn)) refuse("INCOMPATIBLE_STATE", "A recorded turn ending cannot be safely reconstructed.");
      ended.add(ending.turn);
      if (ending.cancelCause?.kind === "parent" || ending.cancelCause?.kind === "hook") {
        refuse("STOP_CONTROL", "A parent or policy control stopped this session. Resume cannot discard that control; continue through its original controlling workflow.");
      }
    }
    if (row.event_type === "loop/cancel") {
      const cause = value.cause as { kind?: unknown } | null;
      if (cause?.kind === "parent" || cause?.kind === "hook") refuse("STOP_CONTROL", "A parent or policy control stopped this session. Resume cannot discard that control; continue through its original controlling workflow.");
    }
    if (row.event_type === "turn/seal") lastSeal = index;
    if (row.event_type === "loop/inbox") {
      if (!Array.isArray(value.messageIds) || value.messageIds.some(id => typeof id !== "string") || !["insert", "claim", "cancel"].includes(String(value.op))) refuse("INCOMPATIBLE_STATE", "The recorded pending-input state is unsupported.");
      for (const id of value.messageIds as string[]) { if (value.op === "insert") pending.add(id); else pending.delete(id); }
    }
    if (row.event_type === "tool/call") {
      if (typeof value.toolCallId !== "string" || calls.has(value.toolCallId)) refuse("INCOMPATIBLE_STATE", "A recorded tool call has an invalid or repeated identity.");
      calls.add(value.toolCallId);
    }
    if (row.event_type === "tool/result") {
      if (typeof value.toolCallId !== "string" || !calls.has(value.toolCallId) || seenResults.has(value.toolCallId)) refuse("INCOMPATIBLE_STATE", "A recorded tool result has no unique original call.");
      seenResults.add(value.toolCallId);
      // An UNKNOWN recovery result does not settle actual side effects or cost.
      if (value.outcome !== "TOOL_OUTCOME_UNKNOWN") results.add(value.toolCallId);
    }
    if (row.event_type === "request/header") headers.add(row.id);
    if (row.event_type === "request/response" || row.event_type === "request/failure") {
      if (typeof value.headerEventId !== "string" || !headers.has(value.headerEventId) || settled.has(value.headerEventId)) refuse("INCOMPATIBLE_STATE", "A recorded model result has no unique original request.");
      settled.add(value.headerEventId);
    }
  }
  // A child's in-memory grant/abort subscription cannot be reconstructed from
  // its root agent name. Never promote it to an unrestricted standalone agent.
  for (const row of history.events) {
    const value = meta(row);
    if (row.session_id !== sessionId && value.childSessionId === sessionId) refuse("DELEGATED_SESSION", "A delegated session must retain its parent controller. Standalone resume cannot replace that controller.");
    if (row.session_id === sessionId && typeof value.childSessionId === "string") {
      const child = history.sessions.find(record => record.session_id === value.childSessionId);
      if (!child || child.ended_ts === null) refuse("UNRESOLVED_CHILD", "A child session has not reached an authenticated closed state. Resolve it through the parent workflow before resuming.");
    }
  }
  return { needsRecovery: rows.slice(lastSeal + 1).some(row => row.event_type === "turn/start"),
    pendingInputIds: [...pending], unknownToolCallIds: [...calls].filter(id => !results.has(id)),
    unsettledRequestIds: [...headers].filter(id => !settled.has(id)) };
}

function assertAccounting(workspace: string, rows: readonly EvidenceEvent[], agentId: string,
  state: ReturnType<typeof recoveryState>): void {
  // Already recorded outcomes and outstanding reservations keep their real
  // identity and amounts. A fresh/empty operations database is NOT a substitute
  // for a missing reservation journal for an uncertain dispatch.
  if (!rows.some(row => row.event_type === "request/header" || row.event_type === "tool/call")) return;
  let ledger: ReturnType<typeof openLedger> | undefined;
  try {
    const path = join(workspace, ".amc", "evidence.sqlite");
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    ledger = openLedger(workspace, { readonly: true });
    const budgetRows = readBudgetEvents(workspace, ledger);
    projectBudgetUsage(budgetRows, agentId, Date.now()); // Existing verifier/projection; no new counters or reservations.
    const reservations = budgetRows.filter(row => row.event_type === "audit" && budgetMeta(row).auditType === NATIVE_BUDGET_RESERVATION)
      .map(budgetMeta).filter(value => value.nativeSessionId === rows[0]!.session_id && value.agentId === agentId);
    for (const id of state.unsettledRequestIds) {
      if (!reservations.some(value => value.kind === "llm" && value.headerEventId === id)) throw new Error();
    }
    for (const id of state.unknownToolCallIds) {
      const acknowledged = budgetRows.some(row => row.session_id === rows[0]!.session_id && row.event_type === "audit"
        && ["TOOL_CALL_ALLOWED", "TOOL_CALL_FAILED", "TOOL_CALL_DENIED"].includes(String(budgetMeta(row).auditType)) && budgetMeta(row).callId === id);
      if (!acknowledged && !reservations.some(value => value.kind === "tool" && value.callId === id)) throw new Error();
    }
  } catch {
    refuse("ACCOUNTING_UNAVAILABLE", "Original usage or unresolved-dispatch reservations could not be authenticated. Restore the original budget journal before resuming; an empty replacement does not reset spend.");
  } finally { ledger?.close(); }
}

/**
 * Authenticated reconstruction, NOT a writer grant. The caller must additionally
 * hold the JSONL mutex and win the existing signed owner/head fence before append.
 * It is repeated under that mutex for both resume and standalone recovery.
 */
export function authenticateJsonlContinuation(options: JsonlContinuationOptions): AuthenticatedJsonlContinuation {
  exactHistoryId(options.sessionId, "sessionId");
  if (options.agentId !== undefined) exactHistoryId(options.agentId, "agentId");
  const history = loadSessionEventHistory({ workspace: options.workspace, verifyPayloads: options.verifyPayloads ?? true,
    ...(options.expectedMonitorFingerprint === undefined ? {} : { expectedMonitorFingerprint: options.expectedMonitorFingerprint }) });
  if (history.backend !== "jsonl") refuse("BACKEND_MISMATCH", "This recovery requires the original JSONL backend, not replacement history.");
  const rows = history.events.filter(row => row.session_id === options.sessionId).map(row => ({ ...row }));
  const record = history.sessions.find(value => value.session_id === options.sessionId);
  if (!record || !rows.length || rows[0]!.event_type !== "session/open") refuse("MISSING", "The exact native session is missing from the original JSONL history.");
  const opening = meta(rows[0]!);
  if (typeof opening.agentId !== "string" || typeof opening.compositionDigest !== "string" || typeof opening.policyDigest !== "string") refuse("UNSUPPORTED_FORMAT", "The signed session does not contain a supported native identity and configuration.");
  if ((options.agentId !== undefined && opening.agentId !== options.agentId) || (options.runtime !== undefined && record.runtime !== options.runtime)) refuse("AGENT_MISMATCH", "Select the original agent and runtime recorded for this session.");
  const digest = /^[a-f0-9]{64}$/i.test(opening.compositionDigest) ? opening.compositionDigest.toLowerCase() : sha256Hex(opening.compositionDigest);
  if (record.binary_sha256 !== digest) refuse("IDENTITY_MISMATCH", "The persisted lifecycle configuration differs from its signed opening.");
  if ((options.compositionDigest !== undefined && opening.compositionDigest !== options.compositionDigest)
    || (options.policyDigest !== undefined && opening.policyDigest !== options.policyDigest)) refuse("CONFIGURATION_MISMATCH", "Resume requires the original execution settings and signed policy. Restore them or deliberately start a separate task; this session cannot silently adopt changed controls.");
  if (options.expectedHeadEventHash !== undefined && rows.at(-1)!.event_hash !== options.expectedHeadEventHash) refuse("STALE_HEAD", "The authenticated session changed before ownership transfer. Refresh and review the new history.");
  if (options.store && (options.store.backendId !== "jsonl" || realpathSync(options.store.workspace) !== history.workspace
    || options.store.readSessionEvents(options.sessionId).at(-1)?.event_hash !== rows.at(-1)!.event_hash)) refuse("IDENTITY_MISMATCH", "The supplied writer does not address the exact authenticated workspace and session.");
  completeAppendBoundaries(history.workspace);
  if (record.ended_ts !== null) {
    if (!options.allowSealed) refuse("SEALED", "This session is closed or archived. Its sealed history cannot be resumed; use an explicit fork where supported.");
    return { history, rows, needsRecovery: false, pendingInputIds: [], unknownToolCallIds: [], unsettledRequestIds: [] };
  }
  const state = recoveryState(history, rows, options.sessionId);
  try { assertSessionOwnerAvailable(rows.at(-1)!); }
  catch (error) {
    if (error instanceof SessionWriterRefused) refuse(error.code === "LIVE_WRITER" ? "LIVE_WRITER" : "UNSUPPORTED_FORMAT", "The original writer is live, unknown, or lacks supported signed ownership. Release it explicitly or establish actual local process exit before refreshing.");
    throw error;
  }
  assertAccounting(history.workspace, rows, opening.agentId, state);
  return { history, rows, ...state };
}

export interface JsonlSessionRecoveryReadiness {
  readonly eligible: boolean;
  readonly state: "ready" | "interrupted" | "blocked";
  readonly reasonCode: string | null;
  readonly message: string;
}

/** Read-only eligibility, never authority. Resume repeats every check under its real writer mutex. */
export function inspectJsonlSessionRecovery(options: Pick<JsonlContinuationOptions, "workspace" | "sessionId" | "agentId">): JsonlSessionRecoveryReadiness {
  try {
    const value = authenticateJsonlContinuation({ ...options, verifyPayloads: false });
    assertJsonlWriterAvailable(jsonlLockPath(value.history.workspace));
    return { eligible: true, state: value.needsRecovery ? "interrupted" : "ready", reasonCode: null,
      message: value.needsRecovery ? "Resume will preserve the original history and mark unfinished work as interrupted or unknown. Nothing is automatically rerun; submit a new turn after recovery."
        : "The released or abandoned session can be resumed under its original settings. History and ownership are checked again before the writer opens." };
  } catch (error) {
    return { eligible: false, state: "blocked", reasonCode: error instanceof JsonlContinuationRefused || error instanceof SessionHistoryRefused ? error.code : "OWNERSHIP_UNAVAILABLE",
      message: error instanceof JsonlContinuationRefused || error instanceof SessionHistoryRefused ? error.message : "Exclusive ownership could not be established. Release the existing writer or confirm its actual exit, then refresh. No history was changed." };
  }
}
