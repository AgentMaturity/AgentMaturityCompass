import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeBlobV1, decryptBlobV1, encodeBlobV1, encryptBlobV1 } from "./blobEncryptor.js";
import { blobV1Dir, ensureBlobKey, prepareBlobKeyInitializationAsync, prepareBlobKeyRotationAsync, readBlobKeyMaterial, rotateBlobKey, type BlobKeyPublicationOptions, type BlobKeyPublicationProgress } from "./blobKeys.js";
import { storeEncryptedBlob, verifyBlobIndexChain } from "./blobStore.js";
import { verifyBlobStore } from "./blobVerify.js";
import { appendTransparencyEntry } from "../../transparency/logChain.js";
import { openLedger } from "../../ledger/ledger.js";
import { sha256Hex } from "../../utils/hash.js";
import { pathExists, writeFileAtomic } from "../../utils/fs.js";
import { canonicalize } from "../../utils/json.js";
import { assertOrgPairsCurrent, captureOrgFiles, orgPairBytes } from "../../org/preparedOrgPairs.js";
import { assertKeysetComplete, boundProviderKey, keysetCommittedMark } from "../../keys/keyset.js";
import { canonicalSigningKey } from "../../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../../keys/keysConfig.js";
import { assertSigningKeyUsable, assertVaultMaySign, getSigningPublicKeyPem } from "../../keys/signingKeys.js";
import { RECEIPT_AUTHORITY_CURRENT } from "../../keys/receiptAuthority.js";
import { readReceiptAuthorityState } from "../../keys/receiptAuthorityState.js";
import { vaultStatus } from "../../vault/vault.js";

/** Original public SQL authority only; excluded ordinary cohorts retain their compatibility recipe. */
function captureRotationAuditAuthority(workspace: string): (() => void) | null {
  if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked) return null;
  const committed = keysetCommittedMark(workspace);
  if (committed === null) return null;
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("marked blob rotation audit key set is unavailable");
  const purposes = ["ledger-row", "receipt"] as const;
  if (purposes.some(purpose => boundProviderKey(workspace, purpose) !== null)) return null;
  const pointerPath = join(workspace, RECEIPT_AUTHORITY_CURRENT), pointer = captureOrgFiles([pointerPath]);
  if (readReceiptAuthorityState(workspace) !== null || orgPairBytes(pointer, pointerPath) !== null)
    throw new Error("original blob rotation audit requires the direct receipt path");
  const originalKeyset = canonicalize(keyset), originalMark = canonicalize(committed);
  const originalPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  const originals = purposes.map(purpose => {
    const key = canonicalSigningKey(getSigningPublicKeyPem(workspace, purpose));
    if (key === null) throw new Error("original blob rotation audit public key is unsupported");
    return Object.freeze({ purpose, publicKeyPem: key.pem, algorithm: key.algorithm });
  });
  const assertCurrent = () => {
    if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked)
      throw new Error("original blob rotation audit signing state is unavailable");
    if (canonicalize(keysetCommittedMark(workspace)) !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== originalKeyset)
      throw new Error("original blob rotation audit committed authority changed");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(policy) !== originalPolicy || policy.requireNonExportable)
      throw new Error("original blob rotation audit policy changed or refuses file signing");
    assertOrgPairsCurrent(pointer);
    if (readReceiptAuthorityState(workspace) !== null) throw new Error("original blob rotation audit receipt authority changed");
    for (const original of originals) {
      const current = canonicalSigningKey(getSigningPublicKeyPem(workspace, original.purpose));
      if (boundProviderKey(workspace, original.purpose) !== null || current === null || current.pem !== original.publicKeyPem
        || current.algorithm !== original.algorithm || !policy.allowed.includes(original.algorithm))
        throw new Error("original blob rotation audit public signing identity changed or is refused");
      assertVaultMaySign(workspace, original.purpose);
      assertSigningKeyUsable(workspace, original.purpose, original.publicKeyPem, "file");
    }
  };
  assertCurrent(); return assertCurrent;
}

function writeAudit(workspace: string, auditType: string, payload: Record<string, unknown>, assertAuditCurrent?: () => void): void {
  assertAuditCurrent?.();
  const ledger = openLedger(workspace);
  const sessionId = `ops-blobs-${Date.now()}`;
  try {
    assertAuditCurrent?.();
    ledger.startSession({
      sessionId,
      runtime: "unknown",
      binaryPath: "amc",
      binarySha256: sha256Hex(Buffer.from("amc", "utf8"))
    });
    assertAuditCurrent?.();
    ledger.appendEvidenceWithReceipt({
      sessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({ auditType, ...payload }),
      payloadExt: "json",
      inline: true,
      meta: {
        auditType,
        severity: "LOW",
        trustTier: "OBSERVED",
        source: "ops.blobs"
      },
      receipt: {
        kind: "guard_check",
        agentId: "system",
        providerId: "ops",
        model: null,
        bodySha256: sha256Hex(Buffer.from(JSON.stringify({ auditType, ...payload }), "utf8"))
      }
    });
    assertAuditCurrent?.();
    ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
  assertAuditCurrent?.();
}

export function blobKeyInitCli(workspace: string): { keyVersion: number } {
  const key = ensureBlobKey(workspace);
  writeAudit(workspace, "BLOB_KEY_ROTATED", {
    keyVersion: key.keyVersion,
    initialized: true
  });
  return { keyVersion: key.keyVersion };
}

export function blobKeyRotateCli(workspace: string): { fromVersion: number; toVersion: number } {
  const before = ensureBlobKey(workspace);
  const after = rotateBlobKey(workspace);
  writeAudit(workspace, "BLOB_KEY_ROTATED", {
    fromVersion: before.keyVersion,
    toVersion: after.keyVersion
  });
  return {
    fromVersion: before.keyVersion,
    toVersion: after.keyVersion
  };
}

export function blobsVerifyCli(workspace: string): { ok: boolean; errors: string[]; checkedBlobRefs: number; checkedRows: number } {
  return verifyBlobStore(workspace, { decrypt: true, verifyLedgerReferences: true });
}

export function blobsReencryptCli(workspace: string, params: { fromVersion: number; toVersion: number; limit: number }): {
  processed: number;
  skipped: number;
} {
  ensureBlobKey(workspace);
  const fromKey = readBlobKeyMaterial(workspace, params.fromVersion);
  const toKey = readBlobKeyMaterial(workspace, params.toVersion);
  const dir = blobV1Dir(workspace);
  if (!pathExists(dir)) {
    return { processed: 0, skipped: 0 };
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".blob"))
    .sort((a, b) => a.localeCompare(b));
  let processed = 0;
  let skipped = 0;
  for (const name of files) {
    if (processed >= Math.max(1, params.limit)) {
      break;
    }
    const blobId = name.replace(/\.blob$/, "");
    const full = join(dir, name);
    const encoded = readFileSync(full);
    const envelope = decodeBlobV1(encoded, blobId);
    if (envelope.keyVersion !== params.fromVersion) {
      skipped += 1;
      continue;
    }
    const plaintext = decryptBlobV1({
      blobId,
      key: fromKey,
      envelope
    });
    const next = encryptBlobV1({
      blobId,
      keyVersion: params.toVersion,
      key: toKey,
      plaintext
    });
    writeFileAtomic(full, encodeBlobV1(next), 0o600);
    processed += 1;
  }

  writeAudit(workspace, "BLOB_REENCRYPT_BATCH", {
    fromVersion: params.fromVersion,
    toVersion: params.toVersion,
    processed,
    skipped
  });
  appendTransparencyEntry({
    workspace,
    type: "BLOB_REENCRYPT_BATCH",
    agentId: "system",
    artifact: {
      kind: "policy",
      id: `blob-reencrypt-${Date.now()}`,
      sha256: sha256Hex(Buffer.from(JSON.stringify({ from: params.fromVersion, to: params.toVersion, processed, skipped }), "utf8"))
    }
  });
  return { processed, skipped };
}

export function blobsStoreForTest(workspace: string, payload: string): { blobId: string; path: string; payloadSha256: string } {
  const stored = storeEncryptedBlob(workspace, Buffer.from(payload, "utf8"));
  return {
    blobId: stored.blobId,
    path: stored.path,
    payloadSha256: stored.payloadSha256
  };
}

export function blobsIndexVerifyCli(workspace: string): { ok: boolean; errors: string[]; rows: number } {
  return verifyBlobIndexChain(workspace);
}


/** Metadata may already be committed when the unchanged local audit suffix refuses or throws. */
export class BlobKeyAuditIncompleteError extends Error {
  readonly code = "BLOB_KEY_AUDIT_PARTIAL";
  constructor(readonly keyVersions: readonly number[], readonly metadataProgress: Readonly<BlobKeyPublicationProgress> | null,
    readonly auditAttempted: boolean, readonly auditReturned: boolean, cause: unknown) {
    super("blob key command did not finish its audit/final continuation; metadata and audit effects may remain", { cause }); this.name = "BlobKeyAuditIncompleteError";
  }
}
export async function blobKeyInitCliAsync(workspace: string, options: BlobKeyPublicationOptions = {}): Promise<{ keyVersion: number }> {
  workspace = resolve(workspace);
  const caller = options.beforePublish, attempt = await prepareBlobKeyInitializationAsync(workspace, { beforePublish: caller });
  let auditAttempted = false, auditReturned = false;
  try {
    attempt.assertCurrent(); auditAttempted = true;
    writeAudit(workspace, "BLOB_KEY_ROTATED", { keyVersion: attempt.key.keyVersion, initialized: true }); auditReturned = true;
    attempt.assertCurrent(); return { keyVersion: attempt.key.keyVersion };
  } catch (cause) { throw new BlobKeyAuditIncompleteError(Object.freeze([attempt.key.keyVersion]), attempt.progress, auditAttempted, auditReturned, cause); }
}
export async function blobKeyRotateCliAsync(workspace: string, options: BlobKeyPublicationOptions = {}): Promise<{ fromVersion: number; toVersion: number }> {
  workspace = resolve(workspace);
  const caller = options.beforePublish, auditCurrent = captureRotationAuditAuthority(workspace);
  const beforePublish = auditCurrent === null ? caller : () => { auditCurrent(); caller?.(); auditCurrent(); };
  const attempt = await prepareBlobKeyRotationAsync(workspace, { beforePublish });
  let auditAttempted = false, auditReturned = false;
  try {
    attempt.assertCurrent(); auditAttempted = true;
    writeAudit(workspace, "BLOB_KEY_ROTATED", { fromVersion: attempt.before.keyVersion, toVersion: attempt.key.keyVersion }, auditCurrent ?? undefined); auditReturned = true;
    attempt.assertCurrent(); return { fromVersion: attempt.before.keyVersion, toVersion: attempt.key.keyVersion };
  } catch (cause) { throw new BlobKeyAuditIncompleteError(Object.freeze([attempt.before.keyVersion, attempt.key.keyVersion]), attempt.progress, auditAttempted, auditReturned, cause); }
}
