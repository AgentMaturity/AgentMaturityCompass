import type { ServerResponse } from "node:http";

/**
 * Headers every JSON server sets on the responses it writes itself (LIVE-RUNTIME-07, D-R6): Studio, the host router, the
 * gateway and the hosted API. Responses carry leases, CSRF tokens and evidence, so they are `no-store` unless they are
 * console static files. HSTS only when the caller decided the request is HTTPS (a TLS socket, or a trusted hop's
 * `x-forwarded-proto`); a client's own header never decides it. The console keeps r2-d's values: this never sets CSP
 * unless asked, and never overrides a header that is already set.
 */
export const SECURITY_HEADER_NAMES = ["x-content-type-options", "x-frame-options", "referrer-policy", "cache-control",
  "strict-transport-security", "content-security-policy"] as const;

export function applySecurityHeaders(res: ServerResponse, options: { trustedHttps: boolean; noStore: boolean; csp?: string }): void {
  const set = (name: string, value: string): void => {
    if (!res.hasHeader(name)) res.setHeader(name, value);
  };
  set("x-content-type-options", "nosniff");
  set("x-frame-options", "DENY");
  set("referrer-policy", "same-origin");
  if (options.noStore) set("cache-control", "no-store");
  if (options.trustedHttps) set("strict-transport-security", "max-age=31536000");
  if (options.csp) set("content-security-policy", options.csp);
}

/** Every /console path the console serves as a file (its pages and assets); /console/snapshot is authenticated JSON. */
export function isConsoleStaticAsset(pathname: string): boolean {
  return (pathname === "/console" || pathname.startsWith("/console/")) && pathname !== "/console/snapshot";
}
