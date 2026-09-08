/**
 * Verifying evidence that does not live in the `evidence_events` table.
 *
 * A workspace pinned to the JSONL backend keeps its session events in
 * .amc/sessions/*.jsonl. verifyLedgerIntegrity reads the SQLite table, so on
 * such a workspace it found NOTHING and reported success — demonstrated: a
 * JSONL workspace whose evidence had been openly rewritten returned
 * chain.ok = true with zero errors.
 *
 * A verifier that cannot see the evidence must never call it verified. This
 * routes those rows through the backend-independent verifier so their failures
 * reach the same chain errors as the SQLite path.
 */
import { readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { jsonlEventsPath, readEventRows } from "../persistence/jsonl/jsonlEventLog.js";
import { verifyStoredSessionEvents } from "../persistence/sessionStoreVerification.js";
import { pathExists } from "../utils/fs.js";

export function verifyAlternateBackendEvidence(
  workspace: string,
  expectedMonitorFingerprint: string | null
): string[] {
  if (readSessionStoreMarker(workspace) !== "jsonl") {
    return [];
  }
  try {
    if (!pathExists(jsonlEventsPath(workspace))) {
      return ["jsonl session event log is missing; a backend marker is not evidence"];
    }
    const rows = readEventRows(workspace);
    const stored = verifyStoredSessionEvents(workspace, rows, {
      ...(expectedMonitorFingerprint ? { expectedMonitorFingerprint } : {})
    });
    return [...stored.errors];
  } catch (error) {
    // Unreadable JSONL evidence is a verification failure, not an absence.
    return [`jsonl session store could not be read: ${error instanceof Error ? error.message : String(error)}`];
  }
}
