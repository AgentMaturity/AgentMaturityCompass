import { openLedger, type Ledger } from "../ledger/ledger.js";
import { sha256Hex } from "../utils/hash.js";
import {
  delegationEvidenceFor,
  type DelegationEvidenceFact
} from "../diagnostic/spineEvidenceProjection.js";

/**
 * Write a settled delegation's projected evidence into a session this module
 * opens and seals itself.
 *
 * Separated from `./subagentSpawn.ts` so the spawn path keeps its one job --
 * deciding and recording the delegation -- and so the ledger handle is opened
 * only on the path that needs it.
 *
 * WHY ITS OWN SESSION, AND NOT THE CHILD'S. These rows were written against the
 * CHILD's session id, and what `verifyLedgerIntegrity` then said depended
 * entirely on what the runner had done with that session. Both halves were
 * measured, not assumed:
 *
 *   `createDriverRunner` opens the child's session and SEALS it, in a `finally`
 *   that runs before `spawnSubagent` settles the delegation. A seal commits to
 *   the session's final event hash, so rows appended after it made that
 *   commitment false -- "Session <child> final hash mismatch", reproducible with
 *   no tool call at all, because the rows come from the delegation settling.
 *
 *   A runner that opens NO session is equally legal -- `SubagentRunner` requires
 *   none, and the stub runners do exactly that. Then the same rows named a
 *   session nothing ever created: "references missing session", which is the
 *   defect f537e29e fixed for tool evidence, reappearing by another route.
 *
 * One cause, two error strings: this writer borrowed a lifecycle it neither
 * owned nor controlled, and it runs at the one moment that lifecycle is already
 * over -- a delegation is not settled until its child has stopped. Owning the
 * session removes the dependency rather than choosing a different runner to
 * depend on, which is why this is preferred to deferring the runner's seal: that
 * would make every present and future runner responsible for holding a session
 * open so a scoring row can land, an invariant nothing could enforce and a
 * violation nothing would show.
 *
 * WHY NOT THE PARENT'S SESSION, where a delegation arguably belongs -- it is the
 * parent's decision, and "settled as failed" is the parent's verdict, not
 * something the child ever said. Because the parent's session is alive and
 * mid-TURN when a delegation settles, and `turn/seal` commits to a Merkle root
 * over exactly the rows its `SessionService` observed in memory. A row appended
 * beside that writer lands INSIDE the sealed turn's id bounds while being a leaf
 * of nothing, and no verifier recomputes window roots today -- so it would fail
 * silently where this failed loudly. Trading a detected defect for an undetected
 * one is not a fix. The parent's authoritative record is unaffected either way:
 * its `agent_delegation_started` / `agent_delegation_completed` pair is written
 * through its own `SessionService`, inside its own turn, and always was.
 *
 * NOTHING SCORED IS LOST BY MOVING THEM. These rows bind to questions through
 * `meta.agentId` and `meta.questionIds` -- `selectRelevantEvents` filters on the
 * former and never on the session id -- and every row already carries
 * `childSessionId` -- put there by the projection, which owns what its rows say --
 * so the delegation each one describes stays nameable by a reader who has only
 * the row. That is also why this function no longer takes the child's session id
 * as an argument: a second source for it could disagree with the projection's.
 *
 * NEVER THROWS INTO THE DELEGATION. Evidence projection is a scoring concern; a
 * ledger that refuses a row must not turn a completed delegation into a failed
 * one, or a scoring change would become a runtime failure. The delegation's own
 * account has already been recorded through the session by the time this runs.
 */
export function writeDelegationEvidence(workspace: string, fact: DelegationEvidenceFact): void {
  const rows = delegationEvidenceFor(fact);
  if (rows.length === 0) return;

  // Keyed by packet, because one delegation mints exactly one packet and settles
  // exactly once -- `spawnSubagent` accounts unconditionally on the immediate
  // path and behind a `closed` guard on the continuation one. The child's
  // session id is carried on every row's meta instead, where it describes the
  // delegation without deciding where the row lives.
  const sessionId = `delegation-evidence-${fact.packetId}`;
  const binaryPath = "amc-delegation-evidence";

  let ledger: Ledger | undefined;
  try {
    ledger = openLedger(workspace);
    ledger.startSession({
      sessionId,
      runtime: "amc",
      binaryPath,
      binarySha256: sha256Hex(binaryPath)
    });
    try {
      ledger.appendEvidenceBatch(
        rows.map((row) => ({
          sessionId,
          runtime: "amc" as const,
          eventType: row.eventType,
          payload: row.payload,
          payloadExt: "json" as const,
          meta: row.meta
        }))
      );
    } finally {
      // Seal whatever landed, including nothing. A refused row must not leave an
      // unsealed session behind: this one carries no `session/open`, so
      // verification holds it to the strict rule and an absent seal would be
      // "Session <id> missing seal" -- the same class of failure this module was
      // changed to stop causing. An empty session seals to `EMPTY_SESSION`,
      // which is exactly what verification expects to recompute for it.
      ledger.sealSession(sessionId);
    }
  } catch {
    // Deliberately swallowed, and deliberately narrow: see the note above.
    // The delegation is already accounted for in the parent's signed log, so
    // the loss here is a scoreable projection, not the audit record.
  } finally {
    // The runner calls a leaked ledger handle "a handle that outlives the
    // delegation that opened it". This one opened its own, so it closes it.
    try { ledger?.close(); } catch { /* already closed */ }
  }
}
