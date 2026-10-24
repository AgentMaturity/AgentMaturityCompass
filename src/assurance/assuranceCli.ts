import { cliInitiator } from "../approvals/approvalEngine.js";
import { readUtf8 } from "../utils/fs.js";
import YAML from "yaml";
import { resolve } from "node:path";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import {
  assuranceInitForApiAsync, assurancePolicyForApiAsync, assurancePolicyApplyForApiAsync, assuranceSchedulerEnableForApiAsync,
  assuranceWaiverStatusForApiAsync, assuranceWaiverRevokeForApiAsync,
  assuranceDefaultPolicyForApi,
  assurancePolicyApplyForApi,
  assurancePolicyForApi,
  assuranceRunDetailForApi,
  assuranceRunForApi,
  assuranceRunsForApi,
  assuranceCertIssueForApi,
  assuranceSchedulerEnableForApi,
  assuranceSchedulerRunNowForApi,
  assuranceSchedulerStatusForApi,
  assuranceWaiverRequestForApi,
  assuranceWaiverRevokeForApi,
  assuranceWaiverStatusForApi
} from "./assuranceControlPlane.js";
import { assurancePolicyPath, initAssurancePolicy, verifyAssurancePolicySignature } from "./assurancePolicyStore.js";
import { verifyAssuranceCertificateFile, verifyAssuranceWorkspace } from "./assuranceVerifier.js";
import type { TrustContext } from "../trust/trustContext.js";

export function assuranceInitCli(workspace: string) {
  return initAssurancePolicy(workspace);
}

export function assuranceVerifyPolicyCli(workspace: string) {
  return verifyAssurancePolicySignature(workspace);
}

export function assurancePrintPolicyCli(workspace: string) {
  return assurancePolicyForApi(workspace).policy;
}

export function assuranceApplyPolicyCli(params: {
  workspace: string;
  file: string;
}) {
  const raw = readUtf8(params.file);
  let policy: unknown;
  try {
    policy = YAML.parse(raw) as unknown;
  } catch {
    policy = JSON.parse(raw) as unknown;
  }
  return assurancePolicyApplyForApi({
    workspace: params.workspace,
    policy
  });
}

export async function assuranceRunCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  pack?: "all" | string;
  windowDays?: number;
}) {
  return assuranceRunForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
    scopeId: params.id,
    pack: params.pack,
    windowDays: params.windowDays
  });
}

export function assuranceRunsCli(workspace: string) {
  return assuranceRunsForApi(workspace);
}

export function assuranceShowRunCli(params: {
  workspace: string;
  runId: string;
}) {
  return assuranceRunDetailForApi(params);
}

export async function assuranceIssueCertCli(params: {
  workspace: string;
  runId: string;
  outFile?: string;
}, options: { beforePublish?: () => void } = {}) {
  return assuranceCertIssueForApi(params, options);
}

export function assuranceVerifyCertCli(params: {
  file: string;
  publicKeyPath?: string;
  trust: TrustContext;
}) {
  return verifyAssuranceCertificateFile(params);
}

export function assuranceVerifyWorkspaceCli(workspace: string) {
  return verifyAssuranceWorkspace({ workspace });
}

export function assuranceSchedulerStatusCli(workspace: string) {
  return assuranceSchedulerStatusForApi(workspace);
}

export async function assuranceSchedulerRunNowCli(workspace: string, options: OrgPairsOptions = {}) {
  return assuranceSchedulerRunNowForApi({ workspace }, options);
}

export function assuranceSchedulerEnableCli(params: {
  workspace: string;
  enabled: boolean;
}) {
  return assuranceSchedulerEnableForApi(params);
}

export function assuranceWaiverRequestCli(params: {
  workspace: string;
  agentId: string;
  reason: string;
  hours: number;
}) {
  return assuranceWaiverRequestForApi({ ...params, initiator: cliInitiator() });
}

export function assuranceWaiverStatusCli(workspace: string) {
  return assuranceWaiverStatusForApi(workspace);
}

export function assuranceWaiverRevokeCli(params: {
  workspace: string;
  waiverId?: string;
}) {
  return assuranceWaiverRevokeForApi(params);
}

export function assuranceDefaultPolicyCli() {
  return assuranceDefaultPolicyForApi();
}

export function assuranceInitCliAsync(workspace: string, options: OrgPairsOptions = {}) { return assuranceInitForApiAsync(workspace, options); }
export async function assurancePrintPolicyCliAsync(workspace: string, options: OrgPairsOptions = {}) { return (await assurancePolicyForApiAsync(workspace, options)).policy; }
export async function assuranceApplyPolicyCliAsync(input: { workspace: string; file: string }, options: OrgPairsOptions = {}) {
  options = { ...options }; const params = { ...input }, actor = options.beforePublish; actor?.();
  const selected = captureOrgFiles([params.file]), bytes = orgPairBytes(selected, params.file);
  if (bytes === null) throw new Error(`assurance policy input missing: ${params.file}`);
  let policy: unknown; try { policy = YAML.parse(bytes.toString("utf8")) as unknown; } catch { policy = JSON.parse(bytes.toString("utf8")) as unknown; }
  const isOwnTarget = resolve(params.file) === resolve(assurancePolicyPath(params.workspace));
  return assurancePolicyApplyForApiAsync({ workspace: params.workspace, policy }, {
    beforePublish: () => { actor?.(); if (!isOwnTarget) assertOrgPairsCurrent(selected); },
    assertInputsCurrent: () => { options.assertInputsCurrent?.(); assertOrgPairsCurrent(selected); }
  });
}
export function assuranceSchedulerEnableCliAsync(params: { workspace: string; enabled: boolean }, options: OrgPairsOptions = {}) { return assuranceSchedulerEnableForApiAsync(params, options); }
export function assuranceWaiverStatusCliAsync(workspace: string, options: OrgPairsOptions = {}) { return assuranceWaiverStatusForApiAsync(workspace, options); }
export function assuranceWaiverRevokeCliAsync(params: { workspace: string; waiverId?: string }, options: OrgPairsOptions = {}) { return assuranceWaiverRevokeForApiAsync(params, options); }
