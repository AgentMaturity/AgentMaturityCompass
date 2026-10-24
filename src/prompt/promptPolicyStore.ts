import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, publishOrgPairs, publishOrgPairsAsync, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { readFileSync } from "node:fs";
import {
  defaultPromptPolicy,
  defaultPromptSchedulerState,
  promptPolicySchema,
  promptSchedulerStateSchema,
  type PromptPolicy,
  type PromptSchedulerState
} from "./promptPolicySchema.js";

function promptRoot(workspace: string): string {
  return join(workspace, ".amc", "prompt");
}

export function promptPolicyPath(workspace: string): string {
  return join(promptRoot(workspace), "policy.yaml");
}

export function promptPolicySigPath(workspace: string): string {
  return `${promptPolicyPath(workspace)}.sig`;
}

export function promptPacksRoot(workspace: string): string {
  return join(promptRoot(workspace), "packs", "agents");
}

function promptSnapshotsRoot(workspace: string): string {
  return join(promptRoot(workspace), "snapshots", "agents");
}

function promptLintRoot(workspace: string): string {
  return join(promptRoot(workspace), "lint", "agents");
}

export function promptLatestPackPath(workspace: string, agentId: string): string {
  return join(promptPacksRoot(workspace), agentId, "latest.amcprompt");
}

export function promptLatestPackShaPath(workspace: string, agentId: string): string {
  return `${promptLatestPackPath(workspace, agentId)}.sha256`;
}

export function promptSnapshotsDir(workspace: string, agentId: string): string {
  return join(promptSnapshotsRoot(workspace), agentId);
}

export function promptLatestLintPath(workspace: string, agentId: string): string {
  return join(promptLintRoot(workspace), agentId, "latest.lint.json");
}

export function promptLatestLintSigPath(workspace: string, agentId: string): string {
  return `${promptLatestLintPath(workspace, agentId)}.sig`;
}

export function promptSchedulerPath(workspace: string): string {
  return join(promptRoot(workspace), "scheduler.json");
}

export function ensurePromptDirs(workspace: string): void {
  ensureDir(promptRoot(workspace));
  ensureDir(promptPacksRoot(workspace));
  ensureDir(promptSnapshotsRoot(workspace));
  ensureDir(promptLintRoot(workspace));
}

export function savePromptPolicy(workspace: string, policy: PromptPolicy): {
  path: string;
  sigPath: string;
} {
  ensurePromptDirs(workspace);
  const path = promptPolicyPath(workspace);
  return publishOrgPairs(workspace, [{ path, bytes: Buffer.from(YAML.stringify(promptPolicySchema.parse(policy))) }])[0]!;
}

export function initPromptPolicy(workspace: string): {
  path: string;
  sigPath: string;
  policy: PromptPolicy;
} {
  const policy = defaultPromptPolicy();
  const saved = savePromptPolicy(workspace, policy);
  return {
    ...saved,
    policy
  };
}

export function loadPromptPolicy(workspace: string): PromptPolicy {
  const path = promptPolicyPath(workspace);
  if (!pathExists(path)) {
    return initPromptPolicy(workspace).policy;
  }
  return promptPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyPromptPolicySignature(workspace: string) {
  const path = promptPolicyPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "prompt policy missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyPromptPair(workspace, path);
}

export function savePromptSchedulerState(workspace: string, state: PromptSchedulerState): {
  path: string;
  sigPath: string;
} {
  ensurePromptDirs(workspace);
  const path = promptSchedulerPath(workspace);
  return publishOrgPairs(workspace, [{ path, bytes: Buffer.from(JSON.stringify(promptSchedulerStateSchema.parse(state), null, 2)) }])[0]!;
}

export function loadPromptSchedulerState(workspace: string): PromptSchedulerState {
  const path = promptSchedulerPath(workspace);
  if (!pathExists(path)) {
    return defaultPromptSchedulerState();
  }
  return promptSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyPromptSchedulerStateSignature(workspace: string) {
  const path = promptSchedulerPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyPromptPair(workspace, path);
}

function verifyPromptPair(workspace: string, path: string) {
  const sigPath = `${path}.sig`, signatureExists = pathExists(sigPath);
  if (!signatureExists) return { valid: false, signatureExists, reason: "signature missing", path, sigPath };
  try { return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", readFileSync(path), readFileSync(sigPath)), signatureExists, path, sigPath }; }
  catch { return { valid: false, signatureExists, reason: "invalid file signature", path, sigPath }; }
}
export async function savePromptPolicyAsync(workspace: string, policy: PromptPolicy, options: OrgPairsOptions = {}) {
  ensurePromptDirs(workspace);
  const path = promptPolicyPath(workspace), bytes = Buffer.from(YAML.stringify(promptPolicySchema.parse(policy)));
  return (await publishOrgPairsAsync(workspace, [{ path, bytes }], options))[0]!;
}
export async function initPromptPolicyAsync(workspace: string, options: OrgPairsOptions = {}) {
  const policy = defaultPromptPolicy(), saved = await savePromptPolicyAsync(workspace, policy, options);
  return { ...saved, policy };
}
/** Existing-body reads remain public; only an actually missing body prepares a default signed pair. */
export async function loadPromptPolicyAsync(workspace: string, options: OrgPairsOptions = {}): Promise<PromptPolicy> {
  const path = promptPolicyPath(workspace);
  if (pathExists(path)) return promptPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
  return (await loadPromptPolicyAttemptAsync(workspace, options)).policy;
}
export async function savePromptSchedulerStateAsync(workspace: string, state: PromptSchedulerState, options: OrgPairsOptions = {}) {
  ensurePromptDirs(workspace);
  const path = promptSchedulerPath(workspace), bytes = Buffer.from(JSON.stringify(promptSchedulerStateSchema.parse(state), null, 2));
  return (await publishOrgPairsAsync(workspace, [{ path, bytes }], options))[0]!;
}

/** Fixed internal cold-policy attempt; callers retain its actual checked publication through later waits. */
export async function loadPromptPolicyAttemptAsync(workspace: string, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  options = { ...options };
  const path = promptPolicyPath(workspace), before = previous ?? captureOrgPairs([path]), bytes = orgPairBytes(before, path);
  if (bytes !== null) return { policy: promptPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown),
    assertCurrent() { options.beforePublish?.(); options.assertInputsCurrent?.(); assertOrgPairsCurrent(before); } };
  const policy = defaultPromptPolicy(), prepared = await prepareOrgPairsAsync(workspace,
    [{ path, bytes: Buffer.from(YAML.stringify(policy)) }], options, before);
  prepared.publish(); return { policy, assertCurrent: prepared.assertCurrent };
}
