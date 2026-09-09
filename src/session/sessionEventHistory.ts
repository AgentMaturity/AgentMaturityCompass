import type { EvidenceEvent, SessionRecord } from "../types.js";
import type { SessionStoreBackendId } from "../persistence/sessionEventStore.js";
import { verifyStoredSessionEventMetadata, verifyStoredSessionEvents, type StoredSessionTrustRoot } from "../persistence/sessionStoreVerification.js";
import { extractEnvelope, SESSION_ENVELOPE_META_KEY } from "./sessionTypes.js";
import { exactHistoryId, historyRefuse, openHistoryReader, SessionHistoryRefused } from "./sessionHistoryReader.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export { SessionHistoryRefused, type SessionHistoryRefusal } from "./sessionHistoryReader.js";
export interface SessionEventHistoryOptions {
  readonly workspace: string;
  /** Omit for ALL selected-store events, as required by workspace spill lifecycle operations. */
  readonly sessionId?: string;
  /** Optional match against the native session/open identity; requires sessionId. */
  readonly agentId?: string;
  readonly expectedMonitorFingerprint?: string;
  /** Independently saved head of the requested scope; detects a valid-prefix rollback. */
  readonly expectedHeadEventHash?: string;
  readonly requireSealed?: boolean;
  /** Explicit opt-in: opens event payloads, may require keys, refuses unsupported retention. */
  readonly verifyPayloads?: boolean;
}
export interface SessionEventHistory {
  readonly format: "amc-session-event-history-v1";
  readonly workspace: string;
  readonly backend: SessionStoreBackendId;
  readonly scope: "workspace" | "session";
  readonly sessionId: string | null;
  /** Actual persisted rows in append order, never a conversation projection. */
  readonly events: readonly Readonly<EvidenceEvent>[];
  readonly sessions: readonly Readonly<SessionRecord>[];
  readonly headEventHash: string;
  readonly storeHeadEventHash: string;
  readonly historySha256: string;
  readonly sealed: boolean;
  readonly verification: {
    readonly metadata: "hashes-signatures-global-and-session-chains";
    readonly checkedStoreEventCount: number;
    readonly payloads: "not-read" | "verified";
    readonly retainedOutput: "not-read";
    readonly trustRoot: StoredSessionTrustRoot;
    readonly completeness: "all-available-events-in-requested-scope";
    readonly rollbackProtection: "expected-head-matched" | "no-external-head";
  };
}

function assertRows(events: readonly EvidenceEvent[]): void {
  if (!events.length) historyRefuse("MISSING", "Selected persisted history has no events; an empty store is not verified evidence.");
  for (const row of events) {
    for (const key of ["id", "session_id", "runtime", "event_type", "meta_json", "writer_sig", "prev_event_hash"] as const) {
      if (typeof row[key] !== "string" || !row[key]) historyRefuse("TAMPERED", "A persisted event has missing required fields.");
    }
    if (!Number.isSafeInteger(row.ts) || row.ts < 0
      || !/^[a-f0-9]{64}$/.test(row.event_hash) || !/^[a-f0-9]{64}$/.test(row.payload_sha256)) {
      historyRefuse("TAMPERED", "A persisted event has invalid timestamp or digest fields.");
    }
    let metadata: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(row.meta_json);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      metadata = value as Record<string, unknown>;
    } catch { return historyRefuse("TAMPERED", "A persisted event has malformed metadata."); }
    if (Object.hasOwn(metadata, SESSION_ENVELOPE_META_KEY)) {
      const raw = metadata[SESSION_ENVELOPE_META_KEY];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) historyRefuse("TAMPERED", "Malformed native session envelope.");
      if (!("v" in raw) || raw.v !== 1) historyRefuse("UNSUPPORTED_FORMAT", "Unsupported session envelope version; signed rows are never migrated in place.");
      if (extractEnvelope(row.meta_json) === null) historyRefuse("TAMPERED", "Malformed native session envelope.");
    } else if (row.event_type.includes("/")) {
      historyRefuse("UNSUPPORTED_FORMAT", "Native event has no supported session envelope; history cannot silently skip it.");
    }
  }
}
function assertRecord(record: SessionRecord | null, id: string, events: readonly EvidenceEvent[]): asserts record is SessionRecord {
  if (!record || record.session_id !== id) historyRefuse("MISSING", "An event's exact session lifecycle record is missing.");
  if (!Number.isSafeInteger(record.started_ts) || record.started_ts < 0
    || typeof record.runtime !== "string" || typeof record.binary_path !== "string" || typeof record.binary_sha256 !== "string") {
    historyRefuse("TAMPERED", "A session lifecycle record is malformed.");
  }
  const sealedFields = [record.ended_ts, record.session_final_event_hash, record.session_seal_sig];
  if (sealedFields.some(value => value !== null) && (sealedFields.some(value => value === null)
    || !Number.isSafeInteger(record.ended_ts) || record.ended_ts! < record.started_ts
    || typeof record.session_final_event_hash !== "string" || !/^[a-f0-9]{64}$/.test(record.session_final_event_hash)
    || typeof record.session_seal_sig !== "string")) historyRefuse("TAMPERED", "A session lifecycle seal is incomplete or malformed.");
  const native = events.filter(row => row.session_id === id && extractEnvelope(row.meta_json) !== null);
  if (native.length) {
    if (native[0]!.event_type !== "session/open") historyRefuse("TAMPERED", "Native history has no initial signed session/open.");
    const open = JSON.parse(native[0]!.meta_json) as Record<string, unknown>;
    if (native[0]!.runtime !== record.runtime || (open.runtime !== undefined && open.runtime !== record.runtime)
      || open.agentId !== record.binary_path) {
      historyRefuse("IDENTITY_MISMATCH", "Persisted lifecycle identity differs from signed session/open.");
    }
    if (native.some(row => row.event_type === "session/close") && record.ended_ts === null) {
      historyRefuse("UNSEALED", "A signed session/close exists without its final lifecycle seal; restore or explicitly repair the original evidence.");
    }
  }
}

/**
 * Load complete available persisted evidence after restart, using the recorded
 * backend. Always authenticates the FULL store before any session selection.
 * No writers, model calls, key creation, repair or retained-output decryption.
 */
export function loadSessionEventHistory(options: SessionEventHistoryOptions): SessionEventHistory {
  if (!options || typeof options !== "object") historyRefuse("INVALID_INPUT", "Provide workspace and an optional exact session identity.");
  if (options.sessionId !== undefined) exactHistoryId(options.sessionId, "sessionId");
  if (options.agentId !== undefined) {
    exactHistoryId(options.agentId, "agentId");
    if (options.sessionId === undefined) historyRefuse("INVALID_INPUT", "agentId identity matching requires an exact sessionId.");
  }
  for (const flag of [options.requireSealed, options.verifyPayloads]) {
    if (flag !== undefined && typeof flag !== "boolean") historyRefuse("INVALID_INPUT", "Verification switches must be booleans.");
  }
  const expectedMonitorFingerprint = options.expectedMonitorFingerprint ?? process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  for (const digest of [expectedMonitorFingerprint, options.expectedHeadEventHash]) {
    if (digest !== undefined && (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))) {
      historyRefuse("INVALID_INPUT", "Expected fingerprints and heads must be complete lowercase SHA-256 values obtained independently.");
    }
  }
  const reader = openHistoryReader(options.workspace);
  try {
    const all = reader.store.readAllEvents();
    assertRows(all);
    const ids = [...new Set(all.map(row => row.session_id))];
    if (options.sessionId !== undefined && !ids.includes(options.sessionId)) historyRefuse("MISSING", "Requested session has no persisted events in the selected backend.");
    const records = ids.map(id => { const record = reader.store.readSessionRecord(id); assertRecord(record, id, all); return record; });
    const verifyOptions = { sessionRecords: records, ...(expectedMonitorFingerprint === undefined ? {} : { expectedMonitorFingerprint }) };
    const result = (options.verifyPayloads ? verifyStoredSessionEvents : verifyStoredSessionEventMetadata)(reader.workspace, all, verifyOptions);
    if (!result.ok || result.trustRoot.monitorFingerprint === null) historyRefuse("TAMPERED", "Persisted evidence failed native signature, chain, seal or requested payload verification; no rows were returned.");
    const events = options.sessionId === undefined ? all : all.filter(row => row.session_id === options.sessionId);
    const sessions = options.sessionId === undefined ? records : records.filter(record => record.session_id === options.sessionId);
    if (options.agentId !== undefined) {
      const opened = events.find(row => row.event_type === "session/open");
      if (!opened || (JSON.parse(opened.meta_json) as Record<string, unknown>).agentId !== options.agentId) {
        historyRefuse("IDENTITY_MISMATCH", "Requested agent differs from the signed session/open identity.");
      }
    }
    const sealed = sessions.every(record => record.ended_ts !== null);
    if (options.requireSealed && !sealed) historyRefuse("UNSEALED", "Requested history includes an unsealed session; release and seal its writer before requiring a closed history.");
    const headEventHash = events[events.length - 1]!.event_hash;
    if (options.expectedHeadEventHash !== undefined && options.expectedHeadEventHash !== headEventHash) {
      historyRefuse("TAMPERED", "Persisted history head differs from the independently saved head; rollback or a different snapshot is possible.");
    }
    reader.assertUnchanged();
    return Object.freeze({ format: "amc-session-event-history-v1", workspace: reader.workspace, backend: reader.backend,
      scope: options.sessionId === undefined ? "workspace" : "session", sessionId: options.sessionId ?? null,
      events: Object.freeze(events.map(row => Object.freeze({ ...row }))),
      sessions: Object.freeze(sessions.map(record => Object.freeze({ ...record }))), headEventHash,
      storeHeadEventHash: all[all.length - 1]!.event_hash, historySha256: sha256Hex(canonicalize({ events, records: sessions })), sealed,
      verification: Object.freeze({ metadata: "hashes-signatures-global-and-session-chains", checkedStoreEventCount: all.length,
        payloads: options.verifyPayloads ? "verified" : "not-read", retainedOutput: "not-read", trustRoot: Object.freeze(result.trustRoot),
        completeness: "all-available-events-in-requested-scope", rollbackProtection: options.expectedHeadEventHash === undefined ? "no-external-head" : "expected-head-matched" }) });
  } catch (error) {
    if (error instanceof SessionHistoryRefused) throw error;
    return historyRefuse("UNREADABLE", "Persisted history could not be decoded or verified; no partial rows or fallback history were returned.");
  } finally { reader.store.close(); }
}
