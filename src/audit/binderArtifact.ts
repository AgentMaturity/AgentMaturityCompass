import { cleanupDir } from "../utils/archiveFiles.js";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { binderExportsScopeDir, listBinderExports } from "./binderStore.js";
import { scanBinderForPii } from "./binderRedaction.js";
import type { signBinderJson } from "./binderSigner.js";
import type { AuditBinderJson } from "./binderSchema.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";
export { createAuditBinderArtifact } from "./binderArtifactAsync.js";

const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};






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

function scopePathId(scopeId: string): string {
  return scopeId.replace(/[^a-zA-Z0-9._-]/g, "_");
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

/** Same timestamp/scope recipe; preparation must not create a public output directory. */
export function defaultAuditPublicationPath(params: Parameters<typeof defaultAuditExportPath>[0]): string {
  const ts = Number.isFinite(Number(params.nowTs)) ? Number(params.nowTs) : Date.now();
  return join(binderExportsScopeDir(params.workspace, params.scopeType, scopePathId(params.scopeType === "WORKSPACE" ? "workspace" : params.scopeId)), `${ts}.amcaudit`);
}
