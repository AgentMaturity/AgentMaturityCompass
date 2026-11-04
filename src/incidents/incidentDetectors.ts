/**
 * Detector wiring from the ledger append path (P2-26 slice A). After an audit row commits, the ledger hands it here:
 * autoDetectAndAssemble decides whether it opens an incident (deduplicated by trigger id among open incidents), the
 * incident is stored, and startIncidentClocks records which clocks apply. Nothing here appends evidence, so a detected
 * incident never re-enters the append path.
 */
import type Database from "better-sqlite3";
import type { EvidenceEvent } from "../types.js";
import { autoDetectAndAssemble, isDetectedAuditType } from "./autoAssembly.js";
import { startIncidentClocks } from "./clockRuntime.js";
import { createIncidentStore } from "./incidentStore.js";
import type { Incident } from "./incidentTypes.js";

interface DetectorInput {
  workspace: string;
  db: Database.Database;
  agentId: string;
  event: Pick<EvidenceEvent, "id" | "ts" | "event_type" | "meta_json">;
  sign: (digestHex: string) => string;
  now?: number;
}

/** Opens and stores the incidents one committed audit row triggers, each with its clock run. */
function runIncidentDetectors(input: DetectorInput): Incident[] {
  if (input.event.event_type !== "audit") return [];
  const store = createIncidentStore(input.db);
  store.initTables();
  const now = input.now ?? Date.now();
  const incidents = autoDetectAndAssemble(input.db, input.agentId, [input.event as EvidenceEvent], input.sign, now);
  for (const incident of incidents) {
    store.insertIncident(incident);
    startIncidentClocks({ workspace: input.workspace, db: input.db, incidentId: incident.incidentId, nowTs: now, sign: input.sign });
  }
  return incidents;
}

/**
 * The ledger's post-commit hook. A detector failure never fails the append that triggered it, and is never silent: it
 * raises a process warning naming the event.
 */
export function runLedgerDetectors(
  workspace: string, db: Database.Database, agentId: string,
  event: { eventId: string; eventType: string; meta: Record<string, unknown>; ts: number }, sign: (digestHex: string) => string
): void {
  if (event.eventType !== "audit" || !isDetectedAuditType(event.meta.auditType)) return;
  try {
    runIncidentDetectors({ workspace, db, agentId, sign,
      event: { id: event.eventId, ts: event.ts, event_type: "audit", meta_json: JSON.stringify(event.meta) } });
  } catch (error) {
    process.emitWarning(`incident detectors failed for evidence ${event.eventId}: ${error instanceof Error ? error.message : String(error)}`, "AmcIncidentDetectorWarning");
  }
}
