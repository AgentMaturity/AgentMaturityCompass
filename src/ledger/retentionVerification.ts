/**
 * Retention-state verification for evidence payloads.
 *
 * Split from ledgerVerification.ts: these three checks answer one question --
 * "are this event's bytes, or the signed proofs excusing their absence, exactly
 * what the row claims?" -- and share no state with the chain, session, or
 * config verifiers that remain there. Same discipline applies: nothing here
 * writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { loadBlobPlaintext } from "../storage/blobs/blobStore.js";
import type { RetentionProofIndex } from "../ops/retention/retentionArchive.js";
import type { EvidenceEvent } from "../types.js";

export function verifyEvidencePayload(
  event: EvidenceEvent,
  workspace: string,
  errors: string[],
  externallyAuthenticatedPayloads?: ReadonlyMap<string, string>,
  retentionProofs?: RetentionProofIndex
): void {
  verifyEventRetentionState(event, workspace, errors, retentionProofs);
  if (event.payload_inline !== null) {
    const payloadSha = sha256Hex(Buffer.from(event.payload_inline, "utf8"));
    if (payloadSha !== event.payload_sha256) errors.push(`Event ${event.id} payload hash mismatch`);
    return;
  }

  const payloadPath = event.payload_pruned === 1
    ? event.canonical_payload_path ?? event.payload_path ?? null
    : event.payload_path ?? event.canonical_payload_path ?? null;
  if (event.payload_pruned === 1 && (!payloadPath || !pathExists(join(workspace, payloadPath)))) return;
  if (!payloadPath) {
    if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) errors.push(`Event ${event.id} payload hash mismatch`);
    return;
  }
  if (!pathExists(join(workspace, payloadPath))) {
    errors.push(`Missing blob file for event ${event.id}`);
    return;
  }

  try {
    const loaded = loadBlobPlaintext(workspace, payloadPath);
    const plaintextSha = sha256Hex(loaded.bytes);
    if (plaintextSha !== event.payload_sha256 || loaded.payloadSha256 !== event.payload_sha256) {
      errors.push(`Event ${event.id} payload hash mismatch`);
    }
  } catch {
    const normalizedPath = payloadPath.replace(/\\/g, "/");
    const expectedStoredDigest = externallyAuthenticatedPayloads?.get(normalizedPath);
    if (expectedStoredDigest) {
      const actualStoredDigest = sha256Hex(readFileSync(join(workspace, payloadPath)));
      if (actualStoredDigest === expectedStoredDigest) return;
    }
    errors.push(`Event ${event.id} payload authentication failed`);
  }
}

function verifyArchivedEventRetentionProof(
  event: EvidenceEvent,
  errors: string[],
  retentionProofs?: RetentionProofIndex
): EvidenceEvent | null {
  const archivedState = event.archived ?? 0;
  if (archivedState === 0) {
    if (event.archive_segment_id != null || event.archive_manifest_sha256 != null) {
      errors.push(`Event ${event.id} archive references exist without archived state`);
    }
    return null;
  }
  if (archivedState !== 1 || !event.archive_segment_id || !event.archive_manifest_sha256) {
    errors.push(`Event ${event.id} archived retention state invalid`);
    return null;
  }
  if (!retentionProofs) {
    errors.push(`Event ${event.id} signed retention proof missing`);
    return null;
  }
  const archived = retentionProofs.archivedEvents.get(event.id);
  if (!archived) {
    errors.push(`Event ${event.id} archived retention proof missing`);
    return null;
  }
  if (
    archived.segmentId !== event.archive_segment_id
    || archived.manifestSha256 !== event.archive_manifest_sha256
  ) {
    errors.push(`Event ${event.id} archive reference mismatch`);
  }

  const original = archived.event;
  const immutableFields: Array<keyof EvidenceEvent> = [
    "id",
    "ts",
    "session_id",
    "runtime",
    "event_type",
    "payload_sha256",
    "meta_json",
    "prev_event_hash",
    "event_hash",
    "writer_sig",
    "canonical_payload_path",
    "canonical_payload_inline",
    "blob_ref"
  ];
  for (const field of immutableFields) {
    if ((event[field] ?? null) !== (original[field] ?? null)) {
      errors.push(`Event ${event.id} archived ${field} mismatch`);
    }
  }
  if ((original.archived ?? 0) !== 0 || (original.payload_pruned ?? 0) !== 0) {
    errors.push(`Event ${event.id} archive does not contain the pre-retention row`);
  }
  return original;
}

function verifyEventRetentionState(
  event: EvidenceEvent,
  workspace: string,
  errors: string[],
  retentionProofs?: RetentionProofIndex
): void {
  const original = verifyArchivedEventRetentionProof(event, errors, retentionProofs);
  const prunedState = event.payload_pruned ?? 0;
  if (prunedState === 0) {
    if (event.payload_pruned_ts != null) {
      errors.push(`Event ${event.id} pruning timestamp exists without pruned state`);
    }
    return;
  }
  if (
    prunedState !== 1
    || event.archived !== 1
    || !original
    || !retentionProofs
    || !Number.isInteger(event.payload_pruned_ts)
    || Number(event.payload_pruned_ts) < event.ts
    || event.payload_path !== null
    || event.payload_inline !== null
  ) {
    errors.push(`Event ${event.id} pruned retention state invalid`);
    return;
  }

  const originalInline = original.canonical_payload_inline ?? original.payload_inline ?? null;
  if (originalInline !== null) {
    if (sha256Hex(Buffer.from(originalInline, "utf8")) !== event.payload_sha256) {
      errors.push(`Event ${event.id} archived payload hash mismatch`);
    }
    return;
  }

  const originalPath = original.canonical_payload_path ?? original.payload_path ?? null;
  if (!originalPath) {
    if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) {
      errors.push(`Event ${event.id} archived empty payload hash mismatch`);
    }
    return;
  }
  if (pathExists(join(workspace, originalPath))) return;
  if (!event.blob_ref) {
    errors.push(`Event ${event.id} missing retained payload without blob pruning proof`);
    return;
  }
  const prunedBlob = retentionProofs.prunedBlobs.get(event.blob_ref);
  if (!prunedBlob || prunedBlob.ts < Number(event.payload_pruned_ts)) {
    errors.push(`Event ${event.id} signed blob pruning proof missing`);
  }
}
