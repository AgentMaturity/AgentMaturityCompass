import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import {
  defaultPromptPolicy,
  defaultPromptSchedulerState,
  promptPolicySchema,
  promptSchedulerStateSchema,
  type PromptPolicy,
  type PromptSchedulerState
} from "./promptPolicySchema.js";

export function promptRoot(workspace: string): string {
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

export function promptSnapshotsRoot(workspace: string): string {
  return join(promptRoot(workspace), "snapshots", "agents");
}

export function promptLintRoot(workspace: string): string {
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
  writeFileAtomic(path, YAML.stringify(promptPolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
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
  return verifySignedFileWithAuditor(workspace, path);
}

export function savePromptSchedulerState(workspace: string, state: PromptSchedulerState): {
  path: string;
  sigPath: string;
} {
  ensurePromptDirs(workspace);
  const path = promptSchedulerPath(workspace);
  writeFileAtomic(path, JSON.stringify(promptSchedulerStateSchema.parse(state), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
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
  return verifySignedFileWithAuditor(workspace, path);
}
