import { join } from "node:path";
import { readFileSync } from "node:fs";
import { pluginManifestSchema } from "./pluginManifestSchema.js";
import { installedPluginTrust, verifyPluginPackage } from "./pluginPackage.js";
import { installedPluginsLockSchema } from "./pluginRegistrySchema.js";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { verifySignedFileWithAuditor } from "../org/orgSigner.js";
import { sha256Hex } from "../utils/hash.js";

export interface InstalledPluginIntegrityResult {
  ok: boolean;
  errors: string[];
  lockValid: boolean;
  installedCount: number;
}

function pluginsRoot(workspace: string): string {
  return join(workspace, ".amc", "plugins");
}

function installedLockPath(workspace: string): string {
  return join(pluginsRoot(workspace), "installed.lock.json");
}

export function verifyInstalledPluginsIntegrity(workspace: string): InstalledPluginIntegrityResult {
  const root = pluginsRoot(workspace);
  ensureDir(root);
  const lockPath = installedLockPath(workspace);
  const lockSig = verifySignedFileWithAuditor(workspace, lockPath);
  const errors: string[] = [];
  if (!lockSig.valid) {
    errors.push(`installed lock signature invalid: ${lockSig.reason ?? "unknown"}`);
    return {
      ok: false,
      errors,
      lockValid: false,
      installedCount: 0
    };
  }
  let lock: ReturnType<typeof installedPluginsLockSchema.parse>;
  try {
    lock = installedPluginsLockSchema.parse(JSON.parse(readUtf8(lockPath)) as unknown);
  } catch (error) {
    return {
      ok: false,
      errors: [`invalid installed lock payload: ${String(error)}`],
      lockValid: true,
      installedCount: 0
    };
  }
  for (const item of lock.installed) {
    const pluginFile = join(root, "installed", item.id, item.version, "package.amcplug");
    if (!pathExists(pluginFile)) {
      errors.push(`missing installed package: ${item.id}@${item.version}`);
      continue;
    }
    const digest = sha256Hex(readFileSync(pluginFile));
    if (digest !== item.sha256) {
      errors.push(`installed package sha mismatch for ${item.id}@${item.version}`);
      continue;
    }
    const verify = verifyPluginPackage({ file: pluginFile, trust: installedPluginTrust(workspace, item.publisherFingerprint) });
    if (!verify.ok || !verify.manifest) {
      errors.push(`installed plugin verification failed for ${item.id}@${item.version}: ${verify.errors.join("; ")}`);
      continue;
    }
    const parsed = pluginManifestSchema.parse(verify.manifest);
    if (parsed.plugin.id !== item.id || parsed.plugin.version !== item.version) {
      errors.push(`installed lock mismatch for ${item.id}@${item.version}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    lockValid: true,
    installedCount: lock.installed.length
  };
}
