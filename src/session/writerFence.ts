/**
 * Writer fencing helpers (P2-12): this machine's anti-rollback mark for a native session's journal, and the signed
 * record of a refused stale or unknown writer.
 *
 * The mark follows P1-08's high-water pattern (src/keys/highWater.ts): the highest per-session sequence this machine
 * accepted and the event hash at it, kept outside every workspace. A dispatch raises it, so a journal restored from
 * before a dispatched effect reads as ROLLBACK_DETECTED and one whose marked row now holds other bytes as
 * FORK_DETECTED. A fresh machine starts with no mark.
 */
import { randomUUID } from "node:crypto";
import { AntiRollbackError, readHighWater, recordHighWater, workspaceScope } from "../keys/highWater.js";
import { openLedger } from "../ledger/ledger.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import type { EvidenceEvent } from "../types.js";
import { extractEnvelope } from "./sessionTypes.js";

export const FENCE_REFUSAL_AUDIT = "SESSION_WRITER_FENCE_REFUSED";

/** The machine-local key of one session's journal mark: the session id in a digest of the workspace's real path. */
export function sessionJournalMarkKey(workspace: string, sessionId: string): string {
  return `session-journal:${sessionId}@${workspaceScope(workspace)}`;
}

function seqOf(row: EvidenceEvent): number {
  const envelope = extractEnvelope(row.meta_json);
  if (envelope === null) throw new Error(`session row ${row.id} has no envelope`);
  return envelope.seq;
}

/** Refuse verified rows older than this machine's mark, or holding other bytes at the marked sequence. */
export function assertSessionJournalCurrent(workspace: string, sessionId: string, rows: readonly EvidenceEvent[]): void {
  const key = sessionJournalMarkKey(workspace, sessionId);
  const mark = readHighWater(key);
  const head = rows.at(-1);
  if (mark === null || head === undefined) return;
  if (seqOf(head) < mark.sequence) {
    throw new AntiRollbackError("ROLLBACK_DETECTED", `${key} head sequence ${seqOf(head)} is older than the accepted sequence ${mark.sequence}`);
  }
  const marked = rows.find((row) => extractEnvelope(row.meta_json)?.seq === mark.sequence);
  if (marked?.event_hash !== mark.sha256) {
    throw new AntiRollbackError("FORK_DETECTED", `${key} sequence ${mark.sequence} holds other bytes than the accepted ${mark.sha256}`);
  }
}

/**
 * Raise this machine's mark to `head` (never lowering it). A lower sequence or other bytes at the mark throw.
 * ponytail: one entry per native session in the shared high-water file, rewritten under its lock on each raise; prune sealed
 * sessions' marks if that file nears its 8 MiB cap or dispatch latency matters.
 */
export function markSessionJournal(workspace: string, sessionId: string, head: EvidenceEvent): void {
  recordHighWater(sessionJournalMarkKey(workspace, sessionId), seqOf(head), head.event_hash);
}

export interface FenceRefusal {
  readonly sessionId: string;
  readonly code: string;
  readonly stage: "append" | "dispatch";
  readonly eventType: string | null;
  readonly writerToken: string;
  readonly writerEpoch: number;
  readonly currentToken: string | null;
  readonly currentEpoch: number | null;
}

/**
 * A signed `SESSION_WRITER_FENCE_REFUSED` audit row in its own sealed ledger session: the refused writer cannot append to
 * the session itself. Returns why it could not be recorded, or null; the refusal stands either way.
 */
export function recordFenceRefusal(workspace: string, refusal: FenceRefusal): string | null {
  try {
    const ledger = openLedger(workspace);
    try {
      const sessionId = `writer-fence-${randomUUID()}`;
      const meta = { trustTier: "OBSERVED", auditType: FENCE_REFUSAL_AUDIT, ...refusal };
      runImmediateTransaction(ledger.db, () => {
        ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-session-fence", binarySha256: "session-fence" });
        ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", payload: JSON.stringify(meta), inline: true, meta });
        ledger.sealSession(sessionId);
      });
    } finally {
      ledger.close();
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
