/**
 * Copies of a ledger verify as of a signed instant (LIVE-INTEGRITY-04, D-INT-7): a bundle as of its export, a
 * certificate as of its issue, a restored backup as of its creation, so a session that was open when the copy was made
 * reads open, not as a missing seal, however long ago that was. Only an admitted signer's time counts; anything else is
 * verified at the real now (fail closed). One implementation for every copy.
 */
import Database from "better-sqlite3";
import type { VerifyResult } from "./ledgerVerification.js";
import { describeOpenSessions } from "./sessionLiveness.js";

/** The signed time when its signer is admitted and the time is a positive safe integer; otherwise the real now. */
export function verifyInstantFor(input: { signedTs: unknown; admitted: boolean }): number {
  const { signedTs, admitted } = input;
  return admitted && typeof signedTs === "number" && Number.isSafeInteger(signedTs) && signedTs > 0 ? signedTs : Date.now();
}

/** The open-session line for a copy's verdict, "as of" the instant it was verified at; null when none was open. */
export function openSessionsAt(result: Pick<VerifyResult, "sessions">, now: number): string | null {
  const open = result.sessions.liveLegacy;
  return open.length === 0 ? null : `${describeOpenSessions(open, now)} (as of ${new Date(now).toISOString()})`;
}

/** Ids of the unended, unsealed sessions without a native opening in a copied evidence database (export summaries). */
export function unsealedLegacySessionIds(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (db.prepare(`SELECT session_id FROM sessions s WHERE ended_ts IS NULL AND session_final_event_hash IS NULL
      AND session_seal_sig IS NULL AND NOT EXISTS (SELECT 1 FROM evidence_events e WHERE e.session_id = s.session_id
      AND e.event_type = 'session/open') ORDER BY started_ts`).all() as Array<{ session_id: string }>).map((row) => row.session_id);
  } finally {
    db.close();
  }
}
