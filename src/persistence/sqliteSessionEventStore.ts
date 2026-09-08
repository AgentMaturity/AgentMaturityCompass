/**
 * The SQLite backend: the existing signed ledger, behind the P2.3 contract.
 *
 * This backend adds no new storage. It delegates every write to
 * `Ledger.appendEvidenceDetailed` — the same transaction, the same
 * `canonicalMetadataForHash` pre-image, the same monitor signature — so the
 * bytes it produces are byte-for-byte what the spine produced before the seam
 * existed. That is the point: the seam must be provably a refactor on the
 * incumbent path before a second backend is worth trusting.
 *
 * The two raw `SELECT`s that SessionService used to run against `ledger.db`
 * live here now. They did not become less raw, but they moved from the writer
 * (which had no business knowing the schema) to the backend (whose whole job it
 * is), which is what lets a non-SQL backend exist at all.
 */
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { openLedger, type AppendEvidenceInput, type Ledger } from "../ledger/ledger.js";
import { ledgerFullFsync } from "../ledger/ledgerDurability.js";
import {
  SESSION_STORE_READ_ONLY,
  SESSION_STORE_SEALED,
  type SessionEventStore,
  type SessionStoreOpenOptions,
  type SessionStoreAppendInput,
  type SessionStoreAppendResult,
  type SessionStoreCapabilities,
  type SessionStoreSeal,
  type SessionStoreStartParams
} from "./sessionEventStore.js";

const SELECT_SESSION_EVENTS =
  "SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid ASC";
const SELECT_SESSION_ROW = "SELECT * FROM sessions WHERE session_id = ? LIMIT 1";

export class SqliteSessionEventStore implements SessionEventStore {
  readonly workspace: string;
  readonly backendId = "sqlite" as const;
  readonly capabilities: SessionStoreCapabilities;
  readonly readOnly: boolean;

  private readonly ledger: Ledger;
  private closed = false;

  constructor(workspace: string, options: SessionStoreOpenOptions = {}) {
    this.workspace = workspace;
    this.readOnly = options.readOnly ?? false;
    this.ledger = openLedger(workspace, { readonly: this.readOnly });
    this.capabilities = {
      // Resolved at open, from the same knob the ledger's own pragma reads, so
      // the declared capability cannot drift from the pragma actually applied.
      powerLossDurable: ledgerFullFsync(workspace),
      // WAL plus the connection pool make a second writer safe here; the JSONL
      // backend cannot say the same, which is why this is a declared capability
      // rather than an assumption.
      concurrentWriters: true
    };
  }

  startSession(params: SessionStoreStartParams): void {
    this.assertWritable();
    if (this.readSessionRecord(params.sessionId) !== null) {
      throw new Error(`session already started: ${params.sessionId}`);
    }
    this.ledger.startSession(params);
  }

  appendSessionEvent(input: SessionStoreAppendInput): SessionStoreAppendResult {
    this.assertWritable();
    // Content is blob-backed, never inline — the contract does not let a caller
    // ask for anything else, and this is where that becomes concrete.
    const ledgerInput: AppendEvidenceInput = {
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      meta: input.meta,
      ...(input.sessionWriteFence ? { sessionWriteFence: input.sessionWriteFence } : {}),
      ...(input.id !== undefined ? { id: input.id } : {}),
      ...(input.ts !== undefined ? { ts: input.ts } : {}),
      ...(input.payload !== undefined
        ? { payload: input.payload, inline: false, payloadExt: "txt" as const }
        : {})
    };
    return this.ledger.appendEvidenceDetailed(ledgerInput);
  }

  readSessionEvents(sessionId: string): readonly EvidenceEvent[] {
    this.assertOpen();
    return this.ledger.db.prepare(SELECT_SESSION_EVENTS).all(sessionId) as unknown as EvidenceEvent[];
  }

  readAllEvents(): readonly EvidenceEvent[] {
    this.assertOpen();
    return this.ledger.getAllEvents();
  }

  readSessionRecord(sessionId: string): SessionRecord | null {
    this.assertOpen();
    const row = this.ledger.db.prepare(SELECT_SESSION_ROW).get(sessionId) as SessionRecord | undefined;
    return row ?? null;
  }

  sealSession(sessionId: string): SessionStoreSeal {
    this.assertWritable();
    const before = this.readSessionRecord(sessionId);
    if (before === null) {
      throw new Error(`cannot seal unknown session: ${sessionId}`);
    }
    // The trigger would raise anyway; checking first makes the contract's
    // not-idempotent rule the same error on both backends instead of a
    // SQLite-shaped message on one and something else on the other.
    if (before.session_final_event_hash !== null || before.session_seal_sig !== null) {
      throw new Error(SESSION_STORE_SEALED);
    }
    this.ledger.sealSession(sessionId);
    const after = this.readSessionRecord(sessionId);
    if (after === null || after.session_final_event_hash === null || after.session_seal_sig === null) {
      throw new Error(`seal did not land for session: ${sessionId}`);
    }
    return {
      sessionId,
      endedTs: after.ended_ts ?? 0,
      finalEventHash: after.session_final_event_hash,
      sealSig: after.session_seal_sig
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.ledger.close();
  }

  private assertWritable(): void {
    this.assertOpen();
    if (this.readOnly) {
      throw new Error(SESSION_STORE_READ_ONLY);
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("SqliteSessionEventStore used after close()");
    }
  }
}
