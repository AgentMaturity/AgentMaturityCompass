import type Database from "better-sqlite3";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import type { AppendEvidenceInput } from "./ledger.js";
import { assertSessionWriteAllowed, hasSessionWriter, SESSION_WRITER_META, SessionWriterRefused } from "../session/sessionOwnership.js";

export function runImmediateTransaction<T>(db: Database.Database, fn: () => T): T {
  // Preserve an admission transaction's immediate lock. A nested ledger append
  // owns only its savepoint; it must never commit or roll back its caller.
  if (db.inTransaction) return db.transaction(fn)();
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

/** The binary the A4 store (src/a4/a4Store.ts) starts each of its `a4-<projectId>-<seq>` sessions with. */
export const A4_STORE_BINARY = "a4-store";

/**
 * `a4-` sessions witness A4 transitions, so only the A4 store writes them: it starts each one as binary `a4-store`,
 * appends its audit row and seals it in one transaction. Any other session start (`binaryPath` given) or append in that
 * namespace is refused, whichever route named the session id.
 */
export function assertSessionNamespace(db: Database.Database, sessionId: string, binaryPath?: string): void {
  if (!sessionId.startsWith("a4-")) return;
  const owner = binaryPath ?? (db.prepare("SELECT binary_path FROM sessions WHERE session_id = ? AND ended_ts IS NULL")
    .get(sessionId) as { binary_path: string | null } | undefined)?.binary_path;
  if (owner !== A4_STORE_BINARY) throw new Error(`A4_SESSION_RESERVED: only the A4 store writes session ${sessionId}`);
}

/** Called inside the existing write transaction, before payload materialization. */
export function assertLedgerSessionAppend(db: Database.Database, input: AppendEvidenceInput): void {
  assertSessionNamespace(db, input.sessionId);
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
