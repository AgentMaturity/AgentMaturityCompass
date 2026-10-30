import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { budgetUsageSnapshot } from "../src/budgets/budgets.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import {
  AdapterRegistry, LLM_FAILURE_CODE, LlmError, LlmRouteError, LlmRuntime,
  anthropicAdapter, deepseekAdapter, gatewayAdapter, geminiAdapter, geminiAudioAdapter,
  ollamaAdapter, openaiAdapter, openaiResponsesAdapter
} from "../src/llm/index.js";
import type { HttpRequest, HttpResponse, HttpTransport, LlmAdapter, LlmRouteConfig, StreamChunk } from "../src/llm/index.js";
import { dispatchWithTimeouts } from "../src/llm/adapter/streamTimeouts.js";
import { anthropicTextStream, okStream, sseBody } from "./helpers/llmStubUpstream.js";

const PROVIDER = "timeout-fixture";
const MODEL = "timeout-fixture";
const TIMEOUTS = { connectTimeoutMs: 31, firstByteTimeoutMs: 47, streamIdleTimeoutMs: 59 };
type Timeouts = typeof TIMEOUTS;
type Stage = "connect" | "first-byte" | "idle";
const STAGES: readonly Stage[] = ["connect", "first-byte", "idle"];
const credentials: CredentialsService = {
  resolve: () => null,
  describe: () => ({ configured: false, source: null, writable: false }),
  set: async () => { throw new Error("unused"); },
  unset: async () => false
};
const providers: readonly { name: string; adapter: LlmAdapter; params: Record<string, unknown>; contentType: string }[] = [
  { name: "Anthropic", adapter: anthropicAdapter, params: { max_tokens: 20, stream: true }, contentType: "text/event-stream" },
  { name: "OpenAI Chat", adapter: openaiAdapter, params: { max_tokens: 20 }, contentType: "text/event-stream" },
  { name: "OpenAI Responses", adapter: openaiResponsesAdapter, params: { max_output_tokens: 20 }, contentType: "text/event-stream" },
  { name: "DeepSeek", adapter: deepseekAdapter, params: { max_tokens: 20 }, contentType: "text/event-stream" },
  { name: "Gemini", adapter: geminiAdapter, params: { generationConfig: { maxOutputTokens: 20 } }, contentType: "text/event-stream" },
  { name: "Gemini audio", adapter: geminiAudioAdapter, params: { generationConfig: { maxOutputTokens: 20 } }, contentType: "text/event-stream" },
  { name: "Ollama", adapter: ollamaAdapter, params: { max_tokens: 20 }, contentType: "application/x-ndjson" },
  { name: "gateway", adapter: gatewayAdapter({ inner: anthropicAdapter, prefix: "/anthropic", agentId: "default" }),
    params: { max_tokens: 20, stream: true }, contentType: "text/event-stream" }
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Finite microtask flushing keeps a missing deadline red without a hung await. */
async function flush(): Promise<void> {
  for (let i = 0; i < 200; i++) await Promise.resolve();
}

function observe(stream: AsyncIterable<StreamChunk>) {
  const state = { settled: false, error: undefined as unknown, chunks: [] as StreamChunk[] };
  const completion = (async () => {
    try { for await (const chunk of stream) state.chunks.push(chunk); }
    catch (error) { state.error = error; }
    finally { state.settled = true; }
  })();
  return { state, completion };
}

/** next() deliberately ignores AbortSignal. The shared seam must still settle. */
function stalledBody(prefix?: Uint8Array) {
  const pending = deferred<IteratorResult<Uint8Array>>();
  let first = true;
  const iterator: AsyncIterator<Uint8Array> = {
    next: vi.fn(() => {
      if (first && prefix !== undefined) { first = false; return Promise.resolve({ done: false, value: prefix }); }
      return pending.promise;
    }),
    return: vi.fn(async () => ({ done: true as const, value: undefined }))
  };
  return { body: { [Symbol.asyncIterator]: () => iterator }, iterator,
    release: () => pending.resolve({ done: true, value: undefined }), pending };
}

function completeResponse(): HttpResponse {
  return okStream(anthropicTextStream({ text: ["complete"], inputTokens: 4, outputTokens: 2 }));
}

function route(adapter = anthropicAdapter, timeouts: Partial<Timeouts> = {}): LlmRouteConfig {
  return { providerId: PROVIDER, adapter, baseUrl: "https://provider.invalid", credentialRef: null, models: [MODEL], ...timeouts };
}

describe("DXA-33 route deadline configuration", () => {
  test("caller cancellation between transport fulfillment and dispatch continuation closes the response once", async () => {
    const caller = new AbortController(); const close = vi.fn(async () => {});
    const response = { ...completeResponse(), close };
    let sent: HttpRequest | undefined;
    const dispatch = dispatchWithTimeouts(request => { sent = request; return Promise.resolve(response); }, {
      method: "POST", url: "https://provider.invalid", body: Buffer.from("{}"), headers: {}, signal: caller.signal
    }, TIMEOUTS);
    queueMicrotask(() => caller.abort());
    await expect(dispatch).rejects.toMatchObject({ code: LLM_FAILURE_CODE.ABORTED });
    expect(sent?.signal?.aborted).toBe(true); expect(close).toHaveBeenCalledTimes(1);
  });

  test("defaults are pinned and frozen", () => {
    const registry = new AdapterRegistry(); registry.register(route());
    const pin = registry.pin({ providerId: PROVIDER, model: MODEL });
    expect(pin.timeouts).toEqual({ connectTimeoutMs: 30_000, firstByteTimeoutMs: 60_000, streamIdleTimeoutMs: 300_000 });
    expect(Object.isFrozen(pin.timeouts)).toBe(true);
  });

  test.each(Object.keys(TIMEOUTS) as (keyof Timeouts)[])("%s accepts both timer bounds", field => {
    for (const value of [1, 2_147_483_647]) {
      const registry = new AdapterRegistry(); registry.register(route(anthropicAdapter, { [field]: value }));
      expect(registry.pin({ providerId: PROVIDER, model: MODEL }).timeouts[field]).toBe(value);
    }
  });

  const invalid = (Object.keys(TIMEOUTS) as (keyof Timeouts)[]).flatMap(field =>
    [0, -1, 1.5, NaN, Infinity, 2_147_483_648, null, "10"].map(value => ({ field, value })));
  test.each(invalid)("rejects $field=$value before registering", ({ field, value }) => {
    const registry = new AdapterRegistry();
    expect(() => registry.register({ ...route(), [field]: value } as LlmRouteConfig)).toThrow(LlmRouteError);
    expect(registry.list()).toEqual([]);
  });

  test("registration snapshots caller settings and replacement cannot reach an existing pin", () => {
    const config = { ...route(), ...TIMEOUTS };
    const registry = new AdapterRegistry(); registry.register(config);
    config.connectTimeoutMs = 999;
    const pin = registry.pin({ providerId: PROVIDER, model: MODEL });
    expect(pin.timeouts).toEqual(TIMEOUTS);
    expect(() => { (pin.timeouts as { connectTimeoutMs: number }).connectTimeoutMs = 999; }).toThrow(TypeError);
    registry.replace(route(anthropicAdapter, { connectTimeoutMs: 997, firstByteTimeoutMs: 998, streamIdleTimeoutMs: 999 }));
    expect(pin.timeouts).toEqual(TIMEOUTS);
    expect(registry.pin({ providerId: PROVIDER, model: MODEL }).timeouts.connectTimeoutMs).toBe(997);
  });
});

describe("DXA-33 shared native transport deadlines", () => {
  let workspace: string;
  const sessions: SessionService[] = [];
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-llm-timeouts-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const session of sessions.splice(0)) {
      try { session.close({ reason: "completed" }); } catch { /* Fixture may already be closed. */ }
    }
    rmSync(workspace, { recursive: true, force: true });
  });

  function harness(options: {
    transport?: HttpTransport; adapter?: LlmAdapter; params?: Record<string, unknown>;
    timeouts?: Partial<Timeouts>; baseUrl?: string; credentialRequired?: boolean;
  } = {}) {
    const session = new SessionService(workspace); sessions.push(session);
    session.open({ agentId: "default", harnessVersion: "timeout-test", compositionDigest: "timeout-test", policyDigest: "timeout-test" });
    const systemPrompt = session.recordSystemPrompt("Deadline fixture.");
    session.startTurn({ trigger: "user" }); session.recordUserMessage("Answer the fixture."); session.startStep();
    const registry = new AdapterRegistry();
    registry.register({ ...route(options.adapter, { ...TIMEOUTS, ...options.timeouts }),
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.credentialRequired ? { credentialRef: credentialRef("AMC_TIMEOUT_MISSING_KEY") } : {}) });
    const runtime = new LlmRuntime({ session, registry, credentials,
      ...(options.transport === undefined ? {} : { transport: options.transport }) });
    const spec = { providerId: PROVIDER, model: MODEL,
      params: options.params ?? { max_tokens: 20, stream: true }, systemPromptEventId: systemPrompt.eventId, tools: null };
    return { session, registry, runtime, spec };
  }

  function failure(session: SessionService, code: string, kind = "error") {
    const rows = session.readEvents().filter(event => event.event_type === "request/failure");
    expect(rows).toHaveLength(1);
    const meta = JSON.parse(rows[0]!.meta_json) as Record<string, unknown>;
    expect(meta).toMatchObject({ finishReason: kind, failure: { code }, policy: { retryable: true } });
    expect(session.readEvents().filter(event => event.event_type === "request/response")).toHaveLength(0);
    return meta;
  }

  function timedTransport(stage: Stage, contentType = "text/event-stream") {
    const connection = deferred<HttpResponse>();
    const body = stalledBody(stage === "idle" ? Buffer.from("\n") : undefined);
    const close = vi.fn(async () => {});
    const response: HttpResponse = { status: 200, headers: { "content-type": contentType }, body: body.body, close };
    let request: HttpRequest | undefined;
    const transport: HttpTransport = vi.fn(async input => {
      request = input;
      return stage === "connect" ? connection.promise : response;
    });
    return { transport, body, close, response, get request() { return request; },
      release: () => { connection.resolve(response); body.release(); } };
  }

  for (const provider of providers) {
    test.each(STAGES)(`${provider.name}: %s timeout aborts and records a typed error`, async stage => {
      const upstream = timedTransport(stage, provider.contentType);
      const h = harness({ transport: upstream.transport, adapter: provider.adapter, params: provider.params });
      const caller = new AbortController();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const observed = observe(h.runtime.stream({ ...h.spec, signal: caller.signal }));
      try {
        await flush();
        expect(upstream.transport).toHaveBeenCalledTimes(1);
        const limit = stage === "connect" ? TIMEOUTS.connectTimeoutMs
          : stage === "first-byte" ? TIMEOUTS.firstByteTimeoutMs : TIMEOUTS.streamIdleTimeoutMs;
        await vi.advanceTimersByTimeAsync(limit - 1);
        expect(observed.state.settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(observed.state.settled, "the missing deadline must fail promptly, even when upstream ignores abort").toBe(true);
        expect(observed.state.error).toBeInstanceOf(LlmError);
        expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
        expect(upstream.request?.signal).toBeInstanceOf(AbortSignal);
        expect(upstream.request?.signal).not.toBe(caller.signal);
        expect(upstream.request?.signal?.aborted).toBe(true);
        expect(caller.signal.aborted).toBe(false);
        expect(failure(h.session, LLM_FAILURE_CODE.TIMEOUT).usage).toMatchObject({ reported: false, complete: false });
        if (stage !== "connect") {
          expect(upstream.close).toHaveBeenCalledTimes(1);
          expect(upstream.body.iterator.return).toHaveBeenCalledTimes(1);
        }
        expect(vi.getTimerCount()).toBe(0);
      } finally { upstream.release(); await flush(); }
    });
  }

  test.each(STAGES)("caller cancellation during %s wins as ABORTED", async stage => {
    const upstream = timedTransport(stage);
    const h = harness({ transport: upstream.transport });
    const caller = new AbortController();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream({ ...h.spec, signal: caller.signal }));
    try {
      await flush(); caller.abort(new DOMException("caller deadline", "TimeoutError")); await flush();
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.ABORTED });
      expect(upstream.request?.signal?.aborted).toBe(true);
      const rows = h.session.readEvents().filter(event => event.event_type === "request/failure");
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.meta_json)).toMatchObject({ finishReason: "aborted", failure: { code: LLM_FAILURE_CODE.ABORTED } });
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.session.readEvents().filter(event => event.event_type === "request/failure")).toHaveLength(1);
    } finally { upstream.release(); await flush(); }
  });

  test("a pre-aborted caller reaches neither transport nor budget reservation", async () => {
    const transport = vi.fn<HttpTransport>(async () => completeResponse());
    const h = harness({ transport }); const caller = new AbortController(); caller.abort();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream({ ...h.spec, signal: caller.signal })); await flush();
    expect(observed.state.settled).toBe(true);
    expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.ABORTED });
    expect(transport).not.toHaveBeenCalled();
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("missing credentials still refuse before transport, timers, or spend", async () => {
    const transport = vi.fn<HttpTransport>(async () => completeResponse());
    const h = harness({ transport, credentialRequired: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec)); await flush();
    expect(observed.state.settled).toBe(true);
    expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.MISSING_CREDENTIAL });
    expect(transport).not.toHaveBeenCalled();
    expect(budgetUsageSnapshot(workspace, "default").daily.llmRequests).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a complete stream disposes timers and caller listeners", async () => {
    let sent: HttpRequest | undefined;
    const close = vi.fn(async () => {});
    const h = harness({ transport: async request => { sent = request; return { ...completeResponse(), close }; } });
    const caller = new AbortController();
    const removeListener = vi.spyOn(caller.signal, "removeEventListener");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream({ ...h.spec, signal: caller.signal })); await flush();
    expect(observed.state.settled).toBe(true); expect(observed.state.error).toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(sent?.signal).toBeInstanceOf(AbortSignal);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    caller.abort(); await flush();
    expect(close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.session.readEvents().filter(event => event.event_type === "request/failure")).toHaveLength(0);
    expect(h.session.readEvents().filter(event => event.event_type === "request/response")).toHaveLength(1);
  });

  test("a response resolving after connect timeout is closed and never decoded", async () => {
    const upstream = timedTransport("connect");
    const decode = vi.fn(anthropicAdapter.decode);
    const h = harness({ transport: upstream.transport, adapter: { ...anthropicAdapter, decode } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.connectTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      upstream.release(); await flush();
      expect(upstream.close).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT); expect(vi.getTimerCount()).toBe(0);
    } finally { upstream.release(); await flush(); }
  });

  test("late body bytes cannot yield output or a second settlement after timeout", async () => {
    const upstream = timedTransport("first-byte"); const h = harness({ transport: upstream.transport });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.firstByteTimeoutMs);
      expect(observed.state.settled).toBe(true);
      upstream.body.pending.resolve({ done: false, value: Buffer.from("event: message_start\ndata: {}\n\n") });
      await flush();
      expect(observed.state.chunks).toEqual([]); failure(h.session, LLM_FAILURE_CODE.TIMEOUT);
      expect(vi.getTimerCount()).toBe(0);
    } finally { upstream.release(); await flush(); }
  });

  test("an HTTP error body also has a first-byte deadline and closes once", async () => {
    const upstream = timedTransport("first-byte");
    const h = harness({ transport: async () => ({ ...upstream.response, status: 429 }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.firstByteTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT);
      expect(upstream.close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    } finally { upstream.release(); await flush(); }
  });

  test("a decoder refusal closes the response and removes timers", async () => {
    const body = stalledBody(); const close = vi.fn(async () => {});
    const h = harness({ adapter: geminiAdapter, params: { generationConfig: { maxOutputTokens: 20 } },
      transport: async () => ({ status: 200, headers: { "content-type": "application/json" }, body: body.body, close }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec)); await flush();
    expect(observed.state.settled).toBe(true); expect(observed.state.error).toBeInstanceOf(LlmError);
    expect(close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  test("idle timeout retains observed Gemini usage as an incomplete subtotal", async () => {
    const frames: Uint8Array[] = [];
    for await (const bytes of sseBody([{ data: JSON.stringify({ usageMetadata: {
      promptTokenCount: 7, candidatesTokenCount: 2, totalTokenCount: 9
    } }) }])) frames.push(bytes);
    const body = stalledBody(Buffer.concat(frames)); const close = vi.fn(async () => {});
    const h = harness({ adapter: geminiAdapter, params: { generationConfig: { maxOutputTokens: 20 } },
      transport: async () => ({ status: 200, headers: { "content-type": "text/event-stream" }, body: body.body, close }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.streamIdleTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      expect(failure(h.session, LLM_FAILURE_CODE.TIMEOUT).usage).toMatchObject({
        reported: true, complete: false, inputTokens: 7, outputTokens: 2
      });
      expect(close).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    } finally { body.release(); await flush(); }
  });

  test("each real byte resets idle time, including a partial frame", async () => {
    const next = deferred<IteratorResult<Uint8Array>>(); const last = deferred<IteratorResult<Uint8Array>>();
    let reads = 0;
    const iterator: AsyncIterator<Uint8Array> = {
      next: () => ++reads === 1 ? Promise.resolve({ done: false, value: Buffer.from("\n") }) : reads === 2 ? next.promise : last.promise,
      return: async () => ({ done: true, value: undefined })
    };
    const h = harness({ transport: async () => ({ status: 200, headers: { "content-type": "text/event-stream" },
      body: { [Symbol.asyncIterator]: () => iterator } }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.streamIdleTimeoutMs - 1);
      next.resolve({ done: false, value: Buffer.from(": partial") }); await flush();
      await vi.advanceTimersByTimeAsync(TIMEOUTS.streamIdleTimeoutMs - 1);
      expect(observed.state.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      expect(vi.getTimerCount()).toBe(0);
    } finally { next.resolve({ done: true, value: undefined }); last.resolve({ done: true, value: undefined }); await flush(); }
  });

  test("a prepared call uses its pinned deadline after route replacement", async () => {
    const upstream = timedTransport("connect"); const h = harness({ transport: upstream.transport });
    const call = h.runtime.prepare(h.spec);
    h.registry.replace(route(anthropicAdapter, { connectTimeoutMs: 1000 }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(call.stream());
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.connectTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      expect(call.settled?.failure?.code).toBe(LLM_FAILURE_CODE.TIMEOUT);
    } finally { upstream.release(); await flush(); }
  });

  test("empty body chunks do not reset the first-byte deadline", async () => {
    const body = stalledBody(Buffer.alloc(0)); const close = vi.fn(async () => {});
    const h = harness({ transport: async () => ({ status: 200, headers: { "content-type": "text/event-stream" },
      body: body.body, close }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.firstByteTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT); expect(vi.getTimerCount()).toBe(0);
    } finally { body.release(); await flush(); }
  });

  test("noncooperative body disposal cannot hold timeout settlement open", async () => {
    const body = stalledBody(); const never = new Promise<void>(() => {});
    const close = vi.fn(() => never);
    body.iterator.return = vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => {}));
    const h = harness({ transport: async () => ({ status: 200, headers: { "content-type": "text/event-stream" },
      body: body.body, close }) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observed = observe(h.runtime.stream(h.spec));
    try {
      await flush(); await vi.advanceTimersByTimeAsync(TIMEOUTS.firstByteTimeoutMs);
      expect(observed.state.settled).toBe(true);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      expect(close).toHaveBeenCalledTimes(1); expect(body.iterator.return).toHaveBeenCalledTimes(1);
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT); expect(vi.getTimerCount()).toBe(0);
    } finally { body.release(); await flush(); }
  });

  test("a timeout while the consumer pauses at finish cannot become a successful settlement", async () => {
    const h = harness({ transport: async () => completeResponse() });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const iterator = h.runtime.stream(h.spec)[Symbol.asyncIterator]();
    try {
      let terminal = false;
      for (let i = 0; i < 20; i++) {
        const next = await iterator.next();
        if (next.done) break;
        if (next.value.type === "finish") { terminal = true; break; }
      }
      expect(terminal).toBe(true);
      await vi.advanceTimersByTimeAsync(TIMEOUTS.streamIdleTimeoutMs);
      let error: unknown;
      try { await iterator.next(); } catch (caught) { error = caught; }
      expect(error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT); expect(vi.getTimerCount()).toBe(0);
    } finally { await iterator.return?.(); }
  });

  test("a consumer abandoning text closes and aborts its upstream stream", async () => {
    const frames: Uint8Array[] = [];
    for await (const bytes of sseBody(anthropicTextStream({ text: ["partial"], inputTokens: 4, outputTokens: 2 }).slice(0, 3))) frames.push(bytes);
    const body = stalledBody(Buffer.concat(frames)); const close = vi.fn(async () => {});
    let request: HttpRequest | undefined;
    const h = harness({ transport: async input => { request = input; return { status: 200,
      headers: { "content-type": "text/event-stream" }, body: body.body, close }; } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      for await (const chunk of h.runtime.stream(h.spec)) if (chunk.type === "text-delta") break;
      expect(request?.signal?.aborted).toBe(true);
      expect(close).toHaveBeenCalledTimes(1); expect(body.iterator.return).toHaveBeenCalledTimes(1);
      const failed = h.session.readEvents().filter(event => event.event_type === "request/failure");
      expect(failed).toHaveLength(1);
      expect(JSON.parse(failed[0]!.meta_json)).toMatchObject({ finishReason: "aborted", failure: { code: LLM_FAILURE_CODE.ABORTED } });
      expect(vi.getTimerCount()).toBe(0);
    } finally { body.release(); await flush(); }
  });

  for (const stage of STAGES) test(`real fetch aborts the local HTTP connection at ${stage} timeout`, async context => {
    const requested = deferred<void>(); const closed = deferred<void>();
    const server = createServer((request, response) => {
      request.resume(); response.on("close", () => closed.resolve());
      if (stage !== "connect") { response.writeHead(200, { "content-type": "text/event-stream" }); response.flushHeaders(); }
      if (stage === "idle") response.write("\n");
      requested.resolve();
    });
    try {
      await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") context.skip(`loopback listen unavailable in this sandbox: ${code}`);
      throw error;
    }
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("local HTTP server did not bind a port");
    const h = harness({ baseUrl: `http://127.0.0.1:${address.port}`,
      timeouts: { connectTimeoutMs: 150, firstByteTimeoutMs: 150, streamIdleTimeoutMs: 150 } });
    const observed = observe(h.runtime.stream(h.spec));
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([requested.promise, observed.completion]);
      await Promise.race([observed.completion,
        new Promise<never>((_, reject) => { watchdog = setTimeout(() => reject(new Error("native deadline did not settle real fetch within 1500ms")), 1500); })]);
      expect(observed.state.error).toBeInstanceOf(LlmError);
      expect(observed.state.error).toMatchObject({ code: LLM_FAILURE_CODE.TIMEOUT });
      failure(h.session, LLM_FAILURE_CODE.TIMEOUT);
      await Promise.race([closed.promise, new Promise<never>((_, reject) => {
        if (watchdog !== undefined) clearTimeout(watchdog);
        watchdog = setTimeout(() => reject(new Error("timed-out fetch left the HTTP connection open")), 1000);
      })]);
    } finally {
      if (watchdog !== undefined) clearTimeout(watchdog);
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await observed.completion;
    }
  }, 4000);
});
