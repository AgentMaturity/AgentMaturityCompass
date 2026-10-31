import { captureOrgPairs, captureOrgPairsAuthority, assertOrgPairsCurrent, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { publishAuditFiles, type AuditPublicationOptions } from "./binderPublication.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { verifyAuditBundlePair } from "./binderFileVerification.js";
import { binderJsonSchema, type AuditBinderJson } from "./binderSchema.js";
import { auditBindersCacheDir, auditBindersExportsDir } from "./auditPolicyStore.js";

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
  const path = binderCachePath(params.workspace, params.scopeType, params.scopeId), body = JSON.stringify(binderJsonSchema.parse(params.binder), null, 2);
  const original = captureOrgPairsAuthority(params.workspace), before = captureOrgPairs([path]), signature = JSON.stringify(signSerializedPayloadWithAuditor(params.workspace, body), null, 2);
  publishAuditFiles(params.workspace, [{ path, bytes: Buffer.from(body) }, { path: `${path}.sig`, bytes: Buffer.from(signature) }], before, original);
  return { path, sigPath: `${path}.sig` };
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
  return verifyAuditBundlePair(params.workspace, path);
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

function hostAuditPortfolioCachePath(hostDir: string): string {
  return join(hostDir, "audit-portfolio", "cache.json");
}

export function hostAuditPortfolioCacheSigPath(hostDir: string): string {
  return `${hostAuditPortfolioCachePath(hostDir)}.sig`;
}

export async function prepareBinderCacheAsync(params: Parameters<typeof saveBinderCache>[0], options: AuditPublicationOptions = {}, previous?: OrgPairsSnapshot) {
  options = { ...options };
  const copied = structuredClone(params), path = binderCachePath(copied.workspace, copied.scopeType, copied.scopeId);
  const actor = options.beforePublish; actor?.();
  const original = captureOrgPairsAuthority(copied.workspace), before = previous ?? captureOrgPairs([path]);
  const body = Buffer.from(JSON.stringify(binderJsonSchema.parse(copied.binder), null, 2));
  const publicationInputs = () => { actor?.(); options.assertInputsCurrent?.(); options.assertOutputsSafe?.(Object.freeze([path, `${path}.sig`])); original(); };
  const gate = () => { options.assertPreparationInputsCurrent?.(); publicationInputs(); assertOrgPairsCurrent(before); };
  const signature = await prepareFileSignatureWithAuditor(copied.workspace, path, body, "BUNDLE", gate);
  const writes = [{ path, bytes: body }, { path: `${path}.sig`, bytes: Buffer.from(signature.signatureBytes) }];
  const assertCurrent = () => { original(); signature.assertCurrent(); };
  return { path, sigPath: `${path}.sig`, writes, assertCurrent, publish() { publishAuditFiles(copied.workspace, writes, before, () => { publicationInputs(); assertCurrent(); }, gate); return { path, sigPath: `${path}.sig` }; } };
}
