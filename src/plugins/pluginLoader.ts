import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { listAssurancePacks } from "../assurance/packs/index.js";
import { listPolicyPacks } from "../policyPacks/builtInPacks.js";
import { policyPackSchema } from "../policyPacks/packSchema.js";
import { complianceMappingSchema, complianceMapsSchema } from "../compliance/mappingSchema.js";
import { listBuiltInAdapters } from "../adapters/registry.js";
import { adapterDefinitionSchema } from "../adapters/adapterTypes.js";
import { outcomeContractSchema } from "../outcomes/outcomeContractSchema.js";
import { casebookCaseSchema, casebookSchema } from "../casebooks/casebookSchema.js";
import { transformMapSchema } from "../transformation/transformMapSchema.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { builtInAssetRegistry } from "./builtins/builtInRegistry.js";
import { extractPluginPackage, installedPluginTrust, verifyPluginPackage } from "./pluginPackage.js";
import { loadInstalledPluginsLock, loadPluginOverrides, pluginInstalledPackagePath, verifyPluginOverrides } from "./pluginStore.js";
import { canOverrideAsset } from "./rules/overlayRules.js";
import { verifyInstalledPluginsIntegrity } from "./pluginVerifier.js";
import { readInstalledNativeExecutable, type NativeExecutableModuleSnapshot } from "./nativeExecutablePackage.js";
import { nativeExecutableReference, type NativeExecutableReference } from "./nativeExecutableSchema.js";

const assurancePackDeclarativeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  scenarios: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      category: z.string().min(1),
      riskTier: z.union([z.literal("all"), z.array(z.string().min(1)).min(1)]),
      prompt: z.string().min(1).optional(),
      validators: z.array(z.string().min(1)).optional()
    })
  )
});

export interface PluginLoadStatus {
  id: string;
  version: string;
  publisherFingerprint: string;
  loaded: boolean;
  failedValidation: boolean;
  errors: string[];
  /** Descriptor discovery is not code execution or an execution approval. */
  executableCode?: "not-started";
}

export interface LoadedPluginAssets {
  policyPacks: Map<string, unknown>;
  assurancePacks: Map<string, unknown>;
  complianceMaps: Map<string, unknown>;
  adapters: Map<string, unknown>;
  outcomeTemplates: Map<string, unknown>;
  casebookTemplates: Map<string, unknown>;
  transformOverlays: Map<string, unknown>;
  learnDocs: Map<string, string>;
  executableModules?: Map<string, NativeExecutableReference>;
}

export interface PluginLoadResult {
  ok: boolean;
  integrity: ReturnType<typeof verifyInstalledPluginsIntegrity>;
  statuses: PluginLoadStatus[];
  assets: LoadedPluginAssets;
}

function parseStructured(file: string): unknown {
  const raw = readUtf8(file);
  if (extname(file).toLowerCase() === ".json") {
    return JSON.parse(raw) as unknown;
  }
  return YAML.parse(raw) as unknown;
}

function assetIdFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.length >= 3 && normalized.startsWith("content/policy-packs/")) {
    return segments[2] ?? basename(path, extname(path));
  }
  if (segments.length >= 3 && normalized.startsWith("content/assurance-packs/")) {
    return segments[2] ?? basename(path, extname(path));
  }
  if (segments.length >= 3 && normalized.startsWith("content/learn/questions/")) {
    return basename(path, extname(path));
  }
  return basename(path, extname(path));
}

function canUseId(params: {
  kind: "policy_pack" | "assurance_pack" | "compliance_map" | "adapter" | "learn_md" | "transform_overlay";
  id: string;
  publisherFingerprint: string;
  builtins: ReturnType<typeof builtInAssetRegistry>;
  currentlyLoaded: Set<string>;
  overrides: ReturnType<typeof loadPluginOverrides>;
}): { allowed: boolean; reason?: string } {
  const inBuiltins = (() => {
    if (params.kind === "policy_pack") return params.builtins.policyPacks.has(params.id);
    if (params.kind === "assurance_pack") return params.builtins.assurancePacks.has(params.id);
    if (params.kind === "compliance_map") return params.builtins.complianceMaps.has(params.id);
    if (params.kind === "adapter") return params.builtins.adapters.has(params.id);
    if (params.kind === "learn_md") return params.builtins.learnIds.has(params.id);
    return params.builtins.transformOverlays.has(params.id);
  })();
  const inLoaded = params.currentlyLoaded.has(params.id);
  if (!inBuiltins && !inLoaded) {
    return { allowed: true };
  }
  const allowed = canOverrideAsset({
    overrides: params.overrides,
    kind: params.kind,
    id: params.id,
    publisherFingerprint: params.publisherFingerprint
  });
  return allowed
    ? { allowed: true }
    : { allowed: false, reason: `PLUGIN_OVERRIDE_DENIED:${params.kind}:${params.id}` };
}

export function loadInstalledPluginAssets(workspace: string): PluginLoadResult {
  const integrity = verifyInstalledPluginsIntegrity(workspace);
  const lock = loadInstalledPluginsLock(workspace);
  const overridesSig = verifyPluginOverrides(workspace);
  const overrides = overridesSig.valid
    ? loadPluginOverrides(workspace)
    : { overrides: { version: 1 as const, allow: [] } };
  const builtins = builtInAssetRegistry();
  const statuses: PluginLoadStatus[] = [];
  const assets: LoadedPluginAssets = {
    policyPacks: new Map(),
    assurancePacks: new Map(),
    complianceMaps: new Map(),
    adapters: new Map(),
    outcomeTemplates: new Map(),
    casebookTemplates: new Map(),
    transformOverlays: new Map(),
    learnDocs: new Map(),
    executableModules: new Map()
  };

  for (const installed of lock.installed) {
    const packageFile = pluginInstalledPackagePath(workspace, installed.id, installed.version);
    const status: PluginLoadStatus = {
      id: installed.id,
      version: installed.version,
      publisherFingerprint: installed.publisherFingerprint,
      loaded: false,
      failedValidation: false,
      errors: []
    };
    if (!integrity.ok) {
      status.failedValidation = true;
      status.errors.push("PLUGIN_INSTALLATION_UNTRUSTED: no assets or executable descriptors loaded from an invalid signed installation");
      statuses.push(status);
      continue;
    }
    if (!pathExists(packageFile)) {
      status.failedValidation = true;
      status.errors.push("installed package missing");
      statuses.push(status);
      continue;
    }
    if (!overridesSig.valid && overridesSig.signatureExists) {
      status.errors.push(`PLUGIN_OVERRIDES_UNTRUSTED:${overridesSig.reason ?? "unknown"}`);
    }
    const verified = verifyPluginPackage({ file: packageFile, trust: installedPluginTrust(workspace, installed.publisherFingerprint) });
    if (!verified.ok || !verified.manifest || verified.publisherFingerprint !== installed.publisherFingerprint
      || verified.manifest.plugin.id !== installed.id || verified.manifest.plugin.version !== installed.version) {
      status.failedValidation = true;
      status.errors.push(...verified.errors);
      if (verified.ok) status.errors.push("PLUGIN_IDENTITY_MISMATCH: publisher or identity differs from the signed installation lock");
      statuses.push(status);
      continue;
    }
    const tmp = mkdtempSync(join(tmpdir(), "amc-plugin-load-"));
    try {
      const extracted = extractPluginPackage(packageFile, tmp);
      const root = extracted.rootDir;
      const loadedIds = {
        policy_pack: new Set<string>(assets.policyPacks.keys()),
        assurance_pack: new Set<string>(assets.assurancePacks.keys()),
        compliance_map: new Set<string>(assets.complianceMaps.keys()),
        adapter: new Set<string>(assets.adapters.keys()),
        learn_md: new Set<string>(assets.learnDocs.keys()),
        transform_overlay: new Set<string>(assets.transformOverlays.keys())
      };
      for (const artifact of verified.manifest.artifacts) {
        const file = join(root, artifact.path);
        if (!pathExists(file)) {
          status.failedValidation = true;
          status.errors.push(`artifact missing: ${artifact.path}`);
          continue;
        }
        try {
          if (artifact.kind === "extension_module") {
            const reference = nativeExecutableReference({ pluginId: installed.id, version: installed.version,
              packageSha256: installed.sha256, publisherFingerprint: installed.publisherFingerprint, entrypoint: artifact.path });
            assets.executableModules!.set(`${installed.id}@${installed.version}:${artifact.path}`, Object.freeze(reference));
            status.executableCode = "not-started";
            continue;
          }
          if (artifact.kind === "policy_pack") {
            const parsed = policyPackSchema.parse(parseStructured(file));
            const id = parsed.id;
            const allowed = canUseId({
              kind: "policy_pack",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.policy_pack,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.policyPacks.set(id, parsed);
            loadedIds.policy_pack.add(id);
            continue;
          }
          if (artifact.kind === "assurance_pack") {
            const parsed = assurancePackDeclarativeSchema.parse(parseStructured(file));
            const id = parsed.id;
            const allowed = canUseId({
              kind: "assurance_pack",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.assurance_pack,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.assurancePacks.set(id, parsed);
            loadedIds.assurance_pack.add(id);
            continue;
          }
          if (artifact.kind === "compliance_map") {
            const raw = parseStructured(file);
            const parsed = (() => {
              const bundle = complianceMapsSchema.safeParse(raw);
              if (bundle.success) {
                return bundle.data.complianceMaps.mappings[0]!;
              }
              return complianceMappingSchema.parse(raw);
            })();
            const id = parsed.id;
            const allowed = canUseId({
              kind: "compliance_map",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.compliance_map,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.complianceMaps.set(id, parsed);
            loadedIds.compliance_map.add(id);
            continue;
          }
          if (artifact.kind === "adapter") {
            const parsed = adapterDefinitionSchema.parse(parseStructured(file));
            const id = parsed.id;
            const allowed = canUseId({
              kind: "adapter",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.adapter,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.adapters.set(id, parsed);
            loadedIds.adapter.add(id);
            continue;
          }
          if (artifact.kind === "outcome_template") {
            const parsed = outcomeContractSchema.parse(parseStructured(file));
            const id = parsed.outcomeContract.title;
            assets.outcomeTemplates.set(id, parsed);
            continue;
          }
          if (artifact.kind === "casebook_template") {
            const raw = parseStructured(file);
            const parsed = casebookSchema.safeParse(raw).success
              ? casebookSchema.parse(raw)
              : casebookCaseSchema.parse(raw);
            const id = "casebook" in parsed ? parsed.casebook.casebookId : parsed.caseId;
            assets.casebookTemplates.set(id, parsed);
            continue;
          }
          if (artifact.kind === "transform_overlay" || artifact.kind === "transform_intervention_library") {
            const parsed = transformMapSchema.parse(parseStructured(file));
            const id = assetIdFromPath(artifact.path);
            const allowed = canUseId({
              kind: "transform_overlay",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.transform_overlay,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.transformOverlays.set(id, parsed);
            loadedIds.transform_overlay.add(id);
            continue;
          }
          if (artifact.kind === "learn_md") {
            const id = assetIdFromPath(artifact.path);
            const allowed = canUseId({
              kind: "learn_md",
              id,
              publisherFingerprint: installed.publisherFingerprint,
              builtins,
              currentlyLoaded: loadedIds.learn_md,
              overrides
            });
            if (!allowed.allowed) {
              status.failedValidation = true;
              status.errors.push(allowed.reason ?? "PLUGIN_OVERRIDE_DENIED");
              continue;
            }
            assets.learnDocs.set(id, readUtf8(file));
          }
        } catch (error) {
          status.failedValidation = true;
          status.errors.push(`FAILED_VALIDATION:${artifact.path}:${String(error)}`);
        }
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    status.loaded = !status.failedValidation;
    statuses.push(status);
  }

  // Touch built-ins to ensure loading path remains deterministic and strongly typed.
  // This statement also guarantees tree-shaking does not remove built-in registries.
  void listPolicyPacks();
  void listAssurancePacks();
  void listBuiltInAdapters();

  return {
    ok: integrity.ok && statuses.every((row) => row.loaded),
    integrity,
    statuses,
    assets
  };
}

/** Explicit native loader path; verifies the exact installed archive and never imports its module into AMC. */
export function loadInstalledPluginExecutable(workspace: string, reference: NativeExecutableReference): NativeExecutableModuleSnapshot {
  return readInstalledNativeExecutable(workspace, reference);
}
