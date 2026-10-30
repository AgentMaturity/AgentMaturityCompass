/**
 * Row building shared by the session-store backends that do not write through
 * the SQLite `Ledger` (JSONL and Postgres).
 *
 * Each of those backends must produce the bytes the ledger would have: the
 * same `canonicalMetadataForHash` pre-image, the same blob-backed payload
 * storage, the same per-event size limits. Keeping that in one place is what
 * stops the second and third backend from drifting apart from each other.
 */
import { join } from "node:path";
import type { EvidenceEvent } from "../types.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import type { loadOpsPolicy } from "../ops/policy.js";
import { storeEncryptedBlob } from "../storage/blobs/blobStore.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { SessionStoreAppendInput } from "./sessionEventStore.js";

/** Sentinel head of the global chain, identical to the ledger's. */
export const GLOBAL_GENESIS = "GENESIS";

/** A session with no events seals to this digest, as the ledger does. */
export const EMPTY_SESSION_SEAL_DIGEST = sha256Hex("EMPTY_SESSION");

export interface StoredSessionPayload {
  readonly path: string | null;
  readonly sha: string;
  readonly blobRef: string | null;
}

/**
 * Blob-backed payload storage, mirroring `Ledger.storeBlob` including its
 * unencrypted fallback. Sharing the content-addressed blob store is what lets
 * every backend produce the same `payload_sha256` for the same bytes — and
 * the same `payload_path` when encryption is off, since that path is the
 * content digest.
 */
export function storeSessionPayload(
  workspace: string,
  policy: ReturnType<typeof loadOpsPolicy>,
  payload: string | Buffer | undefined
): StoredSessionPayload {
  if (payload === undefined) {
    return { path: null, sha: sha256Hex(Buffer.alloc(0)), blobRef: null };
  }
  const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const maxBytes = policy.opsPolicy.retention.maxPayloadBytesPerEvent;
  if (bytes.byteLength > maxBytes) {
    throw new Error(`payload exceeds max bytes per event (${bytes.byteLength} > ${maxBytes})`);
  }
  if (bytes.byteLength > policy.opsPolicy.retention.maxBlobBytes) {
    throw new Error(`payload exceeds max blob bytes (${bytes.byteLength} > ${policy.opsPolicy.retention.maxBlobBytes})`);
  }
  if (!policy.opsPolicy.encryption.blobEncryptionEnabled) {
    const sha = sha256Hex(bytes);
    const name = `${sha}.txt`;
    const full = join(workspace, ".amc", "blobs", name);
    if (!pathExists(full)) {
      writeFileAtomic(full, bytes);
    }
    return { path: join(".amc", "blobs", name), sha, blobRef: null };
  }
  const blob = storeEncryptedBlob(workspace, bytes);
  return { path: blob.path, sha: blob.payloadSha256, blobRef: blob.blobId };
}

/** The full row for one session event, hashed over the ledger's pre-image and signed by `sign`. */
export function buildSessionEventRow(p: {
  readonly id: string;
  readonly ts: number;
  readonly input: SessionStoreAppendInput;
  readonly metaJson: string;
  readonly stored: StoredSessionPayload;
  readonly prevHash: string;
  readonly sign: (digestHex: string) => string;
}): EvidenceEvent {
  const canonicalMetadata = canonicalMetadataForHash({
    id: p.id,
    ts: p.ts,
    sessionId: p.input.sessionId,
    runtime: p.input.runtime,
    eventType: p.input.eventType,
    payloadPath: p.stored.path,
    payloadInline: null,
    metaJson: p.metaJson
  });
  const eventHash = sha256Hex(`${p.prevHash}${canonicalMetadata}${p.stored.sha}`);
  return {
    id: p.id,
    ts: p.ts,
    session_id: p.input.sessionId,
    runtime: p.input.runtime,
    event_type: p.input.eventType,
    payload_path: p.stored.path,
    payload_inline: null,
    payload_sha256: p.stored.sha,
    meta_json: p.metaJson,
    prev_event_hash: p.prevHash,
    event_hash: eventHash,
    writer_sig: p.sign(eventHash),
    canonical_payload_path: p.stored.path,
    canonical_payload_inline: null,
    blob_ref: p.stored.blobRef,
    archived: 0,
    archive_segment_id: null,
    archive_manifest_sha256: null,
    payload_pruned: 0,
    payload_pruned_ts: null
  };
}
