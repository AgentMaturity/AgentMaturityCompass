import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceEvent } from "../../types.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import {
  blobPrunedRowSchema,
  blobPrunedSealSchema,
  retentionSegmentManifestSchema,
  retentionSegmentSignatureSchema,
  type BlobPrunedRow,
  type RetentionSegmentManifest
} from "./retentionSchema.js";

const MAX_RETENTION_SEGMENT_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

export interface ArchivedEventProof {
  event: EvidenceEvent;
  segmentId: string;
  manifestSha256: string;
}

export interface RetentionProofIndex {
  ok: boolean;
  errors: string[];
  archivedEvents: ReadonlyMap<string, ArchivedEventProof>;
  prunedBlobs: ReadonlyMap<string, BlobPrunedRow>;
}

export function archiveLedgerDir(workspace: string): string {
  return join(workspace, ".amc", "archive", "ledger");
}

export function segmentFilePath(workspace: string, segmentId: string, startTs: number, endTs: number): string {
  return join(archiveLedgerDir(workspace), `segment_${startTs}_${endTs}_${segmentId}.jsonl.gz`);
}

export function segmentManifestPath(segmentPath: string): string {
  return `${segmentPath}.manifest.json`;
}

export function segmentManifestSigPath(segmentPath: string): string {
  return `${segmentPath}.manifest.sig`;
}

export function prunedLogPath(workspace: string): string {
  return join(workspace, ".amc", "blobs", "pruned.jsonl");
}

export function prunedSealPath(workspace: string): string {
  return join(workspace, ".amc", "blobs", "pruned.jsonl.sig");
}

export function readPrunedRows(workspace: string): BlobPrunedRow[] {
  const file = prunedLogPath(workspace);
  if (!pathExists(file)) return [];
  return readUtf8(file)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => blobPrunedRowSchema.parse(JSON.parse(line) as unknown));
}

function signPrunedRows(workspace: string, lastHash: string): void {
  const digest = sha256Hex(pathExists(prunedLogPath(workspace)) ? readFileSync(prunedLogPath(workspace)) : Buffer.alloc(0));
  const seal = blobPrunedSealSchema.parse({
    v: 1,
    ts: Date.now(),
    lastHash,
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signer: "auditor"
  });
  writeFileAtomic(prunedSealPath(workspace), JSON.stringify(seal, null, 2), 0o644);
}

export function appendPrunedRow(workspace: string, blobId: string, sha256: string): void {
  const rows = readPrunedRows(workspace);
  const prev = rows.length > 0 ? rows[rows.length - 1]!.hash : "";
  const ts = Date.now();
  const row = blobPrunedRowSchema.parse({
    v: 1,
    ts,
    blobId,
    sha256,
    prev,
    hash: sha256Hex(canonicalize({ v: 1, ts, blobId, sha256, prev }))
  });
  const current = pathExists(prunedLogPath(workspace)) ? readUtf8(prunedLogPath(workspace)) : "";
  writeFileAtomic(prunedLogPath(workspace), `${current}${JSON.stringify(row)}\n`, 0o644);
  signPrunedRows(workspace, row.hash);
}

export function verifyPrunedRows(workspace: string): {
  ok: boolean;
  errors: string[];
  rows: BlobPrunedRow[];
} {
  const errors: string[] = [];
  let rows: BlobPrunedRow[] = [];
  try {
    rows = readPrunedRows(workspace);
  } catch (error) {
    errors.push(`invalid blob pruned log: ${String(error)}`);
    return { ok: false, errors, rows };
  }

  let prev = "";
  for (const row of rows) {
    if (row.prev !== prev) errors.push(`blob pruned row chain mismatch at ${row.blobId}`);
    const expected = sha256Hex(canonicalize({
      v: 1,
      ts: row.ts,
      blobId: row.blobId,
      sha256: row.sha256,
      prev: row.prev
    }));
    if (row.hash !== expected) errors.push(`blob pruned row hash mismatch at ${row.blobId}`);
    prev = row.hash;
  }

  if (rows.length > 0 && !pathExists(prunedSealPath(workspace))) {
    errors.push("blob pruned seal missing");
  } else if (pathExists(prunedSealPath(workspace))) {
    try {
      const seal = blobPrunedSealSchema.parse(JSON.parse(readUtf8(prunedSealPath(workspace))) as unknown);
      const digest = sha256Hex(pathExists(prunedLogPath(workspace)) ? readFileSync(prunedLogPath(workspace)) : Buffer.alloc(0));
      if (seal.digestSha256 !== digest) {
        errors.push("blob pruned seal digest mismatch");
      } else if (!verifyHexDigestAny(digest, seal.signature, getPublicKeyHistory(workspace, "auditor"))) {
        errors.push("blob pruned seal signature invalid");
      }
      if (seal.lastHash !== (rows.length > 0 ? rows[rows.length - 1]!.hash : "")) {
        errors.push("blob pruned seal last hash mismatch");
      }
    } catch (error) {
      errors.push(`invalid blob pruned seal: ${String(error)}`);
    }
  }

  return { ok: errors.length === 0, errors, rows };
}

export function writeRetentionSegment(params: {
  workspace: string;
  segmentId: string;
  startTs: number;
  endTs: number;
  eventLines: string[];
  firstEventHash: string;
  lastEventHash: string;
  prevSegmentLastEventHash: string | null;
  prunePolicy: {
    prunePayloadsAfterDays: number;
    archivePayloadsAfterDays: number;
  };
}): {
  segmentPath: string;
  manifestPath: string;
  sigPath: string;
  manifest: RetentionSegmentManifest;
} {
  ensureDir(archiveLedgerDir(params.workspace));
  const segmentPath = segmentFilePath(params.workspace, params.segmentId, params.startTs, params.endTs);
  const raw = `${params.eventLines.join("\n")}${params.eventLines.length > 0 ? "\n" : ""}`;
  const compressed = gzipSync(Buffer.from(raw, "utf8"));
  writeFileAtomic(segmentPath, compressed, 0o644);
  const segmentFileSha256 = sha256Hex(compressed);
  const manifest = retentionSegmentManifestSchema.parse({
    v: 1,
    segmentId: params.segmentId,
    createdTs: Date.now(),
    startTs: params.startTs,
    endTs: params.endTs,
    eventCount: params.eventLines.length,
    firstEventHash: params.firstEventHash,
    lastEventHash: params.lastEventHash,
    prevSegmentLastEventHash: params.prevSegmentLastEventHash,
    segmentFileSha256,
    prunePolicy: params.prunePolicy
  });
  const manifestPath = segmentManifestPath(segmentPath);
  writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2), 0o644);
  const digest = sha256Hex(readFileSync(manifestPath));
  const sig = retentionSegmentSignatureSchema.parse({
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(params.workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  });
  const sigPath = segmentManifestSigPath(segmentPath);
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return {
    segmentPath,
    manifestPath,
    sigPath,
    manifest
  };
}

export function readRetentionSegmentLines(segmentPath: string): string[] {
  const bytes = readFileSync(segmentPath);
  const text = gunzipSync(bytes, {
    maxOutputLength: MAX_RETENTION_SEGMENT_DECOMPRESSED_BYTES
  }).toString("utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function listRetentionSegments(workspace: string): Array<{
  segmentPath: string;
  manifestPath: string;
  sigPath: string;
  manifest: RetentionSegmentManifest | null;
}> {
  const dir = archiveLedgerDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl.gz"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const segmentPath = join(dir, name);
      const manifestPath = segmentManifestPath(segmentPath);
      const sigPath = segmentManifestSigPath(segmentPath);
      let manifest: RetentionSegmentManifest | null = null;
      if (pathExists(manifestPath)) {
        try {
          manifest = retentionSegmentManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
        } catch {
          manifest = null;
        }
      }
      return {
        segmentPath,
        manifestPath,
        sigPath,
        manifest
      };
    });
}

export function verifyRetentionSegment(params: {
  workspace: string;
  segmentPath: string;
  manifestPath: string;
  sigPath: string;
}): {
  ok: boolean;
  errors: string[];
  manifest: RetentionSegmentManifest | null;
} {
  const errors: string[] = [];
  if (!pathExists(params.segmentPath)) {
    errors.push(`segment missing: ${params.segmentPath}`);
    return { ok: false, errors, manifest: null };
  }
  if (!pathExists(params.manifestPath)) {
    errors.push(`segment manifest missing: ${params.manifestPath}`);
    return { ok: false, errors, manifest: null };
  }
  if (!pathExists(params.sigPath)) {
    errors.push(`segment manifest signature missing: ${params.sigPath}`);
    return { ok: false, errors, manifest: null };
  }
  let manifest: RetentionSegmentManifest | null = null;
  try {
    manifest = retentionSegmentManifestSchema.parse(JSON.parse(readUtf8(params.manifestPath)) as unknown);
  } catch (error) {
    errors.push(`invalid segment manifest: ${String(error)}`);
    return { ok: false, errors, manifest: null };
  }
  const segmentSha = sha256Hex(readFileSync(params.segmentPath));
  if (manifest.segmentFileSha256 !== segmentSha) {
    errors.push(`segment sha mismatch for ${params.segmentPath}`);
  }
  try {
    const sig = retentionSegmentSignatureSchema.parse(JSON.parse(readUtf8(params.sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(params.manifestPath));
    if (sig.digestSha256 !== digest) {
      errors.push(`manifest digest mismatch for ${params.manifestPath}`);
    } else {
      const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(params.workspace, "auditor"));
      if (!valid) {
        errors.push(`manifest signature invalid for ${params.manifestPath}`);
      }
    }
  } catch (error) {
    errors.push(`invalid segment signature payload: ${String(error)}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors, manifest };
  }

  let lines: string[] = [];
  try {
    lines = readRetentionSegmentLines(params.segmentPath);
  } catch (error) {
    errors.push(`segment read failure for ${params.segmentPath}: ${String(error)}`);
    return { ok: false, errors, manifest };
  }
  if (lines.length !== manifest.eventCount) {
    errors.push(`segment event count mismatch for ${params.segmentPath}`);
  } else if (lines.length > 0) {
    try {
      const first = JSON.parse(lines[0]!) as { event_hash?: string };
      const last = JSON.parse(lines[lines.length - 1]!) as { event_hash?: string };
      if (String(first.event_hash ?? "") !== manifest.firstEventHash) {
        errors.push(`segment first event hash mismatch for ${params.segmentPath}`);
      }
      if (String(last.event_hash ?? "") !== manifest.lastEventHash) {
        errors.push(`segment last event hash mismatch for ${params.segmentPath}`);
      }
    } catch {
      errors.push(`segment parse failure for ${params.segmentPath}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    manifest
  };
}

function parseArchivedEvent(line: string, segmentId: string, errors: string[]): EvidenceEvent | null {
  try {
    const value = JSON.parse(line) as Partial<EvidenceEvent> | null;
    if (
      !value
      || typeof value !== "object"
      || typeof value.id !== "string"
      || typeof value.ts !== "number"
      || typeof value.session_id !== "string"
      || typeof value.runtime !== "string"
      || typeof value.event_type !== "string"
      || typeof value.payload_sha256 !== "string"
      || typeof value.meta_json !== "string"
      || typeof value.prev_event_hash !== "string"
      || typeof value.event_hash !== "string"
      || typeof value.writer_sig !== "string"
    ) {
      errors.push(`invalid archived event row in ${segmentId}`);
      return null;
    }
    return value as EvidenceEvent;
  } catch {
    errors.push(`invalid archived event JSON in ${segmentId}`);
    return null;
  }
}

export function buildRetentionProofIndex(workspace: string): RetentionProofIndex {
  const errors: string[] = [];
  const archivedEvents = new Map<string, ArchivedEventProof>();
  const prunedBlobs = new Map<string, BlobPrunedRow>();
  const segments = listRetentionSegments(workspace);
  let previousLastEventHash: string | null = null;

  for (const item of segments) {
    const verified = verifyRetentionSegment({
      workspace,
      segmentPath: item.segmentPath,
      manifestPath: item.manifestPath,
      sigPath: item.sigPath
    });
    errors.push(...verified.errors);
    if (!verified.manifest) continue;

    let segmentTrusted = verified.ok;
    if (verified.manifest.prevSegmentLastEventHash !== previousLastEventHash) {
      errors.push(`segment continuity mismatch for ${verified.manifest.segmentId}`);
      segmentTrusted = false;
    }
    previousLastEventHash = verified.manifest.lastEventHash;
    if (!segmentTrusted) continue;

    let lines: string[] = [];
    try {
      lines = readRetentionSegmentLines(item.segmentPath);
    } catch (error) {
      errors.push(`segment read failure for ${verified.manifest.segmentId}: ${String(error)}`);
      segmentTrusted = false;
    }
    const parsed = lines
      .map((line) => parseArchivedEvent(line, verified.manifest!.segmentId, errors))
      .filter((event): event is EvidenceEvent => event !== null);
    if (parsed.length !== lines.length) segmentTrusted = false;
    if (!segmentTrusted) continue;

    const manifestSha256 = sha256Hex(readFileSync(item.manifestPath));
    for (const event of parsed) {
      if (archivedEvents.has(event.id)) {
        errors.push(`duplicate archived event proof for ${event.id}`);
        archivedEvents.delete(event.id);
        continue;
      }
      archivedEvents.set(event.id, {
        event,
        segmentId: verified.manifest.segmentId,
        manifestSha256
      });
    }
  }

  const pruned = verifyPrunedRows(workspace);
  errors.push(...pruned.errors);
  if (pruned.ok) {
    for (const row of pruned.rows) {
      if (prunedBlobs.has(row.blobId)) {
        errors.push(`duplicate blob pruned proof for ${row.blobId}`);
        prunedBlobs.delete(row.blobId);
        continue;
      }
      prunedBlobs.set(row.blobId, row);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    archivedEvents,
    prunedBlobs
  };
}
