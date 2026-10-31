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
import { postgresChainProblems, readSignedPostgresHeadForCheck } from "../persistence/postgres/postgresHead.js";
import { PostgresSessionEventStore, readPostgresChainId } from "../persistence/postgres/postgresSessionEventStore.js";
import { jsonlEventsPath, readEventRows } from "../persistence/jsonl/jsonlEventLog.js";
import { verifyStoredSessionEvents } from "../persistence/sessionStoreVerification.js";
import { pathExists } from "../utils/fs.js";
import type { TrustContext } from "../trust/trustContext.js";

export function verifyAlternateBackendEvidence(
  workspace: string,
  expectedMonitorFingerprint: string | null,
  trust?: TrustContext
): string[] {
  const marker = readSessionStoreMarker(workspace);
  if (marker === "postgres") return verifyPostgresEvidence(workspace, expectedMonitorFingerprint, trust);
  if (marker !== "jsonl") {
    return [];
  }
  try {
    if (!pathExists(jsonlEventsPath(workspace))) {
      return ["jsonl session event log is missing; a backend marker is not evidence"];
    }
    const rows = readEventRows(workspace);
    const stored = verifyStoredSessionEvents(workspace, rows, {
      trust,
      ...(expectedMonitorFingerprint ? { expectedMonitorFingerprint } : {})
    });
    return [...stored.errors];
  } catch {
    // Native diagnostics may include private filesystem paths or key/provider details.
    return ["jsonl session store could not be read: unreadable or unauthenticated evidence"];
  }
}

/**
 * The same rule for a Postgres workspace: a store that cannot be read is an
 * error, never an empty pass. Beyond the rows' own hashes and signatures, the
 * chain must end at the database head and still contain the head the workspace
 * signed, so a database-side writer cannot truncate the tail unnoticed.
 */
function verifyPostgresEvidence(workspace: string, expectedMonitorFingerprint: string | null, trust?: TrustContext): string[] {
  try {
    if (readPostgresChainId(workspace) === null) return ["postgres session store has no chain id for this workspace; a backend marker is not evidence"];
    const signed = readSignedPostgresHeadForCheck(workspace);
    const store = new PostgresSessionEventStore(workspace, { readOnly: true });
    try {
      const snapshot = store.readChainSnapshot();
      if (snapshot === null) return ["postgres session store has no chain id for this workspace; a backend marker is not evidence"];
      const rows = snapshot.events.map((entry) => entry.event);
      return [
        ...postgresChainProblems(workspace, snapshot, signed),
        ...verifyStoredSessionEvents(workspace, rows, {
          trust, sessionRecords: snapshot.sessions, ...(expectedMonitorFingerprint ? { expectedMonitorFingerprint } : {})
        }).errors
      ];
    } finally {
      store.close();
    }
  } catch {
    return ["postgres session store could not be read: unreachable, misconfigured or unauthenticated evidence"];
  }
}
