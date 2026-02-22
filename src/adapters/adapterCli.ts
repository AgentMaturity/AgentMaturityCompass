import { resolve } from "node:path";
import { resolveAgentId } from "../fleet/paths.js";
import { listBuiltInAdapters } from "./registry.js";
import { getAdapterDefinition, hasAdapterDefinition, listAvailableAdapters } from "./catalog.js";
import { detectAdapter, type AdapterDetectionResult } from "./adapterDetection.js";
import { initAdaptersConfig, loadAdaptersConfig, setAgentAdapterProfile, verifyAdaptersConfigSignature } from "./adapterConfigStore.js";
import { runAdapterCommand, initAdapterProjectSample } from "./adapterRunner.js";
import { assembleAdapterEnv } from "./envAssembler.js";
import type { AdapterRunMode } from "./adapterTypes.js";

export function adaptersInitCli(workspace: string): { configPath: string; sigPath: string } {
  return initAdaptersConfig(workspace);
}

export function adaptersVerifyCli(workspace: string): ReturnType<typeof verifyAdaptersConfigSignature> {
  return verifyAdaptersConfigSignature(workspace);
}

export function adaptersListCli(workspace: string): {
  builtins: ReturnType<typeof listBuiltInAdapters>;
  available: ReturnType<typeof listAvailableAdapters>;
  configured: Array<{ agentId: string; adapterId: string; route: string; model: string; mode: AdapterRunMode }>;
} {
  const config = loadAdaptersConfig(workspace);
  const configured = Object.entries(config.adapters.perAgent)
    .map(([agentId, row]) => ({
      agentId,
      adapterId: row.preferredAdapter,
      route: row.preferredProviderRoute,
      model: row.preferredModel,
      mode: row.runMode
    }))
    .sort((a, b) => a.agentId.localeCompare(b.agentId));
  return {
    builtins: listBuiltInAdapters(),
    available: listAvailableAdapters(workspace),
    configured
  };
}

export function adaptersDetectCli(options?: { workspace?: string; timeoutMs?: number }): AdapterDetectionResult[] {
  const workspace = options?.workspace ?? process.cwd();
  return listAvailableAdapters(workspace).map((adapter) => detectAdapter(adapter, { timeoutMs: options?.timeoutMs }));
}

export function adaptersConfigureCli(params: {
  workspace: string;
  agentId?: string;
  adapterId: string;
  route: string;
  model: string;
  mode: AdapterRunMode;
}): { configPath: string; sigPath: string; agentId: string } {
  if (!hasAdapterDefinition(params.workspace, params.adapterId)) {
    throw new Error(`Unknown adapter: ${params.adapterId}`);
  }
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const out = setAgentAdapterProfile(params.workspace, agentId, {
    preferredAdapter: params.adapterId,
    preferredProviderRoute: params.route,
    preferredModel: params.model,
    runMode: params.mode,
    leaseScopes: ["gateway:llm", "toolhub:intent", "toolhub:execute", "proxy:connect", "governor:check", "receipt:verify"],
    routeAllowlist: [params.route],
    modelAllowlist: ["*"]
  });
  return {
    ...out,
    agentId
  };
}

export async function adaptersRunCli(params: {
  workspace: string;
  agentId?: string;
  adapterId?: string;
  workOrderId?: string;
  mode?: AdapterRunMode;
  command: string[];
}): Promise<Awaited<ReturnType<typeof runAdapterCommand>>> {
  return runAdapterCommand({
    workspace: params.workspace,
    agentId: params.agentId,
    adapterId: params.adapterId,
    workOrderId: params.workOrderId,
    mode: params.mode,
    command: params.command
  });
}

export function adaptersEnvCli(params: {
  workspace: string;
  agentId?: string;
  adapterId?: string;
}): {
  agentId: string;
  adapterId: string;
  routeUrl: string;
  model: string;
  lines: string[];
} {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const config = loadAdaptersConfig(params.workspace);
  const profile = config.adapters.perAgent[agentId];
  const adapterId = params.adapterId ?? profile?.preferredAdapter ?? "generic-cli";
  const route = profile?.preferredProviderRoute ?? "/openai";
  const model = profile?.preferredModel ?? config.adapters.defaults.modelDefault;
  const adapter = getAdapterDefinition(params.workspace, adapterId);
  const env = assembleAdapterEnv({
    adapter,
    lease: "${AMC_LEASE}",
    agentId,
    gatewayBase: config.adapters.defaults.gatewayBase,
    proxyBase: config.adapters.defaults.proxyBase,
    providerRoute: route,
    model,
    includeProxyEnv: true
  });
  const lines = [
    `export AMC_AGENT_ID=${agentId}`,
    "export AMC_LEASE=<obtain-with-amc-lease-issue-or-adapters-run>",
    ...Object.entries(env)
      .filter(([key]) => key.startsWith("OPENAI_") || key.startsWith("ANTHROPIC_") || key.startsWith("GEMINI_") || key.startsWith("GOOGLE_") || key.startsWith("XAI_") || key.startsWith("OPENROUTER_") || key.startsWith("AMC_") || key === "HTTP_PROXY" || key === "HTTPS_PROXY" || key === "NO_PROXY")
      .map(([key, value]) => `export ${key}=${String(value)}`)
  ];
  return {
    agentId,
    adapterId,
    routeUrl: `${config.adapters.defaults.gatewayBase}${route}`,
    model,
    lines
  };
}

export function adaptersInitProjectCli(params: {
  workspace: string;
  adapterId: string;
  agentId?: string;
  route?: string;
}): { dir: string; entry: string } {
  const out = initAdapterProjectSample({
    workspace: params.workspace,
    adapterId: params.adapterId,
    agentId: params.agentId,
    providerRoute: params.route
  });
  return {
    dir: resolve(out.dir),
    entry: resolve(out.entry)
  };
}
