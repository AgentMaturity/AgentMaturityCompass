import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

function cleanup(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to extract audit binder: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function resolveRoot(dir: string): string {
  const direct = join(dir, "amc-audit");
  if (pathExists(direct)) {
    return direct;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = join(dir, entry.name);
    if (pathExists(join(child, "binder.json")) && pathExists(join(child, "binder.sig"))) {
      return child;
    }
  }
  return dir;
}

function digestFile(path: string): string {
  return sha256Hex(readFileSync(path));
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
    const root = resolveRoot(tmp);
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

    const piiPath = join(root, "checks", "pii-scan.json");
    if (!pathExists(piiPath)) {
      errors.push({ code: "MISSING_PII_SCAN", message: "checks/pii-scan.json missing" });
    } else {
      const pii = binderPiiScanSchema.parse(JSON.parse(readUtf8(piiPath)) as unknown);
      if (pii.status !== "PASS") {
        errors.push({ code: "PII_SCAN_FAILED", message: "binder pii scan status is FAIL" });
      }
      const piiSha = join(root, "checks", "pii-scan.sha256");
      if (pathExists(piiSha)) {
        const expected = readUtf8(piiSha).trim();
        const actual = digestFile(piiPath);
        if (expected !== actual) {
          errors.push({ code: "PII_SHA_MISMATCH", message: "checks/pii-scan.sha256 mismatch" });
        }
      } else {
        errors.push({ code: "MISSING_PII_SHA", message: "checks/pii-scan.sha256 missing" });
      }
    }

    const inclusion = parseInclusionProofs(root);
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
    cleanup(tmp);
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
