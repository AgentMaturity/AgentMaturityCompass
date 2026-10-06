import { resolve } from "node:path";
import YAML from "yaml";
import { readUtf8 } from "../utils/fs.js";
import {
  buildPromptPackForApi,
  promptDiffForApi,
  promptInitForApi,
  promptPolicyApplyForApi,
  promptPolicyForApi,
  promptSchedulerRunNowForApi,
  promptSchedulerSetEnabledForApi,
  promptSchedulerStatusForApi,
  promptShowForApi,
  promptStatusForApi,
  promptVerifyForApi
} from "./promptPackApi.js";
import { promptPolicySchema, type PromptPolicy } from "./promptPolicySchema.js";
import { verifyPromptPackFile } from "./promptPackVerifier.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { PromptPackProvider } from "./promptPackSchema.js";

export function promptInitCli(workspace: string) {
  return promptInitForApi(workspace);
}

export function promptVerifyCli(workspace: string) {
  return promptVerifyForApi(workspace);
}

export function promptPolicyPrintCli(workspace: string): PromptPolicy {
  return promptPolicyForApi(workspace).policy;
}

export function promptPolicyApplyCli(params: {
  workspace: string;
  file: string;
  reason: string;
  actor: string;
}) {
  const parsed = promptPolicySchema.parse(YAML.parse(readUtf8(resolve(params.file))) as unknown);
  return promptPolicyApplyForApi({
    workspace: params.workspace,
    policy: parsed,
    reason: params.reason,
    actor: params.actor
  });
}

export function promptStatusCli(workspace: string) {
  return promptStatusForApi(workspace);
}

export function promptPackBuildCli(params: {
  workspace: string;
  agentId?: string;
  outFile?: string;
}) {
  return buildPromptPackForApi(params);
}

export function promptPackVerifyCli(params: {
  file: string;
  pubkeyPath?: string;
  trust: TrustContext;
}) {
  return verifyPromptPackFile({
    file: resolve(params.file),
    publicKeyPath: params.pubkeyPath ? resolve(params.pubkeyPath) : undefined,
    trust: params.trust
  });
}

export function promptPackShowCli(params: {
  workspace: string;
  agentId: string;
  provider: PromptPackProvider;
  format: "text" | "json";
}) {
  return promptShowForApi(params);
}

export function promptPackDiffCli(params: {
  workspace: string;
  agentId: string;
}) {
  return promptDiffForApi(params);
}

export function promptSchedulerStatusCli(workspace: string) {
  return promptSchedulerStatusForApi(workspace);
}

export function promptSchedulerRunNowCli(params: {
  workspace: string;
  agent: string | "all";
}) {
  return promptSchedulerRunNowForApi(params);
}

export function promptSchedulerEnableCli(workspace: string) {
  return promptSchedulerSetEnabledForApi({
    workspace,
    enabled: true
  });
}

export function promptSchedulerDisableCli(workspace: string) {
  return promptSchedulerSetEnabledForApi({
    workspace,
    enabled: false
  });
}

