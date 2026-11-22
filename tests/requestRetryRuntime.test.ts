import { afterEach, describe, expect, it, vi } from "vitest";

/** The default retry wait, and the provider-outage note a turn ending on a context-window overflow leaves (HP-05). */
const outage = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("../src/actions/actionRecovery.js", () => ({ recordProviderOutage: outage.record }));

import { DEFAULT_RETRY_RUNTIME, noteOverflowOutage } from "../src/agent/requestRetry.js";
import { LLM_FAILURE_CODE, LlmError } from "../src/llm/llmFailure.js";
import type { SessionService } from "../src/session/sessionService.js";

afterEach(() => { vi.restoreAllMocks(); outage.record.mockReset(); });

describe("the default retry wait", () => {
  it("does not wait at all when the turn is already cancelled or the delay is not positive", async () => {
    const aborted = new AbortController(); aborted.abort();
    const timer = vi.spyOn(globalThis, "setTimeout");
    await DEFAULT_RETRY_RUNTIME.sleep(60_000, aborted.signal);
    await DEFAULT_RETRY_RUNTIME.sleep(0, new AbortController().signal);
    expect(timer).not.toHaveBeenCalled();
  });

  it("ends a long wait as soon as the turn is cancelled", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = DEFAULT_RETRY_RUNTIME.sleep(60_000, controller.signal);
    setTimeout(() => controller.abort(), 5);
    await waiting;
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("waits the delay when nothing cancels it", async () => {
    const started = Date.now();
    await DEFAULT_RETRY_RUNTIME.sleep(20, new AbortController().signal);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});

describe("noteOverflowOutage", () => {
  const overflow = new LlmError("prompt is too long", LLM_FAILURE_CODE.CONTEXT_WINDOW_EXCEEDED);
  const session = (readEvents: () => Array<{ event_type: string; id: string }>) =>
    ({ workspace: "/ws", sessionId: "sess-1", readEvents }) as unknown as SessionService;

  it("records nothing for any other error, or when no request failure was written", () => {
    const readEvents = vi.fn(() => [{ event_type: "request/failure", id: "evt-1" }]);
    noteOverflowOutage(session(readEvents), new LlmError("busy", LLM_FAILURE_CODE.RATE_LIMIT));
    noteOverflowOutage(session(readEvents), new Error("not a provider error"));
    expect(readEvents).not.toHaveBeenCalled();
    noteOverflowOutage(session(() => [{ event_type: "request/header", id: "evt-0" }]), overflow);
    expect(outage.record).not.toHaveBeenCalled();
  });

  it("reports a failed read or a failed incident write on stderr and never throws over the provider's error", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(() => noteOverflowOutage(session(() => { throw new Error("store closed"); }), overflow)).not.toThrow();
    outage.record.mockImplementation(() => { throw new Error("ledger locked"); });
    expect(() => noteOverflowOutage(session(() => [{ event_type: "request/failure", id: "evt-1" }]), overflow)).not.toThrow();
    expect(stderr.mock.calls.map(([text]) => text)).toEqual([
      "[amc] the provider-outage incident could not be recorded: store closed\n",
      "[amc] the provider-outage incident could not be recorded: ledger locked\n"
    ]);
  });
});
