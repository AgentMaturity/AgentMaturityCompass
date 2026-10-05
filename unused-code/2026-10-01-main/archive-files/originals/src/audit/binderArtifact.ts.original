import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { canonPath } from "../canon/canonLoader.js";
import { diagnosticBankPath } from "../diagnostic/bank/bankLoader.js";
import { cgxLatestGraphPath, cgxLatestPackPath } from "../cgx/cgxStore.js";
import { promptPolicyPath } from "../prompt/promptPolicyStore.js";
import { mechanicTargetsPath } from "../mechanic/targetsStore.js";
import { type AuditPolicy } from "./auditPolicySchema.js";
import {
  loadAuditMapActive,
  loadAuditMapBuiltin,
  verifyAuditMapActiveSignature,
  verifyAuditMapBuiltinSignature
} from "./auditMapStore.js";
import { type AuditMapFile } from "./auditMapSchema.js";
import {
  loadAuditPolicy,
  verifyAuditPolicySignature
} from "./auditPolicyStore.js";
import {
  binderExportsScopeDir,
  listBinderExports,
  saveBinderCache
} from "./binderStore.js";
import { collectAuditBinderData } from "./binderCollector.js";
import { scanBinderForPii } from "./binderRedaction.js";
import { signBinderJson } from "./binderSigner.js";
import { buildBinderProofs, writeBinderProofFiles } from "./binderProofs.js";
import { type AuditBinderJson } from "./binderSchema.js";
import { type EvidenceRequest } from "./evidenceRequestSchema.js";
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
    throw new Error(`failed to create audit binder: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function tarExtract(bundleFile: string, outDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
}

function resolveAuditRoot(dir: string): string {
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

function fileSha(path: string): string {
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

function scopeSegment(type: "WORKSPACE" | "NODE" | "AGENT"): string {
  if (type === "WORKSPACE") {
    return "workspace";
  }
  if (type === "NODE") {
    return "node";
  }
  return "agent";
}

function scopePathId(scopeId: string): string {
  return scopeId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function mapScopeIdForCgx(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  if (scopeType === "WORKSPACE") {
    return "workspace";
  }
  return scopeId;
}

function latestCgxSha(workspace: string, scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  if (scopeType === "AGENT") {
    const packPath = cgxLatestPackPath(workspace, scopeId);
    return fileSha(packPath);
  }
  return fileSha(
    cgxLatestGraphPath(workspace, {
      type: "workspace",
      id: "workspace"
    })
  );
}

function signerPubFromSignature(workspace: string, signature: ReturnType<typeof signBinderJson>): string {
  if (signature.envelope?.pubkeyB64) {
    return Buffer.from(signature.envelope.pubkeyB64, "base64").toString("utf8");
  }
  return getPublicKeyHistory(workspace, "auditor")[0] ?? "";
}

function markdownSummary(params: {
  binder: AuditBinderJson;
  map: AuditMapFile;
}): string {
  const familyLines = params.binder.sections.controls.families
    .map((family) => {
      return `- ${family.title}: PASS ${family.statusSummary.pass}, FAIL ${family.statusSummary.fail}, INSUFFICIENT ${family.statusSummary.insufficient}`;
    })
    .join("\n");
  return [
    "# AMC Audit Binder Summary",
    "",
    "_Engineering control/evidence crosswalk. This artifact is not legal advice._",
    "",
    `- Binder ID: \`${params.binder.binderId}\``,
    `- Generated: \`${new Date(params.binder.generatedTs).toISOString()}\``,
    `- Scope: \`${params.binder.scope.type}\``,
    `- Trust Label: \`${params.binder.trust.trustLabel}\``,
    `- Integrity Index: \`${params.binder.trust.integrityIndex.toFixed(3)}\``,
    `- Correlation Ratio: \`${params.binder.trust.correlationRatio.toFixed(3)}\``,
    `- Compliance Map: \`${params.map.auditMap.id}\``,
    "",
    "## Control Families",
    familyLines.length > 0 ? familyLines : "- None",
    "",
    "## Maturity",
    `- Status: \`${params.binder.sections.maturity.status}\``,
    `- Overall: \`${params.binder.sections.maturity.overall === null ? "N/A" : params.binder.sections.maturity.overall.toFixed(3)}\``,
    `- Unknown Questions: \`${params.binder.sections.maturity.unknownQuestionsCount}\``,
    "",
    "## Assurance",
    `- Last Cert Status: \`${params.binder.sections.assurance.lastCert.status ?? "N/A"}\``,
    `- Risk Assurance Score: \`${params.binder.sections.assurance.riskAssuranceScore ?? "N/A"}\``,
    "",
    "## Privacy Notes",
    "- Export contains allowlisted numeric/categorical fields, hashes, signatures, and deterministic summaries.",
    "- Export excludes raw prompts, raw tool payloads, secrets, and PII."
  ].join("\n");
}

function escapePdfText(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderSummaryPdf(markdown: string): Buffer {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .slice(0, 40);
  const contentLines = ["BT", "/F1 10 Tf", "40 800 Td"];
  let first = true;
  for (const rawLine of lines) {
    const line = rawLine.length === 0 ? " " : rawLine;
    if (!first) {
      contentLines.push("0 -14 Td");
    }
    first = false;
    contentLines.push(`(${escapePdfText(line.slice(0, 110))}) Tj`);
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push(`5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function evidenceScope(scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): { type: "WORKSPACE" | "NODE" | "AGENT"; id: string } {
  if (scopeType === "WORKSPACE") {
    return { type: "WORKSPACE", id: "workspace" };
  }
  return {
    type: scopeType,
    id: scopeId
  };
}

export interface AuditBinderCreateResult {
  outFile: string;
  sha256: string;
  binder: AuditBinderJson;
  signature: ReturnType<typeof signBinderJson>;
  piiScan: ReturnType<typeof scanBinderForPii>;
  transparencyCreatedHash: string;
  transparencyExportedHash: string;
  cachePath: string;
  cacheSigPath: string;
}

export async function createAuditBinderArtifact(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId?: string;
  outFile: string;
  nowTs?: number;
  request?: EvidenceRequest | null;
}): Promise<AuditBinderCreateResult> {
  const policySig = verifyAuditPolicySignature(params.workspace);
  if (!policySig.valid) {
    throw new Error(`audit policy signature invalid: ${policySig.reason ?? "unknown"}`);
  }
  const activeMapSig = verifyAuditMapActiveSignature(params.workspace);
  if (!activeMapSig.valid) {
    throw new Error(`audit active map signature invalid: ${activeMapSig.reason ?? "unknown"}`);
  }
  const builtinMapSig = verifyAuditMapBuiltinSignature(params.workspace);
  if (!builtinMapSig.valid) {
    throw new Error(`audit builtin map signature invalid: ${builtinMapSig.reason ?? "unknown"}`);
  }
  const policy = loadAuditPolicy(params.workspace);
  const map = loadAuditMapActive(params.workspace);
  const scopeType = params.scopeType;
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : (params.scopeId?.trim() || "default");

  const collected = await collectAuditBinderData({
    workspace: params.workspace,
    scope: {
      type: scopeType,
      id: scopeId
    },
    policy,
    map,
    nowTs: params.nowTs,
    request: params.request ?? null
  });

  const proofs = buildBinderProofs({
    workspace: params.workspace,
    includeEventKinds: collected.includedEventKinds
  });
  const calculationManifestCanonical = canonicalize(collected.calculationManifest);
  const calculationManifestSha256 = sha256Hex(Buffer.from(calculationManifestCanonical, "utf8"));
  const tmp = mkdtempSync(join(tmpdir(), "amc-audit-binder-"));

  let binder = collected.binder;
  let piiScan = scanBinderForPii(binder);
  let signature = signBinderJson(params.workspace, binder);
  try {
    const root = join(tmp, "amc-audit");
    ensureDir(root);
    ensureDir(join(root, "proofs"));
    ensureDir(join(root, "checks"));
    ensureDir(join(root, "meta"));
    ensureDir(join(root, "summaries"));

    const proofFiles = writeBinderProofFiles({
      outDir: root,
      bundle: proofs
    });
    binder = {
      ...binder,
      proofBindings: {
        ...binder.proofBindings,
        transparencyRootSha256: proofFiles.transparencyRootSha256,
        merkleRootSha256: proofFiles.merkleRootSha256,
        includedEventProofIds: proofFiles.proofIds,
        calculationManifestSha256
      }
    };

    piiScan = scanBinderForPii(binder);
    if (piiScan.status !== "PASS") {
      appendTransparencyEntry({
        workspace: params.workspace,
        type: "AUDIT_BINDER_VERIFICATION_FAILED",
        agentId: scopeType === "AGENT" ? scopeId : "workspace",
        artifact: {
          kind: "policy",
          sha256: sha256Hex(Buffer.from(canonicalize(piiScan), "utf8")),
          id: binder.binderId
        }
      });
      const top = piiScan.findings.filter((row) => row.severity === "HIGH").slice(0, 8);
      throw new Error(`audit binder pii scan failed: ${top.map((row) => `${row.type}:${row.path}`).join(", ")}`);
    }

    signature = signBinderJson(params.workspace, binder);
    const signerPub = signerPubFromSignature(params.workspace, signature);
    if (!signerPub) {
      throw new Error("missing signer public key for audit binder");
    }

    writeFileAtomic(join(root, "binder.json"), `${canonicalize(binder)}\n`, 0o644);
    writeFileAtomic(join(root, "binder.sig"), `${canonicalize(signature)}\n`, 0o644);
    writeFileAtomic(join(root, "signer.pub"), `${signerPub}\n`, 0o644);

    writeFileAtomic(join(root, "checks", "pii-scan.json"), `${canonicalize(piiScan)}\n`, 0o644);
    writeFileAtomic(join(root, "checks", "pii-scan.sha256"), `${fileSha(join(root, "checks", "pii-scan.json"))}\n`, 0o644);

    writeFileAtomic(join(root, "meta", "policy.sha256"), `${fileSha(policySig.path)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "map.sha256"), `${fileSha(activeMapSig.path)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "canon.sha256"), `${fileSha(canonPath(params.workspace))}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "bank.sha256"), `${fileSha(diagnosticBankPath(params.workspace))}\n`, 0o644);
    writeFileAtomic(
      join(root, "meta", "cgx.pack.sha256"),
      `${latestCgxSha(params.workspace, scopeType, mapScopeIdForCgx(scopeType, scopeId))}\n`,
      0o644
    );
    writeFileAtomic(join(root, "meta", "prompt.policy.sha256"), `${fileSha(promptPolicyPath(params.workspace))}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "mechanic.targets.sha256"), `${fileSha(mechanicTargetsPath(params.workspace))}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "calculation-manifest.json"), `${calculationManifestCanonical}\n`, 0o644);

    const build = {
      v: 1,
      generatedTs: binder.generatedTs,
      binderId: binder.binderId,
      scopeType,
      scopeId,
      includedEventKinds: collected.includedEventKinds,
      sourceEventHashes: collected.sourceEventHashes
    };
    writeFileAtomic(join(root, "meta", "build.json"), `${canonicalize(build)}\n`, 0o644);
    writeFileAtomic(join(root, "meta", "build.sha256"), `${fileSha(join(root, "meta", "build.json"))}\n`, 0o644);

    const summaryMd = markdownSummary({
      binder,
      map
    });
    writeFileAtomic(join(root, "summaries", "summary.md"), `${summaryMd}\n`, 0o644);
    if (policy.auditPolicy.export.allowPdfSummary) {
      writeFileAtomic(join(root, "summaries", "summary.pdf"), renderSummaryPdf(summaryMd), 0o644);
    }

    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    tarCreateDeterministic(tmp, outFile);
    const sha256 = fileSha(outFile);
    writeFileAtomic(`${outFile}.sha256`, `${sha256}\n`, 0o644);

    const cacheSaved = saveBinderCache({
      workspace: params.workspace,
      scopeType,
      scopeId: scopePathId(scopeId),
      binder
    });
    const created = appendTransparencyEntry({
      workspace: params.workspace,
      type: "AUDIT_BINDER_CREATED",
      agentId: scopeType === "AGENT" ? scopeId : "workspace",
      artifact: {
        kind: "policy",
        sha256: signature.digestSha256,
        id: binder.binderId
      }
    });
    const exported = appendTransparencyEntry({
      workspace: params.workspace,
      type: "AUDIT_BINDER_EXPORTED",
      agentId: scopeType === "AGENT" ? scopeId : "workspace",
      artifact: {
        kind: "amcaudit",
        sha256,
        id: binder.binderId
      }
    });

    return {
      outFile,
      sha256,
      binder,
      signature,
      piiScan,
      transparencyCreatedHash: created.hash,
      transparencyExportedHash: exported.hash,
      cachePath: cacheSaved.path,
      cacheSigPath: cacheSaved.sigPath
    };
  } finally {
    cleanupDir(tmp);
  }
}

export function inspectAuditBinder(file: string): {
  binder: AuditBinderJson;
  signature: ReturnType<typeof signBinderJson>;
  piiScan: ReturnType<typeof scanBinderForPii> | null;
  sha256: string;
} {
  const bundle = resolve(file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-audit-inspect-"));
  try {
    tarExtract(bundle, tmp);
    const root = resolveAuditRoot(tmp);
    const binder = JSON.parse(readUtf8(join(root, "binder.json"))) as AuditBinderJson;
    const signature = JSON.parse(readUtf8(join(root, "binder.sig"))) as ReturnType<typeof signBinderJson>;
    const piiPath = join(root, "checks", "pii-scan.json");
    const piiScan = pathExists(piiPath) ? (JSON.parse(readUtf8(piiPath)) as ReturnType<typeof scanBinderForPii>) : null;
    return {
      binder,
      signature,
      piiScan,
      sha256: fileSha(bundle)
    };
  } finally {
    cleanupDir(tmp);
  }
}

export function listExportedAuditBinders(workspace: string): Array<{
  file: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  binderId: string;
  generatedTs: number;
  sha256: string;
}> {
  const rows = listBinderExports(workspace);
  return rows
    .map((row) => {
      try {
        const inspected = inspectAuditBinder(row.file);
        return {
          file: row.file,
          scopeType: row.scopeType,
          scopeId: row.scopeId,
          binderId: inspected.binder.binderId,
          generatedTs: inspected.binder.generatedTs,
          sha256: inspected.sha256
        };
      } catch {
        return null;
      }
    })
    .filter((row): row is {
      file: string;
      scopeType: "WORKSPACE" | "NODE" | "AGENT";
      scopeId: string;
      binderId: string;
      generatedTs: number;
      sha256: string;
    } => row !== null)
    .sort((a, b) => b.generatedTs - a.generatedTs || a.file.localeCompare(b.file));
}

export function defaultAuditExportPath(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  nowTs?: number;
}): string {
  const ts = Number.isFinite(Number(params.nowTs)) ? Number(params.nowTs) : Date.now();
  const dir = binderExportsScopeDir(
    params.workspace,
    params.scopeType,
    scopePathId(params.scopeType === "WORKSPACE" ? "workspace" : params.scopeId)
  );
  ensureDir(dir);
  return join(dir, `${ts}.amcaudit`);
}
