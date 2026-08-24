import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  BlockAssembler,
  LLM_FAILURE_CODE,
  OPENAI_CHAT_ENCODER_ID,
  anthropicAdapter,
  deriveSessionRequests,
  gatewayAdapter,
  isLlmError,
  openaiAdapter,
  prepareRequest
} from "../src/llm/index.js";
import type { LlmAdapter, StreamChunk, ToolSchema } from "../src/llm/index.js";
import { anthropicTextStream, errorResponse, okStream } from "./helpers/llmStubUpstream.js";

/**
 * P3.1 stage 3 — the three providers, at the level where they differ.
 *
 * The runtime test next door proves the seam end to end through one adapter.
 * This file is about the translations themselves: OpenAI has no block
 * boundaries and AMC's protocol is built on blocks, Anthropic reports usage in
 * two frames where AMC allows one, and the gateway is a route rather than a
 * wire format. Each of those is a place a plausible implementation would fudge,
 * and each fudge would end up in a signed row.
 */
const OPENAI_MODEL = "gpt-test-1";

/** Run an adapter's decoder over a scripted wire response. */
async function decode(
  adapter: LlmAdapter,
  frames: readonly { event?: string; data: string }[]
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of adapter.decode(okStream(frames))) out.push(chunk);
  return out;
}

/** OpenAI streams plain `data:` frames with no event name. */
function openaiFrames(payloads: readonly unknown[]): { data: string }[] {
  return [...payloads.map((payload) => ({ data: JSON.stringify(payload) })), { data: "[DONE]" }];
}

describe("the OpenAI adapter synthesizes the block boundaries its wire format lacks", () => {
  test("text and tool calls land in separate block namespaces", async () => {
    const chunks = await decode(
      openaiAdapter,
      openaiFrames([
        { choices: [{ index: 0, delta: { content: "Check" } }] },
        { choices: [{ index: 0, delta: { content: "ing." } }] },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "shell", arguments: '{"c' } }]
              }
            }
          ]
        },
        {
          choices: [
            { index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'md":"ls"}' } }] } }
          ]
        },
        { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 30 } } }
      ])
    );

    const starts = chunks.filter((chunk) => chunk.type === "block-start");
    // Text takes index 0 and tool call n takes 1+n. Without the offset the
    // assistant's prose and its first tool call would fold into one signed row.
    expect(starts).toEqual([
      { type: "block-start", index: 0, blockKind: "text" },
      { type: "block-start", index: 1, blockKind: "tool_use" }
    ]);

    const ends = chunks.filter((chunk) => chunk.type === "block-end");
    expect(ends).toHaveLength(2);
    expect(ends[0]).toEqual({ type: "block-end", index: 0, block: { kind: "text", text: "Checking." } });
    expect(ends[1]).toMatchObject({
      index: 1,
      block: { kind: "tool_use", id: "call_a", name: "shell", arguments: '{"cmd":"ls"}' }
    });

    // The whole sequence is legal AMC protocol — which is the real claim, since
    // an illegal one would be refused at the first push.
    const assembler = new BlockAssembler();
    for (const chunk of chunks) assembler.push(chunk);
    const assembly = assembler.complete();
    expect(assembly.blocks.map((block) => block.blockKind)).toEqual(["text", "tool_use"]);
    // OpenAI's prompt_tokens INCLUDES the cached ones; AMC's counts are
    // disjoint, so the conversion happens exactly once, here.
    expect(assembly.usage).toEqual({ inputTokens: 70, outputTokens: 20, cacheReadTokens: 30 });
  });

  test("usage is emitted before the finish, and only when the provider reported it", async () => {
    const chunks = await decode(
      openaiAdapter,
      openaiFrames([
        { choices: [{ index: 0, delta: { content: "hi" } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
        { choices: [], usage: { prompt_tokens: 4, completion_tokens: 1 } }
      ])
    );
    // The contract is about the sequence a consumer observes, so assert the
    // exact tail rather than that an index is non-negative: usage is emitted,
    // finish immediately follows it, and nothing comes after.
    expect(chunks.slice(-2).map((chunk) => chunk.type)).toEqual(["usage", "finish"]);
  });

  test("NEGATIVE: a stream with no reported usage emits none, and the grammar refuses the finish", async () => {
    const chunks = await decode(
      openaiAdapter,
      openaiFrames([
        { choices: [{ index: 0, delta: { content: "hi" } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }
      ])
    );
    // Emitting zeros instead would sign a row saying the step cost nothing.
    expect(chunks.some((chunk) => chunk.type === "usage")).toBe(false);
    const assembler = new BlockAssembler();
    expect(() => {
      for (const chunk of chunks) assembler.push(chunk);
    }).toThrow(/AMC_LLM_STREAM_USAGE_MISSING|token accounting must precede/);
  });

  test("NEGATIVE: a tool call with no id is refused rather than given a synthetic one", async () => {
    await expect(
      decode(
        openaiAdapter,
        openaiFrames([
          { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "shell" } }] } }] }
        ])
      )
    ).rejects.toThrow(/opened without a call id/);
  });

  test("NEGATIVE: an unmapped finish_reason fails loudly instead of becoming a clean stop", async () => {
    const error = await decode(
      openaiAdapter,
      openaiFrames([{ choices: [{ index: 0, delta: {}, finish_reason: "some_new_reason" }] }])
    ).catch((caught: unknown) => caught);
    expect(isLlmError(error)).toBe(true);
    expect((error as Error).message).toContain("some_new_reason");
  });

  test("NEGATIVE: a socket that ends before [DONE] is a retryable transport failure", async () => {
    const error = await decode(openaiAdapter, [
      { data: JSON.stringify({ choices: [{ index: 0, delta: { content: "half" } }] }) }
    ]).catch((caught: unknown) => caught);
    // Transport, not an AMC protocol code: a dropped connection is worth
    // retrying and an adapter bug is not, and the two must not share a code.
    expect((error as { code: string }).code).toBe(LLM_FAILURE_CODE.TRANSPORT);
  });
});

describe("the Anthropic adapter refuses what it cannot describe honestly", () => {
  test("NEGATIVE: an unmapped stop_reason is an error, never a signed clean stop", async () => {
    const frames = anthropicTextStream({ text: ["x"], inputTokens: 1, outputTokens: 1, stopReason: "pause_turn" });
    const error = await decode(anthropicAdapter, frames).catch((caught: unknown) => caught);
    expect(isLlmError(error)).toBe(true);
    expect((error as Error).message).toContain("pause_turn");
  });

  test("NEGATIVE: a connection that ends before message_stop is a transport failure", async () => {
    const frames = anthropicTextStream({ text: ["x"], inputTokens: 1, outputTokens: 1 }).slice(0, 3);
    const error = await decode(anthropicAdapter, frames).catch((caught: unknown) => caught);
    expect((error as { code: string }).code).toBe(LLM_FAILURE_CODE.TRANSPORT);
  });

  test("an in-band error event becomes a terminal failed finish, not a throw", async () => {
    const chunks = await decode(anthropicAdapter, [
      {
        event: "error",
        data: JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })
      }
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      type: "finish",
      reason: { kind: "error", failure: { message: "Overloaded", code: LLM_FAILURE_CODE.SERVER } }
    });
  });

  test("NEGATIVE: a tool_use block opened without a call id is refused", async () => {
    const error = await decode(anthropicAdapter, [
      {
        event: "content_block_start",
        data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "shell" } })
      }
    ]).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain("without a call id");
  });

  test("describeFailure surfaces the request id without overriding the shared classifier", () => {
    const hint = anthropicAdapter.describeFailure?.({
      status: 429,
      headers: { "request-id": "req_9" },
      bodyText: JSON.stringify({ error: { type: "rate_limit_error", message: "slow down" } })
    });
    expect(hint).toEqual({ requestId: "req_9", message: "slow down" });
    // No `code`: the quota-before-429 ordering in httpFailureCode is what keeps
    // an exhausted balance from retrying forever, and an adapter that returned a
    // code would step over it.
    expect(hint).not.toHaveProperty("code");
  });
});

describe("the gateway is a route, not a wire format", () => {
  const gateway = gatewayAdapter({ inner: anthropicAdapter, prefix: "/anthropic", agentId: "agent-7" });

  test("it addresses the gateway, presents a lease, and forwards no provider key", () => {
    const body = Buffer.from('{"model":"claude-test-1"}', "utf8");
    const request = gateway.envelope({
      baseUrl: "https://gateway.invalid",
      model: "claude-test-1",
      body,
      credential: "lease-token-abc",
      extraHeaders: {}
    });

    expect(request.url).toBe("https://gateway.invalid/anthropic/v1/messages");
    expect(request.headers["x-amc-agent-id"]).toBe("agent-7");
    expect(request.headers["x-amc-lease"]).toBe("lease-token-abc");
    // The provider key stays at the gateway. A key the agent side never holds is
    // a key the agent side cannot leak — that is the whole point of the route.
    expect(request.headers["x-api-key"]).toBeUndefined();
    // The body is the inner adapter's, byte for byte: the gateway forwards it
    // untouched, so the same encoder still reconstructs it.
    expect(request.body.equals(body)).toBe(true);
    expect(request.headers["anthropic-version"]).toBe("2023-06-01");
  });

  test("it reuses the inner decoder, so there is no second protocol to drift", async () => {
    const chunks = await decode(
      gateway,
      anthropicTextStream({ text: ["relayed"], inputTokens: 2, outputTokens: 1 })
    );
    const direct = await decode(
      anthropicAdapter,
      anthropicTextStream({ text: ["relayed"], inputTokens: 2, outputTokens: 1 })
    );
    expect(chunks).toEqual(direct);
    expect(gateway.encoderId).toBe(anthropicAdapter.encoderId);
    expect(gateway.encoderVersion).toBe(anthropicAdapter.encoderVersion);
    expect(gateway.id).toBe(`gateway+${anthropicAdapter.id}`);
  });

  test("a gateway refusal is reported as the gateway's, not as the provider's", async () => {
    const response = errorResponse(403, { error: "lease not valid for this upstream" }, { "x-amc-request-id": "amc_r1" });
    const hint = gateway.describeFailure?.({
      status: response.status,
      headers: response.headers,
      bodyText: JSON.stringify({ error: "lease not valid for this upstream" })
    });
    expect(hint?.message).toBe("amc gateway: lease not valid for this upstream");
    expect(hint?.requestId).toBe("amc_r1");
  });

  test("it forwards the inner adapter's param refusal", () => {
    expect(() => gateway.assertParams?.({ max_tokens: 8 })).toThrow(/stream === true/);
    expect(() => gateway.assertParams?.({ max_tokens: 8, stream: true })).not.toThrow();
  });
});

describe("VERIFY-3 holds for the new encoder too", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-openai-encode-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const TOOLS: readonly ToolSchema[] = [
    {
      name: "shell",
      description: "Run one shell command",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
    }
  ];

  test("an openai-chat request reconstructs byte-identically from the session log", () => {
    const session = new SessionService(dir);
    session.open({
      agentId: "default",
      harnessVersion: "3.1.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const sessionId = session.sessionId;
    const systemPrompt = session.recordSystemPrompt("You are terse.");
    session.startTurn({ trigger: "user" });
    session.recordUserMessage("List the files.");
    session.startStep();

    const prepared = prepareRequest(session, {
      model: OPENAI_MODEL,
      providerId: "openai",
      encoderId: OPENAI_CHAT_ENCODER_ID,
      encoderVersion: 1,
      params: { max_completion_tokens: 512 },
      systemPromptEventId: systemPrompt.eventId,
      tools: TOOLS
    });

    session.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: null, content: "On it." });
    session.recordToolCall({
      toolCallId: "call_1",
      toolName: "shell",
      dispatch: "native",
      parentToken: null,
      args: JSON.stringify({ command: "ls" })
    });
    session.recordToolResult({
      toolCallId: "call_1",
      outcome: "OK",
      exitCode: 0,
      timedOut: false,
      denied: false,
      content: "a.txt\n"
    });
    const second = prepareRequest(session, {
      model: OPENAI_MODEL,
      providerId: "openai",
      encoderId: OPENAI_CHAT_ENCODER_ID,
      encoderVersion: 1,
      params: { max_completion_tokens: 512 },
      systemPromptEventId: systemPrompt.eventId,
      tools: TOOLS
    });
    session.endStep({ stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 2, cacheRead: 0, cacheWrite: 0 } });
    session.endTurn({ reason: "complete" });
    session.sealTurn();
    session.close({ reason: "completed" });

    const derived = deriveSessionRequests({ workspace: dir, sessionId });
    expect(derived).toHaveLength(2);
    expect(derived.map((entry) => entry.status)).toEqual(["reconstructed", "reconstructed"]);
    expect(derived[0]?.bytes?.equals(prepared.toBytes())).toBe(true);
    expect(derived[1]?.bytes?.equals(second.toBytes())).toBe(true);

    // The encoder's own guarantees, read off the reconstructed bytes rather than
    // asserted about the encoder in isolation.
    const body = JSON.parse(second.toBytes().toString("utf8")) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    const messages = body.messages as { role: string; tool_call_id?: string }[];
    expect(messages[0]).toEqual({ content: "You are terse.", role: "system" });
    // A tool result is its own message, keyed by the call it answers.
    expect(messages[messages.length - 1]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
  });

  test("NEGATIVE: a param that collides with a field the encoder sets is refused", () => {
    const session = new SessionService(dir);
    session.open({
      agentId: "default",
      harnessVersion: "3.1.0",
      compositionDigest: sha256Hex("composition"),
      policyDigest: sha256Hex("policy")
    });
    const systemPrompt = session.recordSystemPrompt("You are terse.");
    session.startTurn({ trigger: "user" });
    session.recordUserMessage("hello");
    session.startStep();

    // Silently overwriting would make the transmitted body disagree with what
    // the caller asked for, and the disagreement would only surface much later
    // as a reconstruction that no longer matches.
    expect(() =>
      prepareRequest(session, {
        model: OPENAI_MODEL,
        providerId: "openai",
        encoderId: OPENAI_CHAT_ENCODER_ID,
        encoderVersion: 1,
        params: { stream: false },
        systemPromptEventId: systemPrompt.eventId,
        tools: null
      })
    ).toThrow(/collides with a body field/);
    session.close({ reason: "completed" });
  });
});
