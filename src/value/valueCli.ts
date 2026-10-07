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
import { verifyValueWorkspace } from "./valueVerifier.js";

function parseJsonOrYaml(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return YAML.parse(raw) as unknown;
  }
}

export function valueInitCli(workspace: string) {
  return valueInitForApi(workspace);
}

export function valueVerifyPolicyCli(workspace: string) {
  return valuePolicyForApi(workspace).signature;
}

export function valuePolicyPrintCli(workspace: string) {
  return valuePolicyForApi(workspace).policy;
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
  return await valueSnapshotLatestForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  });
}

export async function valueReportCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  windowDays?: number;
}) {
  return await valueReportForApi({
    workspace: params.workspace,
    scopeType: params.scope.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  });
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
  return await valueSchedulerRunNowForApi({
    workspace: params.workspace,
    scopeType: params.scope?.toUpperCase(),
    scopeId: params.scope === "workspace" ? "workspace" : params.id,
    windowDays: params.windowDays
  });
}

export function valueSchedulerEnableCli(params: {
  workspace: string;
  enabled: boolean;
}) {
  return valueSchedulerSetEnabledForApi(params);
}

export function valueVerifyWorkspaceCli(workspace: string) {
  return verifyValueWorkspace(workspace);
}

export function valuePolicyDefaultCli() {
  return valuePolicyDefaultsForApi();
}
