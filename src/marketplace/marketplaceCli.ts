import { cliInitiator } from "../approvals/approvalEngine.js";
/**
 * marketplace/marketplaceCli.ts — CLI functions for `amc pack` marketplace commands.
 *
 * Provides: search, info, install, uninstall, rate, featured, list.
 */

import { requestPluginInstall, requestPluginRemove, listInstalledPlugins } from "../plugins/pluginApi.js";
import { browseRegistry } from "../plugins/pluginRegistryClient.js";
import { loadPluginRegistriesConfig } from "../plugins/pluginStore.js";
import {
  buildCatalog,
  searchCatalog,
  resolvePack
} from "./marketplaceIndex.js";
import {
  addOrUpdateRating,
  getRatings,
  getRatingStats,
  incrementInstallCount,
  getFeatured,
  setFeatured,
  deprecatePack,
  undeprecatePack,
  ensureMarketplaceStore
} from "./marketplaceStore.js";
import type {
  MarketplaceCatalogEntry,
  MarketplaceSearchParams,
  PackRating,
  PackRatingStats
} from "./marketplaceTypes.js";

/* ── amc pack search ──────────────────────────────────────────── */

export async function packSearchCli(params: {
  workspace: string;
  query?: string;
  category?: string;
  source?: string;
  installed?: boolean;
  featured?: boolean;
  minRating?: number;
  tags?: string[];
  sortBy?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: MarketplaceCatalogEntry[]; total: number }> {
  ensureMarketplaceStore(params.workspace);
  const searchParams: MarketplaceSearchParams = {
    query: params.query,
    category: params.category as any,
    source: params.source as any,
    installed: params.installed,
    featured: params.featured,
    minRating: params.minRating,
    tags: params.tags,
    sortBy: (params.sortBy as any) ?? "name",
    sortOrder: "asc",
    limit: params.limit ?? 50,
    offset: params.offset ?? 0
  };
  return searchCatalog(params.workspace, searchParams);
}

/* ── amc pack info <name> ─────────────────────────────────────── */

export async function packInfoCli(params: {
  workspace: string;
  name: string;
}): Promise<{
  entry: MarketplaceCatalogEntry;
  ratings: PackRating[];
  stats: PackRatingStats;
} | null> {
  ensureMarketplaceStore(params.workspace);
  const entry = await resolvePack(params.workspace, params.name);
  if (!entry) return null;
  const ratings = getRatings(params.workspace, entry.id);
  const stats = getRatingStats(params.workspace, entry.id);
  return { entry, ratings, stats };
}

/* ── amc pack install <name> ──────────────────────────────────── */

export async function packInstallCli(params: {
  workspace: string;
  name: string;
  version?: string;
  agentId: string;
}): Promise<{
  success: boolean;
  packId: string;
  version: string;
  source: string;
  message: string;
}> {
  ensureMarketplaceStore(params.workspace);
  const entry = await resolvePack(params.workspace, params.name);
  if (!entry) {
    return {
      success: false,
      packId: params.name,
      version: "",
      source: "",
      message: `Pack "${params.name}" not found in marketplace. Use 'amc pack search' to browse available packs.`
    };
  }

  if (entry.deprecated) {
    return {
      success: false,
      packId: entry.id,
      version: entry.version,
      source: entry.source,
      message: `Pack "${entry.name}" is deprecated${entry.deprecationNote ? `: ${entry.deprecationNote}` : ""}. Use --force to install anyway.`
    };
  }

  // Built-in packs are always installed
  if (entry.source === "builtin") {
    return {
      success: true,
      packId: entry.id,
      version: entry.version,
      source: "builtin",
      message: `Pack "${entry.name}" is a built-in pack and is already available. No installation needed.`
    };
  }

  // Registry packs go through the plugin install flow
  if (entry.source === "registry" && entry.registryId) {
    try {
      const result = await requestPluginInstall({
        workspace: params.workspace,
        initiator: cliInitiator(),
        agentId: params.agentId,
        pluginRef: entry.name,
        registryId: entry.registryId
      });
      incrementInstallCount(params.workspace, entry.id);
      return {
        success: true,
        packId: entry.id,
        version: result.version ?? params.version ?? entry.version,
        source: "registry",
        message: `Pack "${entry.name}" v${result.version} install requested from registry "${entry.registryId}". Approval required — check 'amc plugin pending' (request: ${result.requestId}).`
      };
    } catch (err: any) {
      return {
        success: false,
        packId: entry.id,
        version: params.version ?? entry.version,
        source: "registry",
        message: `Install failed: ${err.message ?? String(err)}`
      };
    }
  }

  return {
    success: false,
    packId: entry.id,
    version: entry.version,
    source: entry.source,
    message: `Pack "${entry.name}" cannot be installed from this source (${entry.source}).`
  };
}

/* ── amc pack uninstall <name> ────────────────────────────────── */

export async function packUninstallCli(params: {
  workspace: string;
  name: string;
  agentId: string;
}): Promise<{ success: boolean; message: string }> {
  ensureMarketplaceStore(params.workspace);
  const entry = await resolvePack(params.workspace, params.name);
  if (!entry) {
    return { success: false, message: `Pack "${params.name}" not found.` };
  }
  if (entry.source === "builtin") {
    return { success: false, message: `Built-in pack "${entry.name}" cannot be uninstalled.` };
  }
  try {
    requestPluginRemove({
      workspace: params.workspace,
      initiator: cliInitiator(),
      agentId: params.agentId,
      pluginId: entry.name
    });
    return { success: true, message: `Pack "${entry.name}" uninstall requested.` };
  } catch (err: any) {
    return { success: false, message: `Uninstall failed: ${err.message ?? String(err)}` };
  }
}

/* ── amc pack rate <name> ─────────────────────────────────────── */

export function packRateCli(params: {
  workspace: string;
  name: string;
  userId: string;
  score: number;
  review?: string;
}): PackRatingStats | null {
  ensureMarketplaceStore(params.workspace);
  // We accept the pack name directly as ID for rating
  const rating = {
    packId: params.name,
    userId: params.userId,
    score: params.score,
    review: params.review,
    createdTs: Date.now(),
    updatedTs: Date.now()
  };
  return addOrUpdateRating(params.workspace, rating);
}

/* ── amc pack featured ────────────────────────────────────────── */

export function packFeaturedCli(params: {
  workspace: string;
}): string[] {
  ensureMarketplaceStore(params.workspace);
  return getFeatured(params.workspace);
}

export function packSetFeaturedCli(params: {
  workspace: string;
  packIds: string[];
}): void {
  ensureMarketplaceStore(params.workspace);
  setFeatured(params.workspace, params.packIds);
}

/* ── amc pack deprecate / undeprecate ─────────────────────────── */

export function packDeprecateCli(params: {
  workspace: string;
  packId: string;
  note?: string;
}): void {
  ensureMarketplaceStore(params.workspace);
  deprecatePack(params.workspace, params.packId, params.note);
}

export function packUndeprecateCli(params: {
  workspace: string;
  packId: string;
}): void {
  ensureMarketplaceStore(params.workspace);
  undeprecatePack(params.workspace, params.packId);
}

/* ── amc pack list (installed) ────────────────────────────────── */

export async function packListCli(params: {
  workspace: string;
}): Promise<MarketplaceCatalogEntry[]> {
  ensureMarketplaceStore(params.workspace);
  const catalog = await buildCatalog(params.workspace);
  return catalog.filter((e) => e.installed);
}
