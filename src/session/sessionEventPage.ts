import type { EvidenceEvent } from "../types.js";
import { loadSessionEventHistory, type SessionEventHistory, type SessionEventHistoryOptions } from "./sessionEventHistory.js";
import { exactHistoryId, historyRefuse } from "./sessionHistoryReader.js";
import { extractEnvelope } from "./sessionTypes.js";

const SESSION_EVENT_PAGE_MAX_ROWS = 256;
export const SESSION_EVENT_PAGE_MAX_BYTES = 512 * 1024;
export interface SessionEventPageOptions extends Omit<SessionEventHistoryOptions, "sessionId"> {
  readonly sessionId: string;
  /** Caller-authenticated reader identity. A cursor never grants access. */
  readonly consumerId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}
export interface SessionEventPage {
  readonly format: "amc-session-event-page-v1";
  readonly sessionId: string;
  readonly agentId: string;
  readonly committed: true;
  readonly backend: SessionEventHistory["backend"];
  /** Fixed snapshot head; a follow cursor explicitly selects a new snapshot. */
  readonly headEventHash: string;
  readonly headSeq: number;
  readonly storeHeadEventHash: string;
  readonly firstSeq: number;
  /** Exclusive raw sequence, including rows with no user-visible projection. */
  readonly nextSeq: number;
  /** Raw committed rows. Payload and conversation projection admission remain separate. */
  readonly events: readonly Readonly<EvidenceEvent>[];
  readonly nextCursor: string | null;
  readonly resumeCursor: string;
  readonly sealed: boolean;
  readonly verification: SessionEventHistory["verification"];
}
interface Cursor {
  readonly v: 1;
  readonly mode: "page" | "follow";
  readonly sessionId: string;
  readonly agentId: string;
  readonly consumerId: string | null;
  readonly headEventHash: string;
  readonly afterEventHash: string;
}
function encode(cursor: Cursor): string {
  const value = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  if (value.length > 2048) historyRefuse("INVALID_INPUT", "Selected identities exceed the cursor byte bound; no unusable position was returned.");
  return value;
}
function decode(value: string): Cursor {
  if (typeof value !== "string" || !value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    historyRefuse("INVALID_INPUT", "Page cursor must be a bounded canonical history position.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { return historyRefuse("INVALID_INPUT", "Page cursor cannot be decoded."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) historyRefuse("INVALID_INPUT", "Page cursor is malformed.");
  const cursor = parsed as Cursor;
  if (cursor.v !== 1 || (cursor.mode !== "page" && cursor.mode !== "follow")
    || typeof cursor.sessionId !== "string" || typeof cursor.agentId !== "string"
    || (cursor.consumerId !== null && typeof cursor.consumerId !== "string")
    || typeof cursor.headEventHash !== "string" || !/^[a-f0-9]{64}$/.test(cursor.headEventHash)
    || typeof cursor.afterEventHash !== "string" || !/^[a-f0-9]{64}$/.test(cursor.afterEventHash)
    || Object.keys(cursor).sort().join(",") !== "afterEventHash,agentId,consumerId,headEventHash,mode,sessionId,v"
    || encode(cursor) !== value) historyRefuse("INVALID_INPUT", "Page cursor has an unsupported or noncanonical shape.");
  return cursor;
}

/**
 * Page the existing verified store, never a second transcript. Cursor fields are
 * untrusted position references: every hash must still exist in the authenticated
 * session. Callers must authenticate and authorize EVERY read, including follow.
 * Full-store verification intentionally precedes slicing so a gap outside this
 * page cannot masquerade as a shorter successful response. Verification remains
 * O(store size), like loadSessionEventHistory; paging bounds delivery, not reads.
 */
export function readSessionEventPage(options: SessionEventPageOptions): { readonly page: SessionEventPage; readonly history: SessionEventHistory } {
  if (!options || typeof options !== "object") historyRefuse("INVALID_INPUT", "Provide an exact session identity and page options.");
  exactHistoryId(options.sessionId, "sessionId");
  if (options.consumerId !== undefined) exactHistoryId(options.consumerId, "consumerId");
  const limit = options.limit === undefined ? 64 : options.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SESSION_EVENT_PAGE_MAX_ROWS) {
    historyRefuse("INVALID_INPUT", `Page limit must be an integer from 1 to ${SESSION_EVENT_PAGE_MAX_ROWS}.`);
  }
  const cursor = options.cursor === undefined ? null : decode(options.cursor);
  if (cursor && (cursor.sessionId !== options.sessionId || cursor.consumerId !== (options.consumerId ?? null)
    || (options.agentId !== undefined && cursor.agentId !== options.agentId))) {
    historyRefuse("IDENTITY_MISMATCH", "Page cursor belongs to a different session, agent or authenticated consumer.");
  }
  const history = loadSessionEventHistory(options);
  const rows = history.events;
  const opening = rows[0];
  const agentId: unknown = opening?.event_type === "session/open" ? (JSON.parse(opening.meta_json) as Record<string, unknown>).agentId : null;
  if (typeof agentId !== "string" || !agentId || rows.some((row, index) => extractEnvelope(row.meta_json)?.seq !== index)) {
    historyRefuse("TAMPERED", "Paged native history requires a complete signed session/open and contiguous native sequence.");
  }
  if (cursor && cursor.agentId !== agentId) historyRefuse("IDENTITY_MISMATCH", "Page cursor differs from the signed native identity.");
  let firstSeq = 0, headSeq = rows.length - 1;
  if (cursor) {
    const savedHead = rows.findIndex(row => row.event_hash === cursor.headEventHash);
    const after = rows.findIndex(row => row.event_hash === cursor.afterEventHash);
    if (savedHead < 0 || after < 0 || after > savedHead || (cursor.mode === "follow" && after !== savedHead)) {
      historyRefuse("TAMPERED", "Page cursor no longer matches the verified history; a stale, forged or rolled-back position cannot return a prefix.");
    }
    if (cursor.mode === "page") headSeq = savedHead;
    firstSeq = after + 1;
  }
  const headEventHash = rows[headSeq]!.event_hash;
  const sealed = history.sealed && headEventHash === history.headEventHash;
  if (options.requireSealed && !sealed) historyRefuse("UNSEALED", "The selected page snapshot precedes the final session seal.");
  let nextSeq = firstSeq, bytes = 2;
  while (nextSeq <= headSeq && nextSeq - firstSeq < limit) {
    const size = Buffer.byteLength(JSON.stringify(rows[nextSeq]), "utf8") + (nextSeq === firstSeq ? 0 : 1);
    if (bytes + size > SESSION_EVENT_PAGE_MAX_BYTES) {
      if (nextSeq === firstSeq) historyRefuse("INVALID_INPUT", "A committed row exceeds the page byte bound; no row was skipped.");
      break;
    }
    bytes += size; nextSeq++;
  }
  const position = { v: 1 as const, sessionId: options.sessionId, agentId, consumerId: options.consumerId ?? null };
  const afterEventHash = rows[nextSeq - 1]!.event_hash;
  const nextCursor = nextSeq <= headSeq ? encode({ ...position, mode: "page", headEventHash, afterEventHash }) : null;
  // An intermediate page resumes after its own delivered head, never after rows
  // it has not delivered. This also gives a bounded disconnect recovery point.
  const resumeCursor = encode({ ...position, mode: "follow", headEventHash: afterEventHash, afterEventHash });
  const page: SessionEventPage = Object.freeze({ format: "amc-session-event-page-v1", sessionId: options.sessionId, agentId,
    committed: true, backend: history.backend, headEventHash, headSeq, storeHeadEventHash: history.storeHeadEventHash,
    firstSeq, nextSeq, events: Object.freeze(rows.slice(firstSeq, nextSeq)), nextCursor, resumeCursor,
    sealed, verification: history.verification });
  return { page, history };
}
export function loadSessionEventPage(options: SessionEventPageOptions): SessionEventPage { return readSessionEventPage(options).page; }
