// The host router's portfolio endpoints (/host/api/portfolio/forecast, /host/api/bench/portfolio) exist only behind the
// host router, whose workspace consoles live under /w/<id>/. A single-workspace console has no host router, so it renders
// its fallback without probing them (follow-up 8): the probe only ever answered 404 there.

/** The host router's own path for a host API, or null when this console is not behind the host router. */
export function hostRouterPath(path, pathname = globalThis.location?.pathname ?? "/") {
  return pathname.startsWith("/w/") ? `/host${path}` : null;
}

/** The bench portfolio rows: the host router's in host mode (its `rows`), else none; a failed probe renders none too. */
export async function loadBenchPortfolio(apiGet, pathname) {
  const path = hostRouterPath("/api/bench/portfolio", pathname);
  if (path === null) return { rows: [] };
  return apiGet(path).catch(() => ({ rows: [] }));
}
