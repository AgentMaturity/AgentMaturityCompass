import { captureOrgPairs, orgPairBytes, assertOrgPairsCurrent, type OrgPairsOptions } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { distrustAt, listsAt } from "../trust/admissionRule.js";
import { captureBenchImportFiles, publishVerifiedBenchImport, BenchImportPublicationError } from "./benchImportPublication.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { join, resolve } from "node:path";
import { getWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { checkScopedEgress } from "../residency/checkEgress.js";
import { benchRegistryConfigSchema, benchRegistryIndexSchema, benchRegistryIndexSignatureSchema, type BenchRegistryConfig, type BenchRegistryIndex } from "./benchRegistrySchema.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";
import { admitKey, loadTrustContext, untrustedReasons, withPins, type TrustContext } from "../trust/index.js";
import { benchRegistryCachePath, importedBenchPath, listImportedBenches, type ImportedBenchMeta } from "./benchRegistryStore.js";
import { benchImportsCacheDir, benchImportsRegistriesPath, loadBenchRegistriesConfig, loadBenchRegistriesConfigAsync, verifyBenchRegistriesSignature } from "./benchPolicyStore.js";

function isHttp(base: string): boolean {
  return /^https?:\/\//i.test(base);
}

function joinUrl(base: string, rel: string): string {
  return `${base.replace(/\/+$/, "")}/${rel.replace(/^\/+/, "")}`;
}

async function readText(base: string, rel: string, workspace?: string): Promise<string> {
  if (isHttp(base)) {
    const url = joinUrl(base, rel), request: RequestInit = { method: "GET", redirect: "manual" };
    checkScopedEgress(workspace, "network-tool", url, { dataClasses: null, purpose: null });
    const response = await fetch(url, request);
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${url}`);
    }
    return await response.text();
  }
  const file = join(base, rel);
  if (!pathExists(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  return readUtf8(file);
}

async function readBytes(base: string, rel: string, workspace?: string): Promise<Buffer> {
  if (isHttp(base)) {
    const url = joinUrl(base, rel), request: RequestInit = { method: "GET", redirect: "manual" };
    checkScopedEgress(workspace, "network-tool", url, { dataClasses: null, purpose: null });
    const response = await fetch(url, request);
    if (!response.ok) {
      throw new Error(`registry fetch failed (${response.status}): ${url}`);
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
    const valid = verifyWithKey(payload, params.registryPub, Buffer.from(sig.signature, "base64"));
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

async function fetchBenchRegistryIndex(baseRaw: string, workspace?: string): Promise<{
  base: string;
  indexRaw: string;
  sigRaw: string;
  pubRaw: string;
  index: BenchRegistryIndex;
  registryFingerprint: string;
}> {
  const base = isHttp(baseRaw) ? baseRaw.replace(/\/+$/, "") : resolve(baseRaw);
  const [indexRaw, sigRaw, pubRaw] = await Promise.all([
    readText(base, "index.json", workspace),
    readText(base, "index.sig", workspace),
    readText(base, "registry.pub", workspace)
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
  const { base: baseRaw, query: queryRaw } = params;
  const rawWorkspace = getWorkspaceScope();
  const workspace = typeof rawWorkspace === "string" && rawWorkspace.trim() ? resolve(rawWorkspace) : rawWorkspace;
  const fetched = await fetchBenchRegistryIndex(baseRaw, workspace);
  const query = (queryRaw ?? "").trim().toLowerCase();
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

/**
 * The registries config pins registry fingerprints, so it counts only with a valid auditor signature (P0-09).
 * Checked before loading, because loading a missing config writes the signed defaults.
 */
function signedBenchRegistry(workspace: string, registryId: string) {
  const signature = verifyBenchRegistriesSignature(workspace);
  if (!signature.valid) {
    throw new Error(`bench registries config signature invalid: ${signature.reason ?? "unknown"}`);
  }
  return resolveRegistryFromConfig(benchRegistryConfigSchema.parse(loadBenchRegistriesConfig(workspace)), registryId);
}

/** The registry key vouches for the signers its index names only while admitted: distrust beats the pin (P0-09). */
function admitRegistryKey(pubRaw: string, pinnedFingerprint: string, base: TrustContext): void {
  const admission = admitKey({ publicKeyPem: pubRaw, purpose: "artifact-seal", signature: "index.sig",
    context: withPins(base, [{ keyId: pinnedFingerprint, purposes: ["artifact-seal"], origin: "pinned bench registry fingerprint" }]) });
  if (admission.status !== "admitted") {
    throw new Error(`registry key not admitted: ${admission.status}: ${admission.detail ?? ""}`);
  }
}

/**
 * The signer an imported bench was admitted for, re-read from the cached index the pinned registry signed, never from
 * the unsigned meta.json (P0-09). Throws when the signed config, the cache, its signature or the pin does not hold.
 */
export async function importedBenchSigner(workspace: string, meta: ImportedBenchMeta, trust: TrustContext): Promise<string> {
  if (!verifyBenchRegistriesSignature(workspace).signatureExists) throw new Error("bench registries config is not signed");
  const registry = signedBenchRegistry(workspace, meta.registryId);
  const cached = await fetchBenchRegistryIndex(join(benchImportsCacheDir(workspace), meta.registryId));
  if (cached.registryFingerprint !== registry.pinnedRegistryFingerprint) throw new Error("cached registry index is not from the pinned registry");
  admitRegistryKey(cached.pubRaw, registry.pinnedRegistryFingerprint, trust);
  const signer = cached.index.benches.find((row) => row.benchId === meta.benchId)?.versions.find((row) => row.version === meta.version)?.signerFingerprint;
  if (!signer) throw new Error(`the signed registry index names no signer for ${meta.benchId}@${meta.version}`);
  return signer;
}

export async function importBenchFromRegistry(params: { workspace: string; registryId: string; benchRef: string }, options: OrgPairsOptions = {}) {
  return (await importBenchFromRegistryAttempt(params, options)).result;
}

/** Internal actual API caller retains this attempt through its later workspace-log await; absent from root SDK. */
export async function importBenchFromRegistryAttempt(params: { workspace: string; registryId: string; benchRef: string }, options: OrgPairsOptions = {}) {
  const { workspace: rawWorkspace, registryId, benchRef } = params, actor = options.beforePublish, inputs = options.assertInputsCurrent;
  const workspace = typeof rawWorkspace === "string" && rawWorkspace.trim() ? resolve(rawWorkspace) : rawWorkspace;
  actor?.(); inputs?.(); const configPath = benchImportsRegistriesPath(workspace);
  if (!pathExists(configPath)) {
    await loadBenchRegistriesConfigAsync(workspace, { beforePublish: actor, assertInputsCurrent: inputs }); actor?.(); inputs?.();
    // Genuine missing initialization creates only the old empty defaults; never adopt a concurrent configured winner.
    throw new Error(`bench registry not configured: ${registryId}`);
  }
  const pair = captureOrgPairs([configPath]), body = orgPairBytes(pair, configPath), sidecar = orgPairBytes(pair, `${configPath}.sig`);
  if (body === null || sidecar === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar).valid) throw new Error("bench registries config signature invalid");
  const registry = resolveRegistryFromConfig(benchRegistryConfigSchema.parse(YAML.parse(body.toString("utf8")) as unknown), registryId);
  const keyset = canonicalize(assertKeysetComplete(workspace)), policy = canonicalize(loadTrustConfig(workspace));
  const operator = loadTrustContext(), trustState = (value: TrustContext) => canonicalize({ ...value, asOf: null }), originalTrust = trustState(operator);
  const current = () => { actor?.(); inputs?.();
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== policy) throw new Error("original registry configuration authority changed during import");
    const now = loadTrustContext(); if (trustState(now) !== originalTrust || now.asOf.getTime() < operator.asOf.getTime()) throw new Error("original registry trust policy or clock changed during import");
    if (!verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar).valid) throw new Error("captured registry configuration is no longer admitted");
    assertOrgPairsCurrent(pair); return now;
  };
  current(); const cachePaths = benchRegistryCachePath(workspace, registry.id), cacheBefore = captureBenchImportFiles(workspace, Object.values(cachePaths));
  let stage: string | null = null, failure: unknown, completedPaths: readonly string[] = [];
  try {
    const base = isHttp(registry.base) ? registry.base : resolve(workspace, registry.base), fetched = await fetchBenchRegistryIndex(base, workspace); current();
    if (registry.pinnedRegistryFingerprint !== fetched.registryFingerprint) throw new Error("registry fingerprint does not match pinned fingerprint");
    admitRegistryKey(fetched.pubRaw, registry.pinnedRegistryFingerprint, operator);
    const at = benchRef.lastIndexOf("@"), benchId = at > 0 ? benchRef.slice(0, at) : benchRef, requestedVersion = at > 0 ? benchRef.slice(at + 1) : "latest";
    const item = fetched.index.benches.find(row => row.benchId === benchId);
    if (!item) throw new Error(`bench not found in registry: ${benchId}`);
    if (!registry.allowTrustLabels.includes(item.evidence.trustLabel)) throw new Error(`bench trust label not allowed by registry policy: ${item.evidence.trustLabel}`);
    const selected = requestedVersion === "latest" ? item.versions.slice().sort((a, b) => compareVersions(a.version, b.version)).at(-1) : item.versions.find(row => row.version === requestedVersion);
    if (!selected) throw new Error(`bench version not found: ${benchId}@${requestedVersion}`);
    if (registry.allowSignerFingerprints.length > 0 && !registry.allowSignerFingerprints.includes(selected.signerFingerprint)) throw new Error(`bench signer not allowlisted: ${selected.signerFingerprint}`);
    // Derived targets are captured immediately after authenticated selection, before fetching that artifact.
    const target = importedBenchPath(workspace, benchId, selected.version), targetBefore = captureBenchImportFiles(workspace, [target.artifactPath, target.shaPath, target.benchJsonPath, target.metaPath]);
    const bytes = await readBytes(fetched.base, selected.url, workspace); current();
    if (sha256Hex(bytes) !== selected.sha256) throw new Error(`bench sha mismatch for ${benchId}@${selected.version}`);
    stage = mkdtempSync(join(tmpdir(), "amc-bench-import-")); const file = join(stage, "candidate.amcbench"); writeFileAtomic(file, bytes, 0o600);
    const trust = withPins(operator, [{ keyId: selected.signerFingerprint, purposes: ["artifact-seal"], origin: `bench registry ${registry.id} index` }]);
    const verified = verifyBenchArtifactFile({ file, trust });
    if (!verified.ok || !verified.bench) throw new Error(`bench artifact verify failed: ${untrustedReasons(verified.report).join("; ")}`);
    if (verified.fileSha256 !== selected.sha256 || verified.bench.benchId !== benchId) throw new Error("verified bench does not match the selected signed registry item");
    if (registry.requireBenchProofs && verified.bench.proofBindings.includedEventProofIds.length === 0) throw new Error("bench proofs required by registry policy but artifact has no inclusion proofs");
    const admitted = verified.report.issuerAdmission.signatures.map(row => ({ ...row }));
    const publicationCurrent = () => { const now = current(); admitRegistryKey(fetched.pubRaw, registry.pinnedRegistryFingerprint, now);
      const pinned = withPins(now, [{ keyId: selected.signerFingerprint, purposes: ["artifact-seal"], origin: `bench registry ${registry.id} index` }]);
      // Negative-only refresh for already cryptographically verified exact identities. It never supplies a new candidate key.
      for (const row of admitted) {
        if (row.status !== "admitted" || row.keyId === null || distrustAt(pinned.distrust, row.keyId, pinned.asOf.getTime())) throw new Error("verified bench issuer is currently refused");
        if (!pinned.explicitPins.some(pin => pin.keyId === row.keyId && pin.purposes.includes(row.purpose))
          && listsAt(pinned.lists, row.keyId, row.purpose, pinned.asOf.getTime())?.status !== "admitted") throw new Error("verified bench issuer is no longer admitted");
      }
    };
    const stored = publishVerifiedBenchImport({ workspace, registryId: registry.id, registryFingerprint: fetched.registryFingerprint,
      signerFingerprint: selected.signerFingerprint, sourceUrl: selected.url, version: selected.version, bytes, bench: verified.bench, cacheBefore, targetBefore,
      cache: [{ path: cachePaths.indexPath, bytes: Buffer.from(fetched.indexRaw) }, { path: cachePaths.sigPath, bytes: Buffer.from(fetched.sigRaw) }, { path: cachePaths.pubPath, bytes: Buffer.from(fetched.pubRaw) }], current: publicationCurrent });
    completedPaths = stored.completedPaths;
    return { result: { benchId: stored.meta.benchId, version: stored.meta.version, filePath: stored.artifactPath, registryFingerprint: stored.meta.registryFingerprint },
      assertPublished: stored.assertPublished, completedPaths };
  } catch (cause) {
    if (cause instanceof BenchImportPublicationError) completedPaths = cause.completedPaths;
    failure = cause;
    try { actor?.(); } catch (refusal) { failure = new BenchImportPublicationError("authority", completedPaths, null, new AggregateError([cause, refusal])); throw failure; }
    throw cause;
  } finally { if (stage !== null) try { rmSync(stage, { recursive: true, force: true }); } catch (cleanup) {
    throw new BenchImportPublicationError("staging-cleanup", completedPaths, null, failure === undefined ? cleanup : new AggregateError([failure, cleanup]));
  } }
}

export function listImportedBenchArtifacts(workspace: string) {
  return listImportedBenches(workspace);
}
