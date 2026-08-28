import { openLedger } from "../ledger/ledger.js";
import {
  delegationEvidenceFor,
  type DelegationEvidenceFact
} from "../diagnostic/spineEvidenceProjection.js";

/**
 * Write a settled delegation's projected evidence into the ledger.
 *
 * Separated from `./subagentSpawn.ts` so the spawn path keeps its one job --
 * deciding and recording the delegation -- and so the ledger handle is opened
 * only on the path that needs it.
 *
 * Written against the CHILD's session id, because that is the session the
 * delegation produced and the one the parent's `agent_delegation_*` rows already
 * point at.
 *
 * THIS HEADER USED TO GIVE A DIFFERENT AND FALSE REASON: that the parent's spine
 * is a single-writer hash chain and appending beside it "would interleave rows
 * the chain never sequenced". Measured, it does not. Every row written here
 * carries no `SessionEnvelope`, and every per-session chain reader skips
 * envelope-less rows before advancing its head --
 * `verifySessionChains` (../ledger/sessionVerification.ts),
 * `verifySessionEnvelopeChains` (../persistence/sessionStoreVerification.ts),
 * `perSessionChainBroken` and `seedHead` (../session/sessionRecovery.ts), and
 * `SessionService.seedHead` itself. `SessionService.prevHash` is write-only
 * state: it is stamped into the next envelope and advanced from the hash the
 * store returned, never compared against the log. A row appended beside it is
 * therefore invisible to the chain, not a fork in it. Writing these rows into an
 * OPEN parent leaves `seq` contiguous and both `verifySessionChains` and
 * `verifyLedgerIntegrity` clean.
 *
 * WHAT IS ACTUALLY TRUE, AND WHY THIS TARGET IS THE WORSE ONE. Envelope-less
 * rows in a session cost two things, and the child pays both:
 *
 *   1. `buildSessionRootDescriptor` (../transparency/sessionRootDescriptor.ts)
 *      refuses to anchor ANY session containing a row with no envelope --
 *      "carries no session envelope". That cost is the same wherever these rows
 *      land, and it is paid today: a delegating run cannot be anchored.
 *
 *   2. The child session is already CLOSED AND SEALED when this runs.
 *      `createDriverRunner`'s `finally` calls `release()`, which calls
 *      `session.close()`, which calls `store.sealSession()`; only then does
 *      `subagentSpawn`'s `account()` reach this function. So these rows land
 *      after the seal and `verifyLedgerIntegrity` reports "Session <child> final
 *      hash mismatch" for every real delegation. The parent, at that instant, is
 *      still open and would not have had this problem.
 *
 * That second cost is a live defect, not a design choice, and is carved out of
 * the assertion in tests/subagentRunnerEndToEnd.test.ts. Fixing it means writing
 * these rows before the child is sealed (or through the child's own
 * `SessionService`, so they carry envelopes) -- not moving them to the parent.
 *
 * NEVER THROWS INTO THE DELEGATION. Evidence projection is a scoring concern; a
 * ledger that refuses a row must not turn a completed delegation into a failed
 * one, or a scoring change would become a runtime failure. The delegation's own
 * account has already been recorded through the session by the time this runs.
 */
export function writeDelegationEvidence(
  workspace: string,
  childSessionId: string,
  fact: DelegationEvidenceFact
): void {
  const rows = delegationEvidenceFor(fact);
  if (rows.length === 0) return;
  try {
    openLedger(workspace).appendEvidenceBatch(
      rows.map((row) => ({
        sessionId: childSessionId,
        runtime: "amc" as const,
        eventType: row.eventType,
        payload: row.payload,
        payloadExt: "json" as const,
        meta: row.meta
      }))
    );
  } catch {
    // Deliberately swallowed, and deliberately narrow: see the note above.
    // The delegation is already accounted for in the parent's signed log, so
    // the loss here is a scoreable projection, not the audit record.
  }
}
