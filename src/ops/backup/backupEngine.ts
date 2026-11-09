import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import YAML from "yaml";
import { copyFileSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getPublicKeyHistory } from "../../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { loadOpsPolicy, opsPolicyPath, opsPolicySigPath, opsPolicySchema, verifyOpsPolicySignature, verifyOpsPolicyBytes } from "../policy.js";
import { currentTransparencyMerkleRoot, verifyTransparencyMerkle } from "../../transparency/merkleIndexStore.js";
import { transparencySealSigPath, verifyTransparencyLog, appendTransparencyEntry, appendTransparencyEntryAsync } from "../../transparency/logChain.js";
import { verifyLedgerIntegrity } from "../../ledger/ledger.js";
import { openSessionsAt, verifyInstantFor } from "../../ledger/verifyAsOf.js";
import { commitRestore } from "./restoreCommit.js";
import { snapshotSqliteFiles, withoutSqliteSidecars } from "./sqliteSnapshot.js";
import { backupManifestSchema, backupManifestSigSchema, type BackupManifest, type BackupManifestSig } from "./backupSchema.js";
import { decryptBackupPayload, encryptBackupPayload, type BackupEncryptionEnvelope } from "./backupCrypto.js";
import { appendOpsAuditEvent } from "../audit.js";
import { assertPolicySignerCurrent, describePolicySigner, signDigestWithPolicy, signDigestWithPolicyAsync } from "../../crypto/signing/signer.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath } from "../../transparency/merklePaths.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { captureWorkspaceLogAuthority } from "../../transparency/asyncWorkspaceAppend.js";
import { merkleRootRowSchema } from "../../transparency/merkleRows.js";
import type { SignedDigest } from "../../crypto/signing/signerTypes.js";
import { canonicalSigningKey, signingKeyId } from "../../keys/algorithmPolicy.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, untrustedReasons, verdictExitCode, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../../trust/index.js";
import { fileSha256 } from "../../trust/signatureCheck.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../../security/safeTarArchive.js";

import { backupFileState, captureBackupOutput, sameBackupFile } from "./backupOutput.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../../keys/purposePublication.js";
import { assertKeysetComplete, assertKeysetRestorable, boundProviderKey } from "../../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../../crypto/keyHistoryEnvelope.js";
import { vaultStatus } from "../../vault/vault.js";
import { loadTrustConfig } from "../../trust/trustConfig.js";
import { canonicalize } from "../../utils/json.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


function tarCreate(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create tarball: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`, out.error === undefined ? undefined : { cause: out.error });
  }
}

function tarExtract(archiveFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: archiveFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function packageVersion(workspace: string): string {
  const pkgPath = join(workspace, "package.json");
  if (!pathExists(pkgPath)) {
    return "unknown";
  }
  try {
    const parsed = JSON.parse(readUtf8(pkgPath)) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

function collectFiles(root: string, include: string[], exclude: string[]): string[] {
  const out: string[] = [];
  const isExcluded = (rel: string): boolean => {
    const normalized = rel.replaceAll("\\", "/");
    return exclude.some((prefix) => {
      const clean = prefix.replaceAll("\\", "/").replace(/^\.?\//, "");
      return normalized === clean || normalized.startsWith(`${clean}/`);
    });
  };
  const walk = (relDir: string): void => {
    const fullDir = join(root, relDir);
    if (!pathExists(fullDir)) {
      return;
    }
    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      const rel = relDir.length > 0 ? join(relDir, entry.name) : entry.name;
      const relNorm = rel.replaceAll("\\", "/");
      if (isExcluded(relNorm)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.isFile()) {
        out.push(relNorm);
      }
    }
  };
  for (const includePath of include) {
    const clean = includePath.replace(/^\.?\//, "").replaceAll("\\", "/");
    walk(clean);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function copySelectedFiles(params: {
  sourceRoot: string;
  destinationRoot: string;
  files: string[];
  snapshots: ReturnType<typeof snapshotSqliteFiles>;
}): void {
  for (const rel of params.files) {
    const source = join(params.sourceRoot, rel);
    const dest = join(params.destinationRoot, rel);
    ensureDir(dirname(dest));
    const snapshot = params.snapshots.get(rel);
    if (snapshot) writeFileAtomic(dest, snapshot.bytes, snapshot.mode);
    else copyFileSync(source, dest);
  }
}

/** The backed-up evidence database's digest: its consistent snapshot when it was snapshotted. */
function evidenceSnapshotSha(workspace: string, snapshots: ReturnType<typeof snapshotSqliteFiles>): string | null {
  const snapshot = snapshots.get(".amc/evidence.sqlite");
  if (snapshot) return sha256Hex(snapshot.bytes);
  const live = join(workspace, ".amc", "evidence.sqlite");
  return pathExists(live) ? sha256Hex(readFileSync(live)) : null;
}

function backupPassphraseFromEnv(): string | null {
  const file = process.env.AMC_BACKUP_PASSPHRASE_FILE;
  if (file && file.trim().length > 0) {
    return readUtf8(resolve(file.trim())).trim();
  }
  const direct = process.env.AMC_BACKUP_PASSPHRASE;
  return direct && direct.trim().length > 0 ? direct.trim() : null;
}

export function createBackup(params: { workspace: string; outFile: string }): {
  outFile: string;
  manifestPath: string;
  backupId: string;
} {
  const verifyOps = verifyOpsPolicySignature(params.workspace);
  if (!verifyOps.valid) {
    throw new Error(`ops policy invalid: ${verifyOps.reason ?? "unknown reason"}`);
  }
  const policy = loadOpsPolicy(params.workspace);
  if (policy.opsPolicy.backups.requireEncryptedBackups && policy.opsPolicy.backups.defaultBackupEncryption !== "PASSPHRASE_AES_256_GCM") {
    throw new Error("unsupported backup encryption policy");
  }
  const passphrase = backupPassphraseFromEnv();
  if (policy.opsPolicy.backups.requireEncryptedBackups && (!passphrase || passphrase.length === 0)) {
    throw new Error("AMC_BACKUP_PASSPHRASE_FILE (or AMC_BACKUP_PASSPHRASE) is required for encrypted backups");
  }

  const policySigner = describePolicySigner(params.workspace, "BACKUP_MANIFEST");
  const files = withoutSqliteSidecars(collectFiles(params.workspace, policy.opsPolicy.backups.includePaths, policy.opsPolicy.backups.excludePaths));
  const temp = mkdtempSync(join(tmpdir(), "amc-backup-"));
  const snapshots = snapshotSqliteFiles(params.workspace, files, temp);
  const payloadSrc = join(temp, "payload-src");
  const payloadTar = join(temp, "workspace.tar.gz");
  const bundleRoot = join(temp, "amc-backup");
  const payloadDir = join(bundleRoot, "payload");
  const keysDir = join(bundleRoot, "keys");
  ensureDir(payloadSrc);
  ensureDir(payloadDir);
  ensureDir(keysDir);
  copySelectedFiles({
    sourceRoot: params.workspace,
    destinationRoot: payloadSrc,
    files,
    snapshots
  });
  tarCreate(payloadSrc, payloadTar);
  const payloadPlain = readFileSync(payloadTar);
  const encrypted = encryptBackupPayload(payloadPlain, passphrase ?? "");
  const encryptedPath = join(payloadDir, "workspace.tar.gz.enc");
  writeFileAtomic(encryptedPath, encrypted.encrypted, 0o600);
  const payloadSha = sha256Hex(readFileSync(encryptedPath));
  writeFileAtomic(join(bundleRoot, "payload.sha256"), `${payloadSha}\n`, 0o644);

  const backupId = `bkp_${randomUUID()}`;
  const policySha = sha256Hex(readFileSync(opsPolicyPath(params.workspace)));
  const root = currentTransparencyMerkleRoot(params.workspace);
  const sealSigPath = transparencySealSigPath(params.workspace);
  const manifest = backupManifestSchema.parse({
    v: 1,
    backupId,
    createdTs: Date.now(),
    workspace: {
      pathHint: params.workspace,
      amcVersion: packageVersion(params.workspace),
      nodeVersion: process.version
    },
    policy: {
      opsPolicySha256: policySha
    },
    payload: {
      encryption: encrypted.envelope,
      payloadSha256: payloadSha
    },
    files: files.map((relPath) => {
      const bytes = readFileSync(join(payloadSrc, relPath));
      return {
        path: relPath,
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength
      };
    }),
    integrity: {
      transparencyRoot: root?.root ?? "",
      transparencySealSigSha256: pathExists(sealSigPath) ? sha256Hex(readFileSync(sealSigPath)) : sha256Hex(Buffer.alloc(0)),
      evidenceDbSha256: evidenceSnapshotSha(params.workspace, snapshots)
    },
    signing: {
      algorithm: policySigner.algorithm,
      auditorFingerprint: policySigner.fingerprint
    }
  });
  const manifestPath = join(bundleRoot, "manifest.json");
  writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2), 0o644);
  const digest = sha256Hex(readFileSync(manifestPath));
  const signed = signDigestWithPolicy({
    workspace: params.workspace,
    kind: "BACKUP_MANIFEST",
    digestHex: digest,
    expectedSigner: policySigner
  });
  const sig = backupManifestSigSchema.parse({
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  writeFileAtomic(join(bundleRoot, "manifest.sig"), JSON.stringify(sig, null, 2), 0o644);
  writeFileAtomic(join(keysDir, "auditor.pub"), Buffer.from(policySigner.publicKeyPem, "utf8"), 0o644);

  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  tarCreate(bundleRoot, outFile);
  appendOpsAuditEvent({
    workspace: params.workspace,
    auditType: "BACKUP_CREATED",
    payload: {
      backupId,
      outFile,
      payloadSha256: payloadSha,
      fileCount: manifest.files.length
    }
  });
  appendTransparencyEntry({
    workspace: params.workspace,
    type: "BACKUP_CREATED",
    agentId: "system",
    artifact: {
      kind: "policy",
      id: backupId,
      sha256: sha256Hex(readFileSync(manifestPath))
    }
  });
  rmSync(temp, { recursive: true, force: true });
  return {
    outFile,
    manifestPath: `${outFile}#manifest.json`,
    backupId
  };
}

/** Capture before the attempt's first await, with only the existing initial file warm/migration. */
function captureBackupAuthority(workspace: string) {
  assertOwnerMode(workspace, "backup create");
  const descriptor = Object.freeze({ ...describePolicySigner(workspace, "BACKUP_MANIFEST") }), policy = JSON.stringify(loadTrustConfig(workspace));
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const holder = purpose === null ? null : boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file";
  const keyset = canonicalize(assertKeysetComplete(workspace));
  const assertCurrent = (signed?: SignedDigest) => {
    assertOwnerMode(workspace, "backup create"); assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy || canonicalize(assertKeysetComplete(workspace)) !== keyset)
      throw new Error("original backup keyset or signing policy changed while preparing");
    if (purpose !== null && holder !== null) {
      const current = assertKeysetComplete(workspace), keys = keyPolicy(loadKeysConfig(workspace));
      if (current === null || canonicalize(current) !== purpose.keyset || !keys.allowed.includes(descriptor.algorithm)
        || (holder === "file" && keys.requireNonExportable)) throw new Error("original backup purpose authority is refused");
      assertSigningKeyUsable(workspace, "artifact-seal", descriptor.publicKeyPem, holder);
      if (holder === "file") {
        if (!vaultStatus(workspace).unlocked) throw new Error("backup signing vault is locked; unlock before publication");
        if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== descriptor.publicKeyPem)
          throw new Error("original backup vault purpose key changed while preparing");
      }
      if (signed !== undefined) {
        if (signed.envelope === undefined) throw new Error("prepared backup manifest signature has no envelope");
        assertPurposePublicationCurrent(workspace, purpose, { provider: holder, algorithm: signed.envelope.alg,
          keyId: descriptor.fingerprint, publicKeyPem: descriptor.publicKeyPem, signature: Buffer.from(signed.signature, "base64") });
      }
    }
  };
  assertCurrent(); return Object.freeze({ descriptor, assertCurrent });
}

type BackupAttemptProgress = {
  plannedPublication: ReturnType<typeof createBackup> | null; archiveSha256: string | null;
  archiveWriteAttempted: boolean; archiveWriteReturned: boolean; opsAuditAttempted: boolean;
  opsAudit: ReturnType<typeof appendOpsAuditEvent> | null; transparencyAttempted: boolean;
  transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null;
};
class BackupArchivePublicationError extends Error {
  readonly code = "BACKUP_ARCHIVE_PUBLICATION_INCOMPLETE";
  constructor(readonly plannedPublication: ReturnType<typeof createBackup>, readonly archiveSha256: string, readonly writeReturned: boolean, cause: unknown) {
    super(writeReturned ? "Backup archive write returned; exact publication acknowledgement failed" : "Backup archive write threw; inspect the attempted output for an uncertain effect", { cause });
    this.name = "BackupArchivePublicationError";
  }
}
class BackupPublicationIncompleteError extends Error {
  readonly code = "BACKUP_PUBLICATION_INCOMPLETE";
  constructor(readonly publication: ReturnType<typeof createBackup>, readonly archiveSha256: string,
    readonly phase: "ops-audit" | "transparency", readonly opsAudit: ReturnType<typeof appendOpsAuditEvent> | null,
    readonly phaseAttempted: boolean, readonly transparency: Awaited<ReturnType<typeof appendTransparencyEntryAsync>> | null, cause: unknown) {
    super(`Backup archive was published; ${phase} continuation did not complete; known and uncertain prior effects remain`, { cause });
    this.name = "BackupPublicationIncompleteError";
  }
}
class BackupCleanupIncompleteError extends AggregateError {
  readonly code = "BACKUP_CLEANUP_INCOMPLETE";
  constructor(readonly progress: Readonly<BackupAttemptProgress>, readonly tempPath: string, failed: boolean, primary: unknown, cleanup: unknown) {
    super(failed ? [primary, cleanup] : [cleanup], failed ? "Backup attempt and temporary cleanup failed" : "Backup completed; temporary cleanup failed", { cause: failed ? primary : cleanup });
    this.name = "BackupCleanupIncompleteError";
  }
}

// Studio's governed turn can advance these durable records. A retry must capture them again, never omit them.
const STUDIO_BACKUP_INPUT = /^\.amc\/(?:blobs\/(?:blob_[a-z2-7]{26}\.blob|index\.jsonl(?:\.sig)?)|studio-native-tasks\/[a-f0-9]{64}\.json|studio\/(?:audit\/human\.(?:log|seal\.json|seal\.sig)|pairing\.codes\.json))$/;

/** Selected workspace files moved before the archive write. Publication and cleanup errors are terminal. */
class BackupInputDriftError extends Error {
  constructor(readonly assertStableInputs: () => void) {
    super("backup inputs changed while preparing");
  }
}

/** Maintained awaitable producer. Archive → synchronous ops audit → awaited transparency; failures retain publication truth. */
export async function createBackupAsync(input: Parameters<typeof createBackup>[0],
  { retryInputDrift = false }: { retryInputDrift?: boolean } = {}): Promise<ReturnType<typeof createBackup>> {
  const params = { ...input }, workspace = resolve(params.workspace), outFile = resolve(workspace, params.outFile);
  assertOwnerMode(workspace, "backup create");
  const policyPath = opsPolicyPath(workspace), policySigPath = opsPolicySigPath(workspace);
  const policyBytes = backupFileState(policyPath), policySigBytes = backupFileState(policySigPath);
  if (policyBytes === null || policySigBytes === null) throw new Error("ops policy invalid: ops policy or signature missing");
  const policyDigest = sha256Hex(policyBytes.bytes), verifiedPolicy = verifyOpsPolicyBytes(workspace, policyBytes.bytes, policySigBytes.bytes);
  if (!verifiedPolicy.valid) throw new Error(`ops policy invalid: ${verifiedPolicy.reason ?? "signature verification failed"}`);
  const policy = opsPolicySchema.parse(YAML.parse(policyBytes.bytes.toString("utf8")));
  if (policy.opsPolicy.backups.requireEncryptedBackups && policy.opsPolicy.backups.defaultBackupEncryption !== "PASSPHRASE_AES_256_GCM") throw new Error("unsupported backup encryption policy");
  const passphraseFile = process.env.AMC_BACKUP_PASSPHRASE_FILE, passphrase = backupPassphraseFromEnv();
  if (policy.opsPolicy.backups.requireEncryptedBackups && (!passphrase || passphrase.length === 0))
    throw new Error("AMC_BACKUP_PASSPHRASE_FILE (or AMC_BACKUP_PASSPHRASE) is required for encrypted backups");
  const assertPolicyCurrent = () => {
    assertOwnerMode(workspace, "backup create");
    if (!sameBackupFile(policyBytes, backupFileState(policyPath)) || !sameBackupFile(policySigBytes, backupFileState(policySigPath)))
      throw new Error("backup ops policy changed while preparing or continuing publication");
    const checked = verifyOpsPolicyBytes(workspace, policyBytes.bytes, policySigBytes.bytes);
    if (!checked.valid) throw new Error(`ops policy invalid: ${checked.reason ?? "signature verification failed"}`);
  };
  // Capture all actual manifest/TR/Merkle authority before the attempt's first await; do not rebase after archive/audit progress.
  const authority = captureBackupAuthority(workspace), policySigner = authority.descriptor;
  const logAuthority = captureWorkspaceLogAuthority(workspace, assertPolicyCurrent);
  const name = `backup-create-${sha256Hex(outFile).slice(0, 24)}`, lockRoot = dirname(outFile);
  const exclude = [...policy.opsPolicy.backups.excludePaths, relative(workspace, join(lockRoot, `.${name}.lock`)),
    relative(workspace, join(lockRoot, `.${name}-locks`))];
  const output = captureBackupOutput(workspace, outFile);
  let assertRetryInputs: (() => void) | undefined;
  const attempt = async () => {
    assertRetryInputs?.();
    const files = withoutSqliteSidecars(collectFiles(workspace, policy.opsPolicy.backups.includePaths, exclude));
    // P2-09: SQLite files are captured as consistent snapshots, so live appends neither tear nor invalidate the backup.
    const snapshotDir = mkdtempSync(join(tmpdir(), "amc-backup-sqlite-"));
    let snapshots: ReturnType<typeof snapshotSqliteFiles>;
    try { snapshots = snapshotSqliteFiles(workspace, files, snapshotDir); } finally { rmSync(snapshotDir, { recursive: true, force: true }); }
    const snapshotted = (path: string) => snapshots.has(relative(workspace, path).replaceAll("\\", "/"));
    const extras = [policyPath, policySigPath, join(workspace, "package.json"), merkleCurrentRootPath(workspace),
      merkleCurrentRootSigPath(workspace), transparencySealSigPath(workspace), join(workspace, ".amc", "evidence.sqlite")];
    const original = new Map([...new Set([...files.map(path => join(workspace, path)), ...extras])].filter(path => !snapshotted(path)).map(path => [path, backupFileState(path)] as const));
    if (!sameBackupFile(policyBytes, original.get(policyPath)!) || !sameBackupFile(policySigBytes, original.get(policySigPath)!)) throw new Error("backup inputs changed while preparing");
    const selectedSources = [...original.keys(), ...[...snapshots.keys()].map(path => join(workspace, path)), ...(passphraseFile?.trim() ? [resolve(passphraseFile.trim())] : [])];
    output.assertNoAlias(selectedSources);
    const selected = new Set(files);
    const assertStableInputs = (): void => { assertInputsCurrent(true); output.assertNoAlias(selectedSources); };
    const assertInputsCurrent = (allowStudioDrift = false): void => {
      const current = withoutSqliteSidecars(collectFiles(workspace, policy.opsPolicy.backups.includePaths, exclude));
      const currentPaths = new Set(current);
      if (files.some(path => !currentPaths.has(path))) throw new Error("backup inputs changed while preparing");
      const changed = current.filter(path => !selected.has(path));
      for (const [path, before] of original) {
        if (!sameBackupFile(before, backupFileState(path))) changed.push(relative(workspace, path).replaceAll("\\", "/"));
      }
      if (changed.length === 0) return;
      if (!retryInputDrift || !changed.every(path => STUDIO_BACKUP_INPUT.test(path))) throw new Error("backup inputs changed while preparing");
      if (!allowStudioDrift) throw new BackupInputDriftError(assertStableInputs);
    };
    const assertPreparing = (signed?: SignedDigest) => {
      assertInputsCurrent(); assertRetryInputs?.(); output.assertNoAlias(selectedSources);
      assertPolicyCurrent(); authority.assertCurrent(signed); logAuthority.assertCurrent(); output.assertOriginal();
    };
    const rootBytes = original.get(merkleCurrentRootPath(workspace))?.bytes;
    const root = rootBytes === undefined ? null : merkleRootRowSchema.parse(JSON.parse(rootBytes.toString("utf8")));
    const packageBytes = original.get(join(workspace, "package.json"))?.bytes;
    let version = "unknown";
    try { const parsed = JSON.parse(packageBytes?.toString("utf8") ?? "null") as { version?: unknown } | null;
      if (typeof parsed?.version === "string") version = parsed.version; } catch { /* Preserve packageVersion's unknown fallback. */ }
    const temp = mkdtempSync(join(tmpdir(), "amc-backup-async-"));
    const progress: BackupAttemptProgress = { plannedPublication: null, archiveSha256: null, archiveWriteAttempted: false,
      archiveWriteReturned: false, opsAuditAttempted: false, opsAudit: null, transparencyAttempted: false, transparency: null };
    let failed = false, primary: unknown;
    try {
      const payloadSrc = join(temp, "payload-src"), payloadTar = join(temp, "workspace.tar.gz"), bundleRoot = join(temp, "amc-backup");
      ensureDir(payloadSrc); ensureDir(join(bundleRoot, "payload")); ensureDir(join(bundleRoot, "keys"));
      for (const path of files) {
        const state = snapshots.get(path) ?? original.get(join(workspace, path));
        if (state === undefined || state === null) throw new Error("backup source disappeared while preparing");
        writeFileAtomic(join(payloadSrc, path), state.bytes, state.mode);
      }
      tarCreate(payloadSrc, payloadTar);
      const encrypted = encryptBackupPayload(readFileSync(payloadTar), passphrase ?? ""), payloadSha = sha256Hex(encrypted.encrypted);
      writeFileAtomic(join(bundleRoot, "payload", "workspace.tar.gz.enc"), encrypted.encrypted, 0o600);
      writeFileAtomic(join(bundleRoot, "payload.sha256"), `${payloadSha}\n`, 0o644);
      const backupId = `bkp_${randomUUID()}`, seal = original.get(transparencySealSigPath(workspace)), db = snapshots.get(".amc/evidence.sqlite") ?? original.get(join(workspace, ".amc", "evidence.sqlite"));
      const manifest = backupManifestSchema.parse({
        v: 1, backupId, createdTs: Date.now(), workspace: { pathHint: params.workspace, amcVersion: version, nodeVersion: process.version },
        policy: { opsPolicySha256: policyDigest }, payload: { encryption: encrypted.envelope, payloadSha256: payloadSha },
        files: files.map(path => { const bytes = (snapshots.get(path) ?? original.get(join(workspace, path)))!.bytes; return { path, sha256: sha256Hex(bytes), bytes: bytes.byteLength }; }),
        integrity: { transparencyRoot: root?.root ?? "", transparencySealSigSha256: sha256Hex(seal?.bytes ?? Buffer.alloc(0)), evidenceDbSha256: db === null || db === undefined ? null : sha256Hex(db.bytes) },
        signing: { algorithm: policySigner.algorithm, auditorFingerprint: policySigner.fingerprint }
      });
      const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2)), digest = sha256Hex(manifestBytes);
      writeFileAtomic(join(bundleRoot, "manifest.json"), manifestBytes, 0o644);
      assertPreparing();
      const signed = await signDigestWithPolicyAsync({ workspace, kind: "BACKUP_MANIFEST", digestHex: digest, expectedSigner: policySigner, beforeSign: () => assertPreparing() });
      assertPreparing(signed);
      const sig = backupManifestSigSchema.parse({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope });
      writeFileAtomic(join(bundleRoot, "manifest.sig"), JSON.stringify(sig, null, 2), 0o644);
      writeFileAtomic(join(bundleRoot, "keys", "auditor.pub"), policySigner.publicKeyPem, 0o644);
      const archive = join(temp, "prepared.amcbackup"); tarCreate(bundleRoot, archive);
      const archiveBytes = readFileSync(archive), mode = output.before?.mode ?? (lstatSync(archive).mode & 0o777);
      const publication = { outFile, manifestPath: `${outFile}#manifest.json`, backupId }, archiveSha256 = sha256Hex(archiveBytes);
      progress.plannedPublication = publication; progress.archiveSha256 = archiveSha256;
      const published = withControlFileLock({ root: lockRoot, name, operation: () => {
        assertPreparing(signed); // All consumed inputs/aliases first; original authority then the last original output CAS.
        progress.archiveWriteAttempted = true;
        try {
          writeFileAtomic(outFile, archiveBytes, mode); progress.archiveWriteReturned = true;
          const acknowledged = backupFileState(outFile);
          if (acknowledged === null || acknowledged.mode !== mode || !acknowledged.bytes.equals(archiveBytes)) throw new Error("backup returned archive differs from the exact prepared bytes or mode");
          return acknowledged; // Retain own stable identity only after exact expected bytes/mode validation.
        } catch (cause) { throw new BackupArchivePublicationError(publication, archiveSha256, progress.archiveWriteReturned, cause); }
      } });
      // Own archive/audit/log progress must not be tested against the old whole-workspace input snapshot.
      const assertPublished = () => {
        assertPolicyCurrent(); authority.assertCurrent(signed); logAuthority.assertCurrent(); output.assertPathCurrent();
        if (!sameBackupFile(published, backupFileState(outFile))) throw new Error("backup acknowledged archive changed during publication continuation");
      };
      try {
        assertPublished(); progress.opsAuditAttempted = true;
        progress.opsAudit = appendOpsAuditEvent({ workspace, auditType: "BACKUP_CREATED", payload: { backupId, outFile, payloadSha256: payloadSha, fileCount: manifest.files.length } });
      } catch (cause) { throw new BackupPublicationIncompleteError(publication, archiveSha256, "ops-audit", progress.opsAudit, progress.opsAuditAttempted, null, cause); }
      try {
        progress.transparencyAttempted = true;
        progress.transparency = await appendTransparencyEntryAsync({ workspace, type: "BACKUP_CREATED", agentId: "system", artifact: { kind: "policy", id: backupId, sha256: digest } }, {
          beforeCommit: () => withControlFileLock({ root: lockRoot, name, operation: assertPublished })
        });
        assertPublished();
      } catch (cause) { throw new BackupPublicationIncompleteError(publication, archiveSha256, "transparency", progress.opsAudit, progress.transparencyAttempted, progress.transparency, cause); }
      return publication;
    } catch (cause) { failed = true; primary = cause; throw cause; }
    finally {
      try { rmSync(temp, { recursive: true, force: true }); }
      // oxlint-disable-next-line no-unsafe-finally -- A cleanup failure must surface, with any primary failure, instead of reporting success.
      catch (cleanup) { throw new BackupCleanupIncompleteError(Object.freeze({ ...progress }), temp, failed, primary, cleanup); }
    }
  };
  const attempts = retryInputDrift ? 4 : 1;
  for (let attemptNumber = 1; ; attemptNumber++) {
    try { return await attempt(); }
    catch (error) {
      if (!(error instanceof BackupInputDriftError) || attemptNumber >= attempts) throw error;
      // A new snapshot may include later data, but cannot select a new signer, control state, or output predecessor.
      error.assertStableInputs(); assertPolicyCurrent(); authority.assertCurrent(); logAuthority.assertCurrent(); output.assertOriginal();
      assertRetryInputs ??= error.assertStableInputs;
      await delay(100 * attemptNumber);
    }
  }
}

function loadBundle(bundleFile: string): {
  root: string;
  cleanup: () => void;
} {
  const temp = mkdtempSync(join(tmpdir(), "amc-backup-verify-"));
  tarExtract(bundleFile, temp);
  let root = temp;
  if (!pathExists(join(temp, "manifest.json"))) {
    const dirs = readdirSync(temp, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const candidate = dirs
      .map((entry) => join(temp, entry.name))
      .find((dir) => pathExists(join(dir, "manifest.json")));
    if (candidate) {
      root = candidate;
    }
  }
  return {
    root,
    cleanup: () => rmSync(temp, { recursive: true, force: true })
  };
}

/** keys/auditor.pub, the envelope key and --pubkey only locate the signer; admitKey decides whether it counts (P0-09). */
function verifyManifestSignature(manifestPath: string, sigPath: string, candidates: Array<string | null>, trust: TrustContext,
  signatures: IssuerAdmission[], signing: BackupManifest["signing"]): string[] {
  const errors: string[] = [];
  const digest = sha256Hex(readFileSync(manifestPath));
  try {
    const sig = backupManifestSigSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const check = checkDigestSignature({ signature: "manifest.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature, envelope: sig.envelope,
      candidates: [...candidates, envelopePublicKey(sig.envelope)], context: trust, claimedSignedAt: sig.signedTs });
    signatures.push(check.admission);
    if (check.verified) {
      const pem = [...candidates, envelopePublicKey(sig.envelope)].find(pem => typeof pem === "string" && signingKeyId(pem) === check.admission.keyId);
      if (typeof pem !== "string" || canonicalSigningKey(pem)?.algorithm !== signing.algorithm || check.admission.keyId !== signing.auditorFingerprint) {
        errors.push("manifest signing metadata does not match verified signer");
      }
    }
    if (sig.digestSha256 !== digest) {
      errors.push("manifest digest mismatch");
    } else if (!check.verified || (sig.envelope !== undefined && sig.signature !== sig.envelope.sigB64)) {
      errors.push("manifest signature invalid");
    }
  } catch (error) {
    errors.push(`invalid manifest signature payload: ${String(error)}`);
  }
  return errors;
}

function verifyDecryptedFiles(payloadTarBytes: Buffer, manifest: BackupManifest): string[] {
  const errors: string[] = [];
  const temp = mkdtempSync(join(tmpdir(), "amc-backup-payload-"));
  try {
    const payloadTar = join(temp, "payload.tar.gz");
    writeFileAtomic(payloadTar, payloadTarBytes, 0o600);
    const extract = join(temp, "extract");
    ensureDir(extract);
    tarExtract(payloadTar, extract);
    for (const row of manifest.files) {
      const file = join(extract, row.path);
      if (!pathExists(file)) {
        errors.push(`missing file in payload: ${row.path}`);
        continue;
      }
      const bytes = readFileSync(file);
      const sha = sha256Hex(bytes);
      if (sha !== row.sha256) {
        errors.push(`file hash mismatch: ${row.path}`);
      }
      if (bytes.byteLength !== row.bytes) {
        errors.push(`file size mismatch: ${row.path}`);
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  return errors;
}

/**
 * Verifies a .amcbackup offline. keys/auditor.pub and --pubkey only locate the signer; manifest.sig needs a key the
 * trust context admits for artifact-seal (P0-09). ok equals report.trusted.
 */
export function verifyBackup(params: { backupFile: string; pubkeyPath?: string; passphrase?: string; trust: TrustContext }): {
  ok: boolean;
  errors: string[];
  manifest: BackupManifest | null;
  report: VerifierReportV1;
} {
  const errors: string[] = [];
  const signatures: IssuerAdmission[] = [];
  let manifest: BackupManifest | null = null;
  const finish = () => {
    const report = buildVerifierReport({ artifact: { kind: "backup", path: resolve(params.backupFile), sha256: fileSha256(resolve(params.backupFile)) },
      context: params.trust, integrityErrors: errors, signatures, anchoring: { status: "not-applicable", detail: null } });
    return { ok: report.trusted, errors, manifest, report };
  };
  let loaded:
    | {
        root: string;
        cleanup: () => void;
      }
    | null = null;
  try {
    loaded = loadBundle(params.backupFile);
  } catch (error) {
    errors.push(`backup bundle extract failed: ${String(error)}`);
    return finish();
  }
  const { root, cleanup } = loaded;
  try {
    const manifestPath = join(root, "manifest.json");
    const sigPath = join(root, "manifest.sig");
    const payloadPath = join(root, "payload", "workspace.tar.gz.enc");
    const payloadShaPath = join(root, "payload.sha256");
    const pubPath = join(root, "keys", "auditor.pub");
    if (!pathExists(manifestPath) || !pathExists(sigPath) || !pathExists(payloadPath) || !pathExists(payloadShaPath)) {
      errors.push("backup bundle missing required files");
      return finish();
    }
    try {
      manifest = backupManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
    } catch (error) {
      errors.push(`invalid manifest: ${String(error)}`);
      return finish();
    }
    const candidates = [params.pubkeyPath ? readUtf8(resolve(params.pubkeyPath)) : null, pathExists(pubPath) ? readUtf8(pubPath) : null];
    errors.push(...verifyManifestSignature(manifestPath, sigPath, candidates, params.trust, signatures, manifest.signing));
    const payloadSha = sha256Hex(readFileSync(payloadPath));
    if (payloadSha !== manifest.payload.payloadSha256) {
      errors.push("payload sha mismatch");
    }
    const payloadShaFile = readUtf8(payloadShaPath).trim();
    if (payloadShaFile !== payloadSha) {
      errors.push("payload.sha256 file mismatch");
    }
    const passphrase = params.passphrase ?? backupPassphraseFromEnv();
    if (!passphrase || passphrase.length === 0) {
      errors.push("backup passphrase required for full verification");
      return finish();
    }
    try {
      const decrypted = decryptBackupPayload({
        encrypted: readFileSync(payloadPath),
        passphrase,
        envelope: manifest.payload.encryption as BackupEncryptionEnvelope
      });
      errors.push(...verifyDecryptedFiles(decrypted, manifest));
    } catch (error) {
      errors.push(`payload decrypt failed: ${String(error)}`);
    }
    return finish();
  } finally {
    cleanup();
  }
}

export function printBackup(bundleFile: string): BackupManifest {
  const { root, cleanup } = loadBundle(bundleFile);
  try {
    const manifestPath = join(root, "manifest.json");
    if (!pathExists(manifestPath)) {
      throw new Error("manifest.json missing from backup bundle");
    }
    return backupManifestSchema.parse(JSON.parse(readUtf8(manifestPath)) as unknown);
  } finally {
    cleanup();
  }
}

export async function restoreBackup(params: {
  backupFile: string;
  toDir: string;
  force?: boolean;
  passphrase?: string;
  pubkeyPath?: string;
  /** The operator's pins for the backup's auditor key (P0-09); --allow-unpinned restores an integrity-only backup. */
  trust: TrustContext;
}): Promise<{
  restoredTo: string;
  /** Over an existing workspace (--force): where the entries the restore replaced were kept; null for a new target. */
  replacedTo: string | null;
  trusted: boolean;
  warnings: string[];
  report: VerifierReportV1;
}> {
  const verify = verifyBackup({
    backupFile: params.backupFile,
    passphrase: params.passphrase,
    pubkeyPath: params.pubkeyPath,
    trust: params.trust
  });
  if (verdictExitCode(verify.report) === 1 || !verify.manifest) {
    throw new Error(`backup verify failed: ${untrustedReasons(verify.report).join("; ")}`);
  }
  // P2-06-D4: every refusal is decided before anything is written to the target or next to it.
  const target = resolve(params.toDir);
  if (pathExists(target) && !params.force) {
    throw new Error(`restore target already exists: ${target} (use --force)`);
  }
  const { root, cleanup } = loadBundle(params.backupFile);
  try {
    const payloadPath = join(root, "payload", "workspace.tar.gz.enc");
    const decrypted = decryptBackupPayload({
      encrypted: readFileSync(payloadPath),
      passphrase: params.passphrase ?? backupPassphraseFromEnv() ?? "",
      envelope: verify.manifest.payload.encryption as BackupEncryptionEnvelope
    });
    const temp = mkdtempSync(join(tmpdir(), "amc-backup-restore-"));
    try {
      const payloadTar = join(temp, "workspace.tar.gz");
      writeFileAtomic(payloadTar, decrypted, 0o600);
      const extract = join(temp, "extract");
      ensureDir(extract);
      tarExtract(payloadTar, extract);
      assertKeysetRestorable(target, extract);
      // Staged on the target's filesystem and committed by rename: a failure before the commit leaves the target as it was.
      const existed = pathExists(target);
      if (!existed) ensureDir(dirname(target));
      const stage = mkdtempSync(join(existed ? target : dirname(target), ".amc-restore-"));
      try {
        tarExtract(payloadTar, stage);
        const warnings = await sealRestore(stage, target, verify.report, verify.manifest, params.backupFile);
        const replacedTo = commitRestore(stage, target, existed);
        return { restoredTo: target, replacedTo, trusted: warnings.every(isInfo), warnings, report: verify.report };
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  } finally {
    cleanup();
  }
}

/** An informational restore note (an open session in the copy): kept in the warnings, never a reason to distrust the restore. */
const isInfo = (warning: string): boolean => warning.startsWith("INFO: ");

/** Verifies the staged workspace and writes its restore warning, audit row and transparency entry, all inside `stage`. */
async function sealRestore(stage: string, target: string, report: VerifierReportV1, manifest: BackupManifest, source: string): Promise<string[]> {
  const warnings = report.trusted ? [] : untrustedReasons(report).map((reason) => `UNTRUSTED (--allow-unpinned): ${reason}`);
  const opsSig = verifyOpsPolicySignature(stage);
  if (!opsSig.valid) {
    warnings.push(`ops policy invalid after restore: ${opsSig.reason ?? "unknown"}`);
  }
  const tlog = verifyTransparencyLog(stage);
  if (!tlog.ok) {
    warnings.push(...tlog.errors.map((row) => `transparency: ${row}`));
  }
  const merkle = verifyTransparencyMerkle(stage);
  if (!merkle.ok) {
    warnings.push(...merkle.errors.map((row) => `merkle: ${row}`));
  }
  // D-INT-7: the restored ledger is verified as of the backup's createdTs, iff the backup verified as trusted.
  const now = verifyInstantFor({ signedTs: manifest.createdTs, admitted: report.trusted });
  const ledger = await verifyLedgerIntegrity(stage, { now });
  if (!ledger.ok) {
    warnings.push(...ledger.errors.map((row) => `ledger: ${row}`));
  }
  const open = openSessionsAt(ledger, now);
  if (open) warnings.push(`INFO: ${open}`);
  const problems = warnings.filter((warning) => !isInfo(warning));
  if (problems.length > 0) {
    writeFileAtomic(
      join(stage, ".amc", "RESTORE_WARNING.txt"),
      ["Workspace restored but verification warnings were found:", ...warnings].join("\n"),
      0o644
    );
  }
  appendOpsAuditEvent({
    workspace: stage,
    auditType: "BACKUP_RESTORED",
    payload: { backupId: manifest.backupId, source, target, warnings: problems.length },
    severity: problems.length > 0 ? "HIGH" : "LOW"
  });
  appendTransparencyEntry({
    workspace: stage,
    type: "BACKUP_RESTORED",
    agentId: "system",
    artifact: { kind: "policy", id: manifest.backupId, sha256: manifest.payload.payloadSha256 }
  });
  return warnings;
}
