/**
 * marketplace/marketplaceIndex.ts — Unified catalog builder.
 *
 * Merges built-in assurance packs, built-in policy packs, and remote
 * registry plugins into a single searchable marketplace catalog.
 */

import { listAssurancePacks } from "../assurance/packs/index.js";
import { listPolicyPacks } from "../policyPacks/builtInPacks.js";
import { browseRegistry, registryTrust } from "../plugins/pluginRegistryClient.js";
import { listInstalledPlugins, loadSignedPluginRegistriesConfig } from "../plugins/pluginApi.js";
import {
  getRatingStats,
  getFeatured,
  isDeprecated,
  getInstallCount,
  ensureMarketplaceStore
} from "./marketplaceStore.js";
import type {
  MarketplaceCatalogEntry,
  MarketplaceSearchParams,
  PackCategory
} from "./marketplaceTypes.js";

/* ── Assurance pack → catalog entry ───────────────────────────── */

function assurancePackToCatalog(pack: { id: string; title: string; description: string }): MarketplaceCatalogEntry {
  const now = Date.now();
  return {
    id: `assurance:${pack.id}`,
    name: pack.title,
    version: "1.0.0",
    description: pack.description,
    category: "assurance" as PackCategory,
    source: "builtin",
    publisher: { org: "AMC Core" },
    tags: ["assurance", "red-team", "builtin"],
    artifactKinds: ["assurance_pack"],
    installed: true,
    featured: false,
    deprecated: false,
    createdTs: now,
    updatedTs: now
  };
}

/* ── Policy pack → catalog entry ──────────────────────────────── */

function policyPackToCatalog(pack: {
  id: string;
  name: string;
  description: string;
  archetypeId: string;
  riskTier: string;
}): MarketplaceCatalogEntry {
  const now = Date.now();
  return {
    id: `policy:${pack.id}`,
    name: pack.name,
    version: "1.0.0",
    description: pack.description,
    category: "policy" as PackCategory,
    source: "builtin",
    riskCategory: mapRiskTier(pack.riskTier),
    publisher: { org: "AMC Core" },
    tags: ["policy", "builtin", pack.archetypeId],
    artifactKinds: ["policy_pack"],
    installed: true,
    featured: false,
    deprecated: false,
    createdTs: now,
    updatedTs: now
  };
}

function mapRiskTier(tier: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const t = tier.toUpperCase();
  if (t === "LOW" || t === "MEDIUM" || t === "HIGH" || t === "CRITICAL") return t;
  return "MEDIUM";
}

/* ── Build full catalog ───────────────────────────────────────── */

export async function buildCatalog(
  workspace: string,
  opts?: { includeRemote?: boolean }
): Promise<MarketplaceCatalogEntry[]> {
  ensureMarketplaceStore(workspace);

  const catalog: MarketplaceCatalogEntry[] = [];
  const featuredIds = new Set(getFeatured(workspace));

  // 1. Built-in assurance packs
  try {
    const assurancePacks = listAssurancePacks();
    for (const pack of assurancePacks) {
      const entry = assurancePackToCatalog(pack);
      entry.featured = featuredIds.has(entry.id);
      const dep = isDeprecated(workspace, entry.id);
      entry.deprecated = dep.deprecated;
      entry.deprecationNote = dep.note;
      entry.rating = getRatingStats(workspace, entry.id);
      catalog.push(entry);
    }
  } catch {
    // assurance packs may not be available in all configurations
  }

  // 2. Built-in policy packs
  try {
    const policyPacks = listPolicyPacks();
    for (const pack of policyPacks) {
      const entry = policyPackToCatalog({
        id: pack.id ?? "",
        name: pack.name ?? "",
        description: pack.description ?? "",
        archetypeId: pack.archetypeId ?? "",
        riskTier: pack.riskTier ?? "medium"
      });
      entry.featured = featuredIds.has(entry.id);
      const dep = isDeprecated(workspace, entry.id);
      entry.deprecated = dep.deprecated;
      entry.deprecationNote = dep.note;
      entry.rating = getRatingStats(workspace, entry.id);
      catalog.push(entry);
    }
  } catch {
    // policy packs may not be available
  }

  // 3. Remote registry plugins
  if (opts?.includeRemote !== false) {
    try {
      const registriesConfig = loadSignedPluginRegistriesConfig(workspace);
      const installedResult = listInstalledPlugins(workspace);
      const installedMap = new Map(installedResult.items.map((p) => [p.id, p]));

      for (const reg of registriesConfig.pluginRegistries.registries) {
        try {
          const index = await browseRegistry({ registryBase: reg.base, trust: registryTrust(reg.pinnedRegistryPubkeyFingerprint) });
          for (const plugin of index.plugins) {
            const latestVersion = plugin.versions[plugin.versions.length - 1];
            if (!latestVersion) continue;

            const entryId = `registry:${reg.id}:${plugin.id}`;
            const inst = installedMap.get(plugin.id);
            const entry: MarketplaceCatalogEntry = {
              id: entryId,
              name: plugin.id,
              version: latestVersion.version,
              description: `Plugin ${plugin.id} from registry ${reg.id}`,
              category: "other" as PackCategory,
              source: "registry",
              riskCategory: latestVersion.riskCategory,
              publisher: {
                org: reg.id,
                fingerprint: latestVersion.publisherFingerprint
              },
              tags: ["registry", reg.id],
              artifactKinds: [],
              registryId: reg.id,
              sha256: latestVersion.sha256,
              installed: !!inst,
              installedVersion: inst?.version,
              featured: featuredIds.has(entryId),
              deprecated: isDeprecated(workspace, entryId).deprecated,
              deprecationNote: isDeprecated(workspace, entryId).note,
              rating: getRatingStats(workspace, entryId),
              createdTs: Date.now(),
              updatedTs: Date.now()
            };
            catalog.push(entry);
          }
        } catch {
          // individual registry failure is non-fatal
        }
      }
    } catch {
      // registries config may not exist
    }
  }

  return catalog;
}

/* ── Search / filter ──────────────────────────────────────────── */

export async function searchCatalog(
  workspace: string,
  params: MarketplaceSearchParams
): Promise<{ entries: MarketplaceCatalogEntry[]; total: number }> {
  let catalog = await buildCatalog(workspace);

  // Filter
  if (params.query) {
    const q = params.query.toLowerCase();
    catalog = catalog.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (params.category) catalog = catalog.filter((e) => e.category === params.category);
  if (params.source) catalog = catalog.filter((e) => e.source === params.source);
  if (params.riskCategory) catalog = catalog.filter((e) => e.riskCategory === params.riskCategory);
  if (params.installed !== undefined) catalog = catalog.filter((e) => e.installed === params.installed);
  if (params.featured) catalog = catalog.filter((e) => e.featured);
  if (params.minRating !== undefined) {
    catalog = catalog.filter((e) => (e.rating?.averageScore ?? 0) >= params.minRating!);
  }
  if (params.tags && params.tags.length > 0) {
    const tagSet = new Set(params.tags.map((t) => t.toLowerCase()));
    catalog = catalog.filter((e) => e.tags.some((t) => tagSet.has(t.toLowerCase())));
  }

  // Sort
  const total = catalog.length;
  const sortWorkspace = workspace; // capture for closure
  catalog.sort((a, b) => {
    let cmp = 0;
    switch (params.sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "rating":
        cmp = (a.rating?.averageScore ?? 0) - (b.rating?.averageScore ?? 0);
        break;
      case "updated":
        cmp = a.updatedTs - b.updatedTs;
        break;
      case "downloads":
        cmp = getInstallCount(sortWorkspace, a.id) - getInstallCount(sortWorkspace, b.id);
        break;
    }
    return params.sortOrder === "desc" ? -cmp : cmp;
  });

  // Paginate
  const start = params.offset ?? 0;
  const limit = params.limit ?? 50;
  const entries = catalog.slice(start, start + limit);

  return { entries, total };
}

/* ── Resolve a pack by name (for `amc pack install <name>`) ───── */

export async function resolvePack(
  workspace: string,
  name: string
): Promise<MarketplaceCatalogEntry | undefined> {
  const catalog = await buildCatalog(workspace);

  // Try exact ID match first
  const exact = catalog.find((e) => e.id === name);
  if (exact) return exact;

  // Try partial: assurance:<name>, policy:<name>, registry:*:<name>
  const byName = catalog.find(
    (e) =>
      e.name.toLowerCase() === name.toLowerCase() ||
      e.id.endsWith(`:${name}`) ||
      e.id === `assurance:${name}` ||
      e.id === `policy:${name}`
  );
  return byName;
}
