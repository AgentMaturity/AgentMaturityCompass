import {
  cleanupSignedArtifactVerification,
  resolveSignedArtifactRoot,
  readSignedArtifactInclusionProofs,
  verifySignedArtifactPiiScan
} from "../utils/signedArtifactVerification.js";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { verifyBinderProofs } from "./binderProofs.js";
import { binderJsonSchema, binderPiiScanSchema, binderSignatureSchema, type AuditBinderJson } from "./binderSchema.js";
import { listBinderExports, verifyBinderCacheSignature } from "./binderStore.js";
import { verifyAuditMapActiveSignature, verifyAuditMapBuiltinSignature } from "./auditMapStore.js";
import { verifyAuditPolicySignature, verifyAuditSchedulerSignature } from "./auditPolicyStore.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

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


interface AuditBinderVerifyError {
  code: string;
  message: string;
}

export interface AuditBinderVerifyResult {
  ok: boolean;
  binder: AuditBinderJson | null;
  errors: AuditBinderVerifyError[];
  fileSha256: string;
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function digestFile(path: string): string {
  return sha256Hex(readFileSync(path));
}

function verifyDigestSignature(params: {
  digestHex: string;
  signature: ReturnType<typeof binderSignatureSchema.parse>;
  workspace?: string;
  publicKeyPem?: string;
}): boolean {
  const trustedKeys = params.publicKeyPem
    ? [params.publicKeyPem]
    : params.workspace
      ? getPublicKeyHistory(params.workspace, "auditor")
      : [];
  if (params.signature.envelope) {
    try {
      if (params.signature.signature !== params.signature.envelope.sigB64) {
        return false;
      }
      if (
        verifySignatureEnvelope(params.digestHex, params.signature.envelope, {
          trustedPublicKeys: trustedKeys,
          requireTrustedKey: true
        })
      ) {
        return true;
      }
    } catch {
      // fall through to key-based verification
    }
  }
  if (trustedKeys.length > 0) {
    return verifyHexDigestAny(params.digestHex, params.signature.signature, trustedKeys);
  }
  return false;
}

export function verifyAuditBinderFile(params: {
  file: string;
  workspace?: string;
  publicKeyPath?: string;
}): AuditBinderVerifyResult {
  const file = resolve(params.file);
  const errors: AuditBinderVerifyError[] = [];
  const fileSha256 = digestFile(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-audit-verify-"));
  let binder: AuditBinderJson | null = null;
  try {
    tarExtract(file, tmp);
    const root = resolveSignedArtifactRoot(tmp, "amc-audit", "binder.json", "binder.sig");
    const binderPath = join(root, "binder.json");
    const sigPath = join(root, "binder.sig");
    const pubPath = join(root, "signer.pub");
    if (!pathExists(binderPath)) {
      errors.push({ code: "MISSING_BINDER_JSON", message: "binder.json missing" });
      return { ok: false, binder: null, errors, fileSha256 };
    }
    if (!pathExists(sigPath)) {
      errors.push({ code: "MISSING_BINDER_SIG", message: "binder.sig missing" });
      return { ok: false, binder: null, errors, fileSha256 };
    }

    binder = binderJsonSchema.parse(JSON.parse(readUtf8(binderPath)) as unknown);
    const signature = binderSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const digest = sha256Hex(Buffer.from(canonicalize(binder), "utf8"));
    if (digest !== signature.digestSha256) {
      errors.push({ code: "DIGEST_MISMATCH", message: "binder.json digest mismatch with binder.sig" });
    }

    const pubPem = params.publicKeyPath
      ? readUtf8(resolve(params.publicKeyPath))
      : pathExists(pubPath)
        ? readUtf8(pubPath)
        : undefined;
    if (!verifyDigestSignature({
      digestHex: digest,
      signature,
      workspace: params.workspace,
      publicKeyPem: pubPem
    })) {
      errors.push({ code: "SIGNATURE_INVALID", message: "binder signature verification failed" });
    }

    verifySignedArtifactPiiScan({
      root,
      artifact: "binder",
      readScan: (path) => binderPiiScanSchema.parse(JSON.parse(readUtf8(path)) as unknown),
      requireChecksum: true,
      errors
    });

    const inclusion = readSignedArtifactInclusionProofs(root);
    const proofOk = verifyBinderProofs({
      transparencyRoot: null,
      merkleRoot: null,
      proofs: inclusion
    });
    if (!proofOk.ok) {
      for (const error of proofOk.errors) {
        errors.push({ code: "PROOF_INVALID", message: error });
      }
    }
    const proofIds = inclusion.map((row) => row.proofId).sort((a, b) => a.localeCompare(b));
    const expectedProofIds = [...binder.proofBindings.includedEventProofIds].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(proofIds) !== JSON.stringify(expectedProofIds)) {
      errors.push({ code: "PROOF_IDS_MISMATCH", message: "included proof ids do not match binder proofBindings" });
    }

    const transparencyRootPath = join(root, "proofs", "transparency.root.json");
    const merkleRootPath = join(root, "proofs", "merkle.root.json");
    const transparencySha = pathExists(transparencyRootPath) ? digestFile(transparencyRootPath) : "0".repeat(64);
    const merkleSha = pathExists(merkleRootPath) ? digestFile(merkleRootPath) : "0".repeat(64);
    if (transparencySha !== binder.proofBindings.transparencyRootSha256) {
      errors.push({ code: "TRANSPARENCY_ROOT_SHA_MISMATCH", message: "proofBindings.transparencyRootSha256 mismatch" });
    }
    if (merkleSha !== binder.proofBindings.merkleRootSha256) {
      errors.push({ code: "MERKLE_ROOT_SHA_MISMATCH", message: "proofBindings.merkleRootSha256 mismatch" });
    }

    const calcManifestPath = join(root, "meta", "calculation-manifest.json");
    if (!pathExists(calcManifestPath)) {
      errors.push({ code: "MISSING_CALCULATION_MANIFEST", message: "meta/calculation-manifest.json missing" });
    } else {
      const calcRaw = JSON.parse(readUtf8(calcManifestPath)) as unknown;
      const calcSha = sha256Hex(Buffer.from(canonicalize(calcRaw), "utf8"));
      if (calcSha !== binder.proofBindings.calculationManifestSha256) {
        errors.push({
          code: "CALCULATION_MANIFEST_SHA_MISMATCH",
          message: "proofBindings.calculationManifestSha256 mismatch"
        });
      }
    }

    return {
      ok: errors.length === 0,
      binder,
      errors,
      fileSha256
    };
  } catch (error) {
    errors.push({
      code: "VERIFY_EXCEPTION",
      message: String(error)
    });
    return {
      ok: false,
      binder,
      errors,
      fileSha256
    };
  } finally {
    cleanupSignedArtifactVerification(tmp);
  }
}

export function verifyAuditWorkspace(params: {
  workspace: string;
}): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const policy = verifyAuditPolicySignature(params.workspace);
  if (!policy.valid) {
    errors.push(`policy: ${policy.reason ?? "invalid signature"}`);
  }
  const mapBuiltin = verifyAuditMapBuiltinSignature(params.workspace);
  if (!mapBuiltin.valid) {
    errors.push(`builtin map: ${mapBuiltin.reason ?? "invalid signature"}`);
  }
  const mapActive = verifyAuditMapActiveSignature(params.workspace);
  if (!mapActive.valid) {
    errors.push(`active map: ${mapActive.reason ?? "invalid signature"}`);
  }
  const scheduler = verifyAuditSchedulerSignature(params.workspace);
  if (!(scheduler.valid || !scheduler.signatureExists)) {
    errors.push(`scheduler: ${scheduler.reason ?? "invalid signature"}`);
  }

  for (const row of listBinderExports(params.workspace)) {
    const verify = verifyAuditBinderFile({
      file: row.file,
      workspace: params.workspace
    });
    if (!verify.ok) {
      errors.push(`export ${row.file}: ${verify.errors.map((error) => error.message).join("; ")}`);
    }
  }

  const cacheRoot = join(params.workspace, ".amc", "audit", "binders", "cache");
  if (pathExists(cacheRoot)) {
    for (const file of readdirSync(cacheRoot)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      const base = file.replace(/^latest_/, "").replace(/\.json$/, "");
      const parts = base.split("_");
      const scopeRaw = (parts.shift() ?? "").toUpperCase();
      const scopeType = scopeRaw === "NODE" || scopeRaw === "AGENT" ? scopeRaw : "WORKSPACE";
      const scopeId = parts.join("_") || "workspace";
      const sig = verifyBinderCacheSignature({
        workspace: params.workspace,
        scopeType,
        scopeId
      });
      if (!sig.valid) {
        errors.push(`cache ${scopeType}:${scopeId}: ${sig.reason ?? "invalid signature"}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
