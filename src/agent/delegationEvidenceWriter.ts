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
 * point at. It is deliberately not the parent's: the parent's spine is a
 * single-writer hash chain owned by its `SessionService`, and appending through
 * the ledger beside it would interleave rows the chain never sequenced.
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
