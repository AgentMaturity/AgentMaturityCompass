import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { loadPassportPolicy, savePassportCache, verifyPassportPolicySignature } from "./passportStore.js";
import { collectPassportData } from "./passportCollector.js";
import { scanPassportForPii } from "./passportRedaction.js";
import { buildPassportProofs, writePassportProofFiles } from "./passportProofs.js";
import { signPassportJson, digestFile } from "./passportSigner.js";
import { passportJsonSchema, passportPiiScanSchema, passportSignatureSchema, type PassportJson } from "./passportSchema.js";
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


function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function tarCreateDeterministic(sourceDir: string, outFile: string): void {
  const files = collectFiles(sourceDir);
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, ...files], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`failed to create passport artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolvePassportRoot(dir: string): string {
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

function scopeSegment(type: "WORKSPACE" | "NODE" | "AGENT"): string {
  if (type === "WORKSPACE") return "workspace";
  if (type === "NODE") return "node";
  return "agent";
}

function scopePathId(scopeId: string): string {
  return scopeId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function defaultPassportExportPath(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}): string {
  return join(
    params.workspace,
    ".amc",
    "passport",
    "exports",
    scopeSegment(params.scopeType),
    scopePathId(params.scopeId),
    `${Date.now()}.amcpass`
  );
}

export interface PassportCreateResult {
  outFile: string;
  sha256: string;
  passport: PassportJson;
  signature: ReturnType<typeof signPassportJson>;
  piiScan: ReturnType<typeof scanPassportForPii>;
  cachePath: string;
  cacheSigPath: string;
  transparencyCreatedHash: string;
  transparencyExportedHash: string;
}

export function createPassportArtifact(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  outFile: string;
}): PassportCreateResult {
  const policySig = verifyPassportPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`passport policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const policy = loadPassportPolicy(params.workspace);
  const scopeId = params.scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default");
  const collected = collectPassportData({
    workspace: params.workspace,
    scopeType: params.scopeType,
    scopeId,
    policy
  });
  const proofs = buildPassportProofs({
    workspace: params.workspace,
    includeEventKinds: collected.includedEventKinds
  });
  const calculationManifestSha = sha256Hex(Buffer.from(canonicalize(collected.calculationManifest), "utf8"));

  let passport = passportJsonSchema.parse({
    ...collected.passport,
    proofBindings: {
      ...collected.passport.proofBindings,
      calculationManifestSha256: calculationManifestSha
    }
  });
  let piiScan = passportPiiScanSchema.parse(scanPassportForPii(passport));
  if (piiScan.status !== "PASS") {
    const top = piiScan.findings.filter((row) => row.severity === "HIGH").slice(0, 8);
    const detail = top.map((row) => `${row.type}:${row.path}`).join(", ");
    throw new Error(`passport pii scan failed: ${detail}`);
  }

  let signature = passportSignatureSchema.parse(signPassportJson(params.workspace, passport));
  const signerPub = signature.envelope
    ? Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8")
    : (getPublicKeyHistory(params.workspace, "auditor")[0] ?? "");
  if (!signerPub) {
    throw new Error("missing signer public key for passport");
  }

  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  const tmp = mkdtempSync(join(tmpdir(), "amc-passport-artifact-"));
  try {
    const root = join(tmp, "amc-passport");
    ensureDir(root);
    ensureDir(join(root, "proofs"));
    ensureDir(join(root, "checks"));
    ensureDir(join(root, "meta"));

    const proofFiles = writePassportProofFiles({
      outDir: root,
      bundle: proofs
    });
    passport = passportJsonSchema.parse({
      ...passport,
      proofBindings: {
        ...passport.proofBindings,
        transparencyRootSha256: proofFiles.transparencyRootSha256,
        merkleRootSha256: proofFiles.merkleRootSha256,
        includedEventProofIds: proofFiles.proofIds
      }
    });
    piiScan = passportPiiScanSchema.parse(scanPassportForPii(passport));
    if (piiScan.status !== "PASS") {
      throw new Error("passport pii scan failed after proof binding");
    }
    signature = passportSignatureSchema.parse(signPassportJson(params.workspace, passport));

    const passportJsonPath = join(root, "passport.json");
    const passportSigPath = join(root, "passport.sig");
    writeFileAtomic(passportJsonPath, `${canonicalize(passport)}\n`, 0o644);
    writeFileAtomic(passportSigPath, `${canonicalize(signature)}\n`, 0o644);
    writeFileAtomic(join(root, "signer.pub"), signerPub, 0o644);

    const piiPath = join(root, "checks", "pii-scan.json");
    writeFileAtomic(piiPath, `${canonicalize(piiScan)}\n`, 0o644);
    writeFileAtomic(join(root, "checks", "pii-scan.sha256"), `${digestFile(piiPath)}\n`, 0o644);

    writeFileAtomic(join(root, "meta", "policy.sha256"), `${collected.sourceHashes.policySha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "canon.sha256"), `${collected.sourceHashes.canonSha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "bank.sha256"), `${collected.sourceHashes.bankSha256}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "cgx.pack.sha256"), `${collected.sourceHashes.cgxPackSha256}\n`, 0o644);
    if (collected.sourceHashes.promptPackSha256) {
      writeFileAtomic(join(root, "meta", "prompt.pack.sha256"), `${collected.sourceHashes.promptPackSha256}\n`, 0o644);
    }
    if (collected.sourceHashes.assuranceCertSha256) {
      writeFileAtomic(join(root, "meta", "assurance.cert.sha256"), `${collected.sourceHashes.assuranceCertSha256}\n`, 0o644);
    }
    if (collected.sourceHashes.benchSha256) {
      writeFileAtomic(join(root, "meta", "bench.sha256"), `${collected.sourceHashes.benchSha256}\n`, 0o644);
    }
    if (collected.sourceHashes.auditBinderSha256) {
      writeFileAtomic(join(root, "meta", "audit.binder.sha256"), `${collected.sourceHashes.auditBinderSha256}\n`, 0o644);
    }
    if (collected.sourceHashes.valueSnapshotSha256) {
      writeFileAtomic(join(root, "meta", "value.snapshot.sha256"), `${collected.sourceHashes.valueSnapshotSha256}\n`, 0o644);
    }

    const buildMeta = {
      v: 1,
      generatedTs: passport.generatedTs,
      scope: passport.scope,
      status: passport.status.label,
      sourceHashes: collected.sourceHashes
    };
    const buildPath = join(root, "meta", "build.json");
    writeFileAtomic(buildPath, `${canonicalize(buildMeta)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "build.sha256"), `${digestFile(buildPath)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "calculation-manifest.json"), `${canonicalize(collected.calculationManifest)}\n`, 0o644);

    tarCreateDeterministic(tmp, outFile);
  } finally {
    cleanupDir(tmp);
  }

  const sha256 = digestFile(outFile);
  writeFileAtomic(`${outFile}.sha256`, `${sha256}\n`, 0o644);
  const cache = savePassportCache({
    workspace: params.workspace,
    scopeType: params.scopeType,
    scopeId,
    passport
  });
  const createdEntry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "PASSPORT_CREATED",
    agentId: params.scopeType === "AGENT" ? scopeId : "workspace",
    artifact: {
      kind: "amcpass",
      sha256,
      id: passport.passportId
    }
  });
  const exportedEntry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "PASSPORT_EXPORTED",
    agentId: params.scopeType === "AGENT" ? scopeId : "workspace",
    artifact: {
      kind: "amcpass",
      sha256,
      id: passport.passportId
    }
  });

  return {
    outFile,
    sha256,
    passport,
    signature,
    piiScan,
    cachePath: cache.path,
    cacheSigPath: cache.sigPath,
    transparencyCreatedHash: createdEntry.hash,
    transparencyExportedHash: exportedEntry.hash
  };
}

export function inspectPassportArtifact(file: string): {
  passport: PassportJson;
  signature: ReturnType<typeof signPassportJson>;
  piiScan: ReturnType<typeof scanPassportForPii> | null;
  sha256: string;
} {
  const bundle = resolve(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-passport-inspect-"));
  try {
    tarExtract(bundle, tmp);
    const root = resolvePassportRoot(tmp);
    const passport = passportJsonSchema.parse(JSON.parse(readUtf8(join(root, "passport.json"))) as unknown);
    const signature = passportSignatureSchema.parse(JSON.parse(readUtf8(join(root, "passport.sig"))) as unknown);
    const piiPath = join(root, "checks", "pii-scan.json");
    const piiScan = pathExists(piiPath) ? passportPiiScanSchema.parse(JSON.parse(readUtf8(piiPath)) as unknown) : null;
    return {
      passport,
      signature,
      piiScan,
      sha256: digestFile(bundle)
    };
  } finally {
    cleanupDir(tmp);
  }
}

export function listExportedPassportArtifacts(workspace: string): Array<{
  file: string;
  sha256: string;
  passportId: string;
  generatedTs: number;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  status: "VERIFIED" | "INFORMATIONAL" | "UNTRUSTED";
}> {
  const dir = join(workspace, ".amc", "passport", "exports");
  if (!pathExists(dir)) {
    return [];
  }
  const out: Array<{
    file: string;
    sha256: string;
    passportId: string;
    generatedTs: number;
    scopeType: "WORKSPACE" | "NODE" | "AGENT";
    status: "VERIFIED" | "INFORMATIONAL" | "UNTRUSTED";
  }> = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".amcpass")) {
        continue;
      }
      try {
        const inspected = inspectPassportArtifact(full);
        out.push({
          file: full,
          sha256: inspected.sha256,
          passportId: inspected.passport.passportId,
          generatedTs: inspected.passport.generatedTs,
          scopeType: inspected.passport.scope.type,
          status: inspected.passport.status.label
        });
      } catch {
        // skip broken entries in listing
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => b.generatedTs - a.generatedTs || a.file.localeCompare(b.file));
}
