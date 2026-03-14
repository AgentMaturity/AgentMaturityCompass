import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import { getVaultSecret, setVaultSecret } from "../../vault/vault.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import {
  blobKeyCurrentSchema,
  blobKeyCurrentSigSchema,
  type BlobKeyCurrent,
  type BlobKeyCurrentSig
} from "./blobSchema.js";

const BLOB_KEY_SECRET_PREFIX = "vault.secrets.blobKeys.";

export function blobsRoot(workspace: string): string {
  return join(workspace, ".amc", "blobs");
}

export function blobV1Dir(workspace: string): string {
  // Keep blobs directly under .amc/blobs for compatibility with existing scans.
  return blobsRoot(workspace);
}

function blobsKeysDir(workspace: string): string {
  // Keep key metadata outside the blobs directory so .amc/blobs can remain file-only.
  return join(workspace, ".amc", "blob-keys");
}

export function blobCurrentKeyPath(workspace: string): string {
  return join(blobsKeysDir(workspace), "current.json");
}

export function blobCurrentKeySigPath(workspace: string): string {
  return `${blobCurrentKeyPath(workspace)}.sig`;
}

function blobKeySecretName(version: number): string {
  return `${BLOB_KEY_SECRET_PREFIX}${version}`;
}

export function signBlobCurrentKey(workspace: string): string {
  const currentPath = blobCurrentKeyPath(workspace);
  const digest = sha256Hex(readFileSync(currentPath));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  const sig: BlobKeyCurrentSig = blobKeyCurrentSigSchema.parse({
    digestSha256: digest,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  });
  const sigPath = blobCurrentKeySigPath(workspace);
  writeFileAtomic(sigPath, JSON.stringify(sig, null, 2), 0o644);
  return sigPath;
}

export function verifyBlobCurrentKeySignature(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const path = blobCurrentKeyPath(workspace);
  const sigPath = blobCurrentKeySigPath(workspace);
  if (!pathExists(path)) {
    return { valid: false, signatureExists: false, reason: "blob key metadata missing", path, sigPath };
  }
  if (!pathExists(sigPath)) {
    return { valid: false, signatureExists: false, reason: "blob key metadata signature missing", path, sigPath };
  }
  try {
    const sig = blobKeyCurrentSigSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(readFileSync(path));
    if (digest !== sig.digestSha256) {
      return { valid: false, signatureExists: true, reason: "digest mismatch", path, sigPath };
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
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path,
      sigPath
    };
  }
}

export function loadCurrentBlobKey(workspace: string): BlobKeyCurrent {
  const path = blobCurrentKeyPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`blob key metadata missing: ${path}`);
  }
  return blobKeyCurrentSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

function writeCurrentBlobKey(workspace: string, key: BlobKeyCurrent): void {
  ensureDir(blobsKeysDir(workspace));
  ensureDir(blobV1Dir(workspace));
  writeFileAtomic(blobCurrentKeyPath(workspace), JSON.stringify(key, null, 2), 0o644);
  signBlobCurrentKey(workspace);
}

function generateBlobKeyMaterial(): string {
  return randomBytes(32).toString("base64");
}

export function initBlobKey(workspace: string): BlobKeyCurrent {
  const current = blobKeyCurrentSchema.parse({
    v: 1,
    keyVersion: 1,
    createdTs: Date.now(),
    algorithm: "AES-256-GCM"
  });
  setVaultSecret(workspace, blobKeySecretName(current.keyVersion), generateBlobKeyMaterial());
  writeCurrentBlobKey(workspace, current);
  return current;
}

// Deterministic fallback key used in --no-sign / AMC_NO_SIGN=1 mode.
// Not secret — only used when vault is intentionally bypassed for read-only/unsigned runs.
const NO_SIGN_FALLBACK_KEY = Buffer.from("amc-no-sign-fallback-key-32bytes!", "utf8").subarray(0, 32);

function makeFallbackBlobKey(): BlobKeyCurrent {
  return blobKeyCurrentSchema.parse({
    v: 1,
    keyVersion: 1,
    createdTs: 0,
    algorithm: "AES-256-GCM"
  });
}

export function ensureBlobKey(workspace: string): BlobKeyCurrent {
  // In --no-sign mode, skip vault-dependent key init/load
  if (process.env.AMC_NO_SIGN === "1") {
    return makeFallbackBlobKey();
  }
  if (!pathExists(blobCurrentKeyPath(workspace))) {
    return initBlobKey(workspace);
  }
  return loadCurrentBlobKey(workspace);
}

export function rotateBlobKey(workspace: string): BlobKeyCurrent {
  const current = ensureBlobKey(workspace);
  const next = blobKeyCurrentSchema.parse({
    v: 1,
    keyVersion: current.keyVersion + 1,
    createdTs: Date.now(),
    algorithm: "AES-256-GCM"
  });
  setVaultSecret(workspace, blobKeySecretName(next.keyVersion), generateBlobKeyMaterial());
  writeCurrentBlobKey(workspace, next);
  return next;
}

export function readBlobKeyMaterial(workspace: string, keyVersion: number): Buffer {
  // In --no-sign mode, use fallback key so vault isn't required for blob ops
  if (process.env.AMC_NO_SIGN === "1") {
    return NO_SIGN_FALLBACK_KEY;
  }
  const value = getVaultSecret(workspace, blobKeySecretName(keyVersion));
  if (!value) {
    throw new Error(`blob key material missing for version ${keyVersion}`);
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`invalid blob key material length for version ${keyVersion}`);
  }
  return key;
}
