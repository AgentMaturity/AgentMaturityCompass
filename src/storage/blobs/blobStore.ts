import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { z } from "zod";
import { loadOpsPolicy } from "../../ops/policy.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { decodeBlobV1, decryptBlobV1, encodeBlobV1, encryptBlobV1 } from "./blobEncryptor.js";
import { blobV1Dir, ensureBlobKey, readBlobKeyMaterial, blobsRoot } from "./blobKeys.js";
import { blobIndexRowSchema, blobIndexSignatureSchema, type BlobIndexRow, type BlobIndexSignature } from "./blobSchema.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";

const blobIdRegex = /^blob_[a-z2-7]{26}$/;

function toBase32(input: Buffer): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

export function nextBlobId(): string {
  return `blob_${toBase32(randomBytes(16)).slice(0, 26)}`;
}

function blobIndexPath(workspace: string): string {
  return join(blobsRoot(workspace), "index.jsonl");
}

function blobIndexSigPath(workspace: string): string {
  return join(blobsRoot(workspace), "index.jsonl.sig");
}

function readBlobIndexRows(workspace: string): BlobIndexRow[] {
  const path = blobIndexPath(workspace);
  if (!pathExists(path)) {
    return [];
  }
  return readUtf8(path)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => blobIndexRowSchema.parse(JSON.parse(line) as unknown));
}

function writeBlobIndexSig(workspace: string, lastHash: string): void {
  const indexPath = blobIndexPath(workspace);
  const digest = sha256Hex(pathExists(indexPath) ? readFileSync(indexPath) : Buffer.alloc(0));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const payload: BlobIndexSignature = blobIndexSignatureSchema.parse({
    v: 1,
    ts: Date.now(),
    lastHash,
    digestSha256: digest,
    signature,
    signer: "auditor"
  });
  writeFileAtomic(blobIndexSigPath(workspace), JSON.stringify(payload, null, 2), 0o644);
}

/**
 * The hash of the last row in the index, or "" if the index is empty.
 *
 * Reads only the final line rather than parsing every row through zod. The
 * append path needs exactly this one value to chain the new row, and doing it
 * by materialising the whole index made each append O(number of blobs) — which
 * is O(n^2) over a session that stores a blob per content event, the largest
 * cost on the P2.2 content path. The index file is still the authority (not the
 * separately-written signature, which can lag it across a crash), so the chain
 * output is byte-identical to the previous whole-file read.
 */
function lastBlobIndexHash(workspace: string): string {
  const path = blobIndexPath(workspace);
  if (!pathExists(path)) {
    return "";
  }
  const text = readUtf8(path);
  let end = text.length;
  while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end -= 1;
  if (end === 0) return "";
  const start = text.lastIndexOf("\n", end - 1) + 1;
  const lastLine = text.slice(start, end);
  return blobIndexRowSchema.parse(JSON.parse(lastLine) as unknown).hash;
}

function appendBlobIndexRow(workspace: string, row: Omit<BlobIndexRow, "v" | "prev" | "hash">): BlobIndexRow {
  const prev = lastBlobIndexHash(workspace);
  const hash = sha256Hex(
    canonicalize({
      v: 1,
      ts: row.ts,
      blobId: row.blobId,
      keyVersion: row.keyVersion,
      path: row.path,
      payloadSha256: row.payloadSha256,
      encryptedBytes: row.encryptedBytes,
      prev
    })
  );
  const full = blobIndexRowSchema.parse({
    v: 1,
    ...row,
    prev,
    hash
  });
  const path = blobIndexPath(workspace);
  ensureDir(blobsRoot(workspace));
  const current = pathExists(path) ? readUtf8(path) : "";
  writeFileAtomic(path, `${current}${JSON.stringify(full)}\n`, 0o644);
  writeBlobIndexSig(workspace, full.hash);
  return full;
}

function parseBlobIdFromPath(payloadPath: string): string | null {
  const name = basename(payloadPath);
  const match = name.match(/^(blob_[a-z2-7]{26})\.blob$/);
  return match?.[1] ?? null;
}

function normalizeStoredPath(workspace: string, payloadPath: string): string {
  const absolute = join(workspace, payloadPath);
  return pathExists(absolute) ? absolute : payloadPath;
}

function readLegacyOrEncryptedBlob(workspace: string, payloadPath: string): {
  encrypted: boolean;
  blobId: string | null;
  bytes: Buffer;
} {
  const absolute = normalizeStoredPath(workspace, payloadPath);
  const bytes = readFileSync(absolute);
  const blobId = parseBlobIdFromPath(payloadPath);
  if (!blobId) {
    return { encrypted: false, blobId: null, bytes };
  }
  try {
    decodeBlobV1(bytes, blobId);
    return { encrypted: true, blobId, bytes };
  } catch {
    return { encrypted: false, blobId: null, bytes };
  }
}

export function storeEncryptedBlob(workspace: string, plaintext: Buffer): {
  blobId: string;
  path: string;
  payloadSha256: string;
  keyVersion: number;
  encryptedBytes: number;
} {
  const policy = loadOpsPolicy(workspace);
  if (!policy.opsPolicy.encryption.blobEncryptionEnabled) {
    throw new Error("blob encryption disabled by ops policy; refusing encrypted blob write");
  }
  if (plaintext.byteLength > policy.opsPolicy.retention.maxBlobBytes) {
    throw new Error(
      `blob payload exceeds maxBlobBytes (${plaintext.byteLength} > ${policy.opsPolicy.retention.maxBlobBytes})`
    );
  }

  const keyMeta = ensureBlobKey(workspace);
  const key = readBlobKeyMaterial(workspace, keyMeta.keyVersion);
  let blobId = nextBlobId();
  while (pathExists(join(blobV1Dir(workspace), `${blobId}.blob`))) {
    blobId = nextBlobId();
  }
  if (!blobIdRegex.test(blobId)) {
    throw new Error(`invalid generated blob id: ${blobId}`);
  }
  const envelope = encryptBlobV1({
    blobId,
    keyVersion: keyMeta.keyVersion,
    key,
    plaintext
  });
  const encoded = encodeBlobV1(envelope);
  const fullPath = join(blobV1Dir(workspace), `${blobId}.blob`);
  writeFileAtomic(fullPath, encoded, 0o600);
  const storedPath = join(".amc", "blobs", `${blobId}.blob`);

  appendBlobIndexRow(workspace, {
    ts: Date.now(),
    blobId,
    keyVersion: keyMeta.keyVersion,
    path: storedPath,
    payloadSha256: envelope.payloadSha256,
    encryptedBytes: encoded.byteLength
  });

  return {
    blobId,
    path: storedPath,
    payloadSha256: envelope.payloadSha256,
    keyVersion: keyMeta.keyVersion,
    encryptedBytes: encoded.byteLength
  };
}

export function loadBlobPlaintext(workspace: string, payloadPath: string): {
  bytes: Buffer;
  payloadSha256: string;
  blobId: string | null;
} {
  const read = readLegacyOrEncryptedBlob(workspace, payloadPath);
  if (!read.encrypted || !read.blobId) {
    return {
      bytes: read.bytes,
      payloadSha256: sha256Hex(read.bytes),
      blobId: null
    };
  }
  const envelope = decodeBlobV1(read.bytes, read.blobId);
  const key = readBlobKeyMaterial(workspace, envelope.keyVersion);
  const plaintext = decryptBlobV1({
    blobId: read.blobId,
    key,
    envelope
  });
  return {
    bytes: plaintext,
    payloadSha256: envelope.payloadSha256,
    blobId: read.blobId
  };
}

export function loadBlobMetadata(workspace: string, payloadPath: string): {
  encrypted: boolean;
  payloadSha256: string;
  blobId: string | null;
  keyVersion: number | null;
  encryptedBytes: number;
} {
  const read = readLegacyOrEncryptedBlob(workspace, payloadPath);
  if (!read.encrypted || !read.blobId) {
    return {
      encrypted: false,
      payloadSha256: sha256Hex(read.bytes),
      blobId: null,
      keyVersion: null,
      encryptedBytes: read.bytes.byteLength
    };
  }
  const envelope = decodeBlobV1(read.bytes, read.blobId);
  return {
    encrypted: true,
    payloadSha256: envelope.payloadSha256,
    blobId: read.blobId,
    keyVersion: envelope.keyVersion,
    encryptedBytes: read.bytes.byteLength
  };
}

export function listStoredBlobs(workspace: string): Array<{ blobId: string; path: string; bytes: number }> {
  const dir = blobV1Dir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".blob"))
    .map((name) => {
      const blobId = name.replace(/\.blob$/, "");
      const full = join(dir, name);
      const bytes = readFileSync(full).byteLength;
      return {
        blobId,
        path: join(".amc", "blobs", name),
        bytes
      };
    })
    .sort((a, b) => a.blobId.localeCompare(b.blobId));
}

export function verifyBlobIndexSignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = blobIndexPath(workspace);
  const sigPath = blobIndexSigPath(workspace);
  if (!pathExists(path)) {
    return { valid: true, signatureExists: false, reason: null, path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "blob index signature missing", path, sigPath };
  }
  try {
    const sig = blobIndexSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const rows = readBlobIndexRows(workspace);
    const lastHash = rows.length > 0 ? rows[rows.length - 1]!.hash : "";
    if (sig.lastHash !== lastHash) {
      return { valid: false, signatureExists: true, reason: "blob index last hash mismatch", path, sigPath };
    }
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "blob index digest mismatch", path, sigPath };
    }
    const valid = verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"));
    return {
      valid,
      signatureExists: true,
      reason: valid ? null : "signature verification failed",
      path,
      sigPath
    };
  } catch (error) {
    return { valid: false, signatureExists: true, reason: String(error), path, sigPath };
  }
}

export function verifyBlobIndexChain(workspace: string): { ok: boolean; errors: string[]; rows: number } {
  const errors: string[] = [];
  const rows = readBlobIndexRows(workspace);
  let prev = "";
  for (const row of rows) {
    if (row.prev !== prev) {
      errors.push(`blob index chain mismatch at ${row.blobId}`);
    }
    const expected = sha256Hex(
      canonicalize({
        v: 1,
        ts: row.ts,
        blobId: row.blobId,
        keyVersion: row.keyVersion,
        path: row.path,
        payloadSha256: row.payloadSha256,
        encryptedBytes: row.encryptedBytes,
        prev: row.prev
      })
    );
    if (row.hash !== expected) {
      errors.push(`blob index hash mismatch at ${row.blobId}`);
    }
    prev = row.hash;
  }
  const sig = verifyBlobIndexSignature(workspace);
  if (!sig.valid) {
    errors.push(`blob index signature invalid: ${sig.reason ?? "unknown reason"}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    rows: rows.length
  };
}

export function blobPathFromId(blobId: string): string {
  return join(".amc", "blobs", `${blobId}.blob`);
}

export function maybeBlobIdFromPayloadPath(payloadPath: string | null): string | null {
  if (!payloadPath) {
    return null;
  }
  return parseBlobIdFromPath(payloadPath);
}

export function toWorkspaceRelativePath(workspace: string, fullPath: string): string {
  const rel = relative(workspace, fullPath);
  return rel.startsWith(".amc") ? rel : fullPath;
}
