/**
 * SH-PROVIDERS-04: a provider-requested wait has its own ceiling, rate-limit reset headers name the wait when
 * Retry-After is absent, and the header the wait came from is a recorded fact.
 *
 * Mutation checks: clamp the provider hint to `maxDelayMs` again → (2) fails; read a reset header whose remaining
 * counter is not 0 → (3) fails; consult reset headers on a non-429 → (4) fails; drop `providerDelayHeader` from the
 * settle rebuild in llmRuntime → (5) fails on the loop/retry reason; default maxProviderDelayMs below maxDelayMs → (1) fails.
 */
import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { decideRetry } from "../src/agent/requestRetry.js";
import { nativeRouteFor } from "../src/cli-agent-options.js";
import { classifyResponseFailure } from "../src/llm/adapter/responseFailure.js";
import { bodyFromChunks, type HttpResponse, type HttpTransport } from "../src/llm/adapter/transport.js";
import { LlmError, parseRateLimitResetMs } from "../src/llm/llmFailure.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { resolveRetryPolicy } from "../src/llm/retryPolicy.js";
import { readLoopRetryMeta } from "../src/session/loopEventMeta.js";
import { loopHarness, recordingRetryRuntime, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

const NOW = Date.parse("2026-11-07T12:00:00Z");

describe("SH-PROVIDERS-04 provider-driven retry delays", () => {
  const open: LoopHarness[] = [];
  afterEach(() => {
    for (const harness of open.splice(0)) { try { harness.finish(); } catch { /* closed */ } rmSync(harness.dir, { recursive: true, force: true }); }
  });

  test("(1) the provider ceiling defaults to 60 s, never below the local ceiling, and is validated", () => {
    expect(resolveRetryPolicy(undefined, "t").maxProviderDelayMs).toBe(60_000);
    expect(resolveRetryPolicy({ mode: "normal", backoff: { maxDelayMs: 100_000 } }, "t").maxProviderDelayMs).toBe(100_000);
    expect(resolveRetryPolicy({ mode: "always", backoff: { maxProviderDelayMs: 90_000 } }, "t").maxProviderDelayMs).toBe(90_000);
    expect(() => resolveRetryPolicy({ mode: "normal", backoff: { maxDelayMs: 5_000, maxProviderDelayMs: 1_000 } }, "t")).toThrow(/maxProviderDelayMs/);
    expect(() => resolveRetryPolicy({ mode: "normal", backoff: { maxProviderDelayMs: Number.NaN } }, "t")).toThrow(/maxProviderDelayMs/);
  });

  test("(2) Retry-After: 30 is honoured beyond the 10 s backoff ceiling; a day is clamped to the provider ceiling and the clamp is in the reason", () => {
    const policy = resolveRetryPolicy(undefined, "t");
    const honoured = decideRetry(policy, { message: "x", code: "RATE_LIMIT", providerRetryAfterMs: 30_000, providerDelayHeader: "retry-after" }, 1, () => 0.5);
    expect(honoured).toMatchObject({ decision: "retry", delayMs: 30_000, delaySource: "provider" });
    expect(honoured.reason).toBe("retryable RATE_LIMIT; the provider asked for 30000ms (retry-after)");
    const clamped = decideRetry(policy, { message: "x", code: "RATE_LIMIT", providerRetryAfterMs: 86_400_000 }, 1, () => 0.5);
    expect(clamped).toMatchObject({ delayMs: 60_000, delaySource: "provider" });
    expect(clamped.reason).toMatch(/asked for 86400000ms, clamped to the route's 60000ms provider ceiling/);
    // Local backoff still respects its own, lower ceiling.
    expect(decideRetry(policy, { message: "x", code: "SERVER" }, 5, () => 0.5).delayMs).toBe(8_000);
  });

  test("(3) a reset header counts only when its remaining counter is 0; durations and RFC 3339 instants; the longest exhausted one wins", () => {
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "6m0s" }, NOW)).toEqual({ ms: 360_000, header: "x-ratelimit-reset-requests" });
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "20ms" }, NOW)).toEqual({ ms: 20, header: "x-ratelimit-reset-tokens" });
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "1.5s" }, NOW)).toEqual({ ms: 1500, header: "x-ratelimit-reset-tokens" });
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-requests": "12", "x-ratelimit-reset-requests": "6m0s" }, NOW)).toBeUndefined();
    expect(parseRateLimitResetMs({ "x-ratelimit-reset-requests": "6m0s" }, NOW)).toBeUndefined();
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "soon" }, NOW)).toBeUndefined();
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "-5s" }, NOW)).toBeUndefined();
    expect(parseRateLimitResetMs({ "anthropic-ratelimit-requests-remaining": "0", "anthropic-ratelimit-requests-reset": "2026-11-07T12:00:02Z" }, NOW))
      .toEqual({ ms: 2000, header: "anthropic-ratelimit-requests-reset" });
    expect(parseRateLimitResetMs({ "anthropic-ratelimit-requests-remaining": "0", "anthropic-ratelimit-requests-reset": "2026-11-07T11:00:00Z" }, NOW)).toBeUndefined();
    expect(parseRateLimitResetMs({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "2s",
      "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "9s" }, NOW)).toEqual({ ms: 9000, header: "x-ratelimit-reset-tokens" });
  });

  test("(4) classification names the header: Retry-After first, a reset only on a 429 without it, nothing on a 500", () => {
    const classify = (status: number, headers: Record<string, string>) =>
      classifyResponseFailure({ adapter: openaiAdapter, response: { status, headers }, bodyText: "", now: () => NOW }).failure;
    expect(classify(429, { "retry-after": "3", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "9s" }))
      .toMatchObject({ code: "RATE_LIMIT", providerRetryAfterMs: 3000, providerDelayHeader: "retry-after" });
    expect(classify(429, { "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "9s" }))
      .toMatchObject({ code: "RATE_LIMIT", providerRetryAfterMs: 9000, providerDelayHeader: "x-ratelimit-reset-requests" });
    const server = classify(500, { "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "9s" });
    expect(server.providerRetryAfterMs).toBeUndefined();
    expect(server.providerDelayHeader).toBeUndefined();
    expect(classify(429, {}).providerDelayHeader).toBeUndefined();
    // The fact is validated at the boundary: a header name without a delay, or a non-header name, is refused.
    expect(() => new LlmError("x", "RATE_LIMIT", { providerDelayHeader: "retry-after" })).toThrow(/providerDelayHeader/);
    expect(() => new LlmError("x", "RATE_LIMIT", { providerRetryAfterMs: 1, providerDelayHeader: "Retry After" })).toThrow(/providerDelayHeader/);
  });

  test("(5) through the real loop: a 429 with only a reset header waits that long, the signed rows name the header, and --max-retries 0 gives up at once", async () => {
    let seen = 0;
    const transport: HttpTransport = async (): Promise<HttpResponse> => {
      seen += 1;
      if (seen === 1) return { status: 429, headers: { "content-type": "application/json", "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "2s" }, body: bodyFromChunks(["{}"]) };
      return { status: 200, headers: { "content-type": "text/event-stream" }, body: bodyFromChunks([]) };
    };
    const retry = recordingRetryRuntime();
    const harness = loopHarness({ scripts: [textStep("second attempt")], transport, retryRuntime: retry });
    open.push(harness);
    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();
    const retryRow = readLoopRetryMeta(events.find((event) => event.event_type === "loop/retry")!.meta_json)!;
    expect(retryRow).toMatchObject({ decision: "retry", delayMs: 2000, delaySource: "provider" });
    expect(retryRow.reason).toContain("(x-ratelimit-reset-tokens)");
    expect(retry.waits).toEqual([2000]);
    const failure = JSON.parse(events.find((event) => event.event_type === "request/failure")!.meta_json) as { failure: Record<string, unknown> };
    expect(failure.failure).toMatchObject({ providerRetryAfterMs: 2000, providerDelayHeader: "x-ratelimit-reset-tokens" });

    // --max-retries 0 from the command line becomes a route policy that gives up on the first failure.
    expect(nativeRouteFor("stub", { maxRetries: "0", retryMaxDelay: "2000" }, undefined).retry).toEqual({ mode: "normal", maxRetries: 0, backoff: { maxDelayMs: 2000 } });
    expect(() => nativeRouteFor("stub", { maxRetries: "-1" }, undefined)).toThrow(/--max-retries/);
    expect(() => nativeRouteFor("stub", { retryMaxDelay: "0" }, undefined)).toThrow(/--retry-max-delay/);
    const none = loopHarness({ scripts: [textStep("never")], transport, retry: { mode: "normal", maxRetries: 0 }, retryRuntime: recordingRetryRuntime() });
    open.push(none);
    seen = 0;
    none.driver.followup("hello");
    await none.driver.whenIdle();
    none.finish();
    const rows = none.events();
    expect(rows.filter((event) => event.event_type === "request/header")).toHaveLength(1);
    expect(readLoopRetryMeta(rows.find((event) => event.event_type === "loop/retry")!.meta_json)).toMatchObject({ decision: "give-up", attemptsRemaining: 0 });
  });
});
