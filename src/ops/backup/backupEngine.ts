import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getPublicKeyHistory, getPublicKeyPem } from "../../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../../utils/fs.js";
import { sha256Hex } from "../../utils/hash.js";
import { loadOpsPolicy, opsPolicyPath, verifyOpsPolicySignature } from "../policy.js";
import { currentTransparencyMerkleRoot, verifyTransparencyMerkle } from "../../transparency/merkleIndexStore.js";
import { transparencySealSigPath, verifyTransparencyLog, appendTransparencyEntry } from "../../transparency/logChain.js";
import { verifyLedgerIntegrity } from "../../ledger/ledger.js";
import { backupManifestSchema, backupManifestSigSchema, type BackupManifest, type BackupManifestSig } from "./backupSchema.js";
import { decryptBackupPayload, encryptBackupPayload, type BackupEncryptionEnvelope } from "./backupCrypto.js";
import { appendOpsAuditEvent } from "../audit.js";
import { signDigestWithPolicy } from "../../crypto/signing/signer.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, untrustedReasons, verdictExitCode, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../../trust/index.js";
import { fileSha256 } from "../../trust/signatureCheck.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../../security/safeTarArchive.js";

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
    throw new Error(`failed to create tarball: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
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
}): void {
  for (const rel of params.files) {
    const source = join(params.sourceRoot, rel);
    const dest = join(params.destinationRoot, rel);
    ensureDir(dirname(dest));
    copyFileSync(source, dest);
  }
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

  const files = collectFiles(params.workspace, policy.opsPolicy.backups.includePaths, policy.opsPolicy.backups.excludePaths);
  const temp = mkdtempSync(join(tmpdir(), "amc-backup-"));
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
    files
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
      const full = join(params.workspace, relPath);
      const bytes = readFileSync(full);
      return {
        path: relPath,
        sha256: sha256Hex(bytes),
        bytes: bytes.byteLength
      };
    }),
    integrity: {
      transparencyRoot: root?.root ?? "",
      transparencySealSigSha256: pathExists(sealSigPath) ? sha256Hex(readFileSync(sealSigPath)) : sha256Hex(Buffer.alloc(0)),
      evidenceDbSha256: pathExists(join(params.workspace, ".amc", "evidence.sqlite"))
        ? sha256Hex(readFileSync(join(params.workspace, ".amc", "evidence.sqlite")))
        : null
    },
    signing: {
      algorithm: "ed25519",
      auditorFingerprint: sha256Hex(Buffer.from(getPublicKeyPem(params.workspace, "auditor"), "utf8"))
    }
  });
  const manifestPath = join(bundleRoot, "manifest.json");
  writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2), 0o644);
  const digest = sha256Hex(readFileSync(manifestPath));
  const signed = signDigestWithPolicy({
    workspace: params.workspace,
    kind: "BACKUP_MANIFEST",
    digestHex: digest
  });
  const sig = backupManifestSigSchema.parse({
    digestSha256: digest,
    signature: signed.signature,
    signedTs: signed.signedTs,
    signer: "auditor",
    envelope: signed.envelope
  });
  writeFileAtomic(join(bundleRoot, "manifest.sig"), JSON.stringify(sig, null, 2), 0o644);
  writeFileAtomic(join(keysDir, "auditor.pub"), Buffer.from(getPublicKeyPem(params.workspace, "auditor"), "utf8"), 0o644);

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
  signatures: IssuerAdmission[]): string[] {
  const errors: string[] = [];
  const digest = sha256Hex(readFileSync(manifestPath));
  try {
    const sig = backupManifestSigSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const check = checkDigestSignature({ signature: "manifest.sig", purpose: "artifact-seal", digestHex: digest, signatureB64: sig.signature,
      candidates: [...candidates, envelopePublicKey(sig.envelope)], context: trust, claimedSignedAt: sig.signedTs });
    signatures.push(check.admission);
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
    errors.push(...verifyManifestSignature(manifestPath, sigPath, candidates, params.trust, signatures));
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
      const target = resolve(params.toDir);
      if (pathExists(target) && !params.force) {
        throw new Error(`restore target already exists: ${target} (use --force)`);
      }
      ensureDir(target);
      tarExtract(payloadTar, target);
      const warnings = verify.report.trusted ? [] : untrustedReasons(verify.report).map((reason) => `UNTRUSTED (--allow-unpinned): ${reason}`);
      const opsSig = verifyOpsPolicySignature(target);
      if (!opsSig.valid) {
        warnings.push(`ops policy invalid after restore: ${opsSig.reason ?? "unknown"}`);
      }
      const tlog = verifyTransparencyLog(target);
      if (!tlog.ok) {
        warnings.push(...tlog.errors.map((row) => `transparency: ${row}`));
      }
      const merkle = verifyTransparencyMerkle(target);
      if (!merkle.ok) {
        warnings.push(...merkle.errors.map((row) => `merkle: ${row}`));
      }
      const ledger = await verifyLedgerIntegrity(target);
      if (!ledger.ok) {
        warnings.push(...ledger.errors.map((row) => `ledger: ${row}`));
      }
      if (warnings.length > 0) {
        writeFileAtomic(
          join(target, ".amc", "RESTORE_WARNING.txt"),
          ["Workspace restored but verification warnings were found:", ...warnings].join("\n"),
          0o644
        );
      }
      appendOpsAuditEvent({
        workspace: target,
        auditType: "BACKUP_RESTORED",
        payload: {
          backupId: verify.manifest.backupId,
          source: params.backupFile,
          target,
          warnings: warnings.length
        },
        severity: warnings.length > 0 ? "HIGH" : "LOW"
      });
      appendTransparencyEntry({
        workspace: target,
        type: "BACKUP_RESTORED",
        agentId: "system",
        artifact: {
          kind: "policy",
          id: verify.manifest.backupId,
          sha256: verify.manifest.payload.payloadSha256
        }
      });
      return {
        restoredTo: target,
        trusted: warnings.length === 0,
        warnings,
        report: verify.report
      };
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  } finally {
    cleanup();
  }
}
