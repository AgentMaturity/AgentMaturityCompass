/**
 * marketplace/marketplaceRouter.ts — API routes for /api/v1/marketplace/*.
 *
 * Exposes: GET catalog, GET search, GET pack info, POST rating, GET stats.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { apiError, apiSuccess, bodyJson } from "../api/apiHelpers.js";
import { buildCatalog, searchCatalog, resolvePack } from "./marketplaceIndex.js";
import {
  addOrUpdateRating,
  getRatings,
  getRatingStats,
  getInstallCount,
  ensureMarketplaceStore
} from "./marketplaceStore.js";
import { marketplaceSearchParamsSchema, packRatingSchema } from "./marketplaceTypes.js";

export async function handleMarketplaceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace: string
): Promise<boolean> {
  const prefix = "/api/v1/marketplace";
  if (!pathname.startsWith(prefix)) return false;
  const sub = pathname.slice(prefix.length) || "/";

  ensureMarketplaceStore(workspace);

  /* ── GET /api/v1/marketplace/catalog ──────────────────────── */
  if (sub === "/catalog" && method === "GET") {
    const catalog = await buildCatalog(workspace);
    apiSuccess(res, { total: catalog.length, entries: catalog });
    return true;
  }

  /* ── GET /api/v1/marketplace/search?q=...&category=...&... ── */
  if (sub === "/search" && method === "GET") {
    const url = new URL(pathname, `http://${req.headers.host ?? "localhost"}`);
    // Re-parse from actual request URL for query params
    const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const params = marketplaceSearchParamsSchema.parse({
      query: reqUrl.searchParams.get("q") ?? undefined,
      category: reqUrl.searchParams.get("category") ?? undefined,
      source: reqUrl.searchParams.get("source") ?? undefined,
      riskCategory: reqUrl.searchParams.get("risk") ?? undefined,
      installed: reqUrl.searchParams.has("installed") ? reqUrl.searchParams.get("installed") === "true" : undefined,
      featured: reqUrl.searchParams.has("featured") ? reqUrl.searchParams.get("featured") === "true" : undefined,
      minRating: reqUrl.searchParams.has("minRating") ? Number(reqUrl.searchParams.get("minRating")) : undefined,
      tags: reqUrl.searchParams.has("tags") ? reqUrl.searchParams.get("tags")!.split(",") : undefined,
      sortBy: reqUrl.searchParams.get("sort") ?? "name",
      sortOrder: (reqUrl.searchParams.get("order") as "asc" | "desc") ?? "asc",
      limit: reqUrl.searchParams.has("limit") ? Number(reqUrl.searchParams.get("limit")) : 50,
      offset: reqUrl.searchParams.has("offset") ? Number(reqUrl.searchParams.get("offset")) : 0
    });
    const result = await searchCatalog(workspace, params);
    apiSuccess(res, result);
    return true;
  }

  /* ── GET /api/v1/marketplace/packs/:name ─────────────────── */
  const packInfoMatch = sub.match(/^\/packs\/(.+?)(?:\/|$)/);
  if (packInfoMatch && method === "GET") {
    const name = decodeURIComponent(packInfoMatch[1]!);
    const subAfterName = sub.slice(`/packs/${packInfoMatch[1]!}`.length) || "/";

    /* GET /api/v1/marketplace/packs/:name/ratings ──────────── */
    if (subAfterName === "/ratings") {
      const ratings = getRatings(workspace, name);
      const stats = getRatingStats(workspace, name);
      apiSuccess(res, { stats, ratings });
      return true;
    }

    /* GET /api/v1/marketplace/packs/:name (info) ──────────── */
    if (subAfterName === "/") {
      const entry = await resolvePack(workspace, name);
      if (!entry) {
        apiError(res, 404, `Pack "${name}" not found`);
        return true;
      }
      const stats = getRatingStats(workspace, entry.id);
      const installs = getInstallCount(workspace, entry.id);
      apiSuccess(res, { ...entry, rating: stats, downloads: installs });
      return true;
    }
  }

  /* ── POST /api/v1/marketplace/packs/:name/ratings ────────── */
  const ratingMatch = sub.match(/^\/packs\/(.+?)\/ratings$/);
  if (ratingMatch && method === "POST") {
    const name = decodeURIComponent(ratingMatch[1]!);
    const body = await bodyJson<{ userId: string; score: number; review?: string }>(req);
    const rating = packRatingSchema.parse({
      packId: name,
      userId: body.userId,
      score: body.score,
      review: body.review,
      createdTs: Date.now(),
      updatedTs: Date.now()
    });
    const stats = addOrUpdateRating(workspace, rating);
    apiSuccess(res, stats);
    return true;
  }

  return false;
}
