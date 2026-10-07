import { resolve } from "node:path";
import { benchArtifactSchema } from "./benchSchema.js";
import type { BenchRegistryConfig } from "./benchRegistrySchema.js";
import { createBenchArtifact, inspectBenchArtifact, listExportedBenchArtifacts } from "./benchArtifact.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";
import type { TrustContext } from "../trust/trustContext.js";
import { initBenchRegistry, publishBenchToRegistry, serveBenchRegistry, verifyBenchRegistry } from "./benchRegistryServer.js";
import { browseBenchRegistry, importBenchFromRegistry, listImportedBenchArtifacts } from "./benchRegistryClient.js";
import {
  benchPolicyForApi,
  benchInitForApi,
  benchCompareForApi,
  benchComparisonLatestForApi,
  benchPublishExecuteForApi,
  benchPublishRequestForApi,
  benchRegistriesForApi,
  benchRegistryApplyForApi
} from "./benchApi.js";
import { loadBenchPolicy } from "./benchPolicyStore.js";
import { benchPolicySchema, type BenchPolicy } from "./benchPolicySchema.js";

export function benchInitCli(workspace: string) {
  return benchInitForApi(workspace);
}

export function benchVerifyPolicyCli(workspace: string) {
  return benchPolicyForApi(workspace).signature;
}

export function benchPrintPolicyCli(workspace: string): BenchPolicy {
  return loadBenchPolicy(workspace);
}

export function benchCreateCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id?: string;
  outFile: string;
  windowDays?: number;
  named?: boolean;
  labels?: {
    industry?: "software" | "fintech" | "health" | "manufacturing" | "other";
    agentType?: "code-agent" | "support-agent" | "ops-agent" | "research-agent" | "sales-agent" | "other";
    deployment?: "single" | "host" | "k8s" | "compose";
  };
}) {
  return createBenchArtifact({
    workspace: params.workspace,
    scope: params.scope,
    id: params.id,
    outFile: resolve(params.workspace, params.outFile),
    windowDays: params.windowDays,
    named: params.named,
    labels: params.labels
  });
}

export function benchVerifyCli(params: {
  file: string;
  pubkeyPath?: string;
  trust: TrustContext;
}) {
  return verifyBenchArtifactFile({
    file: resolve(params.file),
    publicKeyPath: params.pubkeyPath ? resolve(params.pubkeyPath) : undefined,
    trust: params.trust
  });
}

export function benchPrintCli(file: string) {
  return inspectBenchArtifact(resolve(file));
}

export function benchRegistryInitCli(params: {
  dir: string;
  registryId?: string;
  registryName?: string;
}) {
  return initBenchRegistry({
    dir: resolve(params.dir),
    registryId: params.registryId,
    registryName: params.registryName
  });
}

export function benchRegistryPublishCli(params: {
  dir: string;
  benchFile: string;
  registryKeyPath: string;
  version?: string;
}) {
  return publishBenchToRegistry({
    dir: resolve(params.dir),
    benchFile: resolve(params.benchFile),
    registryKeyPath: resolve(params.registryKeyPath),
    version: params.version
  });
}

export function benchRegistryVerifyCli(dir: string, trust: TrustContext, pubkeyPath?: string) {
  return verifyBenchRegistry(resolve(dir), trust, pubkeyPath);
}

export async function benchRegistryServeCli(params: {
  dir: string;
  port: number;
  host?: string;
}) {
  return serveBenchRegistry({
    dir: resolve(params.dir),
    port: params.port,
    host: params.host
  });
}

export async function benchSearchCli(params: {
  registry: string;
  query?: string;
}) {
  return browseBenchRegistry({
    base: params.registry,
    query: params.query
  });
}

export async function benchImportCli(params: {
  workspace: string;
  registryId: string;
  benchRef: string;
}) {
  return importBenchFromRegistry(params);
}

export function benchListImportsCli(workspace: string) {
  return listImportedBenchArtifacts(workspace);
}

export function benchListExportsCli(workspace: string) {
  return listExportedBenchArtifacts(workspace);
}

export function benchCompareCli(params: {
  workspace: string;
  scope: "workspace" | "node" | "agent";
  id: string;
  against?: "imported" | `registry:${string}`;
}) {
  return benchCompareForApi(params);
}

export function benchComparisonLatestCli(workspace: string) {
  return benchComparisonLatestForApi(workspace);
}

export function benchRegistriesCli(workspace: string) {
  return benchRegistriesForApi(workspace);
}

export function benchRegistriesApplyCli(params: {
  workspace: string;
  config: BenchRegistryConfig;
}) {
  return benchRegistryApplyForApi({
    workspace: params.workspace,
    config: params.config
  });
}

export function benchPublishRequestCli(params: {
  workspace: string;
  agentId: string;
  file: string;
  registryDir: string;
  registryKeyPath: string;
  explicitOwnerAck: boolean;
}) {
  return benchPublishRequestForApi({
    workspace: params.workspace,
    agentId: params.agentId,
    file: resolve(params.file),
    registryDir: resolve(params.registryDir),
    registryKeyPath: resolve(params.registryKeyPath),
    explicitOwnerAck: params.explicitOwnerAck
  });
}

export function benchPublishExecuteCli(params: {
  workspace: string;
  approvalRequestId: string;
}) {
  return benchPublishExecuteForApi(params);
}

export function parseBenchPolicy(input: string): BenchPolicy {
  return benchPolicySchema.parse(JSON.parse(input) as unknown);
}

export function parseBenchArtifact(input: string) {
  return benchArtifactSchema.parse(JSON.parse(input) as unknown);
}
