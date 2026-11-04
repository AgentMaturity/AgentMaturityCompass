import type { AuditPublicationOptions } from "./binderPublication.js";
import { captureOrgFiles, orgPairBytes, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { auditPolicyPath } from "./auditPolicyStore.js";
import { auditMapActivePath } from "./auditMapStore.js";
import { physicalPathWithMissingSuffix, safeIdSchema } from "../utils/pathSafety.js";
import { cliInitiator } from "../approvals/approvalEngine.js";
import { assertOwnerMode } from "../mode/mode.js";
import { resolve } from "node:path";
import YAML from "yaml";
import { readUtf8 } from "../utils/fs.js";
import type { TrustContext } from "../trust/trustContext.js";
import { exportEnterpriseAudit, type EnterpriseAuditExportFormat } from "./enterpriseAuditExport.js";
import {
  auditBinderCreateForApi,
  auditBinderExportExecuteForApi,
  auditBinderExportForApi,
  auditBinderExportRequestForApi,
  auditBinderVerifyFile,
  auditBindersForApi,
  auditInitForApi, auditInitForApiAsync,
  auditMapApplyForApi, auditMapApplyForApiAsync,
  auditMapListForApi, auditMapListForApiAsync,
  auditMapShowForApi, auditMapShowForApiAsync,
  auditMapVerifyForApi,
  auditPolicyApplyForApi, auditPolicyApplyForApiAsync,
  auditPolicyForApi, auditPolicyForApiAsync,
  auditRequestApproveForApi,
  auditRequestCreateForApi, auditRequestCreateForApiAsync,
  auditRequestFulfillForApi,
  auditRequestListForApi,
  auditRequestRejectForApi, auditRequestRejectForApiAsync,
  auditSchedulerEnableForApi, auditSchedulerEnableForApiAsync,
  auditSchedulerRunNowForApi,
  auditSchedulerStatusForApi
} from "./auditApi.js";
import { verifyAuditWorkspace } from "./binderVerifier.js";

/** Reuse the registered operations owner gate; commandPath is error context only, never an authority choice. */
export function assertAuditCliOwnerMode(workspace: string, commandPath: string): void {
  try { assertOwnerMode(workspace, "ops init"); }
  catch (cause) {
    if (!(cause instanceof Error) || cause.message !== "Command 'ops init' is blocked in agent mode. Switch to owner mode with: amc mode owner") throw cause;
    throw new Error(`Command '${commandPath}' is blocked in agent mode. Switch to owner mode with: amc mode owner`, { cause });
  }
}

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

export function auditApplyPolicyCli(params: {
  workspace: string;
  file: string;
}) {
  return auditPolicyApplyForApi({
    workspace: params.workspace,
    policy: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
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
}, options: AuditPublicationOptions = {}) {
  if (params.outFile) {
    return auditBinderExportForApi({
      workspace: params.workspace,
      scopeType: params.scope.toUpperCase(),
      scopeId: params.id,
      outFile: params.outFile,
      requestId: params.requestId
    }, options);
  }
  return auditBinderCreateForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.id,
    requestId: params.requestId
  }, options);
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
    initiator: cliInitiator(),
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
}, options: AuditPublicationOptions = {}) {
  return auditBinderExportExecuteForApi(params, options);
}

export function auditBinderVerifyCli(params: {
  workspace?: string;
  file: string;
  pubkeyPath?: string;
  trust: TrustContext;
}) {
  return auditBinderVerifyFile({
    workspace: params.workspace,
    file: params.file,
    publicKeyPath: params.pubkeyPath,
    trust: params.trust
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
}, options: AuditPublicationOptions = {}) {
  return auditRequestFulfillForApi(params, options);
}

export function auditSchedulerStatusCli(workspace: string) {
  return auditSchedulerStatusForApi(workspace);
}

export function auditSchedulerRunNowCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
}, options: AuditPublicationOptions = {}) {
  return auditSchedulerRunNowForApi({
    workspace: params.workspace,
    scopeType: params.scope?.toUpperCase(),
    scopeId: params.id
  }, options);
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

export async function auditSchedulerEnableCliAsync(params: Parameters<typeof auditSchedulerEnableCli>[0], options: AuditPublicationOptions = {}) {
  return auditSchedulerEnableForApiAsync(params, options);
}

export async function auditInitCliAsync(workspace: string) {
  const beforePublish = () => assertAuditCliOwnerMode(workspace, "audit init"); beforePublish();
  return auditInitForApiAsync(workspace, { beforePublish });
}
export async function auditVerifyPolicyCliAsync(workspace: string) { return (await auditPolicyForApiAsync(workspace)).signature; }
export async function auditPrintPolicyCliAsync(workspace: string) { return (await auditPolicyForApiAsync(workspace)).policy; }
export async function auditMapListCliAsync(workspace: string) { return auditMapListForApiAsync(workspace); }
export async function auditMapShowCliAsync(params: Parameters<typeof auditMapShowCli>[0]) { return auditMapShowForApiAsync({ ...params }); }
export async function auditApplyPolicyCliAsync(params: Parameters<typeof auditApplyPolicyCli>[0]) {
  const input = { ...params }; assertAuditCliOwnerMode(input.workspace, "audit policy apply");
  const file = resolve(input.file), before = captureOrgFiles([file]), bytes = orgPairBytes(before, file), sameTarget = [auditPolicyPath(input.workspace), `${auditPolicyPath(input.workspace)}.sig`].some(path => physicalPathWithMissingSuffix(path) === physicalPathWithMissingSuffix(file));
  if (bytes === null) throw new Error("audit policy input file is missing");
  const policy = parseJsonOrYaml(bytes.toString("utf8")), beforePublish = () => { assertAuditCliOwnerMode(input.workspace, "audit policy apply"); if (!sameTarget) assertOrgPairsCurrent(before); };
  beforePublish(); return auditPolicyApplyForApiAsync({ workspace: input.workspace, policy }, { beforePublish, assertPreparationInputsCurrent() { assertOrgPairsCurrent(before); } });
}
export async function auditMapApplyCliAsync(params: Parameters<typeof auditMapApplyCli>[0]) {
  const input = { ...params }; assertAuditCliOwnerMode(input.workspace, "audit map apply");
  const file = resolve(input.file), before = captureOrgFiles([file]), bytes = orgPairBytes(before, file), sameTarget = [auditMapActivePath(input.workspace), `${auditMapActivePath(input.workspace)}.sig`].some(path => physicalPathWithMissingSuffix(path) === physicalPathWithMissingSuffix(file));
  if (bytes === null) throw new Error("audit map input file is missing");
  const map = parseJsonOrYaml(bytes.toString("utf8")), beforePublish = () => { assertAuditCliOwnerMode(input.workspace, "audit map apply"); if (!sameTarget) assertOrgPairsCurrent(before); };
  beforePublish(); return auditMapApplyForApiAsync({ workspace: input.workspace, map }, { beforePublish, assertPreparationInputsCurrent() { assertOrgPairsCurrent(before); } });
}

export function auditRequestCreateCliAsync(params: Parameters<typeof auditRequestCreateCli>[0], options: AuditPublicationOptions = {}) {
  const input = { ...params, workspace: resolve(params.workspace) };
  return auditRequestCreateForApiAsync({ workspace: input.workspace, scopeType: input.scope.toUpperCase(), scopeId: input.id,
    requestedItems: parseRequestedItems(input.items), requesterUserId: input.requesterUserId }, { ...options });
}
export function auditRequestRejectCliAsync(params: Parameters<typeof auditRequestRejectCli>[0], options: AuditPublicationOptions = {}) {
  const requestId = safeIdSchema.parse(params.requestId), input = { ...params, requestId, workspace: resolve(params.workspace) }, caller = options.beforePublish;
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  const beforePublish = () => { if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); caller?.(); if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing"); assertAuditCliOwnerMode(input.workspace, "audit request reject"); };
  beforePublish(); return auditRequestRejectForApiAsync(input, { ...options, beforePublish });
}
