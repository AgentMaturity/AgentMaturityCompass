import { assertOrgPairsCurrent, captureOrgPairs } from "../org/preparedOrgPairs.js";
import { captureAuditPolicyMapPublication, readAuditPolicySelection } from "./auditPolicyMapPublication.js";
import type { AuditPublicationOptions } from "./binderPublication.js";
import { verifyAuditBundlePair } from "./binderFileVerification.js";
import { saveAuditSchedulerStateSync } from "./binderStatePublication.js";
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

function auditRoot(workspace: string): string {
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

function auditBindersDir(workspace: string): string {
  return join(auditRoot(workspace), "binders");
}

export function auditBindersExportsDir(workspace: string): string {
  return join(auditBindersDir(workspace), "exports");
}

export function auditBindersCacheDir(workspace: string): string {
  return join(auditBindersDir(workspace), "cache");
}

function auditRequestsDir(workspace: string): string {
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
  return saveAuditSchedulerStateSync(workspace, state);
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
  return verifyAuditBundlePair(workspace, path);
}

export function prepareAuditPolicyAsync(workspace: string, policy: AuditPolicy, options: AuditPublicationOptions = {}) {
  return captureAuditPolicyMapPublication(workspace, { policy }, options).prepare();
}
export async function saveAuditPolicyAsync(workspace: string, policy: AuditPolicy, options: AuditPublicationOptions = {}) {
  const prepared = await prepareAuditPolicyAsync(workspace, policy, options); return prepared.publish().policy!;
}
export async function initAuditPolicyAsync(workspace: string, options: AuditPublicationOptions = {}) {
  const policy = defaultAuditPolicy(), prepared = await prepareAuditPolicyAsync(workspace, policy, options);
  const saved = prepared.publish().policy!; prepared.assertCurrent(); return { ...saved, policy };
}
export async function loadAuditPolicyAttemptAsync(workspace: string, options: AuditPublicationOptions = {}) {
  const caller = { ...options }; caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertPreparationInputsCurrent?.();
  const selected = readAuditPolicySelection(workspace);
  if (selected.bytes !== null) {
    const policy = auditPolicySchema.parse(YAML.parse(selected.bytes.toString("utf8")));
    const assertCurrent = () => { caller.beforePublish?.(); caller.assertInputsCurrent?.(); selected.assertCurrent(); };
    assertCurrent(); return Object.freeze({ policy, assertCurrent, verification: selected.verification });
  }
  const previous = captureOrgPairs([auditPolicyPath(workspace)]), policy = defaultAuditPolicy();
  if (previous.members.some(row => row.path === auditPolicyPath(workspace) && row.bytes !== null)) throw new Error("audit policy appeared during default selection");
  assertOrgPairsCurrent(previous);
  const prepared = await captureAuditPolicyMapPublication(workspace, { policy }, caller, previous).prepare();
  prepared.publish(); prepared.assertCurrent();
  return Object.freeze({ policy, assertCurrent: prepared.assertCurrent, verification: () => prepared.verification("policy") });
}
export async function loadAuditPolicyAsync(workspace: string, options: AuditPublicationOptions = {}): Promise<AuditPolicy> {
  const loaded = await loadAuditPolicyAttemptAsync(workspace, options); loaded.assertCurrent(); return loaded.policy;
}
