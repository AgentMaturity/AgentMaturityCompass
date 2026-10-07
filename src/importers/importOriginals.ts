/**
 * Exact source bytes of each import, kept encrypted and addressed by SHA-256 (P1-24).
 *
 * The bytes stored are the bytes read and hashed, before any decoding. A retained
 * original proves the bytes are unchanged since import; it does not make the
 * import observed, and the source's claims stay self-reported.
 */
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadOpsPolicy } from "../ops/policy.js";
import { decodeBlobV1, decryptBlobV1, type BlobEnvelopeV1 } from "../storage/blobs/blobEncryptor.js";
import { readBlobKeyMaterial } from "../storage/blobs/blobKeys.js";
import { blobPathFromId, storeEncryptedBlob } from "../storage/blobs/blobStore.js";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { boundedFile } from "../standard/externalEvidenceFiles.js";
import { DSH_IMPORT_LIMITS } from "./dshSessionContract.js";
import type { NeutralImportCandidate, NeutralImportUnsupported } from "./neutralImporter.js";

export interface ImportOriginalRef {
  sha256: string; bytes: number; mediaType: string;
  source: { format: string; version: string | number | null; sourceRevision: string | null } | null;
  storage: { kind: "encrypted-blob"; blobId: string; path: string; keyVersion: number }
         | { kind: "not-retained"; reason: "operator-opt-out" };
}

export const ORIGINAL_NOT_RETAINED_LOSS = "Original bytes not retained by operator choice; only the SHA-256 digest is kept.";
const BLOB_ID = /^blob_[a-z2-7]{26}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: "IMPORT_ORIGINAL_NOT_RETAINABLE" | "IMPORT_ORIGINAL_DIGEST_MISMATCH", detail: string): never {
  throw Object.assign(new Error(`${code}: ${detail}`), { code });
}
function notRetainable(reason: string): never {
  fail("IMPORT_ORIGINAL_NOT_RETAINABLE", `${reason}; raise retention.maxBlobBytes or pass --no-retain-original.`);
}
function indexPath(workspace: string): string {
  return join(resolve(workspace), ".amc", "imports", "originals.jsonl");
}

export const oversizedImportReason = (limit: number): string => `File is larger than ${limit} bytes; split it into smaller JSON, JSONL, or YAML artifacts.`;

/**
 * One bounded read of the exact source bytes; these are what is hashed, parsed and retained, with no re-read.
 * JSONL may hold a recognized session up to DSH's own 32 MiB limit (Pi sets none); other files keep the generic
 * cap, and the importer refuses a JSONL above that cap unless it is a recognized session.
 */
export function readImportSource(path: string, format: string, genericLimit: number): { raw: Buffer } | Required<Pick<NeutralImportUnsupported, "kind" | "reason">> {
  const limit = format === "jsonl" ? DSH_IMPORT_LIMITS.bytes : genericLimit;
  if (statSync(path).size > limit) return { kind: "oversized", reason: oversizedImportReason(limit) };
  try { return { raw: boundedFile(path, limit) }; } catch {
    return { kind: "unsupported-format", reason: "The file could not be read as a stable regular file (it changed during the read, is a symlink, or is unreadable); nothing was imported from it." };
  }
}

export function importMediaType(format: NeutralImportCandidate["format"]): string {
  return format === "jsonl" ? "application/x-ndjson" : format === "yaml" ? "application/yaml" : "application/json";
}

export function importOriginalSource(candidate: NeutralImportCandidate): NonNullable<ImportOriginalRef["source"]> {
  const format = candidate.sourceFormat;
  return { format: format?.name ?? candidate.format, version: format?.version ?? null,
    sourceRevision: format && "sourceRevision" in format ? format.sourceRevision : null };
}

/** Refuses before anything is written when the ops policy cannot hold the original. */
function assertRetainable(workspace: string, bytes: number): void {
  const policy = loadOpsPolicy(workspace).opsPolicy;
  if (!policy.encryption.blobEncryptionEnabled) notRetainable("blob encryption is disabled by ops policy (encryption.blobEncryptionEnabled)");
  if (bytes > policy.retention.maxBlobBytes) notRetainable(`a ${bytes}-byte source exceeds retention.maxBlobBytes (${policy.retention.maxBlobBytes})`);
}

/** Decrypts a blob and checks it holds exactly these bytes; storage fields come from what was verified, never from a stored reference. */
function openOriginal(workspace: string, blobId: string, sha256: string, size: number): { bytes: Buffer; storage: Extract<ImportOriginalRef["storage"], { kind: "encrypted-blob" }> } {
  if (!BLOB_ID.test(blobId) || !SHA256.test(sha256)) fail("IMPORT_ORIGINAL_DIGEST_MISMATCH", "the reference does not name a valid blob and SHA-256");
  const path = blobPathFromId(blobId);
  const stored = readFileSync(join(resolve(workspace), path));
  let envelope: BlobEnvelopeV1;
  try { envelope = decodeBlobV1(stored, blobId); } catch { fail("IMPORT_ORIGINAL_DIGEST_MISMATCH", `blob ${blobId} is not a valid encrypted envelope`); }
  const key = readBlobKeyMaterial(workspace, envelope.keyVersion);
  let bytes: Buffer;
  try { bytes = decryptBlobV1({ blobId, key, envelope }); } catch { fail("IMPORT_ORIGINAL_DIGEST_MISMATCH", `blob ${blobId} failed authenticated decryption`); }
  if (bytes.byteLength !== size || sha256Hex(bytes) !== sha256) fail("IMPORT_ORIGINAL_DIGEST_MISMATCH", `blob ${blobId} does not hold the recorded SHA-256 ${sha256}`);
  return { bytes, storage: { kind: "encrypted-blob", blobId, path, keyVersion: envelope.keyVersion } };
}

/** Reads retained bytes back and re-hashes them; a decode, decryption or digest failure is an integrity failure. */
export function readImportOriginal(workspace: string, ref: ImportOriginalRef): Buffer {
  if (ref.storage.kind !== "encrypted-blob") throw new Error(`Original bytes were not retained (${ref.storage.reason}); only the SHA-256 digest is kept.`);
  return openOriginal(workspace, ref.storage.blobId, ref.sha256, ref.bytes).bytes;
}

/** An index row is only a hint: it is reused when its blob decrypts to exactly these bytes. */
function verifiedDuplicate(workspace: string, sha256: string, size: number): ImportOriginalRef["storage"] | null {
  if (!pathExists(indexPath(workspace))) return null;
  for (const line of readUtf8(indexPath(workspace)).split("\n")) {
    let row: { sha256?: unknown; storage?: { blobId?: unknown } };
    try { row = JSON.parse(line) as typeof row; } catch { continue; }
    if (row.sha256 !== sha256 || typeof row.storage?.blobId !== "string") continue;
    try { return openOriginal(workspace, row.storage.blobId, sha256, size).storage; } catch {
      // A missing or altered blob is not reused; a fresh copy is stored (the conservative direction).
    }
  }
  return null;
}

export function retainImportOriginal(workspace: string, raw: Buffer, source: ImportOriginalRef["source"], mediaType: string): ImportOriginalRef {
  assertRetainable(workspace, raw.byteLength);
  const sha256 = sha256Hex(raw);
  let storage = verifiedDuplicate(workspace, sha256, raw.byteLength);
  if (!storage) {
    let stored: ReturnType<typeof storeEncryptedBlob>;
    try { stored = storeEncryptedBlob(workspace, raw); } catch (error) {
      notRetainable(`the encrypted blob store refused the original (${error instanceof Error ? error.message : String(error)})`);
    }
    storage = { kind: "encrypted-blob", blobId: stored.blobId, path: stored.path, keyVersion: stored.keyVersion };
    ensureDir(join(resolve(workspace), ".amc", "imports"));
    appendFileSync(indexPath(workspace), `${JSON.stringify({ sha256, bytes: raw.byteLength, storage, retainedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  }
  return { sha256, bytes: raw.byteLength, mediaType, source, storage };
}

/** Retains every candidate's original, or records the operator's opt-out; refuses the whole import before writing when any cannot be kept. */
export function retainImportOriginals(workspace: string, candidates: Array<{ raw: Buffer; candidate: NeutralImportCandidate }>, retain: boolean): ImportOriginalRef[] {
  if (retain) for (const { raw } of candidates) assertRetainable(workspace, raw.byteLength);
  return candidates.map(({ raw, candidate }) => retain
    ? retainImportOriginal(workspace, raw, importOriginalSource(candidate), importMediaType(candidate.format))
    : { sha256: sha256Hex(raw), bytes: raw.byteLength, mediaType: importMediaType(candidate.format), source: importOriginalSource(candidate),
      storage: { kind: "not-retained", reason: "operator-opt-out" } });
}
