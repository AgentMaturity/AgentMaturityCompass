/** Retained synchronous spill/audit/maintenance suffix. No new signer or deletion protocol. */
import { join } from "node:path";
import { openLedger } from "../../ledger/ledger.js";
import { pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { inventorySessionSpills, eraseSessionSpills } from "../../session/spill/spillLifecycle.js";
import { spillLifecycleEventAuthenticityError } from "../../session/spill/spillEvidence.js";
import { appendOpsAuditEvent } from "../audit.js";
import { runVacuum } from "../maintenance/sqliteMaintenance.js";
import type { OpsPolicy } from "../policy.js";
import type { RetentionRunResult } from "./retentionEngine.js";
import type { EvidenceEvent } from "../../types.js";

function maintenanceStatePath(workspace: string): string { return join(workspace, ".amc", "ops", "maintenance-state.json"); }
function readMaintenanceState(workspace: string): { lastVacuumTs: number } {
  const path = maintenanceStatePath(workspace);
  if (!pathExists(path)) return { lastVacuumTs: 0 };
  try {
    const parsed = JSON.parse(readUtf8(path)) as { lastVacuumTs?: unknown }, value = Number(parsed.lastVacuumTs ?? 0);
    return { lastVacuumTs: Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0 };
  } catch { return { lastVacuumTs: 0 }; }
}
function writeMaintenanceState(workspace: string, state: { lastVacuumTs: number }): void {
  writeFileAtomic(maintenanceStatePath(workspace), JSON.stringify({ v: 1, lastVacuumTs: Math.max(0, Math.trunc(state.lastVacuumTs)) }, null, 2), 0o644);
}
export function finishRetentionTail(input: { workspace: string; policy: OpsPolicy; pruneBeforeTs: number; result: RetentionRunResult;
  gate: () => void; before: (stage: string) => void; completed: (stage: string) => void }): void {
  const { workspace, policy, result, pruneBeforeTs } = input;
  input.gate();
  const ledger = openLedger(workspace);
  let spillEvents: EvidenceEvent[];
  try { spillEvents = ledger.db.prepare("SELECT * FROM evidence_events ORDER BY rowid ASC").all() as EvidenceEvent[]; }
  finally { ledger.close(); }
  const inventory = inventorySessionSpills({ workspace, events: spillEvents });
  if (!inventory.ok) throw new Error(`Spill retention refused: ${inventory.errors.join("; ")}`);
  const byId = new Map(spillEvents.map(event => [event.id, event])), lastBySession = new Map(spillEvents.map(event => [event.session_id, event]));
  const groups: Array<readonly string[]> = [];
  for (const entry of inventory.entries) {
    if (entry.locator === null || entry.status === "missing") continue;
    const closed = entry.sessionIds.every(id => {
      const last = lastBySession.get(id);
      return last?.event_type === "session/close" && last.ts < pruneBeforeTs && spillLifecycleEventAuthenticityError(workspace, last) === null;
    });
    const expired = entry.eventIds.every(id => { const event = byId.get(id);
      return event !== undefined && event.ts < pruneBeforeTs && (event.event_type === "tool/spill-commitment" || event.payload_pruned === 1); });
    if (closed && expired) groups.push(entry.eventIds);
  }
  for (const eventIds of groups) {
    input.gate(); input.before("spill-erasure");
    const erased = eraseSessionSpills({ workspace, events: spillEvents, scope: { eventIds },
      reason: `signed ops retention prunePayloadsAfterDays=${policy.opsPolicy.retention.prunePayloadsAfterDays}` });
    result.auditEventIds.push(...erased.auditEventIds);
    result.prunedSpillCount += erased.entries.filter(entry => entry.status === "removed").length;
    if (erased.entries.some(entry => entry.status === "failed")) throw new Error("Spill retention incomplete; inspect signed SESSION_SPILL_ERASURE_FINISHED audit events");
    input.completed("spill-erasure");
  }
  input.gate(); input.before("segment-audit");
  const created = appendOpsAuditEvent({ workspace, auditType: "RETENTION_SEGMENT_CREATED", payload: {
    segmentId: result.segmentId, archivedEventCount: result.archivedEventCount, manifestSha256: result.manifestSha256 } });
  result.auditEventIds.push(created.eventId); input.completed("segment-audit");
  if (result.prunedEventCount > 0) {
    input.gate(); input.before("payload-audit");
    const pruned = appendOpsAuditEvent({ workspace, auditType: "RETENTION_PAYLOAD_PRUNED", payload: {
      prunedEventCount: result.prunedEventCount, prunedGuardEventCount: result.prunedGuardEventCount,
      prunedBlobCount: result.prunedBlobCount, prunedSpillCount: result.prunedSpillCount } });
    result.auditEventIds.push(pruned.eventId); input.completed("payload-audit");
  }
  if (policy.opsPolicy.maintenance.autoVacuumOnRetention) {
    const state = readMaintenanceState(workspace), interval = Math.max(1, policy.opsPolicy.maintenance.vacuumAtMostOnceHours) * 60 * 60 * 1000;
    if (state.lastVacuumTs <= 0 || Date.now() - state.lastVacuumTs >= interval) {
      input.gate(); input.before("vacuum"); const vacuum = runVacuum(workspace); input.completed("vacuum");
      input.gate(); input.before("maintenance-state"); writeMaintenanceState(workspace, { lastVacuumTs: vacuum.lastVacuumTs }); input.completed("maintenance-state");
      input.gate(); input.before("vacuum-audit");
      const audit = appendOpsAuditEvent({ workspace, auditType: "MAINTENANCE_VACUUM", severity: "LOW",
        payload: { source: "retention.auto", lastVacuumTs: vacuum.lastVacuumTs } });
      result.auditEventIds.push(audit.eventId); input.completed("vacuum-audit");
    }
  }
}
