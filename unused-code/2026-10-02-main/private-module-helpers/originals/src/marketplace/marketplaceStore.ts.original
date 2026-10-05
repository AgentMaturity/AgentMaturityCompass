/**
 * marketplace/marketplaceStore.ts — Persistent store for marketplace metadata.
 *
 * Manages ratings, install counts, featured flags, and deprecation records.
 * Backed by a JSON file in the workspace .amc directory.
 */

import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  marketplaceStoreSchema,
  packRatingStatsSchema,
  type MarketplaceStore,
  type PackRating,
  type PackRatingStats
} from "./marketplaceTypes.js";

/* ── Paths ────────────────────────────────────────────────────── */

export function marketplaceRoot(workspace: string): string {
  return join(workspace, ".amc", "marketplace");
}

export function marketplaceStorePath(workspace: string): string {
  return join(marketplaceRoot(workspace), "store.json");
}

/* ── Defaults ─────────────────────────────────────────────────── */

export function defaultMarketplaceStore(): MarketplaceStore {
  return marketplaceStoreSchema.parse({
    v: 1,
    updatedTs: Date.now(),
    ratings: [],
    installCounts: {},
    featured: [],
    deprecated: []
  });
}

/* ── Init ─────────────────────────────────────────────────────── */

export function ensureMarketplaceStore(workspace: string): void {
  ensureDir(marketplaceRoot(workspace));
  const storePath = marketplaceStorePath(workspace);
  if (!pathExists(storePath)) {
    saveMarketplaceStore(workspace, defaultMarketplaceStore());
  }
}

/* ── Load / Save ──────────────────────────────────────────────── */

export function loadMarketplaceStore(workspace: string): MarketplaceStore {
  const storePath = marketplaceStorePath(workspace);
  if (!pathExists(storePath)) return defaultMarketplaceStore();
  const raw = readUtf8(storePath);
  return marketplaceStoreSchema.parse(JSON.parse(raw));
}

export function saveMarketplaceStore(workspace: string, store: MarketplaceStore): void {
  ensureDir(marketplaceRoot(workspace));
  store.updatedTs = Date.now();
  const validated = marketplaceStoreSchema.parse(store);
  writeFileAtomic(marketplaceStorePath(workspace), JSON.stringify(validated, null, 2));
}

/* ── Ratings ──────────────────────────────────────────────────── */

export function addOrUpdateRating(
  workspace: string,
  rating: PackRating
): PackRatingStats {
  const store = loadMarketplaceStore(workspace);
  const existing = store.ratings.findIndex(
    (r) => r.packId === rating.packId && r.userId === rating.userId
  );
  if (existing >= 0) {
    store.ratings[existing] = { ...rating, updatedTs: Date.now() };
  } else {
    store.ratings.push({ ...rating, createdTs: Date.now(), updatedTs: Date.now() });
  }
  saveMarketplaceStore(workspace, store);
  return computeRatingStats(store, rating.packId);
}

export function getRatings(workspace: string, packId: string): PackRating[] {
  const store = loadMarketplaceStore(workspace);
  return store.ratings.filter((r) => r.packId === packId);
}

export function getRatingStats(workspace: string, packId: string): PackRatingStats {
  const store = loadMarketplaceStore(workspace);
  return computeRatingStats(store, packId);
}

function computeRatingStats(store: MarketplaceStore, packId: string): PackRatingStats {
  const ratings = store.ratings.filter((r) => r.packId === packId);
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let total = 0;
  for (const r of ratings) {
    const key = String(r.score) as keyof typeof distribution;
    if (key in distribution) {
      distribution[key] += 1;
      total += r.score;
    }
  }
  return packRatingStatsSchema.parse({
    packId,
    totalRatings: ratings.length,
    averageScore: ratings.length > 0 ? Math.round((total / ratings.length) * 100) / 100 : 0,
    distribution
  });
}

/* ── Install counts ───────────────────────────────────────────── */

export function incrementInstallCount(workspace: string, packId: string): number {
  const store = loadMarketplaceStore(workspace);
  const current = store.installCounts[packId] ?? 0;
  store.installCounts[packId] = current + 1;
  saveMarketplaceStore(workspace, store);
  return current + 1;
}

export function getInstallCount(workspace: string, packId: string): number {
  const store = loadMarketplaceStore(workspace);
  return store.installCounts[packId] ?? 0;
}

/* ── Featured ─────────────────────────────────────────────────── */

export function setFeatured(workspace: string, packIds: string[]): void {
  const store = loadMarketplaceStore(workspace);
  store.featured = Array.from(new Set(packIds));
  saveMarketplaceStore(workspace, store);
}

export function getFeatured(workspace: string): string[] {
  const store = loadMarketplaceStore(workspace);
  return store.featured;
}

/* ── Deprecation ──────────────────────────────────────────────── */

export function deprecatePack(workspace: string, packId: string, note?: string): void {
  const store = loadMarketplaceStore(workspace);
  const existing = store.deprecated.find((d) => d.packId === packId);
  if (!existing) {
    store.deprecated.push({ packId, note, since: Date.now() });
  } else {
    existing.note = note;
  }
  saveMarketplaceStore(workspace, store);
}

export function undeprecatePack(workspace: string, packId: string): void {
  const store = loadMarketplaceStore(workspace);
  store.deprecated = store.deprecated.filter((d) => d.packId !== packId);
  saveMarketplaceStore(workspace, store);
}

export function isDeprecated(workspace: string, packId: string): { deprecated: boolean; note?: string } {
  const store = loadMarketplaceStore(workspace);
  const entry = store.deprecated.find((d) => d.packId === packId);
  return entry ? { deprecated: true, note: entry.note } : { deprecated: false };
}
