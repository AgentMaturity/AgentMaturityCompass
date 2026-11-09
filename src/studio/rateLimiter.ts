import type { ServerResponse } from "node:http";

/**
 * Fixed-window, in-memory request limiters for Studio, the host router and the hosted API (LIVE-RUNTIME-04).
 *
 * Keys come from clients (an address, an address plus a route), so the bucket map must stay bounded (D-R16). Buckets
 * sit in creation order, which is expiry order, so expired ones are swept from the front as new keys arrive; a map of
 * MAX_KEYS live buckets drops its oldest. It never refuses a new key: refusing let one client that rotated keys lock
 * every other client out, health and readiness probes included (skeptic D3). A restart clears every bucket.
 */
const MAX_KEYS = 50_000;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTs: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetTs: number;
}

/** The live bucket for `key`, or a fresh one. */
function bucketFor(buckets: Map<string, Bucket>, key: string, now: number, intervalMs: number): Bucket {
  const existing = buckets.get(key);
  if (existing && existing.resetTs > now) return existing;
  if (existing) buckets.delete(key);
  for (const [name, bucket] of buckets) {
    if (bucket.resetTs > now && buckets.size < MAX_KEYS) break; // the oldest is live and there is room
    buckets.delete(name); // expired, or the oldest live bucket of a full map
  }
  const fresh = { count: 0, resetTs: now + intervalMs };
  buckets.set(key, fresh);
  return fresh;
}

export function makeRateLimiterDetailed(limit: number, intervalMs: number, now: () => number = Date.now): (key: string) => RateLimitDecision {
  const buckets = new Map<string, Bucket>();
  return (key: string): RateLimitDecision => {
    const at = now();
    const bucket = bucketFor(buckets, key, at, intervalMs);
    if (bucket.count >= limit) {
      return { allowed: false, limit, remaining: 0, resetTs: bucket.resetTs, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetTs - at) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, limit, remaining: Math.max(0, limit - bucket.count), resetTs: bucket.resetTs, retryAfterSeconds: 0 };
  };
}

export function makeRateLimiter(limit: number, intervalMs: number, now: () => number = Date.now): (key: string) => boolean {
  const decide = makeRateLimiterDetailed(limit, intervalMs, now);
  return (key: string): boolean => decide(key).allowed;
}

export function setRateLimitHeaders(res: ServerResponse, decision: RateLimitDecision): void {
  const now = Date.now();
  const resetAfterSeconds = Math.max(0, Math.ceil((decision.resetTs - now) / 1000));
  const resetEpochSeconds = Math.max(0, Math.floor(decision.resetTs / 1000));
  res.setHeader("x-ratelimit-limit", String(decision.limit));
  res.setHeader("x-ratelimit-remaining", String(decision.remaining));
  res.setHeader("x-ratelimit-reset", String(resetEpochSeconds));
  res.setHeader("ratelimit-limit", String(decision.limit));
  res.setHeader("ratelimit-remaining", String(decision.remaining));
  res.setHeader("ratelimit-reset", String(resetAfterSeconds));
  if (!decision.allowed && decision.retryAfterSeconds > 0) {
    res.setHeader("retry-after", String(decision.retryAfterSeconds));
  }
}

/**
 * Open long-lived streams per hub (LIVE-RUNTIME-13, SR-8): at most `max` in all and `perPrincipal` per principal (a
 * user, a token, an agent). A principal at its own limit gets its oldest stream closed to make room, so one signed-in
 * user can never hold the hub against everyone else. A full hub refuses new principals, except privileged ones (host
 * admins, the admin token), who are always admitted within their own limit.
 */
export function createStreamCap(max: number, perPrincipal: number): {
  /** Null when refused (answer 503); else the release to call when the stream closes (calling it twice is harmless). */
  admit(principal: string, close: () => void, privileged?: boolean): (() => void) | null;
} {
  const open = new Map<string, Set<{ close: () => void }>>(); // per principal, oldest first
  let total = 0;
  const drop = (principal: string, entry: { close: () => void }): void => {
    const own = open.get(principal);
    if (!own?.delete(entry)) return;
    if (own.size === 0) open.delete(principal);
    total -= 1;
  };
  return {
    admit(principal, close, privileged = false) {
      const own = open.get(principal) ?? new Set<{ close: () => void }>();
      if (own.size >= perPrincipal) {
        const oldest = own.values().next().value!;
        drop(principal, oldest);
        oldest.close();
      } else if (total >= max && !privileged) {
        return null;
      }
      const entry = { close };
      open.set(principal, own.add(entry));
      total += 1;
      return () => drop(principal, entry);
    }
  };
}
