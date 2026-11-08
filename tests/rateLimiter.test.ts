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

  test("expired buckets are pruned when a new key arrives, so they never crowd out live ones", () => {
    let at = 0;
    const limiter = makeRateLimiterDetailed(1, 1_000, () => at);
    for (let i = 0; i < 30_000; i += 1) limiter(`old-${i}`);
    at = 2_000; // every old bucket has expired
    // Unpruned, the 30,000 dead rows would fill the 50,000-key map and push these live ones out.
    for (let i = 0; i < 40_000; i += 1) expect(limiter(`live-${i}`).allowed).toBe(true);
    expect(limiter("live-0").allowed, "the first live key still has its bucket (and its count)").toBe(false);
  });

  // Skeptic D3: refusing new keys at the cap let one client that rotated keys lock every other client out (Studio's
  // /healthz and /readyz included). A full map now drops its oldest bucket instead.
  test("50,000 live keys: a new key is admitted and the oldest bucket is dropped", () => {
    const limiter = makeRateLimiterDetailed(1, 60_000, () => 0);
    for (let i = 0; i < 50_000; i += 1) expect(limiter(`k-${i}`).allowed).toBe(true);
    expect(limiter("probe").allowed, "a new client is never refused because of others").toBe(true);
    expect(limiter("k-1").allowed, "a recent key keeps its bucket").toBe(false);
    expect(limiter("k-0").allowed, "the oldest bucket was dropped, so it starts again").toBe(true);
  });
});
