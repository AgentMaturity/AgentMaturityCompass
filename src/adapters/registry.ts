import { adapterDefinitionSchema, type AdapterDefinition } from "./adapterTypes.js";
import { genericCliAdapter } from "./builtins/genericCli.js";
import { claudeCliAdapter } from "./builtins/claudeCli.js";
import { geminiCliAdapter } from "./builtins/geminiCli.js";
import { openclawCliAdapter } from "./builtins/openclawCli.js";
import { openhandsCliAdapter } from "./builtins/openhandsCli.js";
import { autogenCliAdapter } from "./builtins/autogenCli.js";
import { crewaiCliAdapter } from "./builtins/crewaiCli.js";
import { langchainNodeAdapter } from "./builtins/langchainNode.js";
import { langchainPythonAdapter } from "./builtins/langchainPython.js";
import { langgraphPythonAdapter } from "./builtins/langgraphPython.js";
import { llamaindexPythonAdapter } from "./builtins/llamaindexPython.js";
import { semanticKernelAdapter } from "./builtins/semanticKernel.js";
import { openaiAgentsSdkAdapter } from "./builtins/openaiAgentsSdk.js";
import { pythonAmcSdkAdapter } from "./builtins/pythonAmcSdk.js";
import { loadInstalledPluginAssets } from "../plugins/pluginLoader.js";

const BUILTINS = [
  genericCliAdapter,
  claudeCliAdapter,
  geminiCliAdapter,
  openclawCliAdapter,
  openhandsCliAdapter,
  autogenCliAdapter,
  crewaiCliAdapter,
  langchainNodeAdapter,
  langchainPythonAdapter,
  langgraphPythonAdapter,
  llamaindexPythonAdapter,
  semanticKernelAdapter,
  openaiAgentsSdkAdapter,
  pythonAmcSdkAdapter
].map((row) => adapterDefinitionSchema.parse(row));

function cloneAdapter(row: AdapterDefinition): AdapterDefinition {
  return {
    ...row,
    envStrategy: {
      ...row.envStrategy,
      baseUrlEnv: { ...row.envStrategy.baseUrlEnv },
      apiKeyEnv: { ...row.envStrategy.apiKeyEnv },
      proxyEnv: { ...row.envStrategy.proxyEnv }
    },
    commandTemplate: { ...row.commandTemplate },
    detection: { ...row.detection }
  };
}

function listPluginAdapters(workspace: string): AdapterDefinition[] {
  try {
    const loaded = loadInstalledPluginAssets(workspace);
    if (!loaded.ok) {
      return [];
    }
    return Array.from(loaded.assets.adapters.values()).map((row) => adapterDefinitionSchema.parse(row));
  } catch {
    return [];
  }
}

export function listBuiltInAdapters(): AdapterDefinition[] {
  return BUILTINS.map((row) => cloneAdapter(row));
}

export function getBuiltInAdapter(adapterId: string): AdapterDefinition {
  const found = BUILTINS.find((row) => row.id === adapterId);
  if (!found) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }
  return cloneAdapter(found);
}

export function hasBuiltInAdapter(adapterId: string): boolean {
  return BUILTINS.some((row) => row.id === adapterId);
}

export function listAdapters(workspace?: string): AdapterDefinition[] {
  if (!workspace) {
    return listBuiltInAdapters();
  }
  const byId = new Map<string, AdapterDefinition>();
  for (const builtin of BUILTINS) {
    byId.set(builtin.id, cloneAdapter(builtin));
  }
  for (const pluginAdapter of listPluginAdapters(workspace)) {
    byId.set(pluginAdapter.id, cloneAdapter(pluginAdapter));
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function getAdapter(adapterId: string, workspace?: string): AdapterDefinition {
  if (!workspace) {
    return getBuiltInAdapter(adapterId);
  }
  const pluginAdapter = listPluginAdapters(workspace).find((row) => row.id === adapterId);
  if (pluginAdapter) {
    return cloneAdapter(pluginAdapter);
  }
  return getBuiltInAdapter(adapterId);
}

export function hasAdapter(adapterId: string, workspace?: string): boolean {
  if (!workspace) {
    return hasBuiltInAdapter(adapterId);
  }
  return listPluginAdapters(workspace).some((row) => row.id === adapterId) || hasBuiltInAdapter(adapterId);
}
