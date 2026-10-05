import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { binderJsonSchema, type AuditBinderJson } from "./binderSchema.js";
import { auditBindersCacheDir, auditBindersExportsDir, ensureAuditDirs } from "./auditPolicyStore.js";

function scopeSegment(scopeType: "WORKSPACE" | "NODE" | "AGENT"): string {
  if (scopeType === "WORKSPACE") return "workspace";
  if (scopeType === "NODE") return "node";
  return "agent";
}

export function binderCachePath(workspace: string, scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  return join(auditBindersCacheDir(workspace), `latest_${scopeSegment(scopeType)}_${scopeId}.json`);
}

export function binderCacheSigPath(workspace: string, scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  return `${binderCachePath(workspace, scopeType, scopeId)}.sig`;
}

export function binderExportsScopeDir(workspace: string, scopeType: "WORKSPACE" | "NODE" | "AGENT", scopeId: string): string {
  return join(auditBindersExportsDir(workspace), scopeSegment(scopeType), scopeId);
}

export function saveBinderCache(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
  binder: AuditBinderJson;
}): {
  path: string;
  sigPath: string;
} {
  ensureAuditDirs(params.workspace);
  const path = binderCachePath(params.workspace, params.scopeType, params.scopeId);
  ensureDir(auditBindersCacheDir(params.workspace));
  writeFileAtomic(path, JSON.stringify(binderJsonSchema.parse(params.binder), null, 2), 0o644);
  const sigPath = signFileWithAuditor(params.workspace, path);
  return { path, sigPath };
}

export function loadBinderCache(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}): AuditBinderJson | null {
  const path = binderCachePath(params.workspace, params.scopeType, params.scopeId);
  if (!pathExists(path)) {
    return null;
  }
  return binderJsonSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyBinderCacheSignature(params: {
  workspace: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}) {
  const path = binderCachePath(params.workspace, params.scopeType, params.scopeId);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(params.workspace, path);
}

export function listBinderExports(workspace: string): Array<{
  file: string;
  scopeType: "WORKSPACE" | "NODE" | "AGENT";
  scopeId: string;
}> {
  const root = auditBindersExportsDir(workspace);
  if (!pathExists(root)) {
    return [];
  }
  const out: Array<{ file: string; scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string }> = [];
  const walkScope = (scopeType: "WORKSPACE" | "NODE" | "AGENT", dir: string): void => {
    if (!pathExists(dir)) {
      return;
    }
    for (const idDir of readdirSync(dir, { withFileTypes: true })) {
      if (!idDir.isDirectory()) {
        continue;
      }
      const scopeId = idDir.name;
      const fullIdDir = join(dir, scopeId);
      for (const file of readdirSync(fullIdDir, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".amcaudit")) {
          continue;
        }
        out.push({
          file: join(fullIdDir, file.name),
          scopeType,
          scopeId
        });
      }
    }
  };

  walkScope("WORKSPACE", join(root, "workspace"));
  walkScope("NODE", join(root, "node"));
  walkScope("AGENT", join(root, "agent"));

  return out.sort((a, b) => b.file.localeCompare(a.file));
}

export function hostAuditPortfolioCachePath(hostDir: string): string {
  return join(hostDir, "audit-portfolio", "cache.json");
}

export function hostAuditPortfolioCacheSigPath(hostDir: string): string {
  return `${hostAuditPortfolioCachePath(hostDir)}.sig`;
}
