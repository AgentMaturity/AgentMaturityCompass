import { readUtf8 } from "../utils/fs.js";
import YAML from "yaml";
import {
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
import { initAssurancePolicy, verifyAssurancePolicySignature } from "./assurancePolicyStore.js";
import { verifyAssuranceCertificateFile, verifyAssuranceWorkspace } from "./assuranceVerifier.js";

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
}) {
  return assuranceCertIssueForApi(params);
}

export function assuranceVerifyCertCli(params: {
  file: string;
}) {
  return verifyAssuranceCertificateFile(params);
}

export function assuranceVerifyWorkspaceCli(workspace: string) {
  return verifyAssuranceWorkspace({ workspace });
}

export function assuranceSchedulerStatusCli(workspace: string) {
  return assuranceSchedulerStatusForApi(workspace);
}

export async function assuranceSchedulerRunNowCli(workspace: string) {
  return assuranceSchedulerRunNowForApi({ workspace });
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
  return assuranceWaiverRequestForApi(params);
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
