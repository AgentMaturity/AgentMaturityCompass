import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { openSessionEventStore, readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { extractEnvelope, SESSION_ENVELOPE_META_KEY, SESSION_GENESIS } from "../session/sessionTypes.js";
import type { ActionClass, EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

export const NATIVE_BUDGET_RESERVATION = "NATIVE_BUDGET_RESERVATION";
export const actionClasses: readonly ActionClass[] = ["READ_ONLY", "WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"];
export const toolCounts = (): Record<ActionClass, number> => Object.fromEntries(actionClasses.map(key => [key, 0])) as Record<ActionClass, number>;
export function budgetMeta(event: EvidenceEvent): Record<string, unknown> {
  const parsed: unknown = JSON.parse(event.meta_json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Budget evidence metadata is malformed");
  return parsed as Record<string, unknown>;
}

/** Reads both the native backend and legacy/journal rows, never a caller's event body. */
export function readBudgetEvents(workspace: string, existing?: Ledger): EvidenceEvent[] {
  const ledger = existing ?? openLedger(workspace);
  try {
    const sources: (readonly EvidenceEvent[])[] = [ledger.getAllEvents()];
    if (readSessionStoreMarker(workspace) === "jsonl") {
      const store = openSessionEventStore(workspace, "jsonl", { readOnly: true });
      try {
        sources.push(store.readAllEvents());
      } finally { store.close(); }
    }
    const keys = getPublicKeyHistory(workspace, "monitor");
    const rows = new Map<string, EvidenceEvent>();
    for (const source of sources) {
      let previous = "GENESIS";
      const sessionHeads = new Map<string, { seq: number; hash: string }>();
      for (const row of source) {
        if (row.prev_event_hash !== previous) throw new Error("Budget evidence chain is incomplete");
        const preimage = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
          eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path,
          payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
        if (sha256Hex(`${row.prev_event_hash}${preimage}${row.payload_sha256}`) !== row.event_hash ||
            !verifyHexDigestAny(row.event_hash, row.writer_sig, keys)) throw new Error("Budget evidence signature or hash is invalid");
        const envelope = extractEnvelope(row.meta_json);
        const head = sessionHeads.get(row.session_id);
        if (!envelope && (head || SESSION_ENVELOPE_META_KEY in budgetMeta(row))) throw new Error("Budget evidence session envelope is missing or unsupported");
        if (envelope) {
          if (envelope.sessionId !== row.session_id || envelope.seq !== (head?.seq ?? 0) ||
              envelope.prevSessionEventHash !== (head?.hash ?? SESSION_GENESIS)) throw new Error("Budget evidence session chain is incomplete");
          sessionHeads.set(row.session_id, { seq: envelope.seq + 1, hash: row.event_hash });
        }
        const duplicate = rows.get(row.id);
        if (duplicate && duplicate.event_hash !== row.event_hash) throw new Error("Conflicting budget evidence ID");
        rows.set(row.id, row);
        previous = row.event_hash;
      }
    }
    // Journal sessions are sealed atomically with their reservation. Inspect
    // lifecycle rows too: a deleted final event leaves no successor link, but
    // its retained seal still witnesses the missing spend. This cannot detect
    // rollback of both evidence and lifecycle records without an external pin.
    const journalSessions = new Set([...rows.values()].filter(row => budgetMeta(row).auditType === NATIVE_BUDGET_RESERVATION).map(row => row.session_id));
    const finalHashes = new Map(sources[0]!.map(row => [row.session_id, row.event_hash]));
    for (const session of ledger.getAllSessions()) {
      const journal = journalSessions.has(session.session_id) || session.session_id.startsWith("native-budget-") || session.binary_path === "amc-native-budget-admission";
      if (!journal && !session.session_seal_sig && !session.session_final_event_hash) continue;
      const finalHash = finalHashes.get(session.session_id) ?? (journal ? null : sha256Hex("EMPTY_SESSION"));
      if (!session.session_seal_sig || !session.session_final_event_hash ||
          session.session_final_event_hash !== finalHash ||
          !verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, keys)) throw new Error("Budget evidence session seal is missing or does not match its final event");
      journalSessions.delete(session.session_id);
    }
    if (journalSessions.size) throw new Error("Budget evidence reservation has no sealed journal session");
    return [...rows.values()];
  } finally { if (!existing) ledger.close(); }
}

export function budgetSessionAgent(rows: readonly EvidenceEvent[], sessionId: string): string {
  const opens = rows.filter(row => row.session_id === sessionId && row.event_type === "session/open");
  if (opens.length !== 1) throw new Error("Native budget identity requires one signed session/open");
  const agentId = budgetMeta(opens[0]!).agentId;
  if (typeof agentId !== "string" || agentId.length === 0) throw new Error("Native budget identity is missing");
  return agentId;
}

const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const first = (row: Record<string, unknown>, keys: readonly string[]): number | null => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return number(row[key]);
  return null;
};

/** Totals win over components; aliases and reasoning subsets are never added twice. */
export function measuredUsage(value: unknown, native: boolean): { tokens: number; tokensKnown: boolean; cost: number; costKnown: boolean } {
  const usage = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const total = first(usage, ["total_tokens", "totalTokens"]);
  const input = first(usage, ["inputTokens", "input_tokens", "prompt_tokens"]);
  const output = first(usage, ["outputTokens", "output_tokens", "completion_tokens"]);
  const components = (input ?? 0) + (output ?? 0) + (native ? (number(usage.cacheReadTokens) ?? 0) + (number(usage.cacheWriteTokens) ?? 0) : 0);
  const tokens = total ?? components;
  // Historical native 0/0 cannot distinguish missing usage from measured zero.
  const reported = usage.reported !== false && (!native || usage.reported === true || tokens > 0);
  const cost = first(usage, ["cost_usd", "costUsd", "total_cost_usd", "totalCostUsd"]);
  return { tokens, tokensKnown: reported && usage.complete !== false && (total !== null || (input !== null && output !== null)), cost: cost ?? 0, costKnown: cost !== null };
}

export interface BudgetPeriodUsage {
  llmRequests: number;
  llmPreparedRequests: number;
  /** Known subtotal. Completeness flags must accompany any total-spend claim. */
  llmTokens: number;
  llmCostUsd: number;
  unknownLlmTokenRequests: number;
  /** Excludes explicit 401/403/429 protocol refusals, whose usage remains unknown. */
  blockingUnknownLlmTokenRequests: number;
  unknownLlmCostRequests: number;
  llmTokenUsageComplete: boolean;
  llmCostUsageComplete: boolean;
}
export interface BudgetUsage {
  daily: BudgetPeriodUsage & { toolExecutes: Record<ActionClass, number>; toolDenied: Record<ActionClass, number>; toolPending: Record<ActionClass, number>; llmPendingRequests: number };
  minute: BudgetPeriodUsage;
}
const period = (): BudgetPeriodUsage => ({ llmRequests: 0, llmPreparedRequests: 0, llmTokens: 0, llmCostUsd: 0,
  unknownLlmTokenRequests: 0, blockingUnknownLlmTokenRequests: 0, unknownLlmCostRequests: 0, llmTokenUsageComplete: true, llmCostUsageComplete: true });

export function projectBudgetUsage(rows: readonly EvidenceEvent[], agentId: string, now: number): BudgetUsage {
  const date = new Date(now); date.setHours(0, 0, 0, 0);
  const dayStart = date.getTime();
  const result: BudgetUsage = { daily: { ...period(), toolExecutes: toolCounts(), toolDenied: toolCounts(), toolPending: toolCounts(), llmPendingRequests: 0 }, minute: period() };
  const owners = new Map<string, string>();
  for (const row of rows) if (row.event_type === "session/open") owners.set(row.session_id, budgetSessionAgent(rows, row.session_id));
  const owner = (row: EvidenceEvent): unknown => owners.get(row.session_id) ?? budgetMeta(row).agentId ?? "default";
  const periods = (ts: number): BudgetPeriodUsage[] => ts > now ? [] : [
    ...(ts >= dayStart ? [result.daily] : []), ...(ts >= now - 60_000 ? [result.minute] : [])
  ];
  const headers = new Map<string, EvidenceEvent>();
  const settlements = new Map<string, EvidenceEvent>();
  const reservations = new Map<string, EvidenceEvent>();
  const tools = new Map<string, EvidenceEvent>();
  const toolKey = (row: EvidenceEvent, meta: Record<string, unknown>) => `${row.session_id}:${String(meta.toolToken ?? meta.callId ?? row.id)}`;
  for (const row of rows) {
    if (row.ts > now || owner(row) !== agentId) continue;
    const meta = budgetMeta(row);
    if (row.event_type === "request/header") {
      headers.set(row.id, row);
      for (const part of periods(row.ts)) part.llmPreparedRequests++;
    }
    if (row.event_type === "request/response" || row.event_type === "request/failure") {
      if (typeof meta.headerEventId !== "string") throw new Error("Native budget settlement has no request header");
      if (settlements.has(meta.headerEventId)) throw new Error("Duplicate native budget settlement");
      settlements.set(meta.headerEventId, row);
    }
    if (row.event_type === "audit" && meta.auditType === NATIVE_BUDGET_RESERVATION) {
      if (typeof meta.reservationKey !== "string" || reservations.has(meta.reservationKey)) throw new Error("Invalid or duplicate native budget reservation");
      reservations.set(meta.reservationKey, row);
    }
    if (row.event_type === "audit" && ["TOOL_CALL_ALLOWED", "TOOL_CALL_FAILED", "TOOL_CALL_DENIED"].includes(String(meta.auditType))) {
      const key = toolKey(row, meta);
      if (tools.has(key)) throw new Error("Duplicate native tool budget outcome");
      tools.set(key, row);
    }
  }
  const recordRequest = (ts: number, usage: unknown, native: boolean, protocolRefused = false) => {
    const measured = measuredUsage(usage, native);
    for (const part of periods(ts)) {
      part.llmRequests++; part.llmTokens += measured.tokens; part.llmCostUsd += measured.cost;
      if (!measured.tokensKnown) { part.unknownLlmTokenRequests++; if (!protocolRefused) part.blockingUnknownLlmTokenRequests++; }
      if (!measured.costKnown) part.unknownLlmCostRequests++;
    }
  };
  const handledHeaders = new Set<string>();
  for (const reservation of reservations.values()) {
    const meta = budgetMeta(reservation);
    if (meta.kind === "llm") {
      const headerId = String(meta.headerEventId);
      const header = headers.get(headerId);
      if (!header || header.session_id !== meta.nativeSessionId) throw new Error("Native budget reservation has no matching header");
      const settled = settlements.get(headerId);
      const settledMeta = settled ? budgetMeta(settled) : {};
      recordRequest(reservation.ts, settledMeta.usage, true, settled?.event_type === "request/failure" && [401, 403, 429].includes(Number(settledMeta.httpStatus)));
      if (!settled) result.daily.llmPendingRequests++;
      handledHeaders.add(headerId);
    } else if (meta.kind === "tool") {
      const key = `${String(meta.nativeSessionId)}:${String(meta.toolToken)}`;
      const action = meta.actionClass as ActionClass;
      if (!actionClasses.includes(action)) throw new Error("Native budget reservation has an unknown action class");
      const outcome = tools.get(key);
      if (!outcome) result.daily.toolPending[action]++;
      else {
        const disposition = budgetMeta(outcome);
        if (disposition.callId !== meta.callId || disposition.actionClass !== action || disposition.effectiveMode !== "EXECUTE" ||
            disposition.agentId !== meta.agentId || owner(outcome) !== meta.agentId) throw new Error("Native tool budget outcome differs from its signed reservation");
      }
    } else throw new Error("Unknown native budget reservation kind");
  }
  // Older native streams had no dispatch reservation. A response confirms a
  // dispatch; missing-credential/header-only records do not. Failed transport
  // attempts are conservative admissions with unknown usage.
  for (const [headerId, settled] of settlements) {
    const header = headers.get(headerId);
    if (!header || header.session_id !== settled.session_id) throw new Error("Native budget settlement has no matching header");
    const meta = budgetMeta(settled);
    if (meta.requestDigest !== budgetMeta(header).requestDigest) throw new Error("Native budget settlement request digest differs from its header");
    const failure = meta.failure as Record<string, unknown> | undefined;
    const historicalAttempt = meta.dispatchAttempted === undefined && (meta.httpStatus !== null || ["TRANSPORT", "ABORTED"].includes(String(failure?.code)));
    if (!handledHeaders.has(headerId) && (settled.event_type === "request/response" || meta.dispatchAttempted === true || historicalAttempt)) {
      recordRequest(header.ts, meta.usage, true, settled.event_type === "request/failure" && [401, 403, 429].includes(Number(meta.httpStatus)));
    }
  }
  for (const row of tools.values()) {
    if (row.ts < dayStart) continue;
    const meta = budgetMeta(row); const action = meta.actionClass as ActionClass;
    if (meta.effectiveMode !== "EXECUTE" || !actionClasses.includes(action)) continue;
    if (meta.auditType === "TOOL_CALL_DENIED") result.daily.toolDenied[action]++;
    else result.daily.toolExecutes[action]++;
  }
  const nativeToolCallIds = new Set([...tools.values()].map(row => `${row.session_id}:${String(budgetMeta(row).callId)}`));
  const legacyResponses = new Set(rows.filter(row => row.event_type === "llm_response").map(row => {
    const meta = budgetMeta(row); return `${row.session_id}:${String(meta.request_id ?? meta.requestId ?? row.id)}`;
  }));
  for (const row of rows) {
    if (row.ts > now || owner(row) !== agentId) continue;
    const meta = budgetMeta(row);
    if (row.event_type === "llm_request") for (const part of periods(row.ts)) {
      part.llmRequests++;
      if (!legacyResponses.has(`${row.session_id}:${String(meta.request_id ?? meta.requestId ?? row.id)}`)) {
        part.unknownLlmTokenRequests++; part.blockingUnknownLlmTokenRequests++; part.unknownLlmCostRequests++;
      }
    }
    if (row.event_type === "llm_response") {
      const measured = measuredUsage(meta.usage, false);
      for (const part of periods(row.ts)) {
        part.llmTokens += measured.tokens; part.llmCostUsd += measured.cost;
        if (!measured.tokensKnown) { part.unknownLlmTokenRequests++; part.blockingUnknownLlmTokenRequests++; }
        if (!measured.costKnown) part.unknownLlmCostRequests++;
      }
    }
    if (row.event_type === "tool_action" && row.ts >= dayStart && !tools.has(toolKey(row, meta)) &&
        !(typeof meta.callId === "string" && nativeToolCallIds.has(`${row.session_id}:${meta.callId}`))) {
      // Legacy inline payload is signed into the canonical row; native
      // accounting uses only type metadata, never an unsigned tool body.
      const inline = row.canonical_payload_inline ?? row.payload_inline;
      const payload = inline ? JSON.parse(inline) as Record<string, unknown> : {};
      const action = (payload.actionClass ?? meta.actionClass) as ActionClass;
      if ((payload.effectiveMode ?? meta.effectiveMode) === "EXECUTE" && actionClasses.includes(action)) result.daily.toolExecutes[action]++;
    }
  }
  for (const part of [result.daily, result.minute]) {
    part.llmCostUsd = Number(part.llmCostUsd.toFixed(6));
    part.llmTokenUsageComplete = part.unknownLlmTokenRequests === 0;
    part.llmCostUsageComplete = part.unknownLlmCostRequests === 0;
  }
  return result;
}
