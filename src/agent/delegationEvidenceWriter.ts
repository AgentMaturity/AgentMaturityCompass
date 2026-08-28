import {
  delegationEvidenceFor,
  type DelegationEvidenceFact
} from "../diagnostic/spineEvidenceProjection.js";

/**
 * Write a settled delegation's projected evidence into the parent's session.
 *
 * Separated from `./subagentSpawn.ts` so the spawn path keeps its one job --
 * deciding and recording the delegation.
 *
 * WRITTEN THROUGH THE PARENT'S OWN WRITER, and both halves of that matter.
 *
 * THE PARENT, not the child. These rows used to name the CHILD's session, and
 * the runner seals that session in a `finally` that runs before the delegation
 * settles -- so the append landed after the seal and made the seal's committed
 * final hash false. `verifyLedgerIntegrity` then failed for the whole workspace,
 * and that is a published consequence rather than a hidden one:
 * `../assurance/assuranceRunner.ts` turns it into `status: "INVALID"`, and
 * `../evidence/auditPacket.ts` ships it to a customer as
 * `integrity/ledger-verify.json`. One delegation flipped every later report.
 *
 * Deferring the child's seal would not have been enough: the FOREIGN runner
 * seals inside `spawnGovernedChild` (../ledger/monitor.ts) before it returns, so
 * there is no earlier moment to write into, and a runner may legitimately open
 * no session at all. More fundamentally the fact being projected is the
 * PARENT's: `settledAs` is decided by `spawnSubagent` from `abandoned`,
 * `result.ok` and the child's folded text, and on the cancelled path the child
 * never returned. The `agent_delegation_*` control rows for the same fact are
 * already in the parent, and each projected row carries `childSessionId` in its
 * meta, so the link to the child survives the move.
 *
 * THE WRITER, not the ledger. Appending through `openLedger` produced rows with
 * no session envelope, which `../transparency/sessionRootDescriptor.ts` refuses
 * to anchor around -- correctly, since the root would cover less than the
 * session does. Going through `recordProjectedEvidence` puts them in the spine.
 *
 * NEVER THROWS INTO THE DELEGATION. Evidence projection is a scoring concern; a
 * spine that refuses a row must not turn a completed delegation into a failed
 * one, or a scoring change would become a runtime failure. The delegation's own
 * account has already been recorded by the time this runs.
 */

/** The half of a session writer this module needs. */
export interface DelegationEvidenceRecorder {
  recordProjectedEvidence(row: {
    readonly eventType: "audit" | "metric" | "stdout";
    readonly payload: string;
    readonly meta: Record<string, unknown>;
  }): unknown;
}

export function writeDelegationEvidence(
  recorder: DelegationEvidenceRecorder,
  fact: DelegationEvidenceFact
): void {
  const rows = delegationEvidenceFor(fact);
  if (rows.length === 0) return;
  try {
    for (const row of rows) {
      recorder.recordProjectedEvidence({
        eventType: row.eventType,
        payload: row.payload,
        meta: row.meta
      });
    }
  } catch {
    // Deliberately swallowed, and deliberately narrow: see the note above.
    // The delegation is already accounted for in the parent's signed log, so
    // the loss here is a scoreable projection, not the audit record.
  }
}
