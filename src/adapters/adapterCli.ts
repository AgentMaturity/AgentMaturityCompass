import { resolve, join } from "node:path";
import { readFileSync, lstatSync, openSync, fstatSync, closeSync, constants } from "node:fs";
import { resolveAgentId } from "../fleet/paths.js";
import { assertOwnerMode } from "../mode/mode.js";
import { listBuiltInAdapters, hasBuiltInAdapter } from "./registry.js";
import { installedPluginsLockSchema } from "../plugins/pluginRegistrySchema.js";
import { pluginInstalledPackagePath } from "../plugins/pluginStore.js";
import { getAdapterDefinition, hasAdapterDefinition, listAvailableAdapters } from "./catalog.js";
import { detectAdapter, type AdapterDetectionResult } from "./adapterDetection.js";
import { initAdaptersConfig, initAdaptersConfigAsync, prepareAdaptersConfigInitializationAsync, loadAdaptersConfig, prepareAgentAdapterProfileAsync, setAgentAdapterProfile, verifyAdaptersConfigSignature } from "./adapterConfigStore.js";
import type { AdapterAgentProfile } from "./adapterConfigSchema.js";
import { runAdapterCommand, initAdapterProjectSample } from "./adapterRunner.js";
import { assembleAdapterEnv } from "./envAssembler.js";
import type { AdapterRunMode } from "./adapterTypes.js";
import { issueAdapterCapabilityReceipt, issueAdapterCapabilityReceiptAsync } from "../passport/adapterCapabilityReceipt.js";
import { readDeepseekHarnessLaunch, verifyDeepseekHarnessLaunch } from "./deepseekHarnessLaunch.js";

export function adaptersInitCli(workspace: string): { configPath: string; sigPath: string } {
  return initAdaptersConfig(workspace);
}

export function adaptersInitCliAsync(workspace: string, beforeSign?: () => void): ReturnType<typeof initAdaptersConfigAsync> { return initAdaptersConfigAsync(workspace, beforeSign); }

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

export function adaptersDetectCli(options?: { workspace?: string; timeoutMs?: number; includePlugins?: boolean }): AdapterDetectionResult[] {
  const workspace = options?.workspace ?? process.cwd();
  const adapters = options?.includePlugins === false ? listBuiltInAdapters() : listAvailableAdapters(workspace);
  return adapters.map((adapter) => detectAdapter(adapter, { timeoutMs: options?.timeoutMs }));
}

export function adaptersCapabilitiesCli(params: {
  workspace: string;
  agentId?: string;
  adapterId: string;
}): ReturnType<typeof issueAdapterCapabilityReceipt> {
  return issueAdapterCapabilityReceipt({
    workspace: params.workspace,
    agentId: params.agentId,
    adapterId: params.adapterId
  });
}

export async function adaptersCapabilitiesCliAsync(params: {
  workspace: string;
  agentId?: string;
  adapterId: string;
}): Promise<Awaited<ReturnType<typeof issueAdapterCapabilityReceiptAsync>>> {
  return issueAdapterCapabilityReceiptAsync({ workspace: params.workspace, agentId: params.agentId, adapterId: params.adapterId });
}

// Only actual package/control inputs consumed by plugin adapter resolution; no extraction or signing in this gate.
function captureSelectionInputs(workspace: string, adapterId: string): () => void {
  if (hasBuiltInAdapter(adapterId)) return () => {};
  const state = (path: string): { bytes: Buffer; mode: number } | null => {
    try {
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.nlink !== 1) throw new Error("plugin adapter input is not a single-link regular file");
        const bytes = readFileSync(fd), current = lstatSync(path);
        if (current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) throw new Error("plugin adapter input changed while reading");
        return { bytes, mode: stat.mode & 0o777 };
      } finally { closeSync(fd); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  const snapshots = new Map(["installed.lock.json", "installed.lock.json.sig", "overrides.yaml", "overrides.yaml.sig"]
    .map(rel => { const path = join(workspace, ".amc", "plugins", rel); return [path, state(path)] as const; }));
  const lock = snapshots.get(join(workspace, ".amc", "plugins", "installed.lock.json"));
  if (lock) for (const entry of installedPluginsLockSchema.parse(JSON.parse(lock.bytes.toString("utf8"))).installed) {
    const path = pluginInstalledPackagePath(workspace, entry.id, entry.version); snapshots.set(path, state(path));
  }
  return () => {
    for (const [path, before] of snapshots) {
      const current = state(path);
      if (before === null ? current !== null : current === null || before.mode !== current.mode || !before.bytes.equals(current.bytes)) {
        throw new Error("plugin adapter selection inputs changed while signing; retry");
      }
    }
  };
}

type ConfigureInput = {
  workspace: string;
  agentId?: string;
  adapterId: string;
  route: string;
  model: string;
  mode: AdapterRunMode;
  launchConfig?: string;
};
function prepareConfiguration(input: ConfigureInput) {
  assertOwnerMode(input.workspace, "adapters configure");
  const params = { ...input }, selectionCurrent = captureSelectionInputs(input.workspace, input.adapterId);
  if (!hasAdapterDefinition(params.workspace, params.adapterId)) {
    throw new Error(`Unknown adapter: ${params.adapterId}`);
  }
  const agentId = resolveAgentId(params.workspace, params.agentId);
  if (params.launchConfig && params.adapterId !== "deepseek-harness") throw new Error("--launch-config is currently supported only by deepseek-harness.");
  const dshLaunch = params.adapterId === "deepseek-harness"
    ? (params.launchConfig ? readDeepseekHarnessLaunch(resolve(params.launchConfig)) : undefined)
    : undefined;
  if (params.adapterId === "deepseek-harness") {
    if (!dshLaunch) throw new Error("DSH requires --launch-config with reviewed local executable/entrypoint hashes.");
    if (params.mode !== "SUPERVISE") throw new Error("DSH capture supports SUPERVISE only; its internal sandbox remains a separate boundary.");
    verifyDeepseekHarnessLaunch(dshLaunch);
  }
  const definition = structuredClone(getAdapterDefinition(params.workspace, params.adapterId));
  selectionCurrent(); // Tie the actual resolved definition to the captured source bytes before any Sign.
  const profile: AdapterAgentProfile = {
    preferredAdapter: definition.id,
    preferredProviderRoute: params.route,
    preferredModel: params.model,
    runMode: params.mode,
    leaseScopes: ["gateway:llm", "toolhub:intent", "toolhub:execute", "proxy:connect", "governor:check", "receipt:verify"],
    routeAllowlist: [params.route],
    modelAllowlist: params.adapterId === "deepseek-harness" ? [params.model] : ["*"],
    ...(dshLaunch ? { deepseekHarnessLaunch: dshLaunch } : {})
  };
  return { params, agentId, profile, recheck() {
    selectionCurrent();
    if (resolveAgentId(params.workspace, params.agentId) !== agentId
      || (dshLaunch && JSON.stringify(readDeepseekHarnessLaunch(resolve(params.launchConfig!))) !== JSON.stringify(dshLaunch))) {
      throw new Error("adapter configuration inputs changed while signing; retry");
    }
    if (dshLaunch) verifyDeepseekHarnessLaunch(dshLaunch);
  } };
}
export function adaptersConfigureCli(params: ConfigureInput): { configPath: string; sigPath: string; agentId: string } {
  const prepared = prepareConfiguration(params);
  return { ...setAgentAdapterProfile(prepared.params.workspace, prepared.agentId, prepared.profile), agentId: prepared.agentId };
}
export async function adaptersConfigureCliAsync(params: ConfigureInput, beforeSign?: () => void): Promise<{ configPath: string; sigPath: string; agentId: string }> {
  return (await prepareAdaptersConfigureForHttp(params, beforeSign)).publish();
}
/** Internal fixed prepared publishers, consumed by the owned route; absent from the root SDK exports. */
export function prepareAdaptersInitForHttp(workspace: string, beforeSign?: () => void) { return prepareAdaptersConfigInitializationAsync(workspace, beforeSign); }
export async function prepareAdaptersConfigureForHttp(params: ConfigureInput, beforeSign?: () => void) {
  const caller = beforeSign; caller?.();
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  const input = prepareConfiguration(params), originalInputs = () => { caller?.(); input.recheck(); };
  const prepared = await prepareAgentAdapterProfileAsync(input.params.workspace, input.agentId, input.profile, originalInputs);
  return Object.freeze({ publish(assertActor: () => void = () => {}) {
    return { ...prepared.publish(assertActor), agentId: input.agentId };
  } });
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
      .filter(([key]) => adapter.id === "deepseek-harness"
        ? ["DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "AMC_MODEL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"].includes(key)
        : key.startsWith("OPENAI_") || key.startsWith("ANTHROPIC_") || key.startsWith("GEMINI_") || key.startsWith("GOOGLE_") || key.startsWith("XAI_") || key.startsWith("OPENROUTER_") || key.startsWith("AMC_") || key === "HTTP_PROXY" || key === "HTTPS_PROXY" || key === "NO_PROXY")
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
