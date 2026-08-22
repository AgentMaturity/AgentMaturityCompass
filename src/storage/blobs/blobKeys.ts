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

/**
 * The key this code used to encrypt every blob written without a vault.
 *
 * It is a constant in public source, so anything encrypted with it is readable
 * by anyone holding the workspace — and blob files travel: `exportEvidenceBundle`
 * copies `.amc/blobs/*` into the portable `.amcbundle`, which is precisely the
 * artifact the product tells an operator to hand to a third party.
 *
 * Its comment claimed the mode is "intentionally bypassed", but no-sign is not
 * always a choice: a vault that fails to unlock sets AMC_NO_SIGN=1 on its own
 * (src/cli.ts, instant full-score recovery), so an operator who loses a
 * passphrase silently starts producing evidence encrypted with this string.
 *
 * Retained for READ ONLY, so blobs already written this way remain
 * recoverable. Nothing writes with it again.
 */
const LEGACY_NO_SIGN_KEY = Buffer.from("amc-no-sign-fallback-key-32bytes!", "utf8").subarray(0, 32);

/** Marks a blob key generated without vault protection. */
const UNVAULTED_KEY_VERSION = 0;

function unvaultedKeyPath(workspace: string): string {
  return join(blobsRoot(workspace), "unvaulted.key");
}

/**
 * A real random key for workspaces operating without a vault.
 *
 * Kept outside the vault by necessity, at 0600, and marked with a distinct key
 * version so an auditor can tell these blobs were written without vault
 * protection. That is a weaker guarantee than the vault's, and it is stated
 * rather than disguised — but it is not the same as no guarantee at all, which
 * is what a published constant amounts to.
 */
function ensureUnvaultedKeyMaterial(workspace: string): Buffer {
  const path = unvaultedKeyPath(workspace);
  if (pathExists(path)) {
    const key = Buffer.from(readUtf8(path).trim(), "base64");
    if (key.length === 32) return key;
  }
  ensureDir(blobsRoot(workspace));
  const material = randomBytes(32).toString("base64");
  writeFileAtomic(path, material, 0o600);
  return Buffer.from(material, "base64");
}

function makeFallbackBlobKey(): BlobKeyCurrent {
  return blobKeyCurrentSchema.parse({
    v: 1,
    keyVersion: UNVAULTED_KEY_VERSION,
    createdTs: 0,
    algorithm: "AES-256-GCM"
  });
}

export function ensureBlobKey(workspace: string): BlobKeyCurrent {
  // Without a vault, keys cannot be sealed — but they can still be random and
  // per-workspace, which is the difference between weak protection and none.
  if (process.env.AMC_NO_SIGN === "1") {
    ensureUnvaultedKeyMaterial(workspace);
    return makeFallbackBlobKey();
  }
  if (!pathExists(blobCurrentKeyPath(workspace))) {
    return initBlobKey(workspace);
  }
  return loadCurrentBlobKey(workspace);
}

export function rotateBlobKey(workspace: string): BlobKeyCurrent {
  if (process.env.AMC_NO_SIGN === "1") {
    // Rotating would mint version 1 and seal it in the vault — but reads in
    // this mode resolve version 1 to the legacy constant, so every blob
    // written after the rotation would come back undecryptable. Refuse rather
    // than produce evidence that cannot be reopened.
    throw new Error("cannot rotate blob key without a vault (AMC_NO_SIGN=1)");
  }
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
  // Version 0 is issued only by this code path, so it unambiguously means a
  // real random key held beside the blobs.
  if (keyVersion === UNVAULTED_KEY_VERSION) {
    return ensureUnvaultedKeyMaterial(workspace);
  }
  if (process.env.AMC_NO_SIGN === "1") {
    // A versioned blob read without a vault: written before this change, when
    // no-sign mode stamped keyVersion 1 and encrypted with the published
    // constant. The vault is unreachable in this mode, so that constant is the
    // only key that can still open it. Read-only; nothing writes it again.
    return LEGACY_NO_SIGN_KEY;
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
