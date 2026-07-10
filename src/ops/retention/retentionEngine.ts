import { unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openLedger, verifyLedgerIntegrity } from "../../ledger/ledger.js";
import { loadOpsPolicy, verifyOpsPolicySignature } from "../policy.js";
import { appendTransparencyEntry } from "../../transparency/logChain.js";
import { rebuildTransparencyMerkle } from "../../transparency/merkleIndexStore.js";
import { pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { blobPathFromId } from "../../storage/blobs/blobStore.js";
import { appendOpsAuditEvent } from "../audit.js";
import {
  appendPrunedRow,
  listRetentionSegments,
  readPrunedRows,
  verifyPrunedRows,
  verifyRetentionSegment,
  writeRetentionSegment
} from "./retentionArchive.js";
import { runVacuum } from "../maintenance/sqliteMaintenance.js";

export interface RetentionRunResult {
  dryRun: boolean;
  archivedEventCount: number;
  prunedEventCount: number;
  prunedBlobCount: number;
  segmentId: string | null;
  segmentPath: string | null;
  manifestPath: string | null;
  manifestSha256: string | null;
  auditEventIds: string[];
  transparencyHash: string | null;
}

function nowMs(): number {
  return Date.now();
}

function maintenanceStatePath(workspace: string): string {
  return join(workspace, ".amc", "ops", "maintenance-state.json");
}

function readMaintenanceState(workspace: string): { lastVacuumTs: number } {
  const path = maintenanceStatePath(workspace);
  if (!pathExists(path)) {
    return { lastVacuumTs: 0 };
  }
  try {
    const parsed = JSON.parse(readUtf8(path)) as { lastVacuumTs?: unknown };
    const lastVacuumTs = Number(parsed.lastVacuumTs ?? 0);
    return {
      lastVacuumTs: Number.isFinite(lastVacuumTs) ? Math.max(0, Math.trunc(lastVacuumTs)) : 0
    };
  } catch {
    return { lastVacuumTs: 0 };
  }
}

function writeMaintenanceState(workspace: string, state: { lastVacuumTs: number }): void {
  const path = maintenanceStatePath(workspace);
  writeFileAtomic(
    path,
    JSON.stringify(
      {
        v: 1,
        lastVacuumTs: Math.max(0, Math.trunc(state.lastVacuumTs))
      },
      null,
      2
    ),
    0o644
  );
}

function cutoffTs(days: number): number {
  return nowMs() - Math.max(1, days) * 24 * 60 * 60 * 1000;
}

export function retentionStatus(workspace: string): {
  totalEvents: number;
  archivedEvents: number;
  prunedEvents: number;
  blobRows: number;
  prunedBlobRows: number;
  segmentCount: number;
  latestSegmentId: string | null;
  latestSegmentTs: number | null;
} {
  const ledger = openLedger(workspace);
  try {
    const totalRow = ledger.db.prepare("SELECT COUNT(*) AS c FROM evidence_events").get() as { c?: number } | undefined;
    const archivedRow = ledger.db.prepare("SELECT COUNT(*) AS c FROM evidence_events WHERE archived = 1").get() as
      | { c?: number }
      | undefined;
    const prunedRow = ledger.db.prepare("SELECT COUNT(*) AS c FROM evidence_events WHERE payload_pruned = 1").get() as
      | { c?: number }
      | undefined;
    const blobRow = ledger.db.prepare("SELECT COUNT(*) AS c FROM evidence_events WHERE blob_ref IS NOT NULL AND blob_ref != ''").get() as
      | { c?: number }
      | undefined;
    const totalEvents = Number(totalRow?.c ?? 0);
    const archivedEvents = Number(archivedRow?.c ?? 0);
    const prunedEvents = Number(prunedRow?.c ?? 0);
    const blobRows = Number(blobRow?.c ?? 0);
    const prunedBlobRows = readPrunedRows(workspace).length;
    const segments = listRetentionSegments(workspace);
    const latest = segments.length > 0 ? segments[segments.length - 1]!.manifest : null;
    return {
      totalEvents,
      archivedEvents,
      prunedEvents,
      blobRows,
      prunedBlobRows,
      segmentCount: segments.length,
      latestSegmentId: latest?.segmentId ?? null,
      latestSegmentTs: latest?.createdTs ?? null
    };
  } finally {
    ledger.close();
  }
}

export function runRetention(params: { workspace: string; dryRun: boolean }): RetentionRunResult {
  const verifyPolicy = verifyOpsPolicySignature(params.workspace);
  if (!verifyPolicy.valid) {
    throw new Error(`ops policy invalid: ${verifyPolicy.reason ?? "unknown reason"}`);
  }
  const policy = loadOpsPolicy(params.workspace);
  const archiveBeforeTs = cutoffTs(policy.opsPolicy.retention.archivePayloadsAfterDays);
  const pruneBeforeTs = cutoffTs(policy.opsPolicy.retention.prunePayloadsAfterDays);
  const ledger = openLedger(params.workspace);
  try {
    const eligible = ledger.getRetentionEligibleEvents({
      archiveBeforeTs,
      pruneBeforeTs
    });
    const archiveEvents = eligible.archive;
    const pruneEvents = eligible.prune.filter((row) => row.payload_path !== null || row.payload_inline !== null);

    const segmentId = archiveEvents.length > 0 ? `seg_${randomUUID()}` : null;
    let segmentPath: string | null = null;
    let manifestPath: string | null = null;
    let manifestSha256: string | null = null;

    const auditEventIds: string[] = [];
    if (params.dryRun) {
      const dryAudit = appendOpsAuditEvent({
        workspace: params.workspace,
        auditType: "RETENTION_DRY_RUN",
        payload: {
          archiveCandidates: archiveEvents.length,
          pruneCandidates: pruneEvents.length,
          segmentId
        }
      });
      auditEventIds.push(dryAudit.eventId);
      return {
        dryRun: true,
        archivedEventCount: archiveEvents.length,
        prunedEventCount: pruneEvents.length,
        prunedBlobCount: 0,
        segmentId,
        segmentPath,
        manifestPath,
        manifestSha256,
        auditEventIds,
        transparencyHash: null
      };
    }

    if (segmentId) {
      const prevSegments = listRetentionSegments(params.workspace);
      const prevLast = prevSegments.length > 0 ? prevSegments[prevSegments.length - 1]!.manifest?.lastEventHash ?? null : null;
      const lines = archiveEvents.map((row) => JSON.stringify(row));
      const startTs = archiveEvents[0]!.ts;
      const endTs = archiveEvents[archiveEvents.length - 1]!.ts;
      const segment = writeRetentionSegment({
        workspace: params.workspace,
        segmentId,
        startTs,
        endTs,
        eventLines: lines,
        firstEventHash: archiveEvents[0]!.event_hash,
        lastEventHash: archiveEvents[archiveEvents.length - 1]!.event_hash,
        prevSegmentLastEventHash: prevLast,
        prunePolicy: {
          prunePayloadsAfterDays: policy.opsPolicy.retention.prunePayloadsAfterDays,
          archivePayloadsAfterDays: policy.opsPolicy.retention.archivePayloadsAfterDays
        }
      });
      segmentPath = segment.segmentPath;
      manifestPath = segment.manifestPath;
      manifestSha256 = sha256Hex(readFileSync(segment.manifestPath));
    }

    if (segmentId && manifestSha256) {
      ledger.markEventsArchived(
        archiveEvents.map((row) => row.id),
        segmentId,
        manifestSha256
      );
    }

    const pruneIds = pruneEvents.map((row) => row.id);
    if (pruneIds.length > 0) {
      ledger.pruneEventPayloadColumns(pruneIds, nowMs());
    }

    let prunedBlobCount = 0;
    const refs = ledger.listBlobReferences();
    const byBlob = new Map<string, typeof refs>();
    for (const row of refs) {
      if (!row.blob_ref) {
        continue;
      }
      const list = byBlob.get(row.blob_ref) ?? [];
      list.push(row);
      byBlob.set(row.blob_ref, list);
    }
    for (const [blobId, rows] of byBlob.entries()) {
      const eligibleForDelete = rows.every((row) => row.payload_pruned === 1 && row.ts < pruneBeforeTs);
      if (!eligibleForDelete) {
        continue;
      }
      const rel = blobPathFromId(blobId);
      const full = join(params.workspace, rel);
      if (!pathExists(full)) {
        continue;
      }
      const bytes = readFileSync(full);
      unlinkSync(full);
      appendPrunedRow(params.workspace, blobId, sha256Hex(bytes));
      prunedBlobCount += 1;
    }

    const createdAudit = appendOpsAuditEvent({
      workspace: params.workspace,
      auditType: "RETENTION_SEGMENT_CREATED",
      payload: {
        segmentId,
        archivedEventCount: archiveEvents.length,
        manifestSha256
      }
    });
    auditEventIds.push(createdAudit.eventId);
    if (pruneIds.length > 0) {
      const pruneAudit = appendOpsAuditEvent({
        workspace: params.workspace,
        auditType: "RETENTION_PAYLOAD_PRUNED",
        payload: {
          prunedEventCount: pruneIds.length,
          prunedBlobCount
        }
      });
      auditEventIds.push(pruneAudit.eventId);
    }

    if (policy.opsPolicy.maintenance.autoVacuumOnRetention) {
      const state = readMaintenanceState(params.workspace);
      const minIntervalMs = Math.max(1, policy.opsPolicy.maintenance.vacuumAtMostOnceHours) * 60 * 60 * 1000;
      const due = state.lastVacuumTs <= 0 || nowMs() - state.lastVacuumTs >= minIntervalMs;
      if (due) {
        const vacuum = runVacuum(params.workspace);
        writeMaintenanceState(params.workspace, {
          lastVacuumTs: vacuum.lastVacuumTs
        });
        const vacuumAudit = appendOpsAuditEvent({
          workspace: params.workspace,
          auditType: "MAINTENANCE_VACUUM",
          payload: {
            source: "retention.auto",
            lastVacuumTs: vacuum.lastVacuumTs
          },
          severity: "LOW"
        });
        auditEventIds.push(vacuumAudit.eventId);
      }
    }

    let transparencyHash: string | null = null;
    if (manifestSha256 && segmentId) {
      const entry = appendTransparencyEntry({
        workspace: params.workspace,
        type: "RETENTION_SEGMENT_CREATED",
        agentId: "system",
        artifact: {
          kind: "policy",
          id: segmentId,
          sha256: manifestSha256
        }
      });
      transparencyHash = entry.hash;
      rebuildTransparencyMerkle(params.workspace);
    }

    return {
      dryRun: false,
      archivedEventCount: archiveEvents.length,
      prunedEventCount: pruneIds.length,
      prunedBlobCount,
      segmentId,
      segmentPath,
      manifestPath,
      manifestSha256,
      auditEventIds,
      transparencyHash
    };
  } finally {
    ledger.close();
  }
}

export async function verifyRetention(workspace: string): Promise<{
  ok: boolean;
  errors: string[];
  segmentCount: number;
}> {
  const errors: string[] = [];
  const verifyPolicy = verifyOpsPolicySignature(workspace);
  if (!verifyPolicy.valid) {
    errors.push(`ops policy invalid: ${verifyPolicy.reason ?? "unknown reason"}`);
  }
  const segments = listRetentionSegments(workspace);
  let prevLast: string | null = null;
  for (const item of segments) {
    const verified = verifyRetentionSegment({
      workspace,
      segmentPath: item.segmentPath,
      manifestPath: item.manifestPath,
      sigPath: item.sigPath
    });
    errors.push(...verified.errors);
    if (verified.manifest) {
      if (verified.manifest.prevSegmentLastEventHash !== prevLast) {
        errors.push(`segment continuity mismatch for ${verified.manifest.segmentId}`);
      }
      prevLast = verified.manifest.lastEventHash;
    }
  }
  const pruned = verifyPrunedRows(workspace);
  errors.push(...pruned.errors);

  const result = await verifyLedgerIntegrity(workspace);
  errors.push(...result.errors);
  return {
    ok: errors.length === 0,
    errors,
    segmentCount: segments.length
  };
}
