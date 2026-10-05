import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { benchRegistryConfigSchema, benchRegistryIndexSchema, benchRegistryIndexSignatureSchema, type BenchRegistryConfig, type BenchRegistryIndex } from "./benchRegistrySchema.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";
import { cacheRegistryIndex, listImportedBenches, storeImportedBench } from "./benchRegistryStore.js";
import { loadBenchRegistriesConfig } from "./benchPolicyStore.js";

function isHttp(base: string): boolean {
  return /^https?:\/\//i.test(base);
}

function joinUrl(base: string, rel: string): string {
  return `${base.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`;
}

async function readText(base: string, rel: string): Promise<string> {
  if (isHttp(base)) {
    const response = await fetch(joinUrl(base, rel), { method: "GET" });
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${joinUrl(base, rel)}`);
    }
    return await response.text();
  }
  const file = join(base, rel);
  if (!pathExists(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  return readUtf8(file);
}

async function readBytes(base: string, rel: string): Promise<Buffer> {
  if (isHttp(base)) {
    const response = await fetch(joinUrl(base, rel), { method: "GET" });
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${joinUrl(base, rel)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  const file = join(base, rel);
  if (!pathExists(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  return readFileSync(file);
}

function verifyIndexSignature(params: {
  index: BenchRegistryIndex;
  sigRaw: string;
  registryPub: string;
}): { ok: boolean; reason?: string } {
  try {
    const sig = benchRegistryIndexSignatureSchema.parse(JSON.parse(params.sigRaw) as unknown);
    const payload = Buffer.from(canonicalize(params.index), "utf8");
    const digest = sha256Hex(payload);
    if (digest !== sig.digestSha256) {
      return {
        ok: false,
        reason: "digest mismatch"
      };
    }
    const valid = verify(null, payload, createPublicKey(params.registryPub), Buffer.from(sig.signature, "base64"));
    return valid ? { ok: true } : { ok: false, reason: "signature invalid" };
  } catch (error) {
    return {
      ok: false,
      reason: String(error)
    };
  }
}

function compareVersions(a: string, b: string): number {
  return a.localeCompare(b);
}

export async function fetchBenchRegistryIndex(baseRaw: string): Promise<{
  base: string;
  indexRaw: string;
  sigRaw: string;
  pubRaw: string;
  index: BenchRegistryIndex;
  registryFingerprint: string;
}> {
  const base = isHttp(baseRaw) ? baseRaw.replace(/\/+$/, "") : resolve(baseRaw);
  const [indexRaw, sigRaw, pubRaw] = await Promise.all([
    readText(base, "index.json"),
    readText(base, "index.sig"),
    readText(base, "registry.pub")
  ]);
  const index = benchRegistryIndexSchema.parse(JSON.parse(indexRaw) as unknown);
  const checked = verifyIndexSignature({ index, sigRaw, registryPub: pubRaw });
  if (!checked.ok) {
    throw new Error(`registry signature invalid: ${checked.reason ?? "unknown"}`);
  }
  const registryFingerprint = sha256Hex(Buffer.from(pubRaw, "utf8"));
  if (index.registry.issuerFingerprint !== registryFingerprint) {
    throw new Error("registry fingerprint mismatch");
  }
  return {
    base,
    indexRaw,
    sigRaw,
    pubRaw,
    index,
    registryFingerprint
  };
}

export async function browseBenchRegistry(params: {
  base: string;
  query?: string;
}): Promise<{
  registryId: string;
  registryFingerprint: string;
  benches: BenchRegistryIndex["benches"];
}> {
  const fetched = await fetchBenchRegistryIndex(params.base);
  const query = (params.query ?? "").trim().toLowerCase();
  const benches =
    query.length === 0
      ? fetched.index.benches
      : fetched.index.benches.filter(
          (row) =>
            row.benchId.toLowerCase().includes(query) ||
            row.scopeType.toLowerCase().includes(query) ||
            row.versions.some((version) => version.version.toLowerCase().includes(query))
        );
  return {
    registryId: fetched.index.registry.id,
    registryFingerprint: fetched.registryFingerprint,
    benches: benches.slice().sort((a, b) => a.benchId.localeCompare(b.benchId))
  };
}

function resolveRegistryFromConfig(config: BenchRegistryConfig, registryId: string) {
  const entry = config.benchRegistries.registries.find((row) => row.id === registryId);
  if (!entry) {
    throw new Error(`bench registry not configured: ${registryId}`);
  }
  return entry;
}

export async function importBenchFromRegistry(params: {
  workspace: string;
  registryId: string;
  benchRef: string;
}): Promise<{
  benchId: string;
  version: string;
  filePath: string;
  registryFingerprint: string;
}> {
  const config = benchRegistryConfigSchema.parse(loadBenchRegistriesConfig(params.workspace));
  const registry = resolveRegistryFromConfig(config, params.registryId);
  const base = isHttp(registry.base) ? registry.base : resolve(params.workspace, registry.base);
  const fetched = await fetchBenchRegistryIndex(base);
  cacheRegistryIndex({
    workspace: params.workspace,
    registryId: registry.id,
    indexRaw: fetched.indexRaw,
    sigRaw: fetched.sigRaw,
    pubRaw: fetched.pubRaw
  });
  if (registry.pinnedRegistryFingerprint !== fetched.registryFingerprint) {
    throw new Error("registry fingerprint does not match pinned fingerprint");
  }

  const at = params.benchRef.lastIndexOf("@");
  const benchId = at > 0 ? params.benchRef.slice(0, at) : params.benchRef;
  const requestedVersion = at > 0 ? params.benchRef.slice(at + 1) : "latest";
  const item = fetched.index.benches.find((row) => row.benchId === benchId);
  if (!item) {
    throw new Error(`bench not found in registry: ${benchId}`);
  }
  if (!registry.allowTrustLabels.includes(item.evidence.trustLabel)) {
    throw new Error(`bench trust label not allowed by registry policy: ${item.evidence.trustLabel}`);
  }
  const selected =
    requestedVersion === "latest"
      ? item.versions.slice().sort((a, b) => compareVersions(a.version, b.version)).at(-1)
      : item.versions.find((row) => row.version === requestedVersion);
  if (!selected) {
    throw new Error(`bench version not found: ${benchId}@${requestedVersion}`);
  }
  if (registry.allowSignerFingerprints.length > 0 && !registry.allowSignerFingerprints.includes(selected.signerFingerprint)) {
    throw new Error(`bench signer not allowlisted: ${selected.signerFingerprint}`);
  }
  const bytes = await readBytes(fetched.base, selected.url);
  const digest = sha256Hex(bytes);
  if (digest !== selected.sha256) {
    throw new Error(`bench sha mismatch for ${benchId}@${selected.version}`);
  }
  const tmpPath = join(resolve(params.workspace), ".amc", "bench", "imports", "tmp-import.amcbench");
  writeFileAtomic(tmpPath, bytes, 0o644);
  const verified = verifyBenchArtifactFile({ file: tmpPath });
  if (!verified.ok) {
    throw new Error(`bench artifact verify failed: ${verified.errors.map((row) => row.message).join("; ")}`);
  }
  if (registry.requireBenchProofs && verified.bench && verified.bench.proofBindings.includedEventProofIds.length === 0) {
    throw new Error("bench proofs required by registry policy but artifact has no inclusion proofs");
  }
  const stored = storeImportedBench({
    workspace: params.workspace,
    registryId: registry.id,
    registryFingerprint: fetched.registryFingerprint,
    signerFingerprint: selected.signerFingerprint,
    sourceUrl: selected.url,
    version: selected.version,
    file: tmpPath
  });
  return {
    benchId: stored.meta.benchId,
    version: stored.meta.version,
    filePath: stored.artifactPath,
    registryFingerprint: stored.meta.registryFingerprint
  };
}

export function listImportedBenchArtifacts(workspace: string) {
  return listImportedBenches(workspace);
}
