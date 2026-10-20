import {
  cleanupSignedArtifactVerification,
  resolveSignedArtifactRoot,
  readSignedArtifactInclusionProofs,
  verifySignedArtifactPiiScan
} from "../utils/signedArtifactVerification.js";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { passportJsonSchema, passportPiiScanSchema, passportSignatureSchema, type PassportJson } from "./passportSchema.js";
import { digestFile } from "./passportSigner.js";
import { verifyProofsAgainstSignedRoot } from "../bench/benchProofs.js";
import { buildVerifierReport, checkDigestSignature, envelopePublicKey, workspaceSelfTrust, type IssuerAdmission, type TrustContext, type VerifierReportV1 } from "../trust/index.js";
import {
  verifyPassportPolicySignature,
  listPassportExportFiles,
  verifyPassportCacheSignature,
  getPassportRevocation
} from "./passportStore.js";
import { computePassportExpiresTs } from "./passportConstants.js";
import {
  extractValidatedTarGzipArchive,
  type TarArchiveLimits,
} from "../security/safeTarArchive.js";

const PASSPORT_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 64 * 1024 * 1024,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxPathBytes: 1024,
};

interface PassportVerifyError {
  code: string;
  message: string;
}

export interface PassportVerifyResult {
  ok: boolean;
  passport: PassportJson | null;
  errors: PassportVerifyError[];
  fileSha256: string;
  report: VerifierReportV1;
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({
    file: bundleFile,
    destination: outDir,
    label: "passport bundle",
    limits: PASSPORT_ARCHIVE_LIMITS,
  });
}

/**
 * Verifies a .amcpass offline. signer.pub, the signature envelope and --pubkey only locate the signer: the passport
 * and its signed Merkle root need keys the trust context admits for artifact-seal, and inclusion proofs must resolve
 * to that signed root (P0-09). ok equals report.trusted.
 */
export function verifyPassportArtifactFile(params: {
  file: string;
  workspace?: string;
  publicKeyPath?: string;
  trust: TrustContext;
}): PassportVerifyResult {
  const file = resolve(params.file);
  const errors: PassportVerifyError[] = [];
  const signatures: IssuerAdmission[] = [];
  let anchoring: VerifierReportV1["anchoring"] = { status: "not-applicable", detail: null };
  const fileSha256 = digestFile(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-passport-verify-"));
  let passport: PassportJson | null = null;
  const finish = (): PassportVerifyResult => {
    const report = buildVerifierReport({ artifact: { kind: "passport", path: file, sha256: fileSha256 }, context: params.trust,
      integrityErrors: errors.map((error) => `${error.code}: ${error.message}`), signatures, anchoring });
    return { ok: report.trusted, passport, errors, fileSha256, report };
  };
  try {
    tarExtract(file, tmp);
    const root = resolveSignedArtifactRoot(tmp, "amc-passport", "passport.json", "passport.sig");
    const passportPath = join(root, "passport.json");
    const sigPath = join(root, "passport.sig");
    const pubPath = join(root, "signer.pub");
    if (!pathExists(passportPath)) {
      errors.push({ code: "MISSING_PASSPORT_JSON", message: "passport.json missing" });
      return finish();
    }
    if (!pathExists(sigPath)) {
      errors.push({ code: "MISSING_PASSPORT_SIG", message: "passport.sig missing" });
      return finish();
    }

    passport = passportJsonSchema.parse(JSON.parse(readUtf8(passportPath)) as unknown);
    const signature = passportSignatureSchema.parse(JSON.parse(readUtf8(sigPath)) as unknown);
    const expiresTs = typeof passport.expiresTs === "number"
      ? passport.expiresTs
      : computePassportExpiresTs(passport.generatedTs);
    if (Date.now() > expiresTs) {
      errors.push({
        code: "PASSPORT_EXPIRED",
        message: `passport expired at ${new Date(expiresTs).toISOString()}`
      });
    }
    if (params.workspace) {
      const revocation = getPassportRevocation(params.workspace, passport.passportId);
      if (revocation) {
        errors.push({
          code: "PASSPORT_REVOKED",
          message: `passport revoked at ${new Date(revocation.revokedTs).toISOString()}`
        });
      }
    }
    const digest = sha256Hex(Buffer.from(canonicalize(passport), "utf8"));
    if (digest !== signature.digestSha256) {
      errors.push({ code: "DIGEST_MISMATCH", message: "passport.json digest mismatch with passport.sig" });
    }

    const candidates = [
      params.publicKeyPath ? readUtf8(resolve(params.publicKeyPath)) : null,
      pathExists(pubPath) ? readUtf8(pubPath) : null,
      envelopePublicKey(signature.envelope)
    ];
    const check = checkDigestSignature({ signature: "passport.sig", purpose: "artifact-seal", digestHex: digest,
      signatureB64: signature.signature, candidates, context: params.trust, claimedSignedAt: signature.signedTs });
    signatures.push(check.admission);
    if (!check.verified || (signature.envelope !== undefined && signature.signature !== signature.envelope.sigB64)) {
      errors.push({ code: "SIGNATURE_INVALID", message: "passport signature verification failed" });
    }

    verifySignedArtifactPiiScan({
      root,
      artifact: "passport",
      readScan: (path) => passportPiiScanSchema.parse(JSON.parse(readUtf8(path)) as unknown),
      requireChecksum: false,
      errors
    });

    const inclusion = readSignedArtifactInclusionProofs(root);
    const proofs = verifyProofsAgainstSignedRoot({ root, proofs: inclusion, trust: params.trust, candidates, claimedSignedAt: signature.signedTs });
    errors.push(...proofs.errors.map((message) => ({ code: "PROOF_INVALID", message })));
    if (proofs.admission) signatures.push(proofs.admission);
    anchoring = proofs.anchoring;
    const proofIds = inclusion.map((row) => row.proofId).sort((a, b) => a.localeCompare(b));
    const expectedProofIds = [...passport.proofBindings.includedEventProofIds].sort((a, b) => a.localeCompare(b));
    if (JSON.stringify(proofIds) !== JSON.stringify(expectedProofIds)) {
      errors.push({ code: "PROOF_IDS_MISMATCH", message: "included proof ids do not match passport proofBindings" });
    }

    const transparencyRootPath = join(root, "proofs", "transparency.root.json");
    const merkleRootPath = join(root, "proofs", "merkle.root.json");
    const transparencySha = pathExists(transparencyRootPath) ? digestFile(transparencyRootPath) : "0".repeat(64);
    const merkleSha = pathExists(merkleRootPath) ? digestFile(merkleRootPath) : "0".repeat(64);
    if (transparencySha !== passport.proofBindings.transparencyRootSha256) {
      errors.push({ code: "TRANSPARENCY_ROOT_SHA_MISMATCH", message: "proofBindings.transparencyRootSha256 mismatch" });
    }
    if (merkleSha !== passport.proofBindings.merkleRootSha256) {
      errors.push({ code: "MERKLE_ROOT_SHA_MISMATCH", message: "proofBindings.merkleRootSha256 mismatch" });
    }

    const calcManifestPath = join(root, "meta", "calculation-manifest.json");
    if (!pathExists(calcManifestPath)) {
      errors.push({ code: "MISSING_CALCULATION_MANIFEST", message: "meta/calculation-manifest.json missing" });
    } else {
      const calcRaw = JSON.parse(readUtf8(calcManifestPath)) as unknown;
      const calcSha = sha256Hex(Buffer.from(canonicalize(calcRaw), "utf8"));
      if (calcSha !== passport.proofBindings.calculationManifestSha256) {
        errors.push({
          code: "CALCULATION_MANIFEST_SHA_MISMATCH",
          message: "proofBindings.calculationManifestSha256 mismatch"
        });
      }
    }

    return finish();
  } catch (error) {
    errors.push({
      code: "VERIFY_EXCEPTION",
      message: String(error)
    });
    return finish();
  } finally {
    cleanupSignedArtifactVerification(tmp);
  }
}

export function verifyPassportWorkspace(params: {
  workspace: string;
}): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const policy = verifyPassportPolicySignature(params.workspace);
  if (!policy.valid) {
    errors.push(`policy: ${policy.reason ?? "invalid signature"}`);
  }
  for (const file of listPassportExportFiles(params.workspace)) {
    // A workspace self-check of its own exports: its own keys are the pins, labelled workspace-self.
    const verify = verifyPassportArtifactFile({
      file,
      workspace: params.workspace,
      trust: workspaceSelfTrust(params.workspace)
    });
    if (!verify.ok) {
      errors.push(`export ${file}: ${verify.errors.map((error) => error.message).join("; ")}`);
    }
  }
  const cacheDir = join(params.workspace, ".amc", "passport", "cache");
  if (pathExists(cacheDir)) {
    for (const file of readdirSync(cacheDir)) {
      if (!file.startsWith("latest_") || !file.endsWith(".json")) {
        continue;
      }
      const base = file.slice("latest_".length, -".json".length);
      const parts = base.split("_");
      const scopeRaw = (parts.shift() ?? "").toUpperCase();
      const scopeType = scopeRaw === "NODE" || scopeRaw === "AGENT" ? scopeRaw : "WORKSPACE";
      const scopeId = parts.join("_") || "workspace";
      const sig = verifyPassportCacheSignature({
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
