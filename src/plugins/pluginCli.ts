import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { loadGatewayConfig } from "../gateway/config.js";
import { resolveAgentId } from "../fleet/paths.js";
import { sha256Hex } from "../utils/hash.js";
import { pluginPack, pluginKeygen, printPluginPackage, verifyPluginPackage } from "./pluginPackage.js";
import {
  initPluginRegistry,
  parsePluginRef,
  publishPluginToRegistry,
  servePluginRegistry,
  verifyPluginRegistry
} from "./pluginRegistry.js";
import { browseRegistry } from "./pluginRegistryClient.js";
import {
  browsePluginRegistryForWorkspace,
  executePluginRequest,
  initPluginWorkspace,
  listInstalledPlugins,
  requestPluginInstall,
  requestPluginRemove,
  verifyPluginWorkspace
} from "./pluginApi.js";
import { loadPluginRegistriesConfig, savePluginRegistriesConfig } from "./pluginStore.js";
import { loadApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";

export function pluginKeygenCli(params: { outDir: string }) {
  return pluginKeygen({ outDir: params.outDir });
}

export function pluginPackCli(params: { inputDir: string; keyPath: string; outFile: string }) {
  return pluginPack({ inputDir: params.inputDir, keyPath: params.keyPath, outFile: params.outFile });
}

export function pluginVerifyCli(params: { file: string; pubkeyPath?: string; trust: TrustContext }) {
  return verifyPluginPackage({
    file: params.file,
    pubkeyPath: params.pubkeyPath,
    trust: params.trust
  });
}

export function pluginPrintCli(file: string, trust: TrustContext) {
  return printPluginPackage(file, trust);
}

export function pluginInitCli(workspace: string) {
  return initPluginWorkspace({ workspace });
}

export function pluginWorkspaceVerifyCli(workspace: string) {
  return verifyPluginWorkspace({ workspace });
}

export function pluginListCli(workspace: string) {
  return listInstalledPlugins(workspace);
}

export function pluginRegistryInitCli(params: {
  dir: string;
  registryId?: string;
  registryName?: string;
}) {
  return initPluginRegistry(params);
}

export function pluginRegistryPublishCli(params: {
  dir: string;
  pluginFile: string;
  registryKeyPath: string;
}) {
  return publishPluginToRegistry(params);
}

export function pluginRegistryVerifyCli(dir: string, trust: TrustContext, pubkeyPath?: string) {
  return verifyPluginRegistry(dir, trust, pubkeyPath);
}

export async function pluginRegistryServeCli(params: { dir: string; port: number; host?: string }) {
  return servePluginRegistry(params);
}

export async function pluginSearchCli(params: { registry: string; query?: string }) {
  // An ad hoc registry URL: only the operator's AMC home trust list can admit its registry.pub (P0-09).
  return browseRegistry({ registryBase: params.registry, query: params.query, trust: loadTrustContext() });
}

export async function pluginInstallCli(params: {
  workspace: string;
  agentId?: string;
  registryId: string;
  pluginRef: string;
  action?: "install" | "upgrade";
}) {
  return requestPluginInstall({
    workspace: params.workspace,
    agentId: resolveAgentId(params.workspace, params.agentId),
    registryId: params.registryId,
    pluginRef: params.pluginRef,
    action: params.action
  });
}

export function pluginRemoveCli(params: {
  workspace: string;
  agentId?: string;
  pluginId: string;
}) {
  return requestPluginRemove({
    workspace: params.workspace,
    agentId: resolveAgentId(params.workspace, params.agentId),
    pluginId: params.pluginId
  });
}

export function pluginExecuteCli(params: { workspace: string; approvalRequestId: string }) {
  return executePluginRequest(params);
}

export async function pluginUpgradeCli(params: {
  workspace: string;
  agentId?: string;
  registryId: string;
  pluginId: string;
  to?: string;
}) {
  const ref = `${params.pluginId}@${params.to ?? "latest"}`;
  return pluginInstallCli({
    workspace: params.workspace,
    agentId: params.agentId,
    registryId: params.registryId,
    pluginRef: ref,
    action: "upgrade"
  });
}

export function pluginRegistryApplyCli(params: {
  workspace: string;
  config: unknown;
}) {
  const schema = z.object({
    pluginRegistries: z.object({
      version: z.literal(1),
      registries: z.array(
        z.object({
          id: z.string().min(1),
          type: z.enum(["file", "http"]),
          base: z.string().min(1),
          pinnedRegistryPubkeyFingerprint: z.string().length(64),
          allowPluginPublishers: z.array(z.string().length(64)).default([]),
          allowRiskCategories: z.array(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])).default(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
          autoUpdate: z.boolean().default(false)
        })
      )
    })
  });
  return savePluginRegistriesConfig(params.workspace, schema.parse(params.config));
}

export function pluginRegistriesListCli(workspace: string) {
  return loadPluginRegistriesConfig(workspace);
}

export function pluginAdapterDefaultsCli(workspace: string) {
  const gateway = loadGatewayConfig(workspace);
  const approval = loadApprovalPolicy(workspace);
  return {
    gatewayRoutes: gateway.routes.map((row) => ({
      prefix: row.prefix,
      upstream: row.upstream
    })),
    securityApprovalRule: approval.approvalPolicy.actionClasses.SECURITY
  };
}

export function pluginRegistryFingerprintFromFile(pubPath: string): string {
  return sha256Hex(Buffer.from(readFileSync(resolve(pubPath), "utf8"), "utf8"));
}

export function normalizePluginRef(raw: string): { pluginId: string; version: string | null } {
  return parsePluginRef(raw);
}
