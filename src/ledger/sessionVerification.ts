/**
 * Per-session chain verification for the P2.2 session spine.
 *
 * Split from ledgerVerification.ts to keep that file under the logic cap. The
 * global prev_event_hash chain orders every row, but says nothing about a
 * single session's internal order once that session is extracted on its own (as
 * a Passport export does). This closes that gap, and is the one check a
 * re-signed forgery cannot slip past — proven by tests/sessionVerifierNegative.
 */
import { extractEnvelope, SESSION_GENESIS } from "../session/sessionTypes.js";
import type { Ledger } from "./ledger.js";
import { validateSurfaceCompactions } from "../session/surfaceCompaction.js";

/**
 * Verifies the per-session chain carried inside session events.
 *
 * The global prev_event_hash chain orders every row, but says nothing about a
 * single session's internal order once that session is extracted on its own (as
 * a Passport export does). The SessionEnvelope closes that gap: within each
 * session, `seq` is 0-based and strictly monotone, and `prevSessionEventHash`
 * links to the prior session event's `event_hash` (SESSION_GENESIS at seq 0).
 * Both fields live in meta_json and are therefore inside `event_hash`, so this
 * makes session enclosure and FIFO cryptographic rather than conventional. A
 * break here is a tamper finding, reported on the chain half.
 *
 * Rows with no envelope (legacy events) are skipped, so a workspace with no
 * session spine is unaffected — strictly additive to today's verifier.
 */
export function verifySessionChains(ledger: Ledger, errors: string[]): void {
  const events = ledger.getAllEvents();
  try { validateSurfaceCompactions(ledger.workspace, events); }
  catch (error) { errors.push(`Session compaction invalid: ${error instanceof Error ? error.message : "unsupported history"}`); }
  const expectedSeqBySession = new Map<string, number>();
  const expectedPrevHashBySession = new Map<string, string>();
  for (const event of events) {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) {
      continue;
    }
    const sessionId = event.session_id;
    const expectedSeq = expectedSeqBySession.get(sessionId) ?? 0;
    const expectedPrevHash = expectedPrevHashBySession.get(sessionId) ?? SESSION_GENESIS;

    if (envelope.sessionId !== sessionId) {
      errors.push(`Event ${event.id} session envelope sessionId mismatch`);
    }
    if (envelope.seq !== expectedSeq) {
      errors.push(
        `Event ${event.id} session sequence mismatch (expected ${expectedSeq}, found ${envelope.seq})`
      );
    }
    if (envelope.prevSessionEventHash !== expectedPrevHash) {
      errors.push(`Event ${event.id} session chain mismatch`);
    }

    // Advance from the expected head rather than the event's own claim: this
    // bounds cascade after a break and links the next event to this row's actual
    // hash regardless of the seq it claimed.
    expectedSeqBySession.set(sessionId, expectedSeq + 1);
    expectedPrevHashBySession.set(sessionId, event.event_hash);
  }
}
