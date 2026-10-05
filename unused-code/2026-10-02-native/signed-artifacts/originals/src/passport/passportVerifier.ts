import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Hex } from "../utils/hash.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { passportJsonSchema, passportPiiScanSchema, passportSignatureSchema, type PassportJson } from "./passportSchema.js";
import { digestFile, verifyPassportDigestSignature } from "./passportSigner.js";
import { verifyPassportProofBundle } from "./passportProofs.js";
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
}

function cleanup(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({
    file: bundleFile,
    destination: outDir,
    label: "passport bundle",
    limits: PASSPORT_ARCHIVE_LIMITS,
  });
}

function resolveRoot(dir: string): string {
  const direct = join(dir, "amc-passport");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = join(dir, entry.name);
    if (pathExists(join(child, "passport.json")) && pathExists(join(child, "passport.sig"))) {
      return child;
    }
  }
  return dir;
}

function parseInclusionProofs(root: string): Array<{
  v: 1;
  proofId: string;
  eventHash: string;
  rootHash: string;
  merklePath: Array<{ position: "left" | "right"; hash: string }>;
  verifiedBy: "amc";
}> {
  const dir = join(root, "proofs", "inclusion");
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => JSON.parse(readUtf8(join(dir, name))) as {
      v: 1;
      proofId: string;
      eventHash: string;
      rootHash: string;
      merklePath: Array<{ position: "left" | "right"; hash: string }>;
      verifiedBy: "amc";
    });
}

export function verifyPassportArtifactFile(params: {
  file: string;
  workspace?: string;
  publicKeyPath?: string;
}): PassportVerifyResult {
  const file = resolve(params.file);
  const errors: PassportVerifyError[] = [];
  const fileSha256 = digestFile(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-passport-verify-"));
  let passport: PassportJson | null = null;
  try {
    tarExtract(file, tmp);
    const root = resolveRoot(tmp);
    const passportPath = join(root, "passport.json");
    const sigPath = join(root, "passport.sig");
    const pubPath = join(root, "signer.pub");
    if (!pathExists(passportPath)) {
      errors.push({ code: "MISSING_PASSPORT_JSON", message: "passport.json missing" });
      return { ok: false, passport: null, errors, fileSha256 };
    }
    if (!pathExists(sigPath)) {
      errors.push({ code: "MISSING_PASSPORT_SIG", message: "passport.sig missing" });
      return { ok: false, passport: null, errors, fileSha256 };
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

    const pubPem = params.publicKeyPath
      ? readUtf8(resolve(params.publicKeyPath))
      : pathExists(pubPath)
        ? readUtf8(pubPath)
        : undefined;
    const sigOk = verifyPassportDigestSignature({
      digestHex: digest,
      signature,
      workspace: params.workspace,
      publicKeyPem: pubPem
    });
    if (!sigOk) {
      errors.push({ code: "SIGNATURE_INVALID", message: "passport signature verification failed" });
    }

    const piiPath = join(root, "checks", "pii-scan.json");
    if (pathExists(piiPath)) {
      const pii = passportPiiScanSchema.parse(JSON.parse(readUtf8(piiPath)) as unknown);
      if (pii.status !== "PASS") {
        errors.push({ code: "PII_SCAN_FAILED", message: "passport pii scan status is FAIL" });
      }
      const piiSha = join(root, "checks", "pii-scan.sha256");
      if (pathExists(piiSha)) {
        const expected = readUtf8(piiSha).trim();
        const actual = digestFile(piiPath);
        if (expected !== actual) {
          errors.push({ code: "PII_SHA_MISMATCH", message: "checks/pii-scan.sha256 mismatch" });
        }
      }
    } else {
      errors.push({ code: "MISSING_PII_SCAN", message: "checks/pii-scan.json missing" });
    }

    const inclusion = parseInclusionProofs(root);
    const proofOk = verifyPassportProofBundle({
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

    return {
      ok: errors.length === 0,
      passport,
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
      passport,
      errors,
      fileSha256
    };
  } finally {
    cleanup(tmp);
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
    const verify = verifyPassportArtifactFile({
      file,
      workspace: params.workspace
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
