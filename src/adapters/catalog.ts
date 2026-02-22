import { loadInstalledPluginAssets } from "../plugins/pluginLoader.js";
import { adapterDefinitionSchema, type AdapterDefinition } from "./adapterTypes.js";
import { getBuiltInAdapter, hasBuiltInAdapter, listBuiltInAdapters } from "./registry.js";

function cloneAdapter(definition: AdapterDefinition): AdapterDefinition {
  return {
    ...definition,
    envStrategy: {
      ...definition.envStrategy,
      baseUrlEnv: { ...definition.envStrategy.baseUrlEnv },
      apiKeyEnv: { ...definition.envStrategy.apiKeyEnv },
      proxyEnv: { ...definition.envStrategy.proxyEnv }
    },
    commandTemplate: { ...definition.commandTemplate },
    detection: { ...definition.detection }
  };
}

function listPluginAdapters(workspace: string): AdapterDefinition[] {
  try {
    const loaded = loadInstalledPluginAssets(workspace);
    if (!loaded.ok) {
      return [];
    }
    const out: AdapterDefinition[] = [];
    for (const value of loaded.assets.adapters.values()) {
      const parsed = adapterDefinitionSchema.safeParse(value);
      if (parsed.success) {
        out.push(cloneAdapter(parsed.data));
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function listAvailableAdapters(workspace: string): AdapterDefinition[] {
  const combined = new Map<string, AdapterDefinition>();
  for (const builtIn of listBuiltInAdapters()) {
    combined.set(builtIn.id, cloneAdapter(builtIn));
  }
  for (const pluginAdapter of listPluginAdapters(workspace)) {
    combined.set(pluginAdapter.id, cloneAdapter(pluginAdapter));
  }
  return [...combined.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getAdapterDefinition(workspace: string, adapterId: string): AdapterDefinition {
  if (hasBuiltInAdapter(adapterId)) {
    return getBuiltInAdapter(adapterId);
  }
  const fromPlugin = listPluginAdapters(workspace).find((row) => row.id === adapterId);
  if (fromPlugin) {
    return cloneAdapter(fromPlugin);
  }
  throw new Error(`Unknown adapter: ${adapterId}`);
}

export function hasAdapterDefinition(workspace: string, adapterId: string): boolean {
  try {
    void getAdapterDefinition(workspace, adapterId);
    return true;
  } catch {
    return false;
  }
}
