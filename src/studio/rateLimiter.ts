import type { ServerResponse } from "node:http";

/**
 * Fixed-window, in-memory request limiters for Studio, the host router and the hosted API (LIVE-RUNTIME-04).
 *
 * Keys come from clients (an address, an address plus a route), so the bucket map must stay bounded: once it passes
 * PRUNE_AT entries, expired buckets are swept before a new key is added, and past MAX_KEYS a new key is refused like
 * any limited request (D-R16). A restart clears every bucket.
 */
const PRUNE_AT = 10_000;
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

/** The live bucket for `key`, a fresh one, or null when the map is full of live buckets. */
function bucketFor(buckets: Map<string, Bucket>, key: string, now: number, intervalMs: number): Bucket | null {
  const existing = buckets.get(key);
  if (existing && existing.resetTs > now) return existing;
  if (existing) buckets.delete(key);
  // ponytail: an O(n) sweep only when a new key arrives past PRUNE_AT; a timer wheel if that ever shows in a profile.
  if (buckets.size >= PRUNE_AT) {
    for (const [name, bucket] of buckets) if (bucket.resetTs <= now) buckets.delete(name);
  }
  if (buckets.size >= MAX_KEYS) return null;
  const fresh = { count: 0, resetTs: now + intervalMs };
  buckets.set(key, fresh);
  return fresh;
}

export function makeRateLimiterDetailed(limit: number, intervalMs: number, now: () => number = Date.now): (key: string) => RateLimitDecision {
  const buckets = new Map<string, Bucket>();
  return (key: string): RateLimitDecision => {
    const at = now();
    const bucket = bucketFor(buckets, key, at, intervalMs);
    if (!bucket || bucket.count >= limit) {
      const resetTs = bucket?.resetTs ?? at + intervalMs;
      return { allowed: false, limit, remaining: 0, resetTs, retryAfterSeconds: Math.max(1, Math.ceil((resetTs - at) / 1000)) };
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

/** A count of open long-lived streams with a ceiling (LIVE-RUNTIME-13): `acquire` is false at the cap. */
export function createClientCap(max: number): { acquire: () => boolean; release: () => void } {
  let open = 0;
  return {
    acquire: () => (open < max ? (open += 1, true) : false),
    release: () => { open = Math.max(0, open - 1); }
  };
}
