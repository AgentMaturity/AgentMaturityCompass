import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { resolvePluginInstallPath } from "./pluginIdentifiers.js";
import {
  installedPluginsLockSchema,
  pluginOverridesSchema,
  pluginRegistryConfigSchema,
  type InstalledPluginsLock,
  type PluginOverrides,
  type PluginRegistryConfig
} from "./pluginRegistrySchema.js";

export function pluginsRoot(workspace: string): string {
  return join(workspace, ".amc", "plugins");
}

export function pluginsInstalledDir(workspace: string): string {
  return join(pluginsRoot(workspace), "installed");
}

export function pluginsPendingDir(workspace: string): string {
  return join(pluginsRoot(workspace), "pending");
}

export function pluginsRegistriesPath(workspace: string): string {
  return join(pluginsRoot(workspace), "registries.yaml");
}

export function pluginsOverridesPath(workspace: string): string {
  return join(pluginsRoot(workspace), "overrides.yaml");
}

export function pluginsInstalledLockPath(workspace: string): string {
  return join(pluginsRoot(workspace), "installed.lock.json");
}

export function pluginInstallFolder(workspace: string, pluginId: string, version: string): string {
  return resolvePluginInstallPath({
    installedRoot: pluginsInstalledDir(workspace),
    pluginId,
    version,
  });
}

export function pluginInstalledPackagePath(workspace: string, pluginId: string, version: string): string {
  return join(pluginInstallFolder(workspace, pluginId, version), "package.amcplug");
}

export function ensurePluginsStore(workspace: string): void {
  ensureDir(pluginsRoot(workspace));
  ensureDir(pluginsInstalledDir(workspace));
  ensureDir(pluginsPendingDir(workspace));
}

export function defaultPluginRegistriesConfig(): PluginRegistryConfig {
  return pluginRegistryConfigSchema.parse({
    pluginRegistries: {
      version: 1,
      registries: []
    }
  });
}

export function defaultInstalledPluginsLock(workspace: string): InstalledPluginsLock {
  const hashFor = (rel: string, fallback: string): string => {
    const full = join(workspace, rel);
    if (!pathExists(full)) {
      return sha256Hex(fallback);
    }
    return sha256Hex(readFileSync(full));
  };
  return installedPluginsLockSchema.parse({
    v: 1,
    updatedTs: Date.now(),
    installed: [],
    policySnapshot: {
      actionPolicySha256: hashFor(".amc/action-policy.yaml", "missing-action-policy"),
      toolsSha256: hashFor(".amc/tools.yaml", "missing-tools"),
      budgetsSha256: hashFor(".amc/budgets.yaml", "missing-budgets"),
      approvalPolicySha256: hashFor(".amc/approval-policy.yaml", "missing-approval-policy"),
      opsPolicySha256: hashFor(".amc/ops-policy.yaml", "missing-ops-policy"),
      registriesSha256: hashFor(".amc/plugins/registries.yaml", "missing-plugin-registries")
    }
  });
}

export function savePluginRegistriesConfig(workspace: string, config: PluginRegistryConfig): {
  path: string;
  sigPath: string;
} {
  ensurePluginsStore(workspace);
  const path = pluginsRegistriesPath(workspace);
  writeFileAtomic(path, YAML.stringify(pluginRegistryConfigSchema.parse(config)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function initPluginRegistriesConfig(workspace: string): {
  path: string;
  sigPath: string;
} {
  return savePluginRegistriesConfig(workspace, defaultPluginRegistriesConfig());
}

export function loadPluginRegistriesConfig(workspace: string): PluginRegistryConfig {
  const path = pluginsRegistriesPath(workspace);
  if (!pathExists(path)) {
    return defaultPluginRegistriesConfig();
  }
  return pluginRegistryConfigSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyPluginRegistriesConfig(workspace: string) {
  return verifySignedFileWithAuditor(workspace, pluginsRegistriesPath(workspace));
}

export function saveInstalledPluginsLock(workspace: string, lock: InstalledPluginsLock): {
  path: string;
  sigPath: string;
} {
  ensurePluginsStore(workspace);
  const path = pluginsInstalledLockPath(workspace);
  writeFileAtomic(path, JSON.stringify(installedPluginsLockSchema.parse(lock), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadInstalledPluginsLock(workspace: string): InstalledPluginsLock {
  const path = pluginsInstalledLockPath(workspace);
  if (!pathExists(path)) {
    return defaultInstalledPluginsLock(workspace);
  }
  return installedPluginsLockSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyInstalledPluginsLock(workspace: string) {
  return verifySignedFileWithAuditor(workspace, pluginsInstalledLockPath(workspace));
}

export function loadPluginOverrides(workspace: string): PluginOverrides {
  const path = pluginsOverridesPath(workspace);
  if (!pathExists(path)) {
    return pluginOverridesSchema.parse({
      overrides: {
        version: 1,
        allow: []
      }
    });
  }
  return pluginOverridesSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function savePluginOverrides(workspace: string, overrides: PluginOverrides): {
  path: string;
  sigPath: string;
} {
  ensurePluginsStore(workspace);
  const path = pluginsOverridesPath(workspace);
  writeFileAtomic(path, YAML.stringify(pluginOverridesSchema.parse(overrides)), 0o644);
  return {
    path,
    sigPath: signFileWithAuditor(workspace, path)
  };
}

export function verifyPluginOverrides(workspace: string) {
  const path = pluginsOverridesPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function pendingActionPath(workspace: string, requestId: string): string {
  return join(pluginsPendingDir(workspace), `${requestId}.json`);
}

export function pendingPackagePath(workspace: string, requestId: string): string {
  return join(pluginsPendingDir(workspace), `${requestId}.amcplug`);
}

export function resolvePluginRegistryBase(base: string, workspace: string): string {
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return base;
  }
  return resolve(workspace, base);
}

