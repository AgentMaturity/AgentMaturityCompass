import type Database from "better-sqlite3";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import type { AppendEvidenceInput } from "./ledger.js";
import { assertSessionWriteAllowed, hasSessionWriter, SESSION_WRITER_META, SessionWriterRefused } from "../session/sessionOwnership.js";

export function runImmediateTransaction<T>(db: Database.Database, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(); db.exec("COMMIT"); return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* preserve the original failure */ }
    throw error;
  }
}

function lastSessionEvent(db: Database.Database, sessionId: string): EvidenceEvent | null {
  return db.prepare("SELECT * FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1").get(sessionId) as EvidenceEvent | undefined ?? null;
}

/** Called inside the existing write transaction, before payload materialization. */
export function assertLedgerSessionAppend(db: Database.Database, input: AppendEvidenceInput): void {
  const record = db.prepare("SELECT * FROM sessions WHERE session_id = ? LIMIT 1").get(input.sessionId) as SessionRecord | undefined;
  assertSessionWriteAllowed(input, lastSessionEvent(db, input.sessionId), record ?? null);
}

/** Native sessions promise one durable append at a time. Refuse a mixed batch
 * before its first legacy blob can mutate files outside the SQL rollback. */
export function assertLedgerSessionBatch(db: Database.Database, inputs: readonly AppendEvidenceInput[]): void {
  for (const input of inputs) {
    if (input.sessionWriteFence || SESSION_WRITER_META in (input.meta ?? {}) || hasSessionWriter(lastSessionEvent(db, input.sessionId))) {
      throw new SessionWriterRefused("INVALID_FENCE", "owned native sessions require individual atomic appends");
    }
  }
}
