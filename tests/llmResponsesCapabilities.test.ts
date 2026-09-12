import { describe, expect, test, vi } from "vitest";
import type { SessionService } from "../src/session/sessionService.js";
import type { CredentialsService } from "../src/credentials/credentialsService.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";
import {
  AdapterRegistry, BlockAssembler, LlmCapabilityError, LlmRuntime, LLM_FAILURE_CODE,
  OPENAI_CHAT_CAPABILITIES, OPENAI_RESPONSES_CAPABILITIES, ANTHROPIC_CAPABILITIES,
  assertRequestCapabilities, assertRequiredCapabilities, openaiResponsesAdapter, openaiResponsesEncoder,
  openaiAdapter, anthropicAdapter, snapshotCapabilities,
  type StreamChunk
} from "../src/llm/index.js";
import { anthropicTextStream, okStream } from "./helpers/llmStubUpstream.js";

// Authored during the implementation batch; execution intentionally deferred.
const request = (overrides: Partial<EncodableRequest> = {}): EncodableRequest => ({
  model: "gpt-text-fixture", params: { max_output_tokens: 100 }, system: "Be precise.", tools: null,
  messages: [{ role: "user", parts: [{ kind: "text", text: "hello" }] }], ...overrides
});
const textOutput = { id: "msg_a", type: "message", role: "assistant", status: "completed",
  content: [{ type: "output_text", text: "Hello", annotations: [] }] };
const reportedUsage = { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 4 } };
function textEvents(usage: unknown = reportedUsage): Record<string, unknown>[] {
  return [
    { type: "response.created", response: { id: "resp_a", status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...textOutput, status: "in_progress", content: [] } },
    { type: "response.content_part.added", output_index: 0, item_id: "msg_a", content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", output_index: 0, item_id: "msg_a", content_index: 0, delta: "Hello" },
    { type: "response.output_text.done", output_index: 0, item_id: "msg_a", content_index: 0, text: "Hello" },
    { type: "response.content_part.done", output_index: 0, item_id: "msg_a", content_index: 0, part: textOutput.content[0] },
    { type: "response.output_item.done", output_index: 0, item: textOutput },
    { type: "response.completed", response: { id: "resp_a", status: "completed", output: [textOutput], usage } }
  ];
}
async function decode(events: Record<string, unknown>[]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of openaiResponsesAdapter.decode(okStream(events.map((event, index) => ({
    event: String(event.type), data: JSON.stringify({ sequence_number: index, ...event })
  }))))) out.push(chunk);
  return out;
}

describe("explicit Responses protocol and required capabilities", () => {
  test("function replay preserves provider call IDs, raw arguments, result text and stateless body", () => {
    const body = JSON.parse(openaiResponsesEncoder.encode(request({
      tools: [{ name: "lookup", description: "Look up", parameters: { type: "object" } }],
      messages: [
        { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "call_a", toolName: "lookup", argumentsJson: '{ "x": 1 }' }] },
        { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call_a", isError: false, text: "result" }] }
      ]
    })).toString());
    expect(body).toMatchObject({ model: "gpt-text-fixture", stream: true, store: false, max_output_tokens: 100,
      instructions: "Be precise.", tools: [{ type: "function", name: "lookup", strict: false }], input: [
        { type: "function_call", call_id: "call_a", name: "lookup", arguments: '{ "x": 1 }' },
        { type: "function_call_output", call_id: "call_a", output: '{"isError":false,"output":"result","type":"amc.tool-result","version":1}' }
      ] });
    expect(body).not.toHaveProperty("messages");
  });
  test.each(["previous_response_id", "max_tokens", "include", "store"])("refuses the unsupported/owned %s parameter", key => {
    expect(() => openaiResponsesEncoder.encode(request({ params: { [key]: "value" } }))).toThrow();
  });
  test("orphan and repeated tool results refuse rather than guessing their parent call", () => {
    const result = { kind: "tool_result" as const, toolCallId: "call_a", isError: false, text: "result" };
    expect(() => openaiResponsesEncoder.encode(request({ messages: [{ role: "tool", parts: [result] }] }))).toThrow(/preceding matching call/);
    expect(() => openaiResponsesEncoder.encode(request({ messages: [
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "call_a", toolName: "lookup", argumentsJson: "{}" }] },
      { role: "tool", parts: [result, result] }
    ] }))).toThrow(/preceding matching call/);
  });
  test("refuses unsupported media and thinking but preserves failed tool state as explicit text", () => {
    expect(() => assertRequestCapabilities(OPENAI_CHAT_CAPABILITIES, request({ messages: [
      { role: "assistant", parts: [{ kind: "thinking", text: "opaque replay requires provider metadata" }] }
    ] }))).toThrow(LlmCapabilityError);
    expect(() => openaiResponsesEncoder.encode(request({ messages: [
      { role: "user", parts: [{ kind: "image", sha256: "a".repeat(64) }] }
    ] }))).toThrow(LlmCapabilityError);
    const failedResult = request({ messages: [{ role: "tool", parts: [
      { kind: "tool_result", toolCallId: "call_a", isError: true, text: "denied" }
    ] }] });
    expect(() => assertRequestCapabilities(OPENAI_RESPONSES_CAPABILITIES, failedResult)).not.toThrow();
    expect(() => assertRequiredCapabilities(OPENAI_RESPONSES_CAPABILITIES, ["tool-result-error-flag"])).toThrow(LlmCapabilityError);
    expect(() => assertRequestCapabilities(ANTHROPIC_CAPABILITIES, failedResult)).not.toThrow();
  });
  test("explicit unknown or unsupported requirements refuse before reading session/credentials or transport", () => {
    const registry = new AdapterRegistry();
    registry.register({ providerId: "responses", adapter: openaiResponsesAdapter, baseUrl: "https://provider.invalid", credentialRef: null, models: null });
    const readEvents = vi.fn(), resolve = vi.fn(), transport = vi.fn();
    const runtime = new LlmRuntime({ registry, session: { readEvents } as unknown as SessionService,
      credentials: { resolve } as unknown as CredentialsService, transport });
    // Responses v3 supports signed user images; opaque thinking replay still refuses.
    expect(() => assertRequiredCapabilities(OPENAI_RESPONSES_CAPABILITIES, ["image-input"])).not.toThrow();
    for (const requiredCapabilities of [["thinking-replay"], ["invented-capability"]]) {
      expect(() => runtime.prepare({ providerId: "responses", model: "fixture", params: {}, tools: null,
        systemPromptEventId: "unused", requiredCapabilities })).toThrow(LlmCapabilityError);
    }
    expect(readEvents).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
    expect(() => assertRequiredCapabilities(null, ["text-input"])).toThrow(LlmCapabilityError);
    expect(runtime.describeProviders()[0]?.capabilities?.modelSupport).toBe("not-probed");
    expect(runtime.describeProviders()[0]).not.toHaveProperty("credentialRef");
  });
  test("capability snapshots cannot drift with a caller's mutable feature object", () => {
    const input = { ...OPENAI_RESPONSES_CAPABILITIES, features: { ...OPENAI_RESPONSES_CAPABILITIES.features } };
    const snapshot = snapshotCapabilities(input);
    input.features["text-input"] = "unsupported";
    expect(snapshot?.features["text-input"]).toBe("supported");
    expect(Object.isFrozen(snapshot?.features)).toBe(true);
  });
  test("envelope carries the exact prepared bytes, explicit endpoint and cancellation signal", () => {
    const controller = new AbortController(), body = Buffer.from("exact bytes");
    const envelope = openaiResponsesAdapter.envelope({ baseUrl: "https://provider.invalid", model: "fixture", body,
      credential: "synthetic-only", extraHeaders: {}, signal: controller.signal });
    expect(envelope.url).toBe("https://provider.invalid/v1/responses"); expect(envelope.body).toBe(body);
    expect(envelope.signal).toBe(controller.signal); controller.abort(); expect(envelope.signal?.aborted).toBe(true);
  });
});

describe("Responses streamed content and honest settlement", () => {
  test("assembles text with disjoint reported cache counts and leaves absent counts unknown", async () => {
    const assembler = new BlockAssembler(); for (const chunk of await decode(textEvents())) assembler.push(chunk);
    const result = assembler.complete();
    expect(result.blocks[0]?.block).toEqual({ kind: "text", text: "Hello" });
    expect(result.usage).toEqual({ inputTokens: 6, outputTokens: 2, cacheReadTokens: 4 });
    expect(result.usage).not.toHaveProperty("cacheWriteTokens");
  });
  test("missing usage cannot become successful zero-token evidence", async () => {
    const chunks = await decode(textEvents(null)); expect(chunks.some(c => c.type === "usage")).toBe(false);
    const assembler = new BlockAssembler();
    expect(() => { for (const chunk of chunks) assembler.push(chunk); }).toThrow(/token accounting must precede|AMC_LLM_STREAM_USAGE_MISSING/);
  });
  test("truncated transport cannot manufacture a terminal finish", async () => {
    await expect(decode(textEvents().slice(0, -1))).rejects.toMatchObject({ code: LLM_FAILURE_CODE.TRANSPORT });
  });
  test("changed final text or unsupported assistant phase refuses", async () => {
    const changed = textEvents(); changed[6] = { type: "response.output_item.done", output_index: 0,
      item: { ...textOutput, content: [{ type: "output_text", text: "Different", annotations: [] }] } };
    await expect(decode(changed)).rejects.toThrow(/snapshot mismatch/);
    const phased = textEvents(); phased[1] = { type: "response.output_item.added", output_index: 0,
      item: { ...textOutput, phase: "final_answer", status: "in_progress", content: [] } };
    await expect(decode(phased)).rejects.toMatchObject({ code: LLM_FAILURE_CODE.INVALID_REQUEST });
  });
  test("function arguments retain their own provider ID and a complete boundary", async () => {
    const item = { type: "function_call", id: "fc_a", call_id: "call_a", name: "lookup", arguments: '{"x":1}', status: "completed" };
    const chunks = await decode([
      { type: "response.created", response: { id: "resp_a" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "", status: "in_progress" } },
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: "fc_a", delta: '{"x":1}' },
      { type: "response.function_call_arguments.done", output_index: 0, item_id: "fc_a", arguments: '{"x":1}' },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: { id: "resp_a", status: "completed", output: [item], usage: reportedUsage } }
    ]);
    const assembler = new BlockAssembler(); for (const chunk of chunks) assembler.push(chunk);
    expect(assembler.complete().blocks[0]?.block).toEqual({ kind: "tool_use", id: "call_a", name: "lookup", arguments: '{"x":1}' });
    expect(chunks.at(-1)).toEqual({ type: "finish", reason: { kind: "tool_calls" } });
  });
  test("existing adapters reject missing final accounting and inconsistent reported cache totals", async () => {
    const frames = anthropicTextStream({ text: ["hi"], inputTokens: 3, outputTokens: 1 }).map(frame => {
      const value = JSON.parse(frame.data); if (value.type === "message_delta") delete value.usage;
      return { ...frame, data: JSON.stringify(value) };
    });
    const assembler = new BlockAssembler();
    await expect((async () => { for await (const chunk of anthropicAdapter.decode(okStream(frames))) assembler.push(chunk); })())
      .rejects.toThrow(/token accounting must precede|AMC_LLM_STREAM_USAGE_MISSING/);
    const response = okStream([{ data: JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1,
      prompt_tokens_details: { cached_tokens: 3 } } }) }]);
    await expect((async () => { for await (const _ of openaiAdapter.decode(response)) { /* drain */ } })()).rejects.toThrow(/exceeds/);
  });
});
