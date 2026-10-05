import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { verifyPluginPackage } from "./pluginPackage.js";
import {
  pluginRegistryIndexSchema,
  pluginRegistryIndexSignatureSchema,
  type PluginRegistryConfig,
  type PluginRegistryIndex
} from "./pluginRegistrySchema.js";
import { resolvePluginRegistryBase } from "./pluginStore.js";

function isHttp(base: string): boolean {
  return base.startsWith("http://") || base.startsWith("https://");
}

function joinUrl(base: string, rel: string): string {
  const normalized = rel.replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/${normalized}`;
}

function assertSafeRegistryRelativePath(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("://")) {
    throw new Error(`registry entry url must be a relative path: ${relPath}`);
  }
  const clean = posix.normalize(normalized);
  if (clean === "." || clean.startsWith("../") || clean.includes("/../") || clean.endsWith("/..")) {
    throw new Error(`registry entry url escapes registry root: ${relPath}`);
  }
  return clean;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i += 1) {
    const avRaw = pa[i] ?? "0";
    const bvRaw = pb[i] ?? "0";
    const av = Number(avRaw);
    const bv = Number(bvRaw);
    if (Number.isFinite(av) && Number.isFinite(bv)) {
      if (av !== bv) return av - bv;
      continue;
    }
    const cmp = avRaw.localeCompare(bvRaw);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

async function readTextFromRegistry(base: string, relPath: string): Promise<string> {
  if (isHttp(base)) {
    const url = joinUrl(base, relPath);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${url}`);
    }
    return await response.text();
  }
  const file = join(base, relPath);
  if (!pathExists(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  return readUtf8(file);
}

async function readBytesFromRegistry(base: string, relPath: string): Promise<Buffer> {
  if (isHttp(base)) {
    const url = joinUrl(base, relPath);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${url}`);
    }
    const buf = Buffer.from(await response.arrayBuffer());
    return buf;
  }
  const file = join(base, relPath);
  if (!pathExists(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  return readFileSync(file);
}

function verifyRegistryIndexSignature(params: {
  index: PluginRegistryIndex;
  sigRaw: string;
  pubPem: string;
}): { ok: boolean; reason?: string } {
  try {
    const sig = pluginRegistryIndexSignatureSchema.parse(JSON.parse(params.sigRaw) as unknown);
    const payload = Buffer.from(canonicalize(params.index), "utf8");
    const digest = sha256Hex(payload);
    if (digest !== sig.digestSha256) {
      return { ok: false, reason: "index digest mismatch" };
    }
    const verified = verify(null, payload, createPublicKey(params.pubPem), Buffer.from(sig.signature, "base64"));
    return verified ? { ok: true } : { ok: false, reason: "index signature verification failed" };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}

export interface ResolvedRegistryPackage {
  registryId: string;
  registryBase: string;
  registryFingerprint: string;
  pluginId: string;
  version: string;
  sha256: string;
  publisherFingerprint: string;
  riskCategory: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  packagePath: string;
}

export async function fetchRegistryIndex(baseRaw: string): Promise<{
  base: string;
  index: PluginRegistryIndex;
  registryPub: string;
}> {
  const base = isHttp(baseRaw) ? baseRaw.replace(/\/+$/, "") : resolve(baseRaw);
  const indexRaw = await readTextFromRegistry(base, "index.json");
  const sigRaw = await readTextFromRegistry(base, "index.sig");
  const registryPub = await readTextFromRegistry(base, "registry.pub");
  const index = pluginRegistryIndexSchema.parse(JSON.parse(indexRaw) as unknown);
  const verifyResult = verifyRegistryIndexSignature({ index, sigRaw, pubPem: registryPub });
  if (!verifyResult.ok) {
    throw new Error(`registry index signature invalid: ${verifyResult.reason ?? "unknown"}`);
  }
  return {
    base,
    index,
    registryPub
  };
}

function selectVersion(
  index: PluginRegistryIndex,
  pluginId: string,
  requestedVersion?: string | null
): PluginRegistryIndex["plugins"][number]["versions"][number] {
  const plugin = index.plugins.find((row) => row.id === pluginId);
  if (!plugin) {
    throw new Error(`plugin not found in registry: ${pluginId}`);
  }
  if (requestedVersion && requestedVersion !== "latest") {
    const exact = plugin.versions.find((row) => row.version === requestedVersion);
    if (!exact) {
      throw new Error(`plugin version not found in registry: ${pluginId}@${requestedVersion}`);
    }
    return exact;
  }
  return plugin.versions
    .slice()
    .sort((a, b) => compareVersions(a.version, b.version))
    .at(-1)!;
}

export async function resolveRegistryPackage(params: {
  registryBase: string;
  pluginRef: string;
  pinnedRegistryPubkeyFingerprint?: string;
  allowPluginPublishers?: string[];
  allowRiskCategories?: Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">;
}): Promise<ResolvedRegistryPackage> {
  const at = params.pluginRef.lastIndexOf("@");
  const pluginId = at > 0 ? params.pluginRef.slice(0, at) : params.pluginRef;
  const requestedVersion = at > 0 ? params.pluginRef.slice(at + 1) : null;
  const { base, index, registryPub } = await fetchRegistryIndex(params.registryBase);
  const registryFingerprint = sha256Hex(Buffer.from(registryPub, "utf8"));
  if (params.pinnedRegistryPubkeyFingerprint && params.pinnedRegistryPubkeyFingerprint !== registryFingerprint) {
    throw new Error("registry fingerprint mismatch with pinned fingerprint");
  }
  const selected = selectVersion(index, pluginId, requestedVersion);
  const packageUrl = assertSafeRegistryRelativePath(selected.url);
  if (params.allowPluginPublishers && params.allowPluginPublishers.length > 0) {
    if (!params.allowPluginPublishers.includes(selected.publisherFingerprint)) {
      throw new Error(`plugin publisher not allowlisted: ${selected.publisherFingerprint}`);
    }
  }
  if (params.allowRiskCategories && params.allowRiskCategories.length > 0) {
    if (!params.allowRiskCategories.includes(selected.riskCategory)) {
      throw new Error(`plugin risk category not allowed: ${selected.riskCategory}`);
    }
  }
  const bytes = await readBytesFromRegistry(base, packageUrl);
  const digest = sha256Hex(bytes);
  if (digest !== selected.sha256) {
    throw new Error("plugin package sha256 mismatch with registry index");
  }
  const temp = mkdtempSync(join(tmpdir(), "amc-plugin-registry-"));
  const packagePath = join(temp, "plugin.amcplug");
  writeFileAtomic(packagePath, bytes, 0o644);
  const verifyResult = verifyPluginPackage({ file: packagePath });
  if (!verifyResult.ok || !verifyResult.manifest || !verifyResult.publisherFingerprint) {
    throw new Error(`plugin verification failed: ${verifyResult.errors.join("; ")}`);
  }
  if (verifyResult.manifest.plugin.id !== pluginId || verifyResult.manifest.plugin.version !== selected.version) {
    throw new Error("plugin manifest id/version mismatch with registry entry");
  }
  if (verifyResult.publisherFingerprint !== selected.publisherFingerprint) {
    throw new Error("plugin publisher fingerprint mismatch with registry entry");
  }
  if (verifyResult.manifest.plugin.risk.category !== selected.riskCategory) {
    throw new Error("plugin risk category mismatch with registry entry");
  }
  return {
    registryId: index.registry.id,
    registryBase: base,
    registryFingerprint,
    pluginId,
    version: selected.version,
    sha256: selected.sha256,
    publisherFingerprint: selected.publisherFingerprint,
    riskCategory: selected.riskCategory,
    packagePath
  };
}

export async function browseRegistry(params: {
  registryBase: string;
  query?: string;
}): Promise<{
  registryId: string;
  registryFingerprint: string;
  plugins: PluginRegistryIndex["plugins"];
}> {
  const { index, registryPub } = await fetchRegistryIndex(params.registryBase);
  const query = (params.query ?? "").trim().toLowerCase();
  const filtered = query.length === 0
    ? index.plugins
    : index.plugins.filter((row) =>
        row.id.toLowerCase().includes(query) ||
        row.versions.some((version) => version.publisherFingerprint.toLowerCase().includes(query))
      );
  return {
    registryId: index.registry.id,
    registryFingerprint: sha256Hex(Buffer.from(registryPub, "utf8")),
    plugins: filtered
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({
        ...row,
        versions: row.versions.slice().sort((a, b) => compareVersions(a.version, b.version))
      }))
  };
}

export function resolveRegistryConfigForWorkspace(params: {
  workspace: string;
  registries: PluginRegistryConfig;
  registryId: string;
}): {
  id: string;
  base: string;
  pinnedRegistryPubkeyFingerprint: string;
  allowPluginPublishers: string[];
  allowRiskCategories: Array<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">;
} {
  const entry = params.registries.pluginRegistries.registries.find((row) => row.id === params.registryId);
  if (!entry) {
    throw new Error(`registry not configured in workspace: ${params.registryId}`);
  }
  return {
    id: entry.id,
    base: resolvePluginRegistryBase(entry.base, params.workspace),
    pinnedRegistryPubkeyFingerprint: entry.pinnedRegistryPubkeyFingerprint,
    allowPluginPublishers: entry.allowPluginPublishers,
    allowRiskCategories: entry.allowRiskCategories
  };
}

export function cleanupResolvedPackage(path: string): void {
  try {
    rmSync(dirname(path), { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}
