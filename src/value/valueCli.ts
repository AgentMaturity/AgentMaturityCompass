import { assertOwnerMode } from "../mode/mode.js";
import { resolve } from "node:path";
import YAML from "yaml";
import { readUtf8 } from "../utils/fs.js";
import {
  importValueCsvForApi,
  ingestValueWebhookForApi,
  valueContractApplyForApi,
  valueContractForApi,
  valueContractInitForApi,
  valueInitForApi,
  valuePolicyApplyForApi,
  valuePolicyDefaultsForApi,
  valuePolicyForApi,
  valueReportForApi,
  valueSchedulerRunNowForApi,
  valueSchedulerSetEnabledForApi,
  valueSchedulerStatusForApi,
  valueSnapshotLatestForApi
} from "./valueApi.js";
import { ingestValueWebhookForApiAsync, importValueCsvForApiAsync, valueInitForApiAsync, valuePolicyForApiAsync, valuePolicyApplyForApiAsync, valueContractInitForApiAsync, valueContractApplyForApiAsync, valueSchedulerSetEnabledForApiAsync } from "./valueApi.js";
import { verifyValueWorkspace } from "./valueVerifier.js";

function parseJsonOrYaml(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return YAML.parse(raw) as unknown;
  }
}

export function valuePolicyApplyCli(params: {
  workspace: string;
  file: string;
}) {
  return valuePolicyApplyForApi({
    workspace: params.workspace,
    policy: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
}

export function valueContractInitCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  type: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
  deployment?: "single" | "host" | "k8s" | "compose";
}) {
  return valueContractInitForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    type: params.type,
    deployment: params.deployment
  });
}

export function valueContractApplyCli(params: {
  workspace: string;
  file: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
}) {
  return valueContractApplyForApi({
    workspace: params.workspace,
    contract: parseJsonOrYaml(readUtf8(resolve(params.file))),
    scopeType: params.scope?.toUpperCase(),
    scopeId: params.id
  });
}

export function valueContractPrintCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
}) {
  return valueContractForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
    scopeId: params.scope === "workspace" ? "workspace" : params.id
  });
}

export function valueContractVerifyCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
}) {
  return valueContractForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
    scopeId: params.scope === "workspace" ? "workspace" : params.id
  }).signature;
}

/** What `amc value ingest|import --attested` prints before exiting 2. */
export const VALUE_ATTESTED_REMOVED =
  "--attested was removed in 2.0.0: value events from files and webhooks are SELF_REPORTED, because nothing verifies a third-party signature on them. See docs/EVIDENCE_TRUST.md.";

export function valueIngestWebhookCli(params: {
  workspace: string;
  file: string;
}) {
  return ingestValueWebhookForApi({
    workspace: params.workspace,
    payload: parseJsonOrYaml(readUtf8(resolve(params.file)))
  });
}

export function valueImportCsvCli(params: {
  workspace: string;
  file: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  kpiId: string;
}) {
  return importValueCsvForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT",
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    kpiId: params.kpiId,
    csvText: readUtf8(resolve(params.file))
  });
}

export async function valueSnapshotCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  windowDays?: number;
}) {
  params = { ...params };
  return await valueSnapshotLatestForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  }, { beforePublish: () => assertOwnerMode(params.workspace, "value snapshot") });
}

export async function valueReportCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  windowDays?: number;
}) {
  params = { ...params };
  return await valueReportForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  }, { beforePublish: () => assertOwnerMode(params.workspace, "value report") });
}

export function valueSchedulerStatusCli(workspace: string) {
  return valueSchedulerStatusForApi(workspace);
}

export async function valueSchedulerRunNowCli(params: {
  workspace: string;
  scope?: "workspace" | "node" | "agent";
  id?: string;
  windowDays?: number;
}) {
  params = { ...params };
  return await valueSchedulerRunNowForApi({
    workspace: params.workspace,
    scopeType: params.scope?.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  }, { beforePublish: () => assertOwnerMode(params.workspace, "value scheduler run-now") });
}

export function valueVerifyWorkspaceCli(workspace: string) {
  return verifyValueWorkspace(workspace);
}

export function valuePolicyDefaultCli() {
  return valuePolicyDefaultsForApi();
}

export async function valueInitCliAsync(workspace: string) { return valueInitForApiAsync(workspace, { beforePublish: () => assertOwnerMode(workspace, "value init") }); }
export async function valuePolicyPrintCliAsync(workspace: string) { return (await valuePolicyForApiAsync(workspace)).policy; }
export async function valueVerifyPolicyCliAsync(workspace: string) { return (await valuePolicyForApiAsync(workspace)).signature; }
export async function valuePolicyApplyCliAsync(params: Parameters<typeof valuePolicyApplyCli>[0]) {
  const workspace = params.workspace, policy = parseJsonOrYaml(readUtf8(resolve(params.file))); return valuePolicyApplyForApiAsync({ workspace, policy }, { beforePublish: () => assertOwnerMode(workspace, "value policy apply") });
}
export async function valueContractInitCliAsync(params: Parameters<typeof valueContractInitCli>[0]) {
  const own = { ...params }; return valueContractInitForApiAsync({ workspace: own.workspace, scopeType: own.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT", scopeId: own.scope === "workspace" ? "workspace" : own.id, type: own.type, deployment: own.deployment }, { beforePublish: () => assertOwnerMode(own.workspace, "value contract init") });
}
export async function valueContractApplyCliAsync(params: Parameters<typeof valueContractApplyCli>[0]) {
  const own = { ...params }, contract = parseJsonOrYaml(readUtf8(resolve(own.file))); return valueContractApplyForApiAsync({ workspace: own.workspace, contract, scopeType: own.scope?.toUpperCase(), scopeId: own.id }, { beforePublish: () => assertOwnerMode(own.workspace, "value contract apply") });
}
export async function valueSchedulerEnableCliAsync(params: { workspace: string; enabled: boolean }) {
  const own = { ...params }; return valueSchedulerSetEnabledForApiAsync(own, { beforePublish: () => assertOwnerMode(own.workspace, own.enabled ? "value scheduler enable" : "value scheduler disable") });
}

export async function valueIngestWebhookCliAsync(params: Parameters<typeof valueIngestWebhookCli>[0]) {
  const own = { ...params }, payload = parseJsonOrYaml(readUtf8(resolve(own.file)));
  return ingestValueWebhookForApiAsync({ workspace: own.workspace, payload }, { beforePublish: () => assertOwnerMode(own.workspace, "value ingest") });
}
export async function valueImportCsvCliAsync(params: Parameters<typeof valueImportCsvCli>[0]) {
  const own = { ...params }, csvText = readUtf8(resolve(own.file));
  return importValueCsvForApiAsync({ workspace: own.workspace, scopeType: own.scope.toUpperCase() as "WORKSPACE" | "NODE" | "AGENT", scopeId: own.scope === "workspace" ? "workspace" : own.id, kpiId: own.kpiId, csvText }, { beforePublish: () => assertOwnerMode(own.workspace, "value import") });
}
