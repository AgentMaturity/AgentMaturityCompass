import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { buildLoopEventRow, readLoopRetryMeta } from "../src/session/loopEventMeta.js";
import type { LoopEventRecord } from "../src/session/loopEventMeta.js";
import { AgentDriver } from "../src/agent/agentDriver.js";
import type { SessionEventRef, SessionService } from "../src/session/sessionService.js";
import { readStepBoundary, readTurnEndMeta } from "../src/session/turnLifecycleMeta.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { decideRetry } from "../src/agent/requestRetry.js";
import { resolveRetryPolicy } from "../src/llm/retryPolicy.js";
import { bodyFromChunks } from "../src/llm/adapter/transport.js";
import type { HttpResponse, HttpTransport } from "../src/llm/adapter/transport.js";
import type { EvidenceEvent } from "../src/types.js";
import {
  loopHarness,
  LOOP_MODEL,
  LOOP_PROVIDER,
  recordingRetryRuntime,
  textStep,
  type LoopHarness
} from "./helpers/agentLoopHarness.js";

/**
 * P3.2 stage 4 — turn-boundary retry, which is a REQUEST boundary inside a step.
 *
 * Every test here drives the real driver over the real session spine and asserts
 * what the LOG says. The rules this stage adds each have a test that goes RED
 * when the rule is removed:
 *
 *   - the step number does not advance across a retry  → asserted as "two
 *     request/header rows carry the SAME envelope step", which fails the moment
 *     the retry is lifted to a new step.
 *   - a non-retryable failure is not retried            → asserted as one header
 *     plus a `give-up` row, which fails if the policy lookup is dropped.
 *   - `providerRetryAfterMs` is honoured                → asserted as an exact
 *     recorded delay AND `delaySource: "provider"`, which fails if the hint is
 *     ignored in favour of backoff.
 *   - a cancel during the backoff does not spend another request → asserted as
 *     `cancelled` with one header, which fails if the post-sleep abort check is
 *     removed.
 *   - the budget is finite                              → asserted as exactly
 *     maxRetries+1 headers.
 */
describe("P3.2 — request-boundary retry inside one step", () => {
  const open: LoopHarness[] = [];

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // Already closed, or the session failed. Cleanup, not an assertion.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  function harnessFor(options: Parameters<typeof loopHarness>[0]): LoopHarness {
    const harness = loopHarness(options);
    open.push(harness);
    return harness;
  }

  /**
   * A transport that fails the first `failures` dispatches, then answers 200.
   *
   * The failure happens BEFORE the adapter decodes anything, which is what makes
   * a scripted script survive to be consumed by the retry: attempt 1 never
   * reaches `decode`.
   */
  function failingTransport(
    failures: number,
    response: { status: number; headers?: Record<string, string>; body?: string }
  ): HttpTransport {
    let seen = 0;
    return async (): Promise<HttpResponse> => {
      seen += 1;
      if (seen <= failures) {
        return {
          status: response.status,
          headers: { "content-type": "application/json", ...(response.headers ?? {}) },
          body: bodyFromChunks([response.body ?? "{}"])
        };
      }
      return {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: bodyFromChunks([])
      };
    };
  }

  const typesOf = (events: readonly EvidenceEvent[]): string[] => events.map((event) => event.event_type);

  const rowsOf = (events: readonly EvidenceEvent[], type: string): EvidenceEvent[] =>
    events.filter((event) => event.event_type === type);

  const stepOf = (event: EvidenceEvent): number | null => extractEnvelope(event.meta_json)?.step ?? null;

  const retryRows = (events: readonly EvidenceEvent[]) =>
    rowsOf(events, "loop/retry").map((event) => {
      const meta = readLoopRetryMeta(event.meta_json);
      expect(meta, "a loop/retry row must be readable").not.toBeNull();
      return { event, meta: meta! };
    });

  test("a retryable failure is re-dispatched INSIDE the same step, and the log says why", async () => {
    const retry = recordingRetryRuntime();
    const harness = harnessFor({
      scripts: [textStep("answered on the second attempt")],
      transport: failingTransport(1, { status: 429, headers: { "retry-after": "2" } }),
      retryRuntime: retry
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();

    // ONE step, TWO requests. That is the whole claim, and it is the shape a
    // reader would otherwise have to guess at.
    expect(rowsOf(events, "step/start")).toHaveLength(1);
    expect(rowsOf(events, "step/end")).toHaveLength(1);
    const headers = rowsOf(events, "request/header");
    expect(headers).toHaveLength(2);
    expect(headers.map(stepOf)).toEqual([1, 1]);

    const retries = retryRows(events);
    expect(retries).toHaveLength(1);
    expect(retries[0]!.meta.decision).toBe("retry");
    expect(retries[0]!.meta.attempt).toBe(1);
    // The row NAMES the rows it is about, so an auditor joins rather than guesses.
    expect(retries[0]!.meta.headerEventId).toBe(headers[0]!.id);
    expect(retries[0]!.meta.outcomeEventId).toBe(rowsOf(events, "request/failure")[0]!.id);
    // And it sits between the two headers, at the same step.
    expect(stepOf(retries[0]!.event)).toBe(1);

    const ending = readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json);
    expect(ending?.reason).toBe("complete");
    // The order the rows landed in is the order the story reads in.
    const spine = typesOf(events).filter((type) => type.startsWith("request/") || type === "loop/retry");
    expect(spine).toEqual([
      "request/header",
      "request/failure",
      "loop/retry",
      "request/header",
      "request/response"
    ]);
  });

  test("the provider's Retry-After is honoured verbatim, and recorded as the provider's", async () => {
    const retry = recordingRetryRuntime();
    const harness = harnessFor({
      scripts: [textStep("second attempt")],
      transport: failingTransport(1, { status: 429, headers: { "retry-after": "2" } }),
      retryRuntime: retry
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();

    const [retryRow] = retryRows(harness.events());
    // 2 seconds, exactly, with no jitter applied — and SOURCED, so a later change
    // that quietly fell back to local backoff is visible in the signed row and
    // not only in a number that happens to look plausible.
    expect(retryRow!.meta.delaySource).toBe("provider");
    expect(retryRow!.meta.delayMs).toBe(2000);
    expect(retry.waits).toEqual([2000]);
  });

  test("a failure the policy does not cover is NOT retried, and the give-up is recorded", async () => {
    const retry = recordingRetryRuntime();
    const harness = harnessFor({
      scripts: [textStep("never reached")],
      // 401 classifies as AUTH, which is deliberately outside the default
      // retryable set: a refused credential fails identically every time.
      transport: failingTransport(5, { status: 401, body: '{"error":{"message":"bad key"}}' }),
      retryRuntime: retry
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();

    expect(rowsOf(events, "request/header")).toHaveLength(1);
    expect(retry.waits).toEqual([]);
    const [retryRow] = retryRows(events);
    expect(retryRow!.meta.decision).toBe("give-up");
    expect(retryRow!.meta.delayMs).toBeNull();
    expect(retryRow!.meta.delaySource).toBeNull();
    expect(retryRow!.meta.reason).toContain("AUTH");

    const ending = readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json);
    expect(ending?.reason).toBe("error");
    // Balanced even on the failing path: the step closed before the turn did.
    const boundary = readStepBoundary(rowsOf(events, "step/end")[0]!.meta_json);
    expect(boundary).toEqual({ turn: 1, step: 1 });
  });

  test("the retry budget is finite and its exhaustion is a distinct recorded reason", async () => {
    const retry = recordingRetryRuntime();
    const harness = harnessFor({
      scripts: [textStep("never reached")],
      transport: failingTransport(9, { status: 503, body: "upstream down" }),
      retry: { mode: "normal", maxRetries: 2, backoff: { initialDelayMs: 10, maxDelayMs: 20 } },
      retryRuntime: retry
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();

    // maxRetries: 2 means three dispatches total, and no more.
    expect(rowsOf(events, "request/header")).toHaveLength(3);
    expect(rowsOf(events, "step/start")).toHaveLength(1);
    const decisions = retryRows(events).map((row) => row.meta.decision);
    expect(decisions).toEqual(["retry", "retry", "give-up"]);
    const remaining = retryRows(events).map((row) => row.meta.attemptsRemaining);
    expect(remaining).toEqual([1, 0, 0]);
    expect(retryRows(events)[2]!.meta.reason).toContain("budget");
    expect(readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json)?.reason).toBe("error");
  });

  test("a cancel during the backoff ends the turn CANCELLED without spending another request", async () => {
    const harness = harnessFor({
      scripts: [textStep("never reached")],
      transport: failingTransport(9, { status: 503, body: "upstream down" }),
      retry: { mode: "normal", maxRetries: 5, backoff: { initialDelayMs: 5, maxDelayMs: 5 } },
      // The wait is where the cancel lands: this runtime cancels the driver from
      // inside the sleep, which is exactly when a real operator's Ctrl-C arrives.
      retryRuntime: {
        sleep: (): Promise<void> => {
          harness.driver.cancel({ kind: "user" });
          return Promise.resolve();
        },
        random: (): number => 0.5
      }
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();

    // One request, not two: the loop re-checked the signal after waiting.
    expect(rowsOf(events, "request/header")).toHaveLength(1);
    const ending = readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json);
    // A LIVE cancel, with a cause — never "interrupted", which is crash repair's
    // word and would say this process died.
    expect(ending?.reason).toBe("cancelled");
    expect(ending?.cancelCause).toEqual({ kind: "user" });
    expect(ending?.interrupted).toBe(false);
    expect(rowsOf(events, "loop/cancel")).toHaveLength(1);
  });

  test("a cancelled dispatch is not treated as a retryable provider failure", async () => {
    const retry = recordingRetryRuntime();
    const harness = harnessFor({
      scripts: [textStep("never reached")],
      // The transport aborts the way a cancelled fetch does, and the loop must
      // read that as "someone stopped this", never as "the provider is flaky".
      transport: async (): Promise<HttpResponse> => {
        harness.driver.cancel({ kind: "parent" });
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
      retryRuntime: retry
    });

    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    const events = harness.events();

    expect(rowsOf(events, "request/header")).toHaveLength(1);
    // No retry row at all: the loop never consulted a policy, because a cancel
    // is not a failure class.
    expect(rowsOf(events, "loop/retry")).toHaveLength(0);
    expect(retry.waits).toEqual([]);
    expect(readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json)?.cancelCause).toEqual({ kind: "parent" });
  });

  test("a retry whose loop/retry row cannot be written does NOT send a second request", async () => {
    const harness = harnessFor({
      scripts: [textStep("must never be reached")],
      transport: failingTransport(1, { status: 429, headers: { "retry-after": "1" } })
    });

    // A session that refuses exactly the retry row, and nothing else. If the
    // loop retried anyway, the log would hold two headers in one step with
    // nothing between them saying why — the shape this row exists to prevent.
    const refusing = new Proxy(harness.session, {
      get(target: SessionService, property: string | symbol): unknown {
        if (property === "recordLoopEvent") {
          return (record: LoopEventRecord): SessionEventRef => {
            if (record.kind === "retry") throw new Error("spine refused the loop/retry row");
            return target.recordLoopEvent(record);
          };
        }
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? (value as (...args: never[]) => unknown).bind(target) : value;
      }
    });

    const driver = new AgentDriver({
      session: refusing,
      llm: harness.llm,
      route: { providerId: LOOP_PROVIDER, model: LOOP_MODEL, params: { max_tokens: 256 } },
      systemPromptEventId: harness.systemPromptEventId,
      retryRuntime: recordingRetryRuntime()
    });
    driver.followup("hello");
    await driver.whenIdle();
    harness.finish();
    const events = harness.events();

    expect(rowsOf(events, "request/header")).toHaveLength(1);
    expect(rowsOf(events, "loop/retry")).toHaveLength(0);
    // Evidence first: the action AMC could not record is the action AMC did not
    // take, and the turn says so rather than quietly succeeding.
    expect(readTurnEndMeta(rowsOf(events, "turn/end")[0]!.meta_json)?.reason).toBe("error");
    // Still balanced, because the closers are in `finally` blocks.
    expect(rowsOf(events, "step/start")).toHaveLength(1);
    expect(rowsOf(events, "step/end")).toHaveLength(1);
  });

  describe("the row's own shape", () => {
    const base = {
      kind: "retry" as const,
      attempt: 1,
      headerEventId: "header-1",
      outcomeEventId: "failure-1",
      reason: "because",
      attemptsRemaining: 1
    };

    test("a retry that names no wait is refused", () => {
      // The delay fields are how a reader tells "AMC waited and asked again"
      // from "AMC stopped asking". A row whose halves contradict each other is
      // refused rather than signed.
      expect(() =>
        buildLoopEventRow({ ...base, decision: "retry", delayMs: null, delaySource: null })
      ).toThrow(/must record the wait/);
    });

    test("a give-up that claims a wait is refused", () => {
      expect(() =>
        buildLoopEventRow({ ...base, decision: "give-up", delayMs: 500, delaySource: "backoff" })
      ).toThrow(/must not record a delay/);
    });

    test("an attempt number that names no dispatch is refused", () => {
      expect(() =>
        buildLoopEventRow({ ...base, attempt: 0, decision: "give-up", delayMs: null, delaySource: null })
      ).toThrow(/attempt must be a positive integer/);
    });
  });

  describe("the schedule itself", () => {
    const policy = resolveRetryPolicy(
      { mode: "normal", maxRetries: 3, backoff: { initialDelayMs: 100, maxDelayMs: 1000, jitterRatio: 0 } },
      "test"
    );

    test("doubles the local backoff and clamps it at the ceiling", () => {
      const delays = [1, 2, 3, 4].map(
        (attempt) => decideRetry(policy, { message: "x", code: "SERVER" }, attempt, () => 0.5).delayMs
      );
      // 100, 200, 400 — then the budget runs out, so the fourth is a give-up.
      expect(delays).toEqual([100, 200, 400, null]);
    });

    test("never lets a provider hint exceed the policy ceiling", () => {
      // A remote-controlled sleep is a remote denial of service; the ceiling is
      // what stops "Retry-After: 86400" from parking the agent for a day.
      const verdict = decideRetry(
        policy,
        { message: "x", code: "RATE_LIMIT", providerRetryAfterMs: 86_400_000 },
        1,
        () => 0.5
      );
      expect(verdict.delayMs).toBe(1000);
      expect(verdict.delaySource).toBe("provider");
    });

    test("an unbounded policy never reports a remaining budget it does not have", () => {
      const always = resolveRetryPolicy({ mode: "always" }, "test");
      const verdict = decideRetry(always, { message: "x", code: "AUTH" }, 99, () => 0.5);
      // `always` retries even AUTH — that is what the operator asked for — and
      // reports null rather than a fabricated count.
      expect(verdict.decision).toBe("retry");
      expect(verdict.attemptsRemaining).toBeNull();
    });
  });
});
