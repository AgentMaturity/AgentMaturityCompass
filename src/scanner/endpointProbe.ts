import { formatMaturityOrdinal } from "../score/maturityTaxonomy.js";

export interface EndpointProbeResult {
  url: string;
  reachable: boolean;
  responseTimeMs: number;
  headers: Record<string, string>;
  signals: string[];
  preliminaryScore: { level: number; label: string; confidence: number };
}

export async function probeEndpoint(url: string): Promise<EndpointProbeResult> {
  const signals: string[] = [];
  const start = Date.now();
  let reachable = false;
  let headers: Record<string, string> = {};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    reachable = true;
    const h: Record<string, string> = {};
    resp.headers.forEach((v, k) => { h[k] = v; });
    headers = h;

    // Check security headers
    if (headers["x-content-type-options"]) signals.push("security-headers-present");
    if (headers["strict-transport-security"]) signals.push("hsts-enabled");
    if (headers["content-security-policy"]) signals.push("csp-enabled");
    if (headers["x-ratelimit-limit"] || headers["ratelimit-limit"]) signals.push("rate-limiting");
    if (resp.status === 401 || resp.status === 403) signals.push("auth-required");

    // Check for common agent API patterns
    const contentType = headers["content-type"] || "";
    if (contentType.includes("json")) signals.push("json-api");

    // Try /health or /docs
    try {
      const healthResp = await fetch(new URL("/health", url).toString(), { method: "GET", signal: AbortSignal.timeout(5000) });
      if (healthResp.ok) signals.push("health-endpoint");
    } catch {}
    try {
      const docsResp = await fetch(new URL("/docs", url).toString(), { method: "GET", signal: AbortSignal.timeout(5000) });
      if (docsResp.ok) signals.push("api-docs-available");
    } catch {}
  } catch {
    reachable = false;
  }

  const responseTimeMs = Date.now() - start;
  let level = reachable ? 1 : 0;
  if (signals.includes("rate-limiting") && signals.includes("auth-required")) level = 3;
  else if (signals.includes("auth-required") || signals.length >= 3) level = 2;

  return {
    url,
    reachable,
    responseTimeMs,
    headers,
    signals,
    preliminaryScore: { level, label: formatMaturityOrdinal(level), confidence: reachable ? 0.3 : 0 },
  };
}
