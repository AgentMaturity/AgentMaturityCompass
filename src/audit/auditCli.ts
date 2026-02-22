import { resolve } from "node:path";
import YAML from "yaml";
import { readUtf8 } from "../utils/fs.js";
import { exportEnterpriseAudit, type EnterpriseAuditExportFormat } from "./enterpriseAuditExport.js";
import {
  auditBinderCreateForApi,
  auditBinderExportExecuteForApi,
  auditBinderExportForApi,
  auditBinderExportRequestForApi,
  auditBinderVerifyForApi,
  auditBindersForApi,
  auditInitForApi,
  auditMapApplyForApi,
  auditMapListForApi,
  auditMapShowForApi,
  auditMapVerifyForApi,
  auditPolicyApplyForApi,
  auditPolicyForApi,
  auditRequestApproveForApi,
  auditRequestCreateForApi,
  auditRequestFulfillForApi,
  auditRequestListForApi,
  auditRequestRejectForApi,
  auditSchedulerEnableForApi,
  auditSchedulerRunNowForApi,
  auditSchedulerStatusForApi
} from "./auditApi.js";
import { verifyAuditWorkspace } from "./binderVerifier.js";

function parseJsonOrYaml(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return YAML.parse(raw) as unknown;
  }
}

function parseRequestedItems(items: string): string[] {
  return items
    .split(",")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
}

export function auditInitCli(workspace: string) {
  return auditInitForApi(workspace);
}

export function auditVerifyPolicyCli(workspace: string) {
  return auditPolicyForApi(workspace).signature;
}

export function auditPrintPolicyCli(workspace: string) {
  return auditPolicyForApi(workspace).policy;
}

export function auditApplyPolicyCli(params: {
  workspace: string;
  file: string;
}) {
  return auditPolicyApplyForApi({
    workspace: params.workspace,
    policy: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
}

export function auditMapListCli(workspace: string) {
  return auditMapListForApi(workspace);
}

export function auditMapShowCli(params: {
  workspace: string;
  id?: "builtin" | "active";
}) {
  return auditMapShowForApi(params);
}

export function auditMapApplyCli(params: {
  workspace: string;
  file: string;
}) {
  return auditMapApplyForApi({
    workspace: params.workspace,
    map: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
}

export function auditMapVerifyCli(workspace: string) {
  return auditMapVerifyForApi(workspace);
}

export function auditBinderCreateCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  outFile?: string;
  requestId?: string;
}) {
  if (params.outFile) {
    return auditBinderExportForApi({
      workspace: params.workspace,
      scopeType: params.scope.toUpperCase(),
      scopeId: params.id,
      outFile: params.outFile,
      requestId: params.requestId
    });
  }
  return auditBinderCreateForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    requestId: params.requestId
  });
}

export function auditBinderExportRequestCli(params: {
  workspace: string;
  agentId: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  outFile?: string;
  requestId?: string;
}) {
  return auditBinderExportRequestForApi({
    workspace: params.workspace,
    agentId: params.agentId,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    outFile: params.outFile,
    requestId: params.requestId
  });
}

export function auditBinderExportExecuteCli(params: {
  workspace: string;
  approvalRequestId: string;
}) {
  return auditBinderExportExecuteForApi(params);
}

export function auditBinderVerifyCli(params: {
  workspace?: string;
  file: string;
  pubkeyPath?: string;
}) {
  return auditBinderVerifyForApi({
    workspace: params.workspace,
    file: params.file,
    publicKeyPath: params.pubkeyPath
  });
}

export function auditBindersCli(workspace: string) {
  return auditBindersForApi(workspace);
}

export function auditRequestCreateCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  items: string;
  requesterUserId: string;
}) {
  return auditRequestCreateForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    requestedItems: parseRequestedItems(params.items),
    requesterUserId: params.requesterUserId
  });
}

export function auditRequestListCli(workspace: string) {
  return auditRequestListForApi(workspace);
}

export function auditRequestApproveCli(params: {
  workspace: string;
  requestId: string;
  actorUserId: string;
  actorUsername: string;
  reason: string;
}) {
  return auditRequestApproveForApi({
    workspace: params.workspace,
    requestId: params.requestId,
    actorUserId: params.actorUserId,
    actorUsername: params.actorUsername,
    actorRoles: ["OWNER"],
    reason: params.reason
  });
}

export function auditRequestRejectCli(params: {
  workspace: string;
  requestId: string;
}) {
  return auditRequestRejectForApi(params);
}

export function auditRequestFulfillCli(params: {
  workspace: string;
  requestId: string;
  outFile?: string;
}) {
  return auditRequestFulfillForApi(params);
}

export function auditSchedulerStatusCli(workspace: string) {
  return auditSchedulerStatusForApi(workspace);
}

export function auditSchedulerRunNowCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
}) {
  return auditSchedulerRunNowForApi({
    workspace: params.workspace,
    scopeType: params.scope?.toUpperCase(),
    scopeId: params.id
  });
}

export function auditSchedulerEnableCli(params: {
  workspace: string;
  enabled: boolean;
}) {
  return auditSchedulerEnableForApi(params);
}

export function auditVerifyWorkspaceCli(workspace: string) {
  return verifyAuditWorkspace({
    workspace
  });
}

export function auditEnterpriseExportCli(params: {
  workspace: string;
  format: EnterpriseAuditExportFormat;
  output: string;
  limit?: number;
}) {
  return exportEnterpriseAudit(params);
}
