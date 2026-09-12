/** Tasks14/15: AUTHORED UNEXECUTED. In-memory wire fixtures, never real-provider
 * acceptance. Native registration is paired with conditional replay admission;
 * no module test substitutes for integrated or installed qualification.
 */
import { describe, expect, it } from "vitest";
import { deepseekChatEncoder } from "../src/llm/request/deepseekChatEncoder.js";
import { RequestEncodingError, type EncodablePart, type EncodableRequest, type ToolSchema } from "../src/llm/request/requestSpec.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { bindProviderToolNames, providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import { ProviderToolBinding } from "../src/llm/adapter/providerToolBinding.js";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { assertRequiredCapabilities, assertRequestCapabilities, snapshotCapabilities, DEEPSEEK_CAPABILITIES } from "../src/llm/adapter/providerCapabilities.js";
import { BlockAssembler, surfaceBlocks } from "../src/llm/blockAssembler.js";
import { LlmStreamProtocolError } from "../src/llm/streamProtocol.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import type { HttpResponse } from "../src/llm/adapter/transport.js";
import { decodeDeepseek, deepseekAdapter, deepseekEnvelope, deepseekFailure } from "../src/llm/providers/deepseekAdapter.js";
import { deepseekParams, assertDeepseekJson, DEEPSEEK_WIRE_CONTRACT } from "../src/llm/providers/deepseekContract.js";
import { deepseekUsage } from "../src/llm/providers/deepseekUsage.js";

const functions: ToolSchema[] = [
  { name: "fs.read", description: "Fixture read", parameters: { type: "object", properties: { path: { type: "string" } } } },
  { name: "fs_read", description: "Different fixture identity", parameters: { type: "object", properties: {} } }
];
function request(overrides: Partial<EncodableRequest> = {}): EncodableRequest {
  return { model: "fixture-model", params: { max_tokens: 64 }, system: "Fixture system",
    tools: null, messages: [{ role: "user", parts: [{ kind: "text", text: "Fixture question" }] }], ...overrides };
}
interface WireMessage {
  role: string; content: string | null; reasoning_content?: string; tool_call_id?: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
}
interface WireBody {
  model: string; messages: WireMessage[]; stream: boolean; stream_options: { include_usage: boolean };
  thinking: { type: string }; reasoning_effort?: string;
  tools?: { function: { name: string } }[];
  tool_choice?: { function: { name: string } };
}
function encoded(value: EncodableRequest): WireBody {
  return JSON.parse(deepseekChatEncoder.encode(value).toString("utf8")) as WireBody;
}
const usage = { prompt_tokens: 12, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 7,
  completion_tokens: 4, total_tokens: 16, completion_tokens_details: { reasoning_tokens: 3 } };
function frame(delta: Record<string, unknown>, finish: string | null = null, reported: unknown = null,
  extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "fixture-response", object: "chat.completion.chunk", model: "fixture-model",
    choices: [{ index: 0, delta, finish_reason: finish }], usage: reported, ...extra };
}
function event(value: unknown, ending = "\n"): string {
  return `data: ${value === "[DONE]" ? "[DONE]" : JSON.stringify(value)}${ending}${ending}`;
}
function response(wire: string | Uint8Array, stride = 3): HttpResponse {
  const bytes = typeof wire === "string" ? Buffer.from(wire, "utf8") : wire;
  return { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" }, body: (async function* () {
    for (let offset = 0; offset < bytes.length; offset += stride) yield bytes.subarray(offset, offset + stride);
  })() };
}
async function collect(source: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []; for await (const chunk of source) chunks.push(chunk); return chunks;
}
async function decoded(frames: unknown[], stride = 3): Promise<StreamChunk[]> {
  return collect(decodeDeepseek(response(frames.map(value => event(value)).join(""), stride)));
}
function toolFrame(index = 0, id = "call-A", name = providerToolWireName("fs.read"), args = "{"): Record<string, unknown> {
  return frame({ tool_calls: [{ index, id, type: "function", function: { name, arguments: args } }] });
}
function toolSequence(): unknown[] {
  return [frame({ role: "assistant", content: "" }), frame({ reasoning_content: "Read ☀️ first" }),
    frame({ content: "I will read." }), toolFrame(),
    frame({ tool_calls: [{ index: 0, function: { arguments: '"path":"a"}' } }] }),
    frame({}, "tool_calls", usage), "[DONE]"];
}

describe("DeepSeek explicit option and encoding contract (unexecuted)", () => {
  it("emits pinned thinking/stream defaults without mutating the input", () => {
    const input = request(); const original = JSON.stringify(input); const body = encoded(input);
    expect(body.thinking).toEqual({ type: "enabled" }); expect(body.reasoning_effort).toBe("high");
    expect(body.stream).toBe(true); expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tools).toBeUndefined(); expect(JSON.stringify(input)).toBe(original);
    expect(deepseekChatEncoder.encode(input).equals(deepseekChatEncoder.encode(JSON.parse(original) as EncodableRequest))).toBe(true);
  });
  it("permits sampling only with explicitly disabled thinking", () => {
    expect(deepseekParams({ max_tokens: 64, thinking: { type: "disabled" }, temperature: 0, top_p: 1 }))
      .toEqual({ max_tokens: 64, thinking: { type: "disabled" }, temperature: 0, top_p: 1 });
  });
  it.each(["presence_penalty", "frequency_penalty"])("refuses deprecated %s even with thinking disabled", key => {
    expect(() => deepseekParams({ max_tokens: 64, thinking: { type: "disabled" }, [key]: 0 })).toThrow(/deprecated.*every mode/);
  });
  it.each(["temperature", "top_p", "presence_penalty", "frequency_penalty"])("refuses ignored thinking-mode %s", key => {
    expect(() => deepseekParams({ max_tokens: 64, [key]: 0 })).toThrow(/ignores/);
  });
  it.each([
    {}, { max_tokens: 0 }, { max_tokens: -1 }, { max_tokens: 1.5 }, { max_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { max_tokens: 64, thinking: null }, { max_tokens: 64, thinking: { type: ["enabled"] } },
    { max_tokens: 64, thinking: { type: "enabled", budget_tokens: 20 } },
    { max_tokens: 64, reasoning_effort: "medium" }, { max_tokens: 64, reasoning_effort: "xhigh" },
    { max_tokens: 64, reasoning_effort: ["low"] },
    { max_tokens: 64, thinking: { type: "disabled" }, reasoning_effort: "high" },
    { max_tokens: 64, response_format: { type: ["text"] } },
    { max_tokens: 64, stop: [] }, { max_tokens: 64, stop: "" }, { max_tokens: 64, stop: Array(17).fill("x") },
    { max_tokens: 64, thinking: { type: "disabled" }, temperature: 3 },
    { max_tokens: 64, thinking: { type: "disabled" }, top_p: -0.1 }
  ])("refuses invalid/remapped options %#", params => { expect(() => deepseekParams(params)).toThrow(RequestEncodingError); });
  it.each(["messages", "tools", "model", "stream", "stream_options", "extra_body", "reasoning", "audio", "modalities", "functions", "seed"])(
    "refuses reserved or unsupported param %s rather than silently dropping it", key => {
      expect(() => encoded(request({ params: { max_tokens: 64, [key]: true } }))).toThrow(RequestEncodingError);
    });
  it("preserves complete reasoning across tools and subsequent user turns", () => {
    const body = encoded(request({ tools: functions, params: { max_tokens: 64,
      tool_choice: { type: "function", function: { name: "fs.read" } } }, messages: [
      { role: "user", parts: [{ kind: "text", text: "First question" }] },
      { role: "assistant", parts: [{ kind: "thinking", text: "Reason α" }, { kind: "text", text: "Read first" },
        { kind: "tool_use", toolCallId: "call-A", toolName: "fs.read", argumentsJson: '{ "path" : "a" }' }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call-A", isError: true, text: '{"isError":false}' }] },
      { role: "assistant", parts: [{ kind: "thinking", text: "Reason β" }, { kind: "text", text: "Answer" }] },
      { role: "user", parts: [{ kind: "text", text: "Second question" }] }
    ] }));
    expect(body.messages.map(message => message.role)).toEqual(["system", "user", "assistant", "tool", "assistant", "user"]);
    expect(body.messages[2]?.reasoning_content).toBe("Reason α"); expect(body.messages[4]?.reasoning_content).toBe("Reason β");
    expect(body.messages[2]?.tool_calls?.[0]).toEqual({ id: "call-A", type: "function",
      function: { name: providerToolWireName("fs.read"), arguments: '{ "path" : "a" }' } });
    expect(body.messages[3]?.tool_call_id).toBe("call-A");
    expect(JSON.parse(body.messages[3]?.content ?? "null")).toEqual({ type: "amc.tool-result", version: 1,
      isError: true, output: '{"isError":false}' });
    expect(body.tools?.map(tool => tool.function.name)).toEqual([providerToolWireName("fs.read"), "fs_read"]);
    expect(body.tool_choice?.function.name).toBe(providerToolWireName("fs.read"));
  });
  it("keeps historical removed-tool replay distinct from currently offered authority", () => {
    const input = request({ tools: [functions[1]!], messages: [
      { role: "assistant", parts: [{ kind: "thinking", text: "Earlier reasoning" },
        { kind: "tool_use", toolCallId: "old", toolName: "fs.read", argumentsJson: "{}" }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "old", isError: false, text: "done" }] }
    ] });
    const body = encoded(input); expect(body.messages[1]?.tool_calls?.[0]?.function.name).toBe(providerToolWireName("fs.read"));
    expect(bindProviderToolNames(input.tools ?? []).has(providerToolWireName("fs.read"))).toBe(false);
  });
  it("refuses tools-free reasoning replay instead of sending ignored signed input", () => {
    expect(() => encoded(request({ messages: [{ role: "assistant", parts: [{ kind: "thinking", text: "retain me" }] }] }))).toThrow(/ignores reasoning history/);
    expect(() => encoded(request({ tools: [] }))).toThrow(/empty tools/);
  });
  it("never invents missing reasoning history for thinking-mode tools", () => {
    expect(() => encoded(request({ tools: functions, messages: [{ role: "assistant", parts: [{ kind: "text", text: "old answer" }] }] }))).toThrow(/missing history/);
  });
  it("preserves explicitly recorded empty reasoning as distinct from missing", () => {
    const body = encoded(request({ tools: functions, messages: [{ role: "assistant", parts: [
      { kind: "thinking", text: "" }, { kind: "text", text: "answer" }] }] }));
    expect(Object.hasOwn(body.messages[1]!, "reasoning_content")).toBe(true);
    expect(body.messages[1]?.reasoning_content).toBe("");
  });
  const malformedHistory: { name: string; messages: unknown[]; error: RegExp }[] = [
    { name: "orphan result", messages: [{ role: "tool", parts: [{ kind: "tool_result", toolCallId: "orphan", text: "x", isError: false }] }], error: /no unmatched preceding call/ },
    { name: "unanswered call", messages: [{ role: "assistant", parts: [{ kind: "thinking", text: "x" }, { kind: "tool_use", toolCallId: "a", toolName: "fs.read", argumentsJson: "{}" }] }], error: /unanswered function calls/ },
    { name: "reordered thinking", messages: [{ role: "assistant", parts: [{ kind: "text", text: "x" }, { kind: "thinking", text: "later" }] }], error: /without reordering/ },
    { name: "image", messages: [{ role: "user", parts: [{ kind: "image", sha256: "a".repeat(64) }] }], error: /signed image input/ },
    { name: "user reasoning", messages: [{ role: "user", parts: [{ kind: "thinking", text: "wrong role" }] }], error: /user history supports text only/ },
    { name: "duplicate system source", messages: [{ role: "system", parts: [{ kind: "text", text: "duplicate system" }] }], error: /history role/ },
    { name: "hidden image field", messages: [{ role: "user", parts: [{ kind: "text", text: "x", image_url: "https://example.invalid/image" }] }], error: /unsupported/ },
    { name: "audio", messages: [{ role: "user", parts: [{ kind: "audio", data: "ignored?" }] }], error: /native audio input is unsupported by deepseek-chat@1/ }
  ];
  it.each(malformedHistory)("refuses $name at its actual encoding boundary", ({ messages, error }) => {
    expect(() => encoded(request({ tools: functions, messages: messages as unknown as EncodableRequest["messages"] }))).toThrow(error);
  });
  it("rejects duplicate calls/results, cross-call joins and invalid argument values", () => {
    for (const args of ["{", "null", "[]", "1", '{"n":1e400}']) {
      expect(() => encoded(request({ tools: functions, messages: [
        { role: "assistant", parts: [{ kind: "thinking", text: "r" }, { kind: "tool_use", toolCallId: "a", toolName: "fs.read", argumentsJson: args }] },
        { role: "tool", parts: [{ kind: "tool_result", toolCallId: "a", text: "x", isError: false }] }
      ] }))).toThrow(RequestEncodingError);
    }
    for (const resultId of ["other", "a"]) {
      expect(() => encoded(request({ tools: functions, messages: [
        { role: "assistant", parts: [{ kind: "thinking", text: "r" }, { kind: "tool_use", toolCallId: "a", toolName: "fs.read", argumentsJson: "{}" }] },
        { role: "tool", parts: [{ kind: "tool_result", toolCallId: "a", text: "x", isError: false },
          { kind: "tool_result", toolCallId: resultId, text: "duplicate/orphan", isError: false }] }
      ] }))).toThrow(RequestEncodingError);
    }
    expect(() => encoded(request({ tools: functions, messages: [{ role: "assistant", parts: [
      { kind: "thinking", text: "r" }, { kind: "tool_use", toolCallId: "a", toolName: "fs.read", argumentsJson: "{}" },
      { kind: "tool_use", toolCallId: "a", toolName: "fs_read", argumentsJson: "{}" }] }] }))).toThrow(/duplicate historical/);
  });
  it("refuses unoffered tool_choice and lossy JSON without evaluating accessors", () => {
    expect(() => encoded(request({ tools: functions, params: { max_tokens: 64,
      tool_choice: { type: "function", function: { name: "not-offered" } } } }))).toThrow(/offered/);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const value of [cycle, new Date(0), [undefined], Array(2), { x: NaN }, { x: Infinity }]) {
      expect(() => assertDeepseekJson(value)).toThrow(RequestEncodingError);
    }
    let touched = false;
    const accessor = Object.defineProperty({}, "x", { enumerable: true, get() { touched = true; return 1; } });
    expect(() => assertDeepseekJson(accessor)).toThrow(/accessor/); expect(touched).toBe(false);
  });
});

describe("DeepSeek reported usage (unexecuted)", () => {
  it("maps disjoint cache usage and never fabricates cache writes", () => {
    expect(deepseekUsage(usage)).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 4, reasoningTokens: 3 });
    expect(deepseekUsage({ prompt_tokens: 0, completion_tokens: 0 })).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(deepseekUsage({ prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 })).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
    expect(deepseekUsage(undefined)).toBeNull(); expect(deepseekUsage(null)).toBeNull();
  });
  it.each([
    {}, [], { prompt_tokens: 1 }, { completion_tokens: 1 }, { prompt_tokens: null, completion_tokens: 0 },
    { ...usage, prompt_tokens: -1 }, { ...usage, completion_tokens: 1.5 }, { ...usage, total_tokens: 17 },
    { ...usage, prompt_cache_hit_tokens: 13 }, { ...usage, prompt_cache_miss_tokens: 0 },
    { prompt_tokens: 12, completion_tokens: 4, prompt_cache_hit_tokens: 5 },
    { prompt_tokens: 12, completion_tokens: 4, prompt_cache_miss_tokens: 7 },
    { ...usage, completion_tokens_details: { reasoning_tokens: 5 } },
    { ...usage, completion_tokens_details: { reasoning_tokens: -1 } },
    { ...usage, completion_tokens_details: [] },
    { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 }
  ].map(value => ({ value })))("rejects malformed/inconsistent counts %#", ({ value }) => { expect(() => deepseekUsage(value)).toThrow(); });
});

describe("DeepSeek SSE, tool and cancellation contract (unexecuted)", () => {
  it("preserves byte-fragmented CRLF/UTF-8 and binds exact offered names into the canonical assembler", async () => {
    const wire = toolSequence().map(value => event(value, "\r\n")).join("");
    const binding = new ProviderToolBinding(bindProviderToolNames(functions)); const assembler = new BlockAssembler();
    for await (const chunk of decodeDeepseek(response(wire, 1))) assembler.push(binding.bind(chunk));
    const result = assembler.complete(); expect(result.finishReason).toEqual({ kind: "tool_calls" });
    expect(result.usage).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 4, reasoningTokens: 3 });
    expect(surfaceBlocks(result)).toEqual([{ kind: "thinking", text: "Read ☀️ first" },
      { kind: "text", text: "I will read." }, { kind: "tool_use", id: "call-A", name: "fs.read",
        providerWireName: providerToolWireName("fs.read"), arguments: '{"path":"a"}' }]);
  });
  it("round-trips decoded reasoning/tools through the existing canonical part shape", async () => {
    const binding = new ProviderToolBinding(bindProviderToolNames(functions)); const assembler = new BlockAssembler();
    for (const chunk of await decoded(toolSequence())) assembler.push(binding.bind(chunk));
    const parts = surfaceBlocks(assembler.complete()).map<EncodablePart>(block => {
      if (block.kind === "text" || block.kind === "thinking") return { kind: block.kind, text: block.text };
      if (block.kind === "tool_use") return { kind: "tool_use", toolCallId: block.id, toolName: block.name, argumentsJson: block.arguments };
      throw new Error("Unexpected fixture modality");
    });
    const body = encoded(request({ tools: functions, messages: [{ role: "assistant", parts },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call-A", isError: false, text: "read result" }] }] }));
    expect(body.messages[1]?.reasoning_content).toBe("Read ☀️ first");
    expect(body.messages[1]?.tool_calls?.[0]?.function.arguments).toBe('{"path":"a"}');
    expect(body.messages[2]?.tool_call_id).toBe("call-A");
  });
  it("handles parallel indexed tool deltas without merging their IDs", async () => {
    const frames = [toolFrame(0, "A", "fs_read", "{"), toolFrame(1, "B", providerToolWireName("fs.read"), "{}"),
      frame({ tool_calls: [{ index: 0, function: { arguments: "}" } }] }), frame({}, "tool_calls", usage), "[DONE]"];
    const ends = (await decoded(frames)).filter(chunk => chunk.type === "block-end");
    expect(ends.map(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? chunk.block.id : null)).toEqual(["A", "B"]);
  });
  it("withholds tool completion until DONE and retains usage when the sentinel is lost", async () => {
    const assembler = new BlockAssembler();
    // Stream rather than await collect so prefix facts survive the rejected iterator.
    await expect((async () => { for await (const chunk of decodeDeepseek(response(toolSequence().slice(0, -1).map(value => event(value)).join("")))) {
      assembler.push(chunk);
    } })()).rejects.toThrow(/before \[DONE\]/);
    const result = assembler.abort("fixture-truncated-wire"); expect(result.usage?.cacheReadTokens).toBe(5);
    expect(result.blocks.some(block => block.blockKind === "tool_use" && block.outcome.status === "completed")).toBe(false);
  });
  it("refuses missing usage before any completed tool is emitted", async () => {
    const observed: StreamChunk[] = [];
    const frames = [toolFrame(0, "A", "fs_read", "{}"), frame({}, "tool_calls"), "[DONE]"];
    await expect((async () => { for await (const chunk of decodeDeepseek(response(frames.map(value => event(value)).join("")))) observed.push(chunk); })()).rejects.toBeInstanceOf(LlmStreamProtocolError);
    expect(observed.some(chunk => chunk.type === "block-end")).toBe(false);
  });
  it.each(["content_filter", "insufficient_system_resource", "length"])("does not execute tools after %s", async reason => {
    const assembler = new BlockAssembler();
    for (const chunk of await decoded([toolFrame(0, "A", "fs_read", "{}"), frame({}, reason, usage), "[DONE]"])) assembler.push(chunk);
    const result = assembler.complete(); expect(result.finishReason?.kind).toBe("error"); expect(result.usage?.inputTokens).toBe(7);
    expect(surfaceBlocks(result).some(block => block.kind === "tool_use")).toBe(false);
  });
  it("keeps non-tool output length distinct from stop", async () => {
    const chunks = await decoded([frame({ content: "partial" }), frame({}, "length", usage), "[DONE]"]);
    expect(chunks.at(-1)).toEqual({ type: "finish", reason: { kind: "max_tokens" } });
  });
  it("represents in-band errors without fabricated usage or completed partial tools", async () => {
    const assembler = new BlockAssembler();
    for (const chunk of await decoded([toolFrame(), { error: { message: "fixture failure" } }])) assembler.push(chunk);
    const result = assembler.complete(); expect(result.usage).toBeNull(); expect(result.finishReason?.kind).toBe("error");
    expect(surfaceBlocks(result).some(block => block.kind === "tool_use")).toBe(false);
  });
  const malformedStreams: { name: string; frames: unknown[]; error: RegExp }[] = [
    { name: "early sentinel", frames: ["[DONE]"], error: /without finish_reason/ },
    { name: "unknown finish", frames: [frame({}, "unknown", usage), "[DONE]"], error: /inconsistent finish_reason/ },
    { name: "empty tool finish", frames: [frame({}, "tool_calls", usage), "[DONE]"], error: /inconsistent finish_reason/ },
    { name: "stop with tools", frames: [toolFrame(0, "A", "fs_read", "{}"), frame({}, "stop", usage), "[DONE]"], error: /inconsistent finish_reason/ },
    { name: "premature usage", frames: [frame({}, null, usage)], error: /final finish frame/ },
    { name: "late data", frames: [frame({}, "stop", usage), frame({ content: "late" }), "[DONE]"], error: /after finish_reason/ },
    { name: "empty choices", frames: [frame({}, null, null, { choices: [] })], error: /exactly one completion choice/ },
    { name: "choice index", frames: [frame({}, null, null, { choices: [{ index: 1, delta: {} }] })], error: /multiple choices/ },
    { name: "role", frames: [frame({ role: "user" })], error: /non-assistant/ },
    { name: "content array", frames: [frame({ content: [] })], error: /invalid content/ },
    { name: "reasoning object", frames: [frame({ reasoning_content: {} })], error: /invalid reasoning_content/ },
    { name: "escaped lone surrogate", frames: [frame({ reasoning_content: "\ud800" })], error: /unrepresentable Unicode/ },
    { name: "audio", frames: [frame({ audio: { data: "x" } })], error: /unsupported delta field audio/ },
    { name: "images", frames: [frame({ images: [] })], error: /unsupported delta field images/ },
    { name: "refusal output", frames: [frame({ refusal: "blocked" })], error: /unsupported delta field refusal/ },
    { name: "object kind", frames: [frame({}, null, null, { object: "chat.completion" })], error: /wrong completion object/ },
    { name: "response ID change", frames: [frame({ content: "x" }), frame({ content: "y" }, null, null, { id: "changed" })], error: /identity changed/ },
    { name: "model change", frames: [frame({ content: "x" }), frame({ content: "y" }, null, null, { model: "changed" })], error: /identity changed/ },
    { name: "late reasoning", frames: [frame({ content: "text first" }), frame({ reasoning_content: "late reasoning" })], error: /reasoning followed/ },
    { name: "text after tools", frames: [toolFrame(), frame({ content: "late text" })], error: /text followed/ },
    { name: "tool_calls object", frames: [frame({ tool_calls: {} })], error: /tool_calls is not an array/ },
    { name: "tool index gap", frames: [toolFrame(1)], error: /contiguous/ },
    { name: "negative tool index", frames: [toolFrame(-1)], error: /invalid tool index/ },
    { name: "empty call ID", frames: [toolFrame(0, "", "fs_read")], error: /invalid tool id/ },
    { name: "invalid wire name", frames: [toolFrame(0, "A", "bad.name")], error: /invalid wire name/ },
    { name: "duplicate call ID", frames: [toolFrame(), toolFrame(1, "call-A")], error: /duplicate tool ID/ },
    { name: "changed call ID", frames: [toolFrame(), frame({ tool_calls: [{ index: 0, id: "changed", function: { arguments: "}" } }] })], error: /tool identity changed/ },
    { name: "changed function name", frames: [toolFrame(), frame({ tool_calls: [{ index: 0, function: { name: "changed", arguments: "}" } }] })], error: /tool identity changed/ },
    { name: "argument fragment type", frames: [frame({ tool_calls: [{ index: 0, id: "A", type: "function", function: { name: "fs_read", arguments: {} } }] })], error: /invalid function arguments fragment/ },
    { name: "incomplete argument JSON", frames: [toolFrame(), frame({}, "tool_calls", usage), "[DONE]"], error: /malformed JSON/ },
    { name: "argument array", frames: [toolFrame(0, "A", "fs_read", "[]"), frame({}, "tool_calls", usage), "[DONE]"], error: /arguments must be an object/ },
    { name: "argument overflow", frames: [toolFrame(0, "A", "fs_read", '{"x":1e400}'), frame({}, "tool_calls", usage), "[DONE]"], error: /non-finite/ }
  ];
  it.each(malformedStreams)("refuses $name for the intended protocol reason", async ({ frames, error }) => {
    await expect(decoded(frames)).rejects.toThrow(error);
  });
  it("refuses invalid JSON and malformed/incomplete UTF-8 instead of signing replacements", async () => {
    await expect(collect(decodeDeepseek(response("data: {bad\n\n")))).rejects.toThrow(/not JSON/);
    for (const bytes of [Buffer.from([0xff]), Buffer.from([0xe2, 0x82])]) {
      await expect(collect(decodeDeepseek(response(bytes, 1)))).rejects.toThrow(/UTF-8/);
    }
  });
  it("preserves explicit zero usage and empty reasoning without inventing cache fields", async () => {
    const assembler = new BlockAssembler();
    for (const chunk of await decoded([frame({ reasoning_content: "", content: "answer" }),
      frame({}, "stop", { prompt_tokens: 0, completion_tokens: 0 }), "[DONE]"])) assembler.push(chunk);
    const result = assembler.complete();
    expect(surfaceBlocks(result)).toEqual([{ kind: "thinking", text: "" }, { kind: "text", text: "answer" }]);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
  it("retains error usage without completing tools or reading more events", async () => {
    let closed = false;
    const body = (async function* () { try { yield Buffer.from(event(toolFrame()));
      yield Buffer.from(event({ error: { message: "reported failure" }, usage }));
      throw new Error("terminal error must stop reading");
    } finally { closed = true; } })();
    const assembler = new BlockAssembler();
    for await (const chunk of decodeDeepseek({ status: 200, headers: { "content-type": "text/event-stream" }, body })) assembler.push(chunk);
    const result = assembler.complete(); expect(result.finishReason?.kind).toBe("error");
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 4, cacheReadTokens: 5, reasoningTokens: 3 });
    expect(surfaceBlocks(result).some(block => block.kind === "tool_use")).toBe(false); expect(closed).toBe(true);
  });
  it("refuses the wrong response envelope and a future unsupported SSE event", async () => {
    await expect(collect(decodeDeepseek({ ...response(""), status: 400 }))).rejects.toThrow(/shared failure classifier/);
    await expect(collect(decodeDeepseek({ ...response(""), headers: { "content-type": "application/json" } }))).rejects.toThrow(/text\/event-stream/);
    await expect(collect(decodeDeepseek(response(`event: future-output\n${event(frame({ content: "x" }))}`)))).rejects.toThrow(/unsupported named SSE/);
  });
  it("uses exact offered-name binding for unknown and removed function names", async () => {
    const binding = new ProviderToolBinding(bindProviderToolNames([functions[1]!]));
    await expect((async () => { for await (const chunk of decodeDeepseek(response(toolSequence().map(value => event(value)).join("")))) binding.bind(chunk); })()).rejects.toThrow(/unoffered/);
  });
  it.each(["thinking", "tool"])("consumer cancellation closes the body during %s without completing tools", async kind => {
    let closed = false; const assembler = new BlockAssembler();
    const body = (async function* () {
      try { yield Buffer.from(event(frame({ reasoning_content: "partial reasoning" })));
        yield Buffer.from(event(toolFrame()));
        throw new Error("consumer should already have stopped");
      } finally { closed = true; }
    })();
    for await (const chunk of decodeDeepseek({ status: 200, headers: { "content-type": "text/event-stream" }, body })) {
      assembler.push(chunk);
      if (chunk.type === (kind === "thinking" ? "thinking-delta" : "tool-call-delta")) break;
    }
    expect(closed).toBe(true); const result = assembler.abort("fixture-consumer-cancel");
    expect(result.usage).toBeNull(); expect(result.finishReason).toBeNull();
    expect(result.blocks.some(block => block.blockKind === "tool_use" && block.outcome.status === "completed")).toBe(false);
  });
  it("propagates an aborted response body without manufacturing a success", async () => {
    let closed = false; const aborted = Object.assign(new Error("fixture abort"), { name: "AbortError" });
    const body = (async function* () { try { yield Buffer.from(event(frame({ reasoning_content: "partial" }))); throw aborted; } finally { closed = true; } })();
    await expect(collect(decodeDeepseek({ status: 200, headers: { "content-type": "text/event-stream" }, body }))).rejects.toBe(aborted);
    expect(closed).toBe(true);
  });
});

describe("DeepSeek integration boundary (unexecuted)", () => {
  it("transmits exact body/signal with no key lookup or implicit credentials", () => {
    const controller = new AbortController(); controller.abort(); const body = Buffer.from("fixture bytes");
    const result = deepseekEnvelope({ baseUrl: "https://provider.example.invalid", model: "fixture-model", body,
      credential: null, extraHeaders: { "X-Tenant": "fixture" }, signal: controller.signal });
    expect(result.body).toBe(body); expect(result.signal).toBe(controller.signal); expect(result.signal?.aborted).toBe(true);
    expect(result.url).toBe("https://provider.example.invalid/chat/completions");
    expect(result.headers.authorization).toBeUndefined(); expect(result.headers["x-tenant"]).toBe("fixture");
  });
  it.each(["https://user:pass@example.invalid", "https://example.invalid/v1", "https://example.invalid?key=x",
    "https://example.invalid#x", "file:///tmp/no", "not-a-url"])("refuses non-origin address %s", baseUrl => {
    expect(() => deepseekEnvelope({ baseUrl, model: "fixture", body: Buffer.from("{}"), credential: null, extraHeaders: {} })).toThrow();
  });
  it.each(["Authorization", "authorization", "X-API-Key", "content-type", "Accept", "Proxy-Authorization"])("refuses header override %s", key => {
    expect(() => deepseekEnvelope({ baseUrl: "https://example.invalid", model: "fixture", body: Buffer.from("{}"),
      credential: null, extraHeaders: { [key]: "not-a-real-credential" } })).toThrow(/override/);
  });
  it("keeps HTTP classification separate from vendor diagnostics", () => {
    expect(deepseekFailure({ status: 429, headers: { "x-request-id": "fixture-id" }, bodyText: '{"error":{"message":"fixture quota"}}' })).toEqual({ requestId: "fixture-id", message: "fixture quota" });
    expect(deepseekFailure({ status: 500, headers: {}, bodyText: "not JSON" })).toEqual({});
  });
  it("registers exact native support with conditional replay, not optimistic future-version admission", () => {
    const registry = new AdapterRegistry(); registry.register({ providerId: "fixture-deepseek", adapter: deepseekAdapter,
      baseUrl: "https://example.invalid", credentialRef: null, models: ["fixture-model"] });
    const route = registry.pin({ providerId: "fixture-deepseek", model: "fixture-model" });
    expect(route.capabilities).toEqual(DEEPSEEK_CAPABILITIES);
    expect(route.capabilities?.thinking).toBe("full-text-replay-with-tools");
    expect(Object.isFrozen(route.capabilities?.features)).toBe(true);
    expect(() => assertRequiredCapabilities(route.capabilities, ["text-input", "thinking-replay", "tool-replay"])).not.toThrow();
    expect(new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS).get("deepseek-chat", 1)).toBe(deepseekChatEncoder);
    expect(usesProviderToolNames("deepseek-chat", 1)).toBe(true);
    for (const version of [0, 2, 100]) {
      expect(usesProviderToolNames("deepseek-chat", version)).toBe(false);
      expect(new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS).get("deepseek-chat", version)).toBeNull();
    }
    expect(usesProviderToolNames("DeepSeek-chat", 1)).toBe(false);
    expect(new RequestEncoderRegistry([deepseekChatEncoder]).get("deepseek-chat", 1)).toBe(deepseekChatEncoder);
    expect(DEEPSEEK_WIRE_CONTRACT.integration).toBe("native-runtime");
    const replay = request({ tools: functions, messages: [{ role: "assistant", parts: [{ kind: "thinking", text: "Recorded" }, { kind: "text", text: "Answer" }] }] });
    expect(() => assertRequestCapabilities(route.capabilities, replay)).not.toThrow();
    for (const tools of [null, []]) expect(() => assertRequestCapabilities(route.capabilities, { ...replay, tools })).toThrow(/thinking-replay-requires-offered-tools/);
    expect(() => assertRequiredCapabilities(route.capabilities, ["image-input"])).toThrow();
    expect(() => assertRequiredCapabilities(route.capabilities, ["cache-write-usage"])).toThrow();
    expect(() => snapshotCapabilities({ ...DEEPSEEK_CAPABILITIES, thinking: "output-text-only-no-replay" })).toThrow(/consistent-thinking-replay/);
    expect(() => snapshotCapabilities({ ...DEEPSEEK_CAPABILITIES, features: { ...DEEPSEEK_CAPABILITIES.features, "tool-calls": "unsupported" } })).toThrow(/consistent-thinking-replay/);
  });
});
