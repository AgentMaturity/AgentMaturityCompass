import { openLedger, verifyLedgerIntegrity } from "../../ledger/ledger.js";
import { verifyOpsPolicySignature } from "../policy.js";
import { listRetentionSegments, readPrunedRows, verifyPrunedRows, verifyRetentionSegment } from "./retentionArchive.js";
import { runRetentionSync } from "./retentionRun.js";
export { runRetentionAsync } from "./retentionRun.js";

export interface RetentionRunResult {
  dryRun: boolean;
  archivedEventCount: number;
  prunedEventCount: number;
  /** Guard events deleted; 0 unless retention.pruneGuardEventsAfterDays is set. */
  prunedGuardEventCount: number;
  prunedBlobCount: number;
  prunedSpillCount: number;
  segmentId: string | null;
  segmentPath: string | null;
  manifestPath: string | null;
  manifestSha256: string | null;
  auditEventIds: string[];
  transparencyHash: string | null;
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

/** Blocking compatibility API; signatures are prepared before final hold/publication/SQL gates. */
export function runRetention(params: { workspace: string; dryRun: boolean }): RetentionRunResult { return runRetentionSync(params); }

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
