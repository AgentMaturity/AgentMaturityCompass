import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRYABLE_CODES,
  LLM_FAILURE_CODE,
  LlmError,
  type LlmFailure,
  RetryPolicyConfigError,
  httpFailureCode,
  isRetryableFailure,
  normalizeLlmFailure,
  parseProviderRetryAfterMs,
  resolveRetryPolicy
} from "../src/llm/index.js";

/**
 * The typed failure taxonomy, and the split it exists to defend.
 *
 * `LlmFailure` carries provider FACTS. Whether those facts are worth repeating
 * is a POLICY lookup, resolved separately and captured at route registration.
 * The split matters more here than in dsh because AMC signs the facts: a
 * `retryable` flag signed beside them would be an opinion recorded as an
 * observation, and the next policy edit would make every earlier row wrong
 * about a decision it never actually took.
 */

const DEFAULT_POLICY = resolveRetryPolicy(undefined, "test.provider.retry");

function failure(code: string): LlmFailure {
  return { message: `simulated ${code}`, code };
}

describe("provider HTTP classification", () => {
  it.each([
    [429, "", LLM_FAILURE_CODE.RATE_LIMIT],
    [401, "", LLM_FAILURE_CODE.AUTH],
    [403, "", LLM_FAILURE_CODE.AUTH],
    [413, "payload too large", LLM_FAILURE_CODE.INVALID_REQUEST],
    [400, "", LLM_FAILURE_CODE.INVALID_REQUEST],
    [400, "This model's maximum context length is 8192 tokens", LLM_FAILURE_CODE.CONTEXT_WINDOW_EXCEEDED],
    [500, "", LLM_FAILURE_CODE.SERVER],
    [503, "", LLM_FAILURE_CODE.SERVER],
    [418, "", "HTTP_418"]
  ])("classifies %i as %s", (status, detail, expected) => {
    expect(httpFailureCode(status, detail)).toBe(expected);
  });

  it("checks quota wording BEFORE the 429 status", () => {
    // Providers signal an exhausted balance with the same status as a transient
    // rate limit. Getting this order wrong makes a terminal failure retry until
    // the retry budget runs out, every single time.
    expect(httpFailureCode(429, "insufficient_quota: You exceeded your current quota")).toBe(
      LLM_FAILURE_CODE.QUOTA
    );
    expect(isRetryableFailure(DEFAULT_POLICY, failure(LLM_FAILURE_CODE.QUOTA))).toBe(false);
    expect(isRetryableFailure(DEFAULT_POLICY, failure(LLM_FAILURE_CODE.RATE_LIMIT))).toBe(true);
  });
});

describe("retryable vs terminal is a policy lookup, not a property of the failure", () => {
  it("carries no verdict field on the failure itself", () => {
    const error = new LlmError("Too Many Requests", LLM_FAILURE_CODE.RATE_LIMIT, {
      status: 429,
      providerRetryAfterMs: 2_000,
      requestId: "req_9"
    });
    expect(Object.keys(error.failure).sort()).toEqual([
      "code",
      "message",
      "providerRetryAfterMs",
      "requestId",
      "status"
    ]);
    expect("retryable" in error.failure).toBe(false);
    // Frozen, because these facts are on their way to a signed row and a later
    // holder must not be able to edit what was recorded.
    expect(Object.isFrozen(error.failure)).toBe(true);
  });

  it.each([
    [LLM_FAILURE_CODE.RATE_LIMIT, true],
    [LLM_FAILURE_CODE.SERVER, true],
    [LLM_FAILURE_CODE.TIMEOUT, true],
    [LLM_FAILURE_CODE.TRANSPORT, true],
    // Nothing durable was produced, so repeating cannot duplicate a side effect.
    [LLM_FAILURE_CODE.EMPTY_RESPONSE, true],
    [LLM_FAILURE_CODE.AUTH, false],
    [LLM_FAILURE_CODE.QUOTA, false],
    [LLM_FAILURE_CODE.CONTEXT_WINDOW_EXCEEDED, false],
    // A malformed credential fails identically on every attempt; retrying only
    // delays the operator's fix.
    [LLM_FAILURE_CODE.INVALID_CREDENTIAL, false],
    [LLM_FAILURE_CODE.MISSING_CREDENTIAL, false],
    [LLM_FAILURE_CODE.INVALID_REQUEST, false],
    [LLM_FAILURE_CODE.ABORTED, false],
    [LLM_FAILURE_CODE.UNKNOWN, false],
    ["HTTP_418", false]
  ])("default policy treats %s as retryable=%s", (code, retryable) => {
    expect(isRetryableFailure(DEFAULT_POLICY, failure(code))).toBe(retryable);
  });

  it("gives the same failure a different verdict under a different policy", () => {
    // The proof that the verdict lives in the policy: identical facts, opposite
    // answers. If retryability were a field on the failure this could not hold.
    const quota = failure(LLM_FAILURE_CODE.QUOTA);
    const always = resolveRetryPolicy({ mode: "always" }, "test.always");
    const widened = resolveRetryPolicy(
      { mode: "normal", retryableCodes: [LLM_FAILURE_CODE.QUOTA] },
      "test.widened"
    );
    expect(isRetryableFailure(DEFAULT_POLICY, quota)).toBe(false);
    expect(isRetryableFailure(always, quota)).toBe(true);
    expect(isRetryableFailure(widened, quota)).toBe(true);
  });

  it("freezes the resolved policy so an in-flight failure keeps its rules", () => {
    expect(Object.isFrozen(DEFAULT_POLICY)).toBe(true);
    expect(DEFAULT_POLICY.mode).toBe("normal");
    if (DEFAULT_POLICY.mode !== "normal") throw new Error("unreachable");
    expect(Object.isFrozen(DEFAULT_POLICY.retryableCodes)).toBe(true);
    expect([...DEFAULT_POLICY.retryableCodes].sort()).toEqual([...DEFAULT_RETRYABLE_CODES].sort());
  });

  it.each([
    [{ mode: "normal", maxRetries: -1 }, /maxRetries/],
    [{ mode: "normal", retryableCodes: [] }, /must not be empty/],
    [{ mode: "normal", retryableCodes: ["A", "A"] }, /duplicates/],
    [{ mode: "normal", backoff: { initialDelayMs: 0 } }, /initialDelayMs/],
    [{ mode: "normal", backoff: { initialDelayMs: 5000, maxDelayMs: 100 } }, /less than or equal/],
    [{ mode: "normal", backoff: { jitterRatio: 2 } }, /jitterRatio/],
    [{ mode: "normal", retires: 3 }, /unknown key/],
    [{ mode: "sideways" }, /must be "normal" or "always"/]
  ] as const)("rejects malformed retry configuration %#", (config, message) => {
    expect(() => resolveRetryPolicy(config as never, "test.bad")).toThrow(RetryPolicyConfigError);
    expect(() => resolveRetryPolicy(config as never, "test.bad")).toThrow(message);
  });
});

describe("LlmError validates provider-supplied values at the boundary", () => {
  it.each([
    [{ status: 99 }, /status/],
    [{ status: 600 }, /status/],
    [{ status: 429.5 }, /status/],
    [{ providerRetryAfterMs: 0 }, /providerRetryAfterMs/],
    [{ providerRetryAfterMs: -1 }, /providerRetryAfterMs/],
    [{ providerRetryAfterMs: Number.POSITIVE_INFINITY }, /providerRetryAfterMs/],
    [{ requestId: "" }, /requestId/]
  ])("refuses %o", (options, message) => {
    // These arrive from a provider response and are heading for an anchored
    // row, so nonsense fails here rather than being discovered later inside
    // evidence nobody can rewrite.
    expect(() => new LlmError("boom", "SERVER", options as never)).toThrow(message);
  });

  it("omits absent facts rather than defaulting them", () => {
    // Absent means "the provider did not report it", which is a different fact
    // from zero and must not be collapsed into one.
    const error = new LlmError("boom", "SERVER");
    expect(error.failure).toEqual({ message: "boom", code: "SERVER" });
  });
});

describe("Retry-After parsing", () => {
  it.each([
    ["2", 2_000],
    ["0", undefined],
    ["", undefined],
    ["  ", undefined],
    ["soon", undefined]
  ])("parses %j", (value, expected) => {
    expect(parseProviderRetryAfterMs(value)).toBe(expected);
  });

  it("accepts the HTTP-date form and rejects one already in the past", () => {
    const now = Date.parse("2026-08-24T00:00:00Z");
    expect(parseProviderRetryAfterMs("Mon, 24 Aug 2026 00:00:30 GMT", now)).toBe(30_000);
    expect(parseProviderRetryAfterMs("Mon, 24 Aug 2026 00:00:00 GMT", now)).toBeUndefined();
    expect(parseProviderRetryAfterMs("Sun, 23 Aug 2026 23:59:00 GMT", now)).toBeUndefined();
  });

  it("survives the round trip into a typed error", () => {
    const delay = parseProviderRetryAfterMs("3");
    const error = new LlmError("Too Many Requests", LLM_FAILURE_CODE.RATE_LIMIT, {
      status: 429,
      ...(delay === undefined ? {} : { providerRetryAfterMs: delay })
    });
    expect(error.failure.providerRetryAfterMs).toBe(3_000);
  });
});

describe("normalizeLlmFailure reads facts once, through own data properties", () => {
  it("preserves the full facts of an LlmError", () => {
    const error = new LlmError("Too Many Requests", LLM_FAILURE_CODE.RATE_LIMIT, {
      status: 429,
      providerRetryAfterMs: 1_500,
      requestId: "req_1"
    });
    expect(normalizeLlmFailure(error)).toEqual({
      message: "Too Many Requests",
      code: LLM_FAILURE_CODE.RATE_LIMIT,
      status: 429,
      providerRetryAfterMs: 1_500,
      requestId: "req_1"
    });
  });

  it("trusts a cross-package copy only when its own code agrees", () => {
    // Class identity does not survive a copy between packages, but own data
    // does; agreement between the two own properties is the substitute check.
    const copied = new Error("copied");
    Object.defineProperty(copied, "failure", {
      value: { message: "Too Many Requests", code: "RATE_LIMIT", status: 429 }
    });
    Object.defineProperty(copied, "code", { value: "RATE_LIMIT" });
    expect(normalizeLlmFailure(copied).status).toBe(429);

    const mismatched = new Error("mismatched");
    Object.defineProperty(mismatched, "failure", {
      value: { message: "Too Many Requests", code: "RATE_LIMIT" }
    });
    Object.defineProperty(mismatched, "code", { value: "SERVER" });
    expect(normalizeLlmFailure(mismatched).code).toBe(LLM_FAILURE_CODE.UNKNOWN);
  });

  it("never invokes an SDK-defined accessor", () => {
    // A getter that answers differently on two reads would let the signed row
    // disagree with what the user was shown. Deleting the descriptor guard
    // makes this test red.
    const hostile = new Error("hostile");
    let reads = 0;
    Object.defineProperty(hostile, "failure", {
      get: () => {
        reads += 1;
        return { message: "spoofed", code: "RATE_LIMIT" };
      }
    });
    Object.defineProperty(hostile, "code", { value: "RATE_LIMIT" });
    const normalized = normalizeLlmFailure(hostile);
    expect(reads).toBe(0);
    expect(normalized.code).toBe(LLM_FAILURE_CODE.UNKNOWN);
  });

  it("refuses to adopt a third-party SDK code as AMC taxonomy", () => {
    const foreign = new Error("connection reset");
    Object.defineProperty(foreign, "code", { value: "ECONNRESET" });
    expect(normalizeLlmFailure(foreign).code).toBe(LLM_FAILURE_CODE.UNKNOWN);
  });

  it("normalizes a non-Error throw without letting hostile coercion escape", () => {
    const hostile = {
      toString(): string {
        throw new Error("no string for you");
      }
    };
    expect(normalizeLlmFailure(hostile)).toEqual({
      message: "LLM adapter failed",
      code: LLM_FAILURE_CODE.UNKNOWN
    });
  });

  it("rejects a carried failure whose numbers are out of range", () => {
    const bogus = new Error("bogus");
    Object.defineProperty(bogus, "failure", {
      value: { message: "m", code: "RATE_LIMIT", status: 9_000 }
    });
    Object.defineProperty(bogus, "code", { value: "RATE_LIMIT" });
    expect(normalizeLlmFailure(bogus)).toEqual({ message: "bogus", code: LLM_FAILURE_CODE.UNKNOWN });
  });
});
