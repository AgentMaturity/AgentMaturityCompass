import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import semver from "semver";
import { sha256Hex } from "../utils/hash.js";
import { inspectTarGzipArchive } from "../security/safeTarArchive.js";
import { extractPluginPackage, installedPluginTrust, verifyPluginPackage } from "./pluginPackage.js";
import { installedPluginsLockSchema } from "./pluginRegistrySchema.js";
import { pluginInstalledPackagePath, pluginsInstalledLockPath } from "./pluginStore.js";
import { NATIVE_EXECUTABLE_LIMITS, NativeExecutableError, nativeExecutableReference, type NativeExecutableReference } from "./nativeExecutableSchema.js";
import { readNativeExecutableFile, readNativeExecutableSignedJson } from "./nativeExecutableSource.js";

export interface NativeExecutableModuleSnapshot {
  readonly reference: NativeExecutableReference;
  readonly source: string;
  readonly moduleSha256: string;
}

/** Rechecked during execution as well: uninstall, repinning or an invalid lock revokes the load. */
export function assertNativeExecutableInstalled(workspace: string, selected: NativeExecutableReference): Buffer {
  const reference = nativeExecutableReference(selected);
  workspace = resolve(workspace);
  const signed = readNativeExecutableSignedJson(workspace, pluginsInstalledLockPath(workspace), NATIVE_EXECUTABLE_LIMITS.policyBytes);
  const lock = installedPluginsLockSchema.safeParse(signed.value);
  if (!lock.success) throw new NativeExecutableError("EXECUTABLE_LOCK_INVALID", "The signed plugin installation lock has an unsupported shape.");
  const matches = lock.data.installed.filter(item => item.id === reference.pluginId);
  if (matches.length !== 1 || matches[0]!.version !== reference.version
    || matches[0]!.sha256 !== reference.packageSha256 || matches[0]!.publisherFingerprint !== reference.publisherFingerprint) {
    throw new NativeExecutableError("EXECUTABLE_NOT_INSTALLED", "The exact reviewed plugin version, package digest and publisher are not admitted by the signed installation lock.");
  }
  const bytes = readNativeExecutableFile(workspace,
    pluginInstalledPackagePath(workspace, reference.pluginId, reference.version), NATIVE_EXECUTABLE_LIMITS.packageBytes);
  if (sha256Hex(bytes) !== reference.packageSha256) {
    throw new NativeExecutableError("EXECUTABLE_PACKAGE_CHANGED", "The installed executable package differs from its reviewed pin. Explicit review and reload are required.");
  }
  return bytes;
}

/** Verify and extract the SAME private archive snapshot, not two reads of a mutable installed path. */
export function readInstalledNativeExecutable(workspace: string, selected: NativeExecutableReference): NativeExecutableModuleSnapshot {
  const reference = nativeExecutableReference(selected);
  const bytes = assertNativeExecutableInstalled(workspace, reference);
  const temporary = mkdtempSync(join(realpathSync(tmpdir()), "amc-executable-verify-"));
  try {
    const archive = join(temporary, "package.amcplug");
    writeFileSync(archive, bytes, { flag: "wx", mode: 0o600 });
    // Native executable admission is narrower than the general content-bundle
    // limit. Bound decompression before the existing verifier extracts files.
    inspectTarGzipArchive({ file: archive, label: "native executable plugin archive", limits: {
      maxEntries: 512, maxCompressedBytes: NATIVE_EXECUTABLE_LIMITS.packageBytes,
      maxEntryBytes: 1_048_576, maxTotalBytes: NATIVE_EXECUTABLE_LIMITS.packageBytes, maxPathBytes: 512
    } });
    const verified = verifyPluginPackage({ file: archive, trust: installedPluginTrust(workspace, reference.publisherFingerprint) });
    if (!verified.ok || !verified.manifest || verified.publisherFingerprint !== reference.publisherFingerprint
      || verified.manifest.plugin.id !== reference.pluginId || verified.manifest.plugin.version !== reference.version) {
      throw new NativeExecutableError("EXECUTABLE_SIGNATURE_INVALID", "The executable package does not have a valid signature from its pinned publisher and identity. No module was imported.");
    }
    const minimumNode = semver.valid(verified.manifest.plugin.compatibility.nodeMinVersion);
    if (minimumNode === null || !semver.gte(process.versions.node, minimumNode)) {
      throw new NativeExecutableError("EXECUTABLE_NODE_VERSION", "The signed executable package requires an unsupported or invalid minimum Node version. No module was imported; use a compatible reviewed package or runtime.");
    }
    const entries = verified.manifest.artifacts.filter(entry => entry.path === reference.entrypoint);
    if (entries.length !== 1 || entries[0]!.kind !== "extension_module" || entries[0]!.bytes > NATIVE_EXECUTABLE_LIMITS.moduleBytes) {
      throw new NativeExecutableError("EXECUTABLE_ENTRYPOINT_INVALID", "The selected entrypoint must be one bounded, publisher-signed extension_module artifact.");
    }
    const destination = join(temporary, "content");
    mkdirSync(destination, { mode: 0o700 });
    const extracted = extractPluginPackage(archive, destination);
    const module = readNativeExecutableFile(extracted.rootDir, join(extracted.rootDir, reference.entrypoint), NATIVE_EXECUTABLE_LIMITS.moduleBytes);
    if (module.length !== entries[0]!.bytes || sha256Hex(module) !== entries[0]!.sha256) {
      throw new NativeExecutableError("EXECUTABLE_MODULE_CHANGED", "The executable entrypoint no longer matches the publisher-signed bytes.");
    }
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(module);
    if (source.includes("\0")) throw new Error("invalid module text");
    return Object.freeze({ reference: Object.freeze(reference), source, moduleSha256: entries[0]!.sha256 });
  } catch (error) {
    if (error instanceof NativeExecutableError) throw error;
    throw new NativeExecutableError("EXECUTABLE_PACKAGE_INVALID", "The executable package could not be verified or decoded safely. No module was imported; package diagnostics are withheld.");
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
