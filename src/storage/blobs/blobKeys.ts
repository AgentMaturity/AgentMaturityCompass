import { randomBytes } from "node:crypto";
import { captureConfigSignatureAuthority, captureRawConfigPair, ConfigSignaturePublicationError, verifyRawConfigSignature, withConfigSignaturePairLock } from "../../config/configSignaturePair.js";
import { assertOrgPairsCurrent, captureOrgPairs, orgPairBytes, type OrgPairsSnapshot } from "../../org/preparedOrgPairs.js";
import { join, relative, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { getSigningKey, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../crypto/keys.js";
import { getVaultSecretReadOnly, setVaultSecret, vaultStatus } from "../../vault/vault.js";
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
  const signature = signHexDigest(digest, getSigningKey(workspace, "config-signature"));
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
    const encoded = readUtf8(path).trim();
    const key = Buffer.from(encoded, "base64");
    if (key.length === 32 && key.toString("base64") === encoded) return key;
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
    // Verification is a read: missing/corrupt key material must not create a
    // replacement key and mutate the workspace under inspection.
    const path = unvaultedKeyPath(workspace);
    if (!pathExists(path)) throw new Error(`unvaulted blob key missing: ${path}`);
    const encoded = readUtf8(path).trim();
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded) {
      throw new Error(`invalid unvaulted blob key material: ${path}`);
    }
    return key;
  }
  if (process.env.AMC_NO_SIGN === "1") {
    // A versioned blob read without a vault: written before this change, when
    // no-sign mode stamped keyVersion 1 and encrypted with the published
    // constant. The vault is unreachable in this mode, so that constant is the
    // only key that can still open it. Read-only; nothing writes it again.
    return LEGACY_NO_SIGN_KEY;
  }
  const value = getVaultSecretReadOnly(workspace, blobKeySecretName(keyVersion));
  if (!value) {
    throw new Error(`blob key material missing for version ${keyVersion}`);
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`invalid blob key material length for version ${keyVersion}`);
  }
  return key;
}

/** Optional refusal only. Async metadata preparation does not grant a new owner or signer policy. */
export interface BlobKeyPublicationOptions { beforePublish?: () => void }
export interface BlobKeySecretProgress {
  keyVersion: number; attempted: boolean; returned: boolean; acknowledged: boolean;
}
export interface BlobKeyPublicationProgress {
  phase: string; secretWrites: readonly Readonly<BlobKeySecretProgress>[];
  metadataPublishedPaths: readonly string[]; attemptedMetadataPath: string | null;
  completedKeyVersions: readonly number[]; blobsDirectoryAttempted: boolean; blobsDirectoryReturned: boolean;
}
export class BlobKeyPublicationError extends Error {
  readonly code = "BLOB_KEY_METADATA_PARTIAL";
  constructor(readonly progress: Readonly<BlobKeyPublicationProgress>, cause: unknown) {
    super("blob key metadata preparation did not finish; earlier secret and metadata effects may remain", { cause }); this.name = "BlobKeyPublicationError";
  }
}
function capturedBlobMetadata(workspace: string, previous: OrgPairsSnapshot) {
  const bytes = orgPairBytes(previous, blobCurrentKeyPath(workspace));
  if (bytes === null) return null;
  const key = blobKeyCurrentSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  const signatureBytes = orgPairBytes(previous, blobCurrentKeySigPath(workspace));
  const assertAdmission = () => {
    if (signatureBytes === null) throw new Error("blob key metadata signature missing");
    const raw: unknown = JSON.parse(signatureBytes.toString("utf8"));
    if (raw !== null && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "envelope"))
      throw new Error("blob key metadata needs its raw config-purpose signature");
    const signature = blobKeyCurrentSigSchema.parse(raw), digest = sha256Hex(bytes);
    if (signature.digestSha256 !== digest || !verifyRawConfigSignature(workspace, digest, signature.signature))
      throw new Error("blob key metadata is not authenticated by current config-signature admission");
  };
  assertAdmission(); return { key, assertAdmission };
}
function freezeBlobProgress(progress: BlobKeyPublicationProgress): Readonly<BlobKeyPublicationProgress> {
  return Object.freeze({ ...progress, secretWrites: Object.freeze(progress.secretWrites.map(row => Object.freeze({ ...row }))),
    metadataPublishedPaths: Object.freeze([...progress.metadataPublishedPaths]), completedKeyVersions: Object.freeze([...progress.completedKeyVersions]) });
}
/** Fixed init/rotation cohort only. Secret values never enter results, errors, logs or publication progress. */
async function prepareBlobKeyStages(workspace: string, previous: OrgPairsSnapshot,
  selected: ReturnType<typeof capturedBlobMetadata>, rotate: boolean, options: BlobKeyPublicationOptions) {
  const caller = options.beforePublish, original = captureConfigSignatureAuthority(workspace);
  const versions = selected === null ? (rotate ? [1, 2] : [1]) : [selected.key.keyVersion + 1];
  const secrets = new Map(versions.map(version => [version, getVaultSecretReadOnly(workspace, blobKeySecretName(version))]));
  const secretWrites: BlobKeySecretProgress[] = [], metadataPublishedPaths: string[] = [], completedKeyVersions: number[] = [];
  const progress: BlobKeyPublicationProgress = { phase: "captured", secretWrites, metadataPublishedPaths, attemptedMetadataPath: null,
    completedKeyVersions, blobsDirectoryAttempted: false, blobsDirectoryReturned: false };
  const intrinsic: Array<() => void> = [];
  const stable = () => {
    caller?.();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("blob key signing mode changed during metadata preparation");
    if (!vaultStatus(workspace).unlocked) throw new Error("blob key vault is locked; unlock before metadata preparation");
    for (const [version, value] of secrets) if (getVaultSecretReadOnly(workspace, blobKeySecretName(version)) !== value)
      throw new Error("selected blob key secret changed during metadata preparation");
    selected?.assertAdmission();
    for (const assertCurrent of intrinsic) assertCurrent();
    original.assertCurrent();
  };
  let currentPair = () => assertOrgPairsCurrent(previous);
  const assertCurrent = () => { stable(); currentPair(); };
  let current = selected?.key ?? null, before = current;
  try {
    assertCurrent();
    for (const version of versions) {
      const next = blobKeyCurrentSchema.parse({ v: 1, keyVersion: version, createdTs: Date.now(), algorithm: "AES-256-GCM" });
      const bytes = Buffer.from(JSON.stringify(next, null, 2));
      // A later stage selects only the exact earlier genuine publication, never a fresh winner after its await.
      const captured = withConfigSignaturePairLock(workspace, () => {
        assertCurrent(); const snapshot = captureOrgPairs([blobCurrentKeyPath(workspace)]); assertCurrent(); return snapshot;
      });
      const pair = captureRawConfigPair(workspace, blobCurrentKeyPath(workspace), bytes, { previous: captured, beforePublish: stable });
      pair.assertInputsCurrent();
      const material = generateBlobKeyMaterial(), secret = { keyVersion: version, attempted: true, returned: false, acknowledged: false };
      secretWrites.push(secret); progress.phase = "secret-write";
      setVaultSecret(workspace, blobKeySecretName(version), material); secret.returned = true;
      // Own secret publication is acknowledged only after the actual setter returned and its authenticated value matches.
      caller?.();
      if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked) throw new Error("blob key vault or signing mode changed after secret write");
      original.assertCurrent();
      if (getVaultSecretReadOnly(workspace, blobKeySecretName(version)) !== material) throw new Error("written blob key secret differs from the generated material");
      secrets.set(version, material); secret.acknowledged = true;
      progress.phase = "metadata-sign";
      const prepared = await pair.prepare();
      prepared.assertCurrent(); progress.phase = "blobs-directory"; progress.blobsDirectoryAttempted = true;
      ensureDir(blobsRoot(workspace)); progress.blobsDirectoryReturned = true;
      progress.phase = "metadata-publish";
      try {
        const published = prepared.publish();
        metadataPublishedPaths.push(relative(workspace, published.path), relative(workspace, published.sigPath));
      } catch (cause) {
        if (cause instanceof ConfigSignaturePublicationError) {
          metadataPublishedPaths.push(...cause.publishedPaths.map(path => relative(workspace, path)));
          progress.attemptedMetadataPath = cause.attemptedPath === null ? null : relative(workspace, cause.attemptedPath);
        }
        throw cause;
      }
      // Intrinsic checked-signature authority survives replacement of this stage's own metadata targets.
      intrinsic.push(prepared.assertSignatureCurrent); currentPair = prepared.assertCurrent;
      completedKeyVersions.push(version); current = next; if (before === null) before = next;
      assertCurrent();
    }
    progress.phase = "complete";
    return Object.freeze({ key: Object.freeze(current!), before: Object.freeze(before!), assertCurrent,
      progress: freezeBlobProgress(progress) });
  } catch (cause) { throw new BlobKeyPublicationError(freezeBlobProgress(progress), cause); }
}
/** Maintained init command's ensure semantics: existing unsigned metadata remains a parse/return path. */
export async function prepareBlobKeyInitializationAsync(workspace: string, options: BlobKeyPublicationOptions = {}) {
  workspace = resolve(workspace);
  const caller = options.beforePublish; caller?.();
  if (process.env.AMC_NO_SIGN === "1") {
    const material = Buffer.from(ensureUnvaultedKeyMaterial(workspace)), key = Object.freeze(makeFallbackBlobKey());
    const assertCurrent = () => { caller?.();
      if (process.env.AMC_NO_SIGN !== "1" || !readBlobKeyMaterial(workspace, UNVAULTED_KEY_VERSION).equals(material))
        throw new Error("selected unvaulted blob key or no-sign mode changed");
    };
    assertCurrent(); return Object.freeze({ key, assertCurrent, progress: null });
  }
  const path = blobCurrentKeyPath(workspace);
  if (pathExists(path)) {
    const bytes = readFileSync(path), key = Object.freeze(blobKeyCurrentSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown));
    const assertCurrent = () => { caller?.();
      if (process.env.AMC_NO_SIGN === "1" || !readFileSync(path).equals(bytes)) throw new Error("selected blob key metadata or signing mode changed");
    };
    assertCurrent(); return Object.freeze({ key, assertCurrent, progress: null });
  }
  const previous = withConfigSignaturePairLock(workspace, () => captureOrgPairs([path]));
  if (orgPairBytes(previous, path) !== null) throw new Error("blob key metadata appeared during initialization; retry");
  return prepareBlobKeyStages(workspace, previous, null, false, { beforePublish: caller });
}
/** Maintained rotation command: a cold workspace publishes version 1 before its real version 2 rotation. */
export async function prepareBlobKeyRotationAsync(workspace: string, options: BlobKeyPublicationOptions = {}) {
  workspace = resolve(workspace);
  const caller = options.beforePublish; caller?.();
  if (process.env.AMC_NO_SIGN === "1") throw new Error("cannot rotate blob key without a vault (AMC_NO_SIGN=1)");
  const previous = withConfigSignaturePairLock(workspace, () => captureOrgPairs([blobCurrentKeyPath(workspace)]));
  const selected = capturedBlobMetadata(workspace, previous);
  return prepareBlobKeyStages(workspace, previous, selected, true, { beforePublish: caller });
}
