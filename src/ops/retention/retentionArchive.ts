import { gunzipSync } from "node:zlib";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceEvent } from "../../types.js";
import { getSigningKey, getPublicKeyPem, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../../keys/signingKeys.js";
import { pathExists, readUtf8 } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { captureRetentionFile, prunedFiles, preparePrunedPrefix, prepareRetentionSegment, publishPrunedPrefix,
  publishRetentionSegment, withRetentionPublication, type RetentionFile } from "./retentionPublication.js";
import { captureRetentionAuthority, assertRetentionAuthorityCurrent } from "./retentionAuthority.js";
import {
  blobPrunedRowSchema,
  blobPrunedSealSchema,
  retentionSegmentManifestSchema,
  retentionSegmentSignatureSchema,
  type BlobPrunedRow,
  type RetentionSegmentManifest
} from "./retentionSchema.js";

const MAX_RETENTION_SEGMENT_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

interface ArchivedEventProof {
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

function archiveLedgerDir(workspace: string): string {
  return join(workspace, ".amc", "archive", "ledger");
}

function segmentManifestPath(segmentPath: string): string {
  return `${segmentPath}.manifest.json`;
}

function segmentManifestSigPath(segmentPath: string): string {
  return `${segmentPath}.manifest.sig`;
}

function prunedLogPath(workspace: string): string {
  return join(workspace, ".amc", "blobs", "pruned.jsonl");
}

export function readPrunedRows(workspace: string): BlobPrunedRow[] {
  return parsePrunedRows(captureRetentionFile(prunedLogPath(workspace)).bytes);
}

function parsePrunedRows(bytes: Buffer | null): BlobPrunedRow[] {
  return (bytes?.toString("utf8") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => blobPrunedRowSchema.parse(JSON.parse(line) as unknown));
}

export function appendPrunedRow(workspace: string, blobId: string, sha256: string): void {
  const authority = captureRetentionAuthority(workspace, false);
  const plan = preparePrunedPrefix(workspace, blobId, sha256, prunedFiles(workspace));
  // Retained sync/no-sign contract; all key lookup and crypto finish before the common lock.
  const signature = signHexDigest(plan.digest, getSigningKey(workspace, "artifact-seal"));
  const seal = JSON.stringify(blobPrunedSealSchema.parse({ v: 1, ts: plan.sealTs, lastHash: plan.row.hash,
    digestSha256: plan.digest, signature, signer: "auditor" }), null, 2);
  withRetentionPublication(workspace, () => { assertRetentionAuthorityCurrent(workspace, authority); publishPrunedPrefix(plan, seal, []); });
}

function verifyRetentionDigest(workspace: string, digest: string, signature: string): boolean {
  try {
    assertKeysetComplete(workspace);
    const keys = getPurposeKeyHistory(workspace, "artifact-seal");
    if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
      const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
      keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
    }
    return verifyHexDigestAny(digest, signature, keys);
  } catch { return false; }
}

export function verifyPrunedRows(workspace: string): {
  ok: boolean;
  errors: string[];
  rows: BlobPrunedRow[];
} {
  try { return verifyPrunedSnapshot(workspace, prunedFiles(workspace)); }
  catch { return { ok: false, errors: ["invalid blob pruned log or seal: unreadable state"], rows: [] }; }
}

/** Internal same-buffer verifier, also used before preparing the next cumulative seal. */
export function verifyPrunedSnapshot(workspace: string, files: readonly RetentionFile[]): {
  ok: boolean; errors: string[]; rows: BlobPrunedRow[];
} {
  const errors: string[] = [];
  let rows: BlobPrunedRow[] = [];
  try {
    rows = parsePrunedRows(files[0]!.bytes);
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

  if (rows.length > 0 && files[1]!.bytes === null) {
    errors.push("blob pruned seal missing");
  } else if (files[1]!.bytes !== null) {
    try {
      const seal = blobPrunedSealSchema.parse(JSON.parse(files[1]!.bytes!.toString("utf8")) as unknown);
      const digest = sha256Hex(files[0]!.bytes ?? Buffer.alloc(0));
      if (seal.digestSha256 !== digest) {
        errors.push("blob pruned seal digest mismatch");
      } else if (!verifyRetentionDigest(workspace, digest, seal.signature)) {
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
  const authority = captureRetentionAuthority(params.workspace, false);
  const plan = prepareRetentionSegment({ ...params, eventLines: [...params.eventLines], prunePolicy: { ...params.prunePolicy } });
  const signature = signHexDigest(plan.digest, getSigningKey(params.workspace, "artifact-seal"));
  const sig = retentionSegmentSignatureSchema.parse({
    digestSha256: plan.digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  });
  const signatureBytes = JSON.stringify(sig, null, 2);
  withRetentionPublication(params.workspace, () => { assertRetentionAuthorityCurrent(params.workspace, authority); publishRetentionSegment(plan, signatureBytes, []); });
  return {
    segmentPath: plan.segmentPath,
    manifestPath: plan.manifestPath,
    sigPath: plan.sigPath,
    manifest: plan.manifest
  };
}

function readRetentionSegmentLines(bytes: Buffer): string[] {
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
  const result = verifiedSegment(params);
  return { ok: result.ok, errors: result.errors, manifest: result.manifest };
}

function verifiedSegment(params: { workspace: string; segmentPath: string; manifestPath: string; sigPath: string }) {
  const errors: string[] = [];
  let files: RetentionFile[] = [];
  const failed = (manifest: RetentionSegmentManifest | null = null) => ({ ok: false, errors, manifest, lines: [] as string[], files, manifestSha256: "" });
  try { files = [params.segmentPath, params.manifestPath, params.sigPath].map(captureRetentionFile); }
  catch { errors.push("segment read failure: unreadable or changed state"); return failed(); }
  if (files[0]!.bytes === null) {
    errors.push(`segment missing: ${params.segmentPath}`);
    return failed();
  }
  if (files[1]!.bytes === null) {
    errors.push(`segment manifest missing: ${params.manifestPath}`);
    return failed();
  }
  if (files[2]!.bytes === null) {
    errors.push(`segment manifest signature missing: ${params.sigPath}`);
    return failed();
  }
  let manifest: RetentionSegmentManifest | null = null;
  try {
    manifest = retentionSegmentManifestSchema.parse(JSON.parse(files[1]!.bytes!.toString("utf8")) as unknown);
  } catch (error) {
    errors.push(`invalid segment manifest: ${String(error)}`);
    return failed();
  }
  const segmentSha = sha256Hex(files[0]!.bytes!);
  if (manifest.segmentFileSha256 !== segmentSha) {
    errors.push(`segment sha mismatch for ${params.segmentPath}`);
  }
  try {
    const sig = retentionSegmentSignatureSchema.parse(JSON.parse(files[2]!.bytes!.toString("utf8")) as unknown);
    const digest = sha256Hex(files[1]!.bytes!);
    if (sig.digestSha256 !== digest) {
      errors.push(`manifest digest mismatch for ${params.manifestPath}`);
    } else {
      const valid = verifyRetentionDigest(params.workspace, digest, sig.signature);
      if (!valid) {
        errors.push(`manifest signature invalid for ${params.manifestPath}`);
      }
    }
  } catch (error) {
    errors.push(`invalid segment signature payload: ${String(error)}`);
  }

  if (errors.length > 0) {
    return failed(manifest);
  }

  let lines: string[] = [];
  try {
    lines = readRetentionSegmentLines(files[0]!.bytes!);
  } catch (error) {
    errors.push(`segment read failure for ${params.segmentPath}: ${String(error)}`);
    return failed(manifest);
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
    manifest,
    lines,
    files,
    manifestSha256: sha256Hex(files[1]!.bytes!)
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
  return captureRetentionProofs(workspace).index;
}

/** Same-read proof bytes retained for a destructive caller's final synchronous CAS. */
export function captureRetentionProofs(workspace: string): { index: RetentionProofIndex; files: readonly RetentionFile[] } {
  const errors: string[] = [];
  const files: RetentionFile[] = [];
  const archivedEvents = new Map<string, ArchivedEventProof>();
  const prunedBlobs = new Map<string, BlobPrunedRow>();
  const segments = listRetentionSegments(workspace);
  let previousLastEventHash: string | null = null;

  for (const item of segments) {
    const verified = verifiedSegment({
      workspace,
      segmentPath: item.segmentPath,
      manifestPath: item.manifestPath,
      sigPath: item.sigPath
    });
    files.push(...verified.files);
    errors.push(...verified.errors);
    if (!verified.manifest) continue;

    let segmentTrusted = verified.ok;
    if (verified.manifest.prevSegmentLastEventHash !== previousLastEventHash) {
      errors.push(`segment continuity mismatch for ${verified.manifest.segmentId}`);
      segmentTrusted = false;
    }
    previousLastEventHash = verified.manifest.lastEventHash;
    if (!segmentTrusted) continue;

    const lines = verified.lines;
    const parsed = lines
      .map((line) => parseArchivedEvent(line, verified.manifest!.segmentId, errors))
      .filter((event): event is EvidenceEvent => event !== null);
    if (parsed.length !== lines.length) segmentTrusted = false;
    if (!segmentTrusted) continue;

    const manifestSha256 = verified.manifestSha256;
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

  let pruned: ReturnType<typeof verifyPrunedRows>;
  try {
    const pruneFiles = prunedFiles(workspace); files.push(...pruneFiles);
    pruned = verifyPrunedSnapshot(workspace, pruneFiles);
  } catch { pruned = { ok: false, errors: ["invalid blob pruned log or seal: unreadable state"], rows: [] }; }
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

  return { files, index: {
    ok: errors.length === 0,
    errors,
    archivedEvents,
    prunedBlobs
  } };
}
