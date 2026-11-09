import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * DNS-rebinding residual (follow-up 11): a workspace API the host router starts binds loopback and trusts its peer as
 * the router (one forwarding hop), so a page whose name rebinds to 127.0.0.1, or any local process, reaching that port
 * directly would skip the router's Host check by adding X-Forwarded-For. The router sends a per-boot random secret on
 * every request it proxies; such a workspace API refuses any request without it. The secret lives in memory only.
 */
export const ROUTER_SECRET_HEADER = "x-amc-router-secret";

export function newRouterSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Whether `req` carries `secret`; the header is removed either way, so nothing past the check sees it. */
export function routerSecretValid(req: IncomingMessage, secret: string): boolean {
  const supplied = req.headers[ROUTER_SECRET_HEADER];
  delete req.headers[ROUTER_SECRET_HEADER];
  if (typeof supplied !== "string" || secret.length === 0) return false;
  const a = Buffer.from(supplied), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
