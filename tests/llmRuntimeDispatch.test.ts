import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { credentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialRef } from "../src/credentials/credentialRef.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import type { CredentialDescription } from "../src/credentials/credentialSources.js";
import {
  ANTHROPIC_ADAPTER_ID,
  AdapterRegistry,
  DEFAULT_RETRYABLE_CODES,
  LLM_FAILURE_CODE,
  LlmDispatchError,
  LlmError,
  LlmRuntime,
  anthropicAdapter,
  isLlmError,
  isLlmStreamProtocolError
} from "../src/llm/index.js";
import type { HttpTransport, LlmAdapter, StreamChunk } from "../src/llm/index.js";
import type { EvidenceEvent } from "../src/types.js";
import { ANTHROPIC_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import {
  anthropicTextStream,
  errorResponse,
  okStream,
  refusingUpstream,
  stubUpstream
} from "./helpers/llmStubUpstream.js";

/**
 * P3.1 stage 3 — the adapter seam end to end, with no network anywhere.
 *
 * Three of the plan's four VERIFY clauses land here (VERIFY-3 has its own file):
 *
 *   VERIFY-1  a streamed completion assembles correctly — and, because this is
 *             AMC and not a client library, assembles into SIGNED ROWS. A test
 *             that only checked the in-memory chunks would pass on an
 *             implementation that recorded nothing.
 *   VERIFY-2  `usage` precedes `finish` — asserted positively on the chunk
 *             order AND negatively, by scripting an adapter that violates it and
 *             pinning the specific code that refuses it.
 *   VERIFY-4  a forced 429 surfaces a typed retryable error from a direct
 *             `stream()` call, WITH a durable event.
 *
 * Every rule this stage adds also has a negative test, because a rule with only
 * a happy-path test is a rule that can be deleted without anything going red.
 */
const MODEL = "claude-test-1";
const PROVIDER = "anthropic";
const KEY_REF: CredentialRef = credentialRef("AMC_TEST_ANTHROPIC_KEY");
const KEY_VALUE = "sk-test-000-DO-NOT-LOG-111";

/** A credentials seam that answers from a mutable map and counts every read. */
class StubCredentials implements CredentialsService {
  readonly reads: CredentialRef[] = [];

  private readonly values = new Map<string, string>();

  constructor(entries: Readonly<Record<string, string>> = {}) {
    for (const [name, value] of Object.entries(entries)) this.values.set(name, value);
  }

  /** Rotate a value the way a file edit would, without a restart. */
  rotate(ref: CredentialRef, value: string | null): void {
    if (value === null) this.values.delete(ref);
    else this.values.set(ref, value);
  }

  resolve(ref: CredentialRef): string | null {
    this.reads.push(ref);
    return this.values.get(ref) ?? null;
  }

  describe(ref: CredentialRef): CredentialDescription {
    return Object.freeze({
      configured: this.values.has(ref),
      source: this.values.has(ref) ? ("file" as const) : null,
      writable: true
    });
  }

  async set(): Promise<void> {
    throw new Error("not used");
  }

  async unset(): Promise<boolean> {
    throw new Error("not used");
  }
}

/** An adapter that replays a scripted chunk list, ignoring the wire entirely. */
function scriptedAdapter(chunks: readonly StreamChunk[], id = "scripted"): LlmAdapter {
  return {
    capabilities: { ...ANTHROPIC_CAPABILITIES, usage: "synthetic-demonstration" },
    id,
    version: 1,
    encoderId: "anthropic-messages",
    encoderVersion: 1,
    envelope: (input) => ({
      url: `${input.baseUrl}/v1/messages`,
      method: "POST",
      headers: { ...input.extraHeaders, ...(input.credential === null ? {} : { "x-api-key": input.credential }) },
      body: input.body
    }),
    decode: async function* decode() {
      for (const chunk of chunks) yield chunk;
    }
  };
}

interface Harness {
  readonly dir: string;
  readonly session: SessionService;
  readonly sessionId: string;
  readonly systemPromptEventId: string;
}

describe("P3.1 — the LLM adapter seam dispatches, records, and fails typed", () => {
  let dir: string;
  const openSessions: SessionService[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-llm-dispatch-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    while (openSessions.length > 0) {
      const session = openSessions.pop();
      try {
        session?.close({ reason: "completed" });
      } catch {
        // Already closed by the test, or never opened. Cleanup, not an assertion.
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  function harness(): Harness {
    const session = new SessionService(dir);
    openSessions.push(session);
    session.open({
      agentId: "default",
      harnessVersion: "3.1.0",
      compositionDigest: "composition-digest",
      policyDigest: "policy-digest"
    });
    const systemPrompt = session.recordSystemPrompt("You are a careful assistant.");
    session.startTurn({ trigger: "user" });
    session.recordUserMessage("Summarise the changelog.");
    session.startStep();
    return { dir, session, sessionId: session.sessionId, systemPromptEventId: systemPrompt.eventId };
  }

  function events(sessionId: string): EvidenceEvent[] {
    const ledger = openLedger(dir);
    try {
      return ledger.getAllEvents().filter((event) => event.session_id === sessionId);
    } finally {
      ledger.close();
    }
  }

  function metaOf(event: EvidenceEvent): Record<string, unknown> {
    return JSON.parse(event.meta_json) as Record<string, unknown>;
  }

  function only(sessionId: string, type: string): EvidenceEvent {
    const matches = events(sessionId).filter((event) => event.event_type === type);
    expect(matches).toHaveLength(1);
    return matches[0]!;
  }

  /** Wire a runtime over one route, one adapter and one stub upstream. */
  function runtimeFor(options: {
    readonly harness: Harness;
    readonly transport: HttpTransport;
    readonly adapter?: LlmAdapter;
    readonly credentials?: StubCredentials;
    readonly retryableCodes?: readonly string[];
    /** `undefined` keeps the default ref; `null` configures a route with none. */
    readonly credentialRefOverride?: CredentialRef | null;
  }): { runtime: LlmRuntime; registry: AdapterRegistry; credentials: StubCredentials } {
    const credentials = options.credentials ?? new StubCredentials({ [KEY_REF]: KEY_VALUE });
    const registry = new AdapterRegistry();
    registry.register({
      providerId: PROVIDER,
      adapter: options.adapter ?? anthropicAdapter,
      baseUrl: "https://api.anthropic.invalid",
      credentialRef: options.credentialRefOverride === undefined ? KEY_REF : options.credentialRefOverride,
      models: [MODEL],
      ...(options.retryableCodes === undefined
        ? {}
        : { retry: { mode: "normal" as const, retryableCodes: options.retryableCodes } })
    });
    // A monotonic fake clock, so a `durationMs` in a signed row is a fact the
    // test controls rather than a number that varies per machine.
    let clock = 1_000;
    const runtime = new LlmRuntime({
      session: options.harness.session,
      credentials,
      registry,
      transport: options.transport,
      now: () => {
        clock += 5;
        return clock;
      }
    });
    return { runtime, registry, credentials };
  }

  const callSpec = (h: Harness, params: Record<string, unknown> = { max_tokens: 256, stream: true }) => ({
    providerId: PROVIDER,
    model: MODEL,
    params,
    systemPromptEventId: h.systemPromptEventId,
    tools: null
  });

  async function drain(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
    const out: StreamChunk[] = [];
    for await (const chunk of stream) out.push(chunk);
    return out;
  }

  // ── VERIFY-1 and VERIFY-2 ───────────────────────────────────────────────

  test("a streamed completion assembles into signed rows, with usage before finish", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () =>
        okStream(
          anthropicTextStream({
            text: ["The change", "log has ", "three entries."],
            inputTokens: 120,
            outputTokens: 17,
            cacheReadTokens: 40
          })
        )
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    const chunks = await drain(runtime.stream(callSpec(h)));

    // VERIFY-2, positively: the ordering is a property of the chunk sequence a
    // consumer actually observes, not of an internal flag.
    // Assert the exact observed tail: usage is emitted, finish immediately
    // follows, and finish is terminal. An index-is-non-negative check would
    // pass for a stream that emitted usage in the wrong place.
    expect(chunks.slice(-2).map((chunk) => chunk.type)).toEqual(["usage", "finish"]);

    // VERIFY-1: the deltas assembled into one block, and that block is a row.
    const block = only(h.sessionId, "assistant/block");
    const blockMeta = metaOf(block);
    expect(blockMeta.blockKind).toBe("text");
    expect(blockMeta.blockIndex).toBe(0);
    expect(blockMeta.stopReason).toBe("stop");

    const settlement = only(h.sessionId, "request/response");
    const meta = metaOf(settlement);
    expect(meta.outcome).toBe("completed");
    expect(meta.finishReason).toBe("stop");
    expect(meta.adapterId).toBe(ANTHROPIC_ADAPTER_ID);
    expect(meta.headerEventId).toBe(only(h.sessionId, "request/header").id);
    // Anthropic reports cached input separately, which is already AMC's disjoint
    // model — so the counts cross unchanged and nothing is double-counted.
    expect(meta.usage).toMatchObject({ inputTokens: 120, outputTokens: 17, cacheReadTokens: 40 });
    expect(meta.blocks).toEqual([
      { eventId: block.id, ordinal: 0, kind: "text", status: "completed", reason: null }
    ]);
    expect(events(h.sessionId).some((event) => event.event_type === "request/failure")).toBe(false);
  });

  test("NEGATIVE: a finish that precedes usage is refused, and the refusal is durable", async () => {
    const h = harness();
    // The grammar rule under test is the one AMC added on top of dsh's: usage is
    // REQUIRED before a successful finish. Delete that rule and this goes green.
    const adapter = scriptedAdapter([
      { type: "block-start", index: 0, blockKind: "text" },
      { type: "text-delta", index: 0, text: "hello" },
      { type: "block-end", index: 0, block: { kind: "text", text: "hello" } },
      { type: "finish", reason: { kind: "stop" } }
    ]);
    const upstream = stubUpstream([() => okStream([])]);
    const { runtime } = runtimeFor({ harness: h, adapter, transport: upstream.transport });

    const error = await drain(runtime.stream(callSpec(h))).catch((caught: unknown) => caught);
    expect(isLlmStreamProtocolError(error)).toBe(true);
    expect((error as { code: string }).code).toBe("AMC_LLM_STREAM_USAGE_MISSING");

    const failure = only(h.sessionId, "request/failure");
    const meta = metaOf(failure);
    // An AMC contract violation is recorded with an AMC_-prefixed code, which is
    // in no policy's retryable set — a signed row must never invite a retry of
    // our own bug.
    expect((meta.failure as Record<string, unknown>).code).toBe("AMC_LLM_STREAM_USAGE_MISSING");
    expect((meta.policy as Record<string, unknown>).retryable).toBe(false);
  });

  test("NEGATIVE: a chunk after the terminal finish is refused", async () => {
    const h = harness();
    const adapter = scriptedAdapter([
      { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } },
      { type: "finish", reason: { kind: "stop" } },
      { type: "usage", usage: { inputTokens: 1, outputTokens: 2 } }
    ]);
    const upstream = stubUpstream([() => okStream([])]);
    const { runtime } = runtimeFor({ harness: h, adapter, transport: upstream.transport });

    const error = await drain(runtime.stream(callSpec(h))).catch((caught: unknown) => caught);
    expect((error as { code: string }).code).toBe("AMC_LLM_STREAM_CHUNK_AFTER_TERMINATION");
  });

  // ── VERIFY-4 ────────────────────────────────────────────────────────────

  test("a forced 429 surfaces a typed retryable error and writes a durable event", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () =>
        errorResponse(
          429,
          { type: "error", error: { type: "rate_limit_error", message: "number of requests has exceeded your rate limit" } },
          { "retry-after": "3", "request-id": "req_abc123" }
        )
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    const error = await drain(runtime.stream(callSpec(h))).catch((caught: unknown) => caught);

    // TYPED: an instance check, not a string match on a message.
    expect(isLlmError(error)).toBe(true);
    const llmError = error as LlmError;
    expect(llmError.code).toBe(LLM_FAILURE_CODE.RATE_LIMIT);
    expect(llmError.failure.status).toBe(429);
    expect(llmError.failure.providerRetryAfterMs).toBe(3000);
    expect(llmError.failure.requestId).toBe("req_abc123");

    // RETRYABLE: by the shipped default policy, which is the only thing entitled
    // to have an opinion about it.
    expect(DEFAULT_RETRYABLE_CODES).toContain(llmError.failure.code);

    // DURABLE: and the row says everything an operator needs without the key.
    const failure = only(h.sessionId, "request/failure");
    const meta = metaOf(failure);
    expect(meta.outcome).toBe("failed");
    expect(meta.finishReason).toBe("error");
    expect(meta.httpStatus).toBe(429);
    expect(meta.headerEventId).toBe(only(h.sessionId, "request/header").id);
    expect(meta.adapterId).toBe(ANTHROPIC_ADAPTER_ID);
    expect(meta.failure).toMatchObject({
      code: LLM_FAILURE_CODE.RATE_LIMIT,
      status: 429,
      providerRetryAfterMs: 3000,
      requestId: "req_abc123"
    });
    expect(meta.policy).toEqual({ mode: "normal", retryable: true });
    expect(meta.credential).toEqual({ ref: "AMC_TEST_ANTHROPIC_KEY", configured: true, source: "file" });
    expect(meta.blocks).toEqual([]);
    // The bytes were committed before they were sent, and the failure did not
    // retract that: the header row stands, settled by the failure row.
    expect(events(h.sessionId).filter((event) => event.event_type === "request/header")).toHaveLength(1);
  });

  test("NEGATIVE: the retry verdict comes from the route's policy, not from the failure", async () => {
    const h = harness();
    const upstream = stubUpstream([() => errorResponse(429, { error: { message: "slow down" } })]);
    // Same 429, same code, same provider facts — a policy that does not list
    // RATE_LIMIT records `retryable: false`. If the verdict ever migrates onto
    // LlmFailure, this test cannot be made to pass.
    const { runtime } = runtimeFor({
      harness: h,
      transport: upstream.transport,
      retryableCodes: [LLM_FAILURE_CODE.SERVER]
    });

    await expect(drain(runtime.stream(callSpec(h)))).rejects.toBeInstanceOf(LlmError);
    const meta = metaOf(only(h.sessionId, "request/failure"));
    expect((meta.failure as Record<string, unknown>).code).toBe(LLM_FAILURE_CODE.RATE_LIMIT);
    expect(meta.policy).toEqual({ mode: "normal", retryable: false });
  });

  test("a provider error body echoing the credential never reaches the signed row", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () => errorResponse(401, { error: { message: `invalid x-api-key: ${KEY_VALUE}` } })
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    await expect(drain(runtime.stream(callSpec(h)))).rejects.toBeInstanceOf(LlmError);

    const raw = only(h.sessionId, "request/failure").meta_json;
    expect(raw).not.toContain(KEY_VALUE);
    expect(raw).toContain("[amc:redacted-credential]");
    // And nowhere else in the session either — a scrub that only cleaned one
    // field would still leave the value in the log.
    for (const event of events(h.sessionId)) {
      expect(event.meta_json).not.toContain(KEY_VALUE);
    }
  });

  // ── Credentials resolve through the seam, per request ───────────────────

  test("a rotated credential applies to the next request without a restart", async () => {
    const h = harness();
    const credentials = new StubCredentials({ [KEY_REF]: KEY_VALUE });
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["one"], inputTokens: 5, outputTokens: 1 })),
      () => okStream(anthropicTextStream({ text: ["two"], inputTokens: 5, outputTokens: 1 }))
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport, credentials });

    await drain(runtime.stream(callSpec(h)));
    credentials.rotate(KEY_REF, "sk-test-rotated-222");
    await drain(runtime.stream(callSpec(h)));

    expect(upstream.sent).toHaveLength(2);
    expect(upstream.sent[0]?.headers["x-api-key"]).toBe(KEY_VALUE);
    expect(upstream.sent[1]?.headers["x-api-key"]).toBe("sk-test-rotated-222");
    // Two dispatches, two reads: a hoisted value would show up here as one.
    expect(credentials.reads).toHaveLength(2);
  });

  test("NEGATIVE: a route whose credential no layer supplies fails typed, before the network", async () => {
    const h = harness();
    const credentials = new StubCredentials({});
    const upstream = stubUpstream([() => okStream([])]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport, credentials });

    const error = await drain(runtime.stream(callSpec(h))).catch((caught: unknown) => caught);
    expect((error as LlmError).code).toBe(LLM_FAILURE_CODE.MISSING_CREDENTIAL);
    expect(upstream.sent).toHaveLength(0);

    const meta = metaOf(only(h.sessionId, "request/failure"));
    expect(meta.httpStatus).toBeNull();
    expect(meta.credential).toEqual({ ref: "AMC_TEST_ANTHROPIC_KEY", configured: false, source: null });
    // The name is reportable, and there is no value anywhere to report.
    expect((meta.failure as Record<string, unknown>).message).toContain("AMC_TEST_ANTHROPIC_KEY");
  });

  test("a route configured with no credential sends no auth header at all", async () => {
    const h = harness();
    const credentials = new StubCredentials({});
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["local"], inputTokens: 1, outputTokens: 1 }))
    ]);
    const { runtime } = runtimeFor({
      harness: h,
      transport: upstream.transport,
      credentials,
      credentialRefOverride: null
    });

    await drain(runtime.stream(callSpec(h)));
    expect(upstream.sent[0]?.headers["x-api-key"]).toBeUndefined();
    expect(credentials.reads).toHaveLength(0);
  });

  // ── The pin ─────────────────────────────────────────────────────────────

  test("replacing a route mid-call cannot change the adapter the call already pinned", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["pinned"], inputTokens: 3, outputTokens: 1 }))
    ]);
    const { runtime, registry } = runtimeFor({ harness: h, transport: upstream.transport });

    const call = runtime.prepare(callSpec(h));
    // The hot-reload moment: a composition swaps the provider's adapter between
    // the signed header row and the dispatch.
    registry.replace({
      providerId: PROVIDER,
      adapter: scriptedAdapter([], "hot-swapped"),
      baseUrl: "https://replaced.invalid",
      credentialRef: KEY_REF,
      models: [MODEL]
    });

    await drain(call.stream());

    expect(upstream.sent[0]?.url).toBe("https://api.anthropic.invalid/v1/messages");
    expect(metaOf(only(h.sessionId, "request/response")).adapterId).toBe(ANTHROPIC_ADAPTER_ID);
    expect(call.settled?.assembly.blocks).toHaveLength(1);
  });

  test("NEGATIVE: a prepared call dispatches exactly once", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () => okStream(anthropicTextStream({ text: ["once"], inputTokens: 3, outputTokens: 1 }))
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    const call = runtime.prepare(callSpec(h));
    await drain(call.stream());
    expect(() => call.stream()).toThrow(LlmDispatchError);
    expect(upstream.sent).toHaveLength(1);
  });

  test("NEGATIVE: preparing a call the adapter cannot carry writes nothing durable", async () => {
    const h = harness();
    const upstream = stubUpstream([() => okStream([])]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    // `anthropic-messages@1` does not set `stream` itself, so omitting it would
    // produce a JSON response the SSE decoder can only report as a truncated
    // connection a minute later. The adapter refuses first.
    expect(() => runtime.prepare(callSpec(h, { max_tokens: 256 }))).toThrow(/stream === true/);
    expect(events(h.sessionId).filter((event) => event.event_type === "request/header")).toHaveLength(0);
    expect(upstream.sent).toHaveLength(0);
  });

  // ── The paths that are easy to leave unrecorded ─────────────────────────

  test("a consumer that walks away mid-stream still settles the request", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () =>
        okStream(
          anthropicTextStream({ text: ["partial ", "output ", "here"], inputTokens: 9, outputTokens: 3 })
        )
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    for await (const chunk of runtime.stream(callSpec(h))) {
      if (chunk.type === "text-delta") break;
    }

    const meta = metaOf(only(h.sessionId, "request/failure"));
    expect(meta.finishReason).toBe("aborted");
    expect((meta.failure as Record<string, unknown>).code).toBe(LLM_FAILURE_CODE.ABORTED);
    // The prefix the model did produce is kept, marked truncated rather than
    // presented as a finished block.
    const blocks = meta.blocks as { status: string; kind: string }[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ status: "truncated", kind: "text" });
    expect(metaOf(only(h.sessionId, "assistant/block")).stopReason).toBe("truncated");
  });

  test("a refused connection is a retryable transport failure, recorded", async () => {
    const h = harness();
    const upstream = refusingUpstream(new Error("connect ECONNREFUSED 127.0.0.1:443"));
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    const error = await drain(runtime.stream(callSpec(h))).catch((caught: unknown) => caught);
    expect((error as LlmError).code).toBe(LLM_FAILURE_CODE.TRANSPORT);
    expect(DEFAULT_RETRYABLE_CODES).toContain(LLM_FAILURE_CODE.TRANSPORT);

    const meta = metaOf(only(h.sessionId, "request/failure"));
    expect(meta.httpStatus).toBeNull();
    expect((meta.failure as Record<string, unknown>).code).toBe(LLM_FAILURE_CODE.TRANSPORT);
  });

  test("a tool call the model emitted becomes a joinable tool/call row", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () =>
        okStream([
          {
            event: "message_start",
            data: JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 40, output_tokens: 0 } } })
          },
          {
            event: "content_block_start",
            data: JSON.stringify({
              type: "content_block_start",
              index: 0,
              content_block: { type: "tool_use", id: "toolu_01", name: "shell" }
            })
          },
          {
            event: "content_block_delta",
            data: JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: '{"command":' }
            })
          },
          {
            event: "content_block_delta",
            data: JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: '"ls"}' }
            })
          },
          { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
          {
            event: "message_delta",
            data: JSON.stringify({
              type: "message_delta",
              delta: { stop_reason: "tool_use" },
              usage: { output_tokens: 12 }
            })
          },
          { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) }
        ])
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    await drain(runtime.stream({ ...callSpec(h), tools: [{ name: "shell", description: "Fixture shell",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] }));

    const call = only(h.sessionId, "tool/call");
    const meta = metaOf(call);
    expect(meta.toolCallId).toBe("toolu_01");
    expect(meta.toolName).toBe("shell");
    expect(meta.providerName).toEqual({ version: 1, wireName: "shell", headerEventId: only(h.sessionId, "request/header").id,
      encoderId: anthropicAdapter.encoderId, encoderVersion: anthropicAdapter.encoderVersion });
    // Native and parentless by construction: a code-mode sub-call is dispatched
    // from inside a running program, never decoded from a provider stream.
    expect(meta.dispatch).toBe("native");
    expect(meta.parentToken).toBeNull();
    expect(metaOf(only(h.sessionId, "request/response")).finishReason).toBe("tool_calls");
  });

  test("a max_tokens truncation drops the tool call and says so in the signed row", async () => {
    const h = harness();
    const upstream = stubUpstream([
      () =>
        okStream([
          {
            event: "message_start",
            data: JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 40, output_tokens: 0 } } })
          },
          {
            event: "content_block_start",
            data: JSON.stringify({
              type: "content_block_start",
              index: 0,
              content_block: { type: "tool_use", id: "toolu_cut", name: "shell" }
            })
          },
          {
            event: "content_block_delta",
            data: JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: '{"command":"rm -rf' }
            })
          },
          { event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
          {
            event: "message_delta",
            data: JSON.stringify({
              type: "message_delta",
              delta: { stop_reason: "max_tokens" },
              usage: { output_tokens: 256 }
            })
          },
          { event: "message_stop", data: JSON.stringify({ type: "message_stop" }) }
        ])
    ]);
    const { runtime } = runtimeFor({ harness: h, transport: upstream.transport });

    await drain(runtime.stream({ ...callSpec(h), tools: [{ name: "shell", description: "Fixture shell",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] }));

    // A tool call cut off by the token limit is unsafe to dispatch, so no
    // `tool/call` row exists for it — and the settlement names the drop rather
    // than leaving an absence for a reader to interpret.
    expect(events(h.sessionId).some((event) => event.event_type === "tool/call")).toBe(false);

    // The dropped block still reached the consumer's stream, so it MUST carry a
    // durable event id: content a consumer saw that the log cannot account for
    // is an unsigned side-channel. The settlement names the drop and points at
    // the row that records it.
    const settled = metaOf(only(h.sessionId, "request/response")).blocks as Array<{
      eventId: string | null;
      ordinal: number;
      kind: string;
      status: string;
      reason: string | null;
    }>;
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      ordinal: 0,
      kind: "tool_use",
      status: "dropped",
      reason: "max_tokens_truncated"
    });
    expect(settled[0]?.eventId, "a dropped block must still be signed into the log").not.toBeNull();

    // And that row is distinguishable from a kept block at a glance.
    const droppedRow = events(h.sessionId).find((event) => event.id === settled[0]?.eventId);
    expect(droppedRow).toBeDefined();
    expect(metaOf(droppedRow!).stopReason).toBe("dropped:max_tokens_truncated");
    const payload = readEventPayload(dir, droppedRow!);
    expect(payload.status).toBe("ok");
    if (payload.status === "ok") expect(JSON.parse(payload.bytes.toString())).toEqual({
      type: "amc.provider-tool-drop", version: 1, providerName: { version: 1, wireName: "shell",
        headerEventId: only(h.sessionId, "request/header").id, encoderId: anthropicAdapter.encoderId,
        encoderVersion: anthropicAdapter.encoderVersion }, content: 'shell{"command":"rm -rf'
    });
  });
});
