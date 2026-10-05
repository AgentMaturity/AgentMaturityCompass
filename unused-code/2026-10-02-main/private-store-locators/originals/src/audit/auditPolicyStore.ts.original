import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import {
  auditPolicySchema,
  auditSchedulerStateSchema,
  defaultAuditPolicy,
  defaultAuditSchedulerState,
  type AuditPolicy,
  type AuditSchedulerState
} from "./auditPolicySchema.js";

export function auditRoot(workspace: string): string {
  return join(workspace, ".amc", "audit");
}

export function auditPolicyPath(workspace: string): string {
  return join(auditRoot(workspace), "policy.yaml");
}

export function auditPolicySigPath(workspace: string): string {
  return `${auditPolicyPath(workspace)}.sig`;
}

export function auditMapsDir(workspace: string): string {
  return join(auditRoot(workspace), "maps");
}

export function auditBindersDir(workspace: string): string {
  return join(auditRoot(workspace), "binders");
}

export function auditBindersExportsDir(workspace: string): string {
  return join(auditBindersDir(workspace), "exports");
}

export function auditBindersCacheDir(workspace: string): string {
  return join(auditBindersDir(workspace), "cache");
}

export function auditRequestsDir(workspace: string): string {
  return join(auditRoot(workspace), "requests");
}

export function auditRequestsOpenDir(workspace: string): string {
  return join(auditRequestsDir(workspace), "open");
}

export function auditRequestsClosedDir(workspace: string): string {
  return join(auditRequestsDir(workspace), "closed");
}

export function auditSchedulerPath(workspace: string): string {
  return join(auditRoot(workspace), "scheduler.json");
}

export function ensureAuditDirs(workspace: string): void {
  ensureDir(auditRoot(workspace));
  ensureDir(auditMapsDir(workspace));
  ensureDir(auditBindersDir(workspace));
  ensureDir(auditBindersExportsDir(workspace));
  ensureDir(auditBindersCacheDir(workspace));
  ensureDir(auditRequestsOpenDir(workspace));
  ensureDir(auditRequestsClosedDir(workspace));
}

export function saveAuditPolicy(workspace: string, policy: AuditPolicy): {
  path: string;
  sigPath: string;
} {
  ensureAuditDirs(workspace);
  const path = auditPolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(auditPolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function initAuditPolicy(workspace: string): {
  path: string;
  sigPath: string;
  policy: AuditPolicy;
} {
  const policy = defaultAuditPolicy();
  const saved = saveAuditPolicy(workspace, policy);
  return {
    ...saved,
    policy
  };
}

export function loadAuditPolicy(workspace: string): AuditPolicy {
  const path = auditPolicyPath(workspace);
  if (!pathExists(path)) {
    return initAuditPolicy(workspace).policy;
  }
  return auditPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyAuditPolicySignature(workspace: string) {
  const path = auditPolicyPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "audit policy missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function loadAuditSchedulerState(workspace: string): AuditSchedulerState {
  const path = auditSchedulerPath(workspace);
  if (!pathExists(path)) {
    return defaultAuditSchedulerState();
  }
  return auditSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function saveAuditSchedulerState(workspace: string, state: AuditSchedulerState): {
  path: string;
  sigPath: string;
} {
  ensureAuditDirs(workspace);
  const path = auditSchedulerPath(workspace);
  writeFileAtomic(path, JSON.stringify(auditSchedulerStateSchema.parse(state), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
}

export function verifyAuditSchedulerSignature(workspace: string) {
  const path = auditSchedulerPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}
