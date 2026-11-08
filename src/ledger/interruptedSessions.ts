/**
 * Interrupted legacy sessions (LIVE-INTEGRITY-02 D-INT-6): one implementation seals them for the running gateway's sweep.
 *
 * A session is sealed only when, re-read inside one immediate transaction, it is unended with neither seal column and
 * has at least one signed event whose tail is at least `minAgeMs` old at `now`. The marker row and the seal commit
 * together: a second sealer re-reads a sealed row and stops, and if it got past that, protect_sessions_sealed_immutable
 * rolls back its whole transaction, marker included.
 */
import type { Ledger } from "./ledger.js";
import { runImmediateTransaction } from "./ledgerSessionTransactions.js";
import { INTERRUPTED_SEALED_STAGE } from "./sessionLiveness.js";
import type { SessionRecord } from "../types.js";

/**
 * Seals one interrupted session with a signed `interrupted-sealed` marker, or returns false and writes nothing when the
 * re-read row is sealed, ended, event-less or too fresh. Throws only what the ledger throws (a locked vault, a lost race
 * on the trigger); the transaction has rolled back by then.
 */
export function sealInterruptedSession(ledger: Ledger, sessionId: string, input: { now: number; minAgeMs: number; recoveredBy: string }): boolean {
  return runImmediateTransaction(ledger.db, () => {
    const row = ledger.db.prepare("SELECT runtime, ended_ts, session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ?")
      .get(sessionId) as Pick<SessionRecord, "runtime" | "ended_ts" | "session_final_event_hash" | "session_seal_sig"> | undefined;
    if (!row || row.ended_ts !== null || row.session_final_event_hash !== null || row.session_seal_sig !== null) return false;
    const tail = ledger.db.prepare("SELECT ts FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(sessionId) as { ts: number } | undefined;
    if (!tail || input.now - tail.ts < input.minAgeMs) return false;
    ledger.appendEvidence({ sessionId, runtime: row.runtime, eventType: "gateway",
      meta: { stage: INTERRUPTED_SEALED_STAGE, lastEventTs: tail.ts, recoveredBy: input.recoveredBy, trustTier: "OBSERVED" } });
    ledger.sealSession(sessionId);
    return true;
  });
}
