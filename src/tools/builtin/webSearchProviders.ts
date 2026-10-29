import { originForEntry } from "./nativeToolBreadth/originPolicy.js";
import type { WebSearchProvider, WebSearchResult } from "./webSearchTool.js";

/**
 * The one shipped `web_search` provider (DXC-25): a SearXNG JSON endpoint the
 * OPERATOR runs or chooses, named with `--web-search-searxng <origin>`.
 *
 * Opt-in twice: nothing is configured by default, and the origin must also be
 * granted under `web_search` in the signed tools policy, because every request
 * goes through the tool's governed GET (origin allowlist, egress decision,
 * byte cap, no redirects). SearXNG needs no credential, so none is configured,
 * stored or sent, and no network dependency is added.
 */

export class WebSearchProviderConfigError extends Error {}

const MAX_RESULTS_READ = 100;

export function searxngSearchProvider(origin: string): WebSearchProvider {
  // An explicit origin only: a bare host would silently mean https on 443.
  const granted = origin.includes("://") ? originForEntry(origin) : null;
  if (granted === null) {
    throw new WebSearchProviderConfigError(`--web-search-searxng needs an http(s) origin with no path, query or credentials, e.g. https://search.example.org; got ${JSON.stringify(origin)}`);
  }
  return {
    id: "searxng",
    origin: granted,
    async search({ query, limit, get }) {
      const url = new URL("/search", granted);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      const response = await get(url.toString());
      if (response.status !== 200) throw new Error(`searxng answered HTTP ${response.status}`);
      let parsed: unknown;
      try { parsed = JSON.parse(response.body); } catch { throw new Error("searxng answered with a body that is not JSON"); }
      const results = (parsed as { results?: unknown } | null)?.results;
      if (!Array.isArray(results)) throw new Error("searxng answered without a results array");
      const found: WebSearchResult[] = [];
      for (const entry of results.slice(0, MAX_RESULTS_READ)) {
        const row = entry as { title?: unknown; url?: unknown; content?: unknown } | null;
        if (typeof row?.url !== "string") continue;
        found.push({ title: typeof row.title === "string" ? row.title : "", url: row.url, snippet: typeof row.content === "string" ? row.content : "" });
        if (found.length >= limit) break;
      }
      return found;
    }
  };
}
