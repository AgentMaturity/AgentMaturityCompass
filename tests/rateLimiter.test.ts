import { describe, expect, test } from "vitest";
import { makeRateLimiter, makeRateLimiterDetailed } from "../src/studio/rateLimiter.js";

// LIVE-RUNTIME-04 (D-R16): client-chosen keys never grow the bucket map without bound.
describe("rate limiter bucket bounds", () => {
  test("allows `limit` requests per window and refuses the next", () => {
    let at = 0;
    const limiter = makeRateLimiter(3, 1_000, () => at);
    expect([limiter("a"), limiter("a"), limiter("a"), limiter("a")]).toEqual([true, true, true, false]);
    at = 1_000;
    expect(limiter("a")).toBe(true);
  });

  test("past 10,000 keys, expired buckets are pruned when a new key arrives", () => {
    let at = 0;
    const limiter = makeRateLimiterDetailed(1, 1_000, () => at);
    for (let i = 0; i < 10_001; i += 1) limiter(`old-${i}`);
    at = 2_000; // every old bucket has expired
    // Unpruned, the 10,001 dead rows plus these 40,000 live ones would pass the 50,000-key cap and refuse new keys.
    for (let i = 0; i < 40_000; i += 1) expect(limiter(`live-${i}`).allowed).toBe(true);
    expect(limiter("one-more-key").allowed).toBe(true);
  });

  test("50,000 live keys refuse a new key with the same 429 decision", () => {
    const limiter = makeRateLimiterDetailed(5, 60_000, () => 0);
    for (let i = 0; i < 50_000; i += 1) expect(limiter(`k-${i}`).allowed).toBe(true);
    const refused = limiter("k-new");
    expect(refused).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(limiter("k-1").allowed, "an existing key keeps its bucket").toBe(true);
  });
});
