import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeBlobV1, decryptBlobV1, encodeBlobV1, encryptBlobV1 } from "./blobEncryptor.js";
import { blobV1Dir, ensureBlobKey, prepareBlobKeyInitializationAsync, prepareBlobKeyRotationAsync, readBlobKeyMaterial, rotateBlobKey, BlobKeyPublicationError, type BlobKeyPublicationOptions, type BlobKeyPublicationProgress } from "./blobKeys.js";
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
import { signDigestWithPolicyAsync } from "../../crypto/signing/signer.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../../transparency/asyncWorkspaceAppend.js";
import { currentTreeAlgorithm } from "../../transparency/merkleIndexStore.js";
import { transparencySealSchema, transparencySealSignatureSchema } from "../../transparency/logSchema.js";
import { captureTransparencyAppendPublication, stateBytes, withTransparencyPublicationLock,
  workspaceLogPath, workspaceSealPath, workspaceSealSigPath } from "../../transparency/workspacePublication.js";

/** Original public SQL authority only; excluded ordinary cohorts retain their compatibility recipe. */
function captureBlobKeyAuditAuthority(workspace: string): (() => void) | null {
  if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked) return null;
  const committed = keysetCommittedMark(workspace);
  if (committed === null) return null;
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("marked blob key audit key set is unavailable");
  const purposes = ["ledger-row", "receipt"] as const;
  if (purposes.some(purpose => boundProviderKey(workspace, purpose) !== null)) return null;
  const pointerPath = join(workspace, RECEIPT_AUTHORITY_CURRENT), pointer = captureOrgFiles([pointerPath]);
  if (readReceiptAuthorityState(workspace) !== null || orgPairBytes(pointer, pointerPath) !== null)
    throw new Error("original blob key audit requires the direct receipt path");
  const originalKeyset = canonicalize(keyset), originalMark = canonicalize(committed);
  const originalPolicy = canonicalize(keyPolicy(loadKeysConfig(workspace)));
  const originals = purposes.map(purpose => {
    const key = canonicalSigningKey(getSigningPublicKeyPem(workspace, purpose));
    if (key === null) throw new Error("original blob key audit public key is unsupported");
    return Object.freeze({ purpose, publicKeyPem: key.pem, algorithm: key.algorithm });
  });
  const assertCurrent = () => {
    if (process.env.AMC_NO_SIGN === "1" || !vaultStatus(workspace).unlocked)
      throw new Error("original blob key audit signing state is unavailable");
    if (canonicalize(keysetCommittedMark(workspace)) !== originalMark || canonicalize(assertKeysetComplete(workspace)) !== originalKeyset)
      throw new Error("original blob key audit committed authority changed");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(policy) !== originalPolicy || policy.requireNonExportable)
      throw new Error("original blob key audit policy changed or refuses file signing");
    assertOrgPairsCurrent(pointer);
    if (readReceiptAuthorityState(workspace) !== null) throw new Error("original blob key audit receipt authority changed");
    for (const original of originals) {
      const current = canonicalSigningKey(getSigningPublicKeyPem(workspace, original.purpose));
      if (boundProviderKey(workspace, original.purpose) !== null || current === null || current.pem !== original.publicKeyPem
        || current.algorithm !== original.algorithm || !policy.allowed.includes(original.algorithm))
        throw new Error("original blob key audit public signing identity changed or is refused");
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

export function blobsVerifyCli(workspace: string): { ok: boolean; errors: string[]; checkedBlobRefs: number; checkedRows: number } {
  return verifyBlobStore(workspace, { decrypt: true, verifyLedgerReferences: true });
}

interface BlobRewriteProgress {
  phase: string; attemptedPath: string | null; returnedPaths: string[]; processed: number; skipped: number;
}
interface BlobReencryptInitializationProgress {
  phase: string; signingCallAttempted: boolean; signingCallReturned: boolean;
  lockSetupAttempted: boolean; lockEntered: boolean; lockReturned: boolean;
  attemptedPath: string | null; returnedMembers: string[]; acknowledgedMembers: string[]; completed: boolean;
}
interface BlobReencryptProgress {
  phase: string; auditCaptureAttempted: boolean; auditCaptureReturned: boolean;
  metadataAttempted: boolean; metadataReturned: boolean; metadataProgress: Readonly<BlobKeyPublicationProgress> | null;
  rewrite: BlobRewriteProgress; auditAttempted: boolean; auditReturned: boolean;
  transparencyCaptureAttempted: boolean; transparencyCaptureReturned: boolean;
  initialization: BlobReencryptInitializationProgress | null;
  appendAttempted: boolean; appendReturned: boolean; completedEntryHash: string | null;
}
function blobReencryptSnapshot(progress: BlobReencryptProgress) {
  return Object.freeze({ ...progress, rewrite: Object.freeze({ ...progress.rewrite, returnedPaths: Object.freeze([...progress.rewrite.returnedPaths]) }),
    initialization: progress.initialization === null ? null : Object.freeze({ ...progress.initialization,
      returnedMembers: Object.freeze([...progress.initialization.returnedMembers]), acknowledgedMembers: Object.freeze([...progress.initialization.acknowledgedMembers]) }) });
}
/** Actual returned writes and lower typed causes are retained; this is not a batch transaction or a no-effects claim. */
class BlobReencryptIncompleteError extends Error {
  readonly code = "BLOB_REENCRYPT_INCOMPLETE";
  constructor(readonly workspace: string, readonly fromVersion: number, readonly toVersion: number,
    readonly progress: ReturnType<typeof blobReencryptSnapshot>, cause: unknown) {
    super("blob reencryption did not complete; inspect metadata, rewrite, audit and transparency progress before retrying", { cause });
    this.name = "BlobReencryptIncompleteError";
  }
}
/** Shared literal native core. Optional progress is private observation, never a supplied actor or authority. */
function rewriteBlobBatch(workspace: string, params: { fromVersion: number; toVersion: number; limit: number },
  progress?: BlobRewriteProgress): { processed: number; skipped: number } | null {
  if (progress) progress.phase = "source-key";
  const fromKey = readBlobKeyMaterial(workspace, params.fromVersion);
  if (progress) progress.phase = "target-key";
  const toKey = readBlobKeyMaterial(workspace, params.toVersion);
  if (progress) progress.phase = "blob-directory";
  const dir = blobV1Dir(workspace);
  if (!pathExists(dir)) {
    return null;
  }
  if (progress) progress.phase = "blob-list";
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
    if (progress) progress.phase = "blob-read";
    const encoded = readFileSync(full);
    const envelope = decodeBlobV1(encoded, blobId);
    if (envelope.keyVersion !== params.fromVersion) {
      skipped += 1;
      if (progress) progress.skipped = skipped;
      continue;
    }
    if (progress) progress.phase = "blob-decrypt";
    const plaintext = decryptBlobV1({
      blobId,
      key: fromKey,
      envelope
    });
    if (progress) progress.phase = "blob-encrypt";
    const next = encryptBlobV1({
      blobId,
      keyVersion: params.toVersion,
      key: toKey,
      plaintext
    });
    if (progress) progress.phase = "blob-encode";
    const bytes = encodeBlobV1(next);
    if (progress) { progress.phase = "blob-write"; progress.attemptedPath = full; }
    writeFileAtomic(full, bytes, 0o600);
    if (progress) { progress.returnedPaths.push(full); progress.attemptedPath = null; }
    processed += 1;
    if (progress) progress.processed = processed;
  }
  if (progress) progress.phase = "rewrite-complete";
  return { processed, skipped };
}

function blobsReencryptCli(workspace: string, params: { fromVersion: number; toVersion: number; limit: number }): {
  processed: number;
  skipped: number;
} {
  ensureBlobKey(workspace);
  const result = rewriteBlobBatch(workspace, params);
  if (result === null) return { processed: 0, skipped: 0 };
  const { processed, skipped } = result;
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

/** Preserve the real late init prefix: optional extra TR Sign, no-op lock and log/body/sidecar order. */
async function initializeBlobReencryptTransparency(workspace: string, original: ReturnType<typeof captureWorkspaceLogAuthority>,
  progress: BlobReencryptInitializationProgress, assertCurrent: () => void) {
  progress.phase = "initialization-capture"; assertCurrent();
  const publication = captureTransparencyAppendPublication(workspace), logPath = workspaceLogPath(workspace);
  const log = stateBytes(publication.state, logPath), bodyPath = workspaceSealPath(workspace), sigPath = workspaceSealSigPath(workspace);
  const needsSeal = !publication.present(bodyPath) || !publication.present(sigPath);
  const beforePrepared = () => { assertCurrent(); publication.assertCurrent(); };
  let preparedSeal: { body: Buffer; signature: Buffer } | null = null;
  if (needsSeal) {
    progress.phase = "initialization-seal-prepare"; beforePrepared();
    const algorithm = currentTreeAlgorithm(workspace); beforePrepared();
    const body = Buffer.from(JSON.stringify(transparencySealSchema.parse({ v: 1, ts: Date.now(), lastHash: "",
      signerFingerprint: original.sealSigner.descriptor.fingerprint, merkleAlgorithm: algorithm }), null, 2));
    progress.phase = "initialization-seal-sign"; progress.signingCallAttempted = true;
    const signed = await signDigestWithPolicyAsync({ workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(body),
      expectedSigner: original.sealSigner.descriptor, beforeSign: beforePrepared });
    progress.signingCallReturned = true; beforePrepared();
    const signature = Buffer.from(JSON.stringify(transparencySealSignatureSchema.parse({ digestSha256: sha256Hex(body),
      signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }), null, 2));
    preparedSeal = { body, signature };
  }
  const seal = preparedSeal;
  const member = (path: string, bytes: Buffer) => {
    progress.attemptedPath = null; progress.phase = `initialization-before:${path}`; beforePrepared();
    progress.phase = `initialization-write:${path}`; progress.attemptedPath = path;
    // Atomic helper internals can have effects before a throw; exact acknowledgment is point-in-time only.
    writeFileAtomic(path, bytes, 0o644); progress.returnedMembers.push(path);
    progress.phase = `initialization-acknowledge:${path}`;
    publication.acknowledge(path, bytes, 0o644, "replace"); progress.acknowledgedMembers.push(path);
    progress.attemptedPath = null;
  };
  progress.phase = "initialization-lock-setup"; progress.lockSetupAttempted = true;
  withTransparencyPublicationLock(workspace, () => {
    progress.lockEntered = true; progress.phase = "initialization-first-gate"; beforePrepared();
    if (log === null) member(logPath, Buffer.alloc(0));
    if (seal !== null) { member(bodyPath, seal.body); member(sigPath, seal.signature); }
    progress.phase = "initialization-final-gate"; beforePrepared();
  });
  progress.lockReturned = true; progress.phase = "initialization-after-lock"; beforePrepared();
  progress.completed = true; progress.phase = "initialization-complete";
  // Preparation only: append retires these old family postimages at its genuine pre-line boundary.
  return Object.freeze({ assertCurrent: beforePrepared });
}

/** Maintained command path. Initial no-sign keeps its old sync/ephemeral recipe; signed work never retries unsigned. */
export async function blobsReencryptCliAsync(workspace: string, params: { fromVersion: number; toVersion: number; limit: number }): Promise<{
  processed: number; skipped: number;
}> {
  const originalWorkspace = workspace, unsigned = process.env.AMC_NO_SIGN === "1", input = { ...params };
  if (unsigned) return blobsReencryptCli(originalWorkspace, input);
  workspace = resolve(originalWorkspace);
  const progress: BlobReencryptProgress = { phase: "original-audit-authority", auditCaptureAttempted: false, auditCaptureReturned: false,
    metadataAttempted: false, metadataReturned: false, metadataProgress: null,
    rewrite: { phase: "not-entered", attemptedPath: null, returnedPaths: [], processed: 0, skipped: 0 },
    auditAttempted: false, auditReturned: false, transparencyCaptureAttempted: false, transparencyCaptureReturned: false,
    initialization: null, appendAttempted: false, appendReturned: false, completedEntryHash: null };
  const enabled = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("blob reencryption signing mode changed; no unsigned retry is permitted"); };
  try {
    enabled(); progress.auditCaptureAttempted = true;
    const auditCurrent = captureBlobKeyAuditAuthority(workspace); progress.auditCaptureReturned = true;
    const beforeMetadata = () => { enabled(); auditCurrent?.(); enabled(); };
    beforeMetadata(); progress.phase = "metadata"; progress.metadataAttempted = true;
    const metadata = await prepareBlobKeyInitializationAsync(workspace, { beforePublish: beforeMetadata });
    progress.metadataReturned = true; progress.metadataProgress = metadata.progress;
    const stable = () => metadata.assertCurrent();
    stable(); progress.phase = "rewrite";
    const result = rewriteBlobBatch(workspace, input, progress.rewrite);
    if (result === null) { progress.phase = "missing-directory-return"; stable(); return { processed: 0, skipped: 0 }; }
    const { processed, skipped } = result;
    stable(); progress.phase = "audit"; progress.auditAttempted = true;
    writeAudit(workspace, "BLOB_REENCRYPT_BATCH", { fromVersion: input.fromVersion, toVersion: input.toVersion, processed, skipped }, auditCurrent ?? undefined);
    progress.auditReturned = true; stable();
    // Same late argument stage as the sync call: freeze actual batch fields before any suffix wait.
    const appendInput = { workspace, type: "BLOB_REENCRYPT_BATCH", agentId: "system", artifact: { kind: "policy" as const,
      id: `blob-reencrypt-${Date.now()}`,
      sha256: sha256Hex(Buffer.from(JSON.stringify({ from: input.fromVersion, to: input.toVersion, processed, skipped }), "utf8")) } };
    progress.phase = "transparency-authority"; progress.transparencyCaptureAttempted = true;
    const original = captureWorkspaceLogAuthority(workspace, stable); progress.transparencyCaptureReturned = true;
    const current = () => original.assertCurrent();
    current(); progress.phase = "initialization";
    const initialization: BlobReencryptInitializationProgress = { phase: "initialization-start", signingCallAttempted: false, signingCallReturned: false,
      lockSetupAttempted: false, lockEntered: false, lockReturned: false, attemptedPath: null, returnedMembers: [], acknowledgedMembers: [], completed: false };
    progress.initialization = initialization;
    const initialized = await initializeBlobReencryptTransparency(workspace, original, initialization, current);
    progress.phase = "append"; progress.appendAttempted = true;
    const attempt = await appendTransparencyEntryAttemptAsync(appendInput, { beforeCommit: initialized.assertCurrent, beforeMember: current });
    progress.appendReturned = true; progress.completedEntryHash = attempt.entry.hash; progress.phase = "final-continuation";
    current(); attempt.assertCurrent();
    progress.phase = "complete"; return { processed, skipped };
  } catch (cause) {
    if (cause instanceof BlobKeyPublicationError) progress.metadataProgress = cause.progress;
    throw new BlobReencryptIncompleteError(workspace, input.fromVersion, input.toVersion, blobReencryptSnapshot(progress), cause);
  }
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
class BlobKeyAuditIncompleteError extends Error {
  readonly code = "BLOB_KEY_AUDIT_PARTIAL";
  constructor(readonly keyVersions: readonly number[], readonly metadataProgress: Readonly<BlobKeyPublicationProgress> | null,
    readonly auditAttempted: boolean, readonly auditReturned: boolean, cause: unknown) {
    super("blob key command did not finish its audit/final continuation; metadata and audit effects may remain", { cause }); this.name = "BlobKeyAuditIncompleteError";
  }
}
export async function blobKeyInitCliAsync(workspace: string, options: BlobKeyPublicationOptions = {}): Promise<{ keyVersion: number }> {
  workspace = resolve(workspace);
  const caller = options.beforePublish, auditCurrent = captureBlobKeyAuditAuthority(workspace);
  const beforePublish = auditCurrent === null ? caller : () => { auditCurrent(); caller?.(); auditCurrent(); };
  const attempt = await prepareBlobKeyInitializationAsync(workspace, { beforePublish });
  let auditAttempted = false, auditReturned = false;
  try {
    attempt.assertCurrent(); auditAttempted = true;
    writeAudit(workspace, "BLOB_KEY_ROTATED", { keyVersion: attempt.key.keyVersion, initialized: true }, auditCurrent ?? undefined); auditReturned = true;
    attempt.assertCurrent(); return { keyVersion: attempt.key.keyVersion };
  } catch (cause) { throw new BlobKeyAuditIncompleteError(Object.freeze([attempt.key.keyVersion]), attempt.progress, auditAttempted, auditReturned, cause); }
}
export async function blobKeyRotateCliAsync(workspace: string, options: BlobKeyPublicationOptions = {}): Promise<{ fromVersion: number; toVersion: number }> {
  workspace = resolve(workspace);
  const caller = options.beforePublish, auditCurrent = captureBlobKeyAuditAuthority(workspace);
  const beforePublish = auditCurrent === null ? caller : () => { auditCurrent(); caller?.(); auditCurrent(); };
  const attempt = await prepareBlobKeyRotationAsync(workspace, { beforePublish });
  let auditAttempted = false, auditReturned = false;
  try {
    attempt.assertCurrent(); auditAttempted = true;
    writeAudit(workspace, "BLOB_KEY_ROTATED", { fromVersion: attempt.before.keyVersion, toVersion: attempt.key.keyVersion }, auditCurrent ?? undefined); auditReturned = true;
    attempt.assertCurrent(); return { fromVersion: attempt.before.keyVersion, toVersion: attempt.key.keyVersion };
  } catch (cause) { throw new BlobKeyAuditIncompleteError(Object.freeze([attempt.before.keyVersion, attempt.key.keyVersion]), attempt.progress, auditAttempted, auditReturned, cause); }
}
