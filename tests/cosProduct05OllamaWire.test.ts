/** Authored, UNEXECUTED. Scripted bytes only; no Ollama/model/provider calls. */
import { describe, expect, test } from "vitest";
import { AdapterRegistry } from "../src/llm/adapter/adapterRegistry.js";
import { OLLAMA_CAPABILITIES, assertRequestCapabilities } from "../src/llm/adapter/providerCapabilities.js";
import type { HttpResponse } from "../src/llm/adapter/transport.js";
import { StreamGrammar } from "../src/llm/streamProtocol.js";
import type { StreamChunk, ToolUseContentBlock } from "../src/llm/streamChunk.js";
import { ollamaAdapter, decodeOllama, ollamaEnvelope } from "../src/llm/providers/ollamaAdapter.js";
import { ollamaParams } from "../src/llm/providers/ollamaContract.js";
import { createOllamaRoute } from "../src/llm/providers/ollamaRoute.js";
import { parseOllamaJson } from "../src/llm/providers/ollamaJson.js";
import { ollamaUsage } from "../src/llm/providers/ollamaUsage.js";
import { readOllamaCallKey } from "../src/llm/providers/ollamaToolIdentity.js";
import { ollamaChatEncoder } from "../src/llm/request/ollamaChatEncoder.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";

const RAW_ARGS = '{ "path" : "α.txt", "offset" : 1e0, "nested": { "z":2,"a":1 } }';
const model = "p05-fixture-model";
function frame(message: string, done = false, metrics = '"prompt_eval_count":12,"prompt_eval_cached_count":5,"eval_count":4', reason = "stop"): string {
  return `{"model":"${model}","created_at":"2026-09-11T05:00:00.123456789Z","message":${message},"done":${done}${done ? `,"done_reason":${JSON.stringify(reason)},${metrics}` : ""}}`;
}
const last = (metrics?: string, reason?: string) => frame('{"role":"assistant","content":""}', true, metrics, reason);
const nativeCall = (name: string, index?: number, id?: string, args = RAW_ARGS) =>
  `{"function":{${index === undefined ? "" : `"index":${index},`}"name":${JSON.stringify(name)},"arguments":${args}}${id === undefined ? "" : `,"id":${JSON.stringify(id)}`}}`;
const messageCalls = (calls: string[]) => `{"role":"assistant","content":"","tool_calls":[${calls.join(",")}]}`;
function response(records: string[], options: { suffix?: Buffer; chunkSize?: number; onClose?: () => void; contentType?: string } = {}): HttpResponse {
  const bytes = Buffer.concat([Buffer.from(records.join("\r\n") + "\r\n"), options.suffix ?? Buffer.alloc(0)]);
  return { status: 200, headers: { "content-type": options.contentType ?? "application/x-ndjson; charset=utf-8" },
    body: (async function* () {
      const width = options.chunkSize ?? 1;
      for (let offset = 0; offset < bytes.length; offset += width) yield bytes.subarray(offset, offset + width);
    })(), close: async () => { options.onClose?.(); } };
}
async function drain(stream: AsyncIterable<StreamChunk>, seen: StreamChunk[] = []): Promise<StreamChunk[]> {
  for await (const chunk of stream) seen.push(chunk); return seen;
}
function calls(chunks: readonly StreamChunk[]): ToolUseContentBlock[] {
  return chunks.flatMap(chunk => chunk.type === "block-end" && chunk.block.kind === "tool_use" ? [chunk.block] : []);
}
function request(): EncodableRequest {
  return { model, params: { max_tokens: 32 }, system: "Use offered tools.", tools: null,
    messages: [{ role: "user", parts: [{ kind: "text", text: "hello" }] }] };
}

describe("P05 native Ollama wire (unexecuted)", () => {
  test("registers an exact native adapter, default encoder and value-free capability description", () => {
    const registry = new AdapterRegistry(), route = createOllamaRoute({ model }); registry.register(route);
    expect(route).toMatchObject({ providerId: "ollama", credentialRef: null, baseUrl: "http://127.0.0.1:11434", models: [model] });
    expect(registry.pin({ providerId: "ollama", model }).adapter).toBe(ollamaAdapter);
    expect(registry.describe()[0]).toMatchObject({ adapterId: "ollama-chat", adapterVersion: 1,
      capabilities: { protocol: "ollama-chat", modelSupport: "not-probed", toolReplay: "native-call-key-and-ordered-results",
        features: { "image-input": "supported", "audio-input": "unsupported", "cache-write-usage": "unsupported" } } });
    expect(JSON.stringify(registry.describe())).not.toContain("11434");
    expect(new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS).get("ollama-chat", 1)).toBe(ollamaChatEncoder);
    expect(usesProviderToolNames("ollama-chat", 1)).toBe(true);
    expect(usesProviderToolNames("ollama-chat", 2)).toBe(false);
  });
  test("transmits the exact prepared Buffer to /api/chat with cancellation and no redirect", () => {
    const body = ollamaChatEncoder.encode(request()), controller = new AbortController();
    const wire = ollamaEnvelope({ model, baseUrl: "http://localhost:11434", body, credential: null,
      extraHeaders: { "x-p05-trace": "unit-fixture" }, signal: controller.signal });
    expect(wire).toMatchObject({ url: "http://localhost:11434/api/chat", method: "POST", redirect: "error", cancelBodyOnReturn: true,
      headers: { "content-type": "application/json", accept: "application/x-ndjson" } });
    expect(wire.body).toBe(body); expect(wire.signal).toBe(controller.signal);
    expect(wire.headers.authorization).toBeUndefined();
    expect(JSON.parse(body.toString())).toMatchObject({ options: { num_predict: 32 }, stream: true });
    expect(JSON.parse(body.toString()).max_tokens).toBeUndefined();
  });
  test.each(["http://localhost:11434/v1", "http://user:pass@localhost:11434", "http://localhost:11434?secret=x", "file:///tmp/ollama"])("refuses non-native origin %s without dispatch", baseUrl => {
    expect(() => createOllamaRoute({ model, baseUrl })).toThrow();
  });
  test.each(["Authorization", "Host", "Content-Length", "cookie", "Transfer-Encoding", "Proxy-Authorization"])("refuses owned header override %s", header => {
    expect(() => ollamaEnvelope({ model, baseUrl: "http://localhost:11434", body: Buffer.from("{}"), credential: null,
      extraHeaders: { [header]: "untrusted" } })).toThrow();
  });
  test("native options are reproducible; unsupported aliases, lossy values and conflicting budgets refuse", () => {
    expect(ollamaParams({ options: { num_predict: 64, temperature: 0, seed: 0 }, think: "max" }))
      .toEqual({ options: { num_predict: 64, temperature: 0, seed: 0 }, think: "max", stream: true });
    for (const params of [{}, { max_tokens: 0 }, { max_tokens: 8, options: { num_predict: 9 } },
      { max_tokens: 8, stream: false }, { max_tokens: 8, temperature: 0.1 }, { max_tokens: 8, options: { num_gpu: 8 } },
      { max_tokens: 8, options: { top_p: 1.1 } }, { max_tokens: 8, options: { temperature: NaN } },
      { max_tokens: 8, think: "enabled" }, { max_tokens: 8, tool_choice: "required" }, { max_tokens: 8, format: null }]) {
      expect(() => ollamaParams(params)).toThrow();
    }
    let touched = false;
    expect(() => ollamaParams(Object.defineProperty({}, "max_tokens", { enumerable: true, get() { touched = true; return 8; } }))).toThrow();
    expect(touched).toBe(false);
  });
  test("byte-split thinking/content/tool stream retains raw object arguments and disjoint reported usage", async () => {
    const chunks = await drain(decodeOllama(response([
      frame('{"role":"assistant","thinking":"Reason α"}'), frame('{"role":"assistant","content":"Read now."}'),
      frame(messageCalls([nativeCall("read", 0, "native-id")])), last()
    ])));
    const grammar = new StreamGrammar(); for (const chunk of chunks) grammar.observe(chunk);
    expect(calls(chunks)).toHaveLength(1);
    expect(calls(chunks)[0]!.arguments).toBe(RAW_ARGS);
    expect(readOllamaCallKey(calls(chunks)[0]!.id)).toMatchObject({ ordinal: 0, wireId: "native-id", wireIndex: 0, wireType: null });
    expect(chunks.find(chunk => chunk.type === "usage")).toEqual({ type: "usage", usage: { inputTokens: 7, cacheReadTokens: 5, outputTokens: 4 } });
    expect(chunks.at(-1)).toEqual({ type: "finish", reason: { kind: "tool_calls" } });
  });
  test("ID-less repeated function calls get distinct labelled keys, replay exact args and ordered name-bound results", async () => {
    const blocks = calls(await drain(decodeOllama(response([frame(messageCalls([nativeCall("read"), nativeCall("read")])), last()]))));
    expect(blocks).toHaveLength(2); expect(blocks[0]!.id).not.toBe(blocks[1]!.id);
    for (const block of blocks) expect(readOllamaCallKey(block.id).wireId).toBeNull();
    const base = request();
    const replay: EncodableRequest = { ...base, messages: [...base.messages,
      { role: "assistant", parts: blocks.map(block => ({ kind: "tool_use", toolCallId: block.id, toolName: block.name, argumentsJson: block.arguments })) },
      { role: "tool", parts: blocks.map((block, index) => ({ kind: "tool_result", toolCallId: block.id, isError: index === 1, text: index ? "failed" : "ok" })) }] };
    const body = ollamaChatEncoder.encode(replay).toString(), decoded = JSON.parse(body);
    expect(body.split(RAW_ARGS)).toHaveLength(3);
    expect(decoded.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => JSON.parse(message.content).isError)).toEqual([false, true]);
    expect(body).not.toContain("amc-ollama-call-v1:"); expect(body).not.toContain("tool_call_id");
    const tools = replay.messages.at(-1)!;
    expect(() => ollamaChatEncoder.encode({ ...replay, messages: [...replay.messages.slice(0, -1), { ...tools, parts: [...tools.parts].reverse() }] })).toThrow(/order/);
  });
  test("optional native call ID/index/type survive replay without emitting the local join key", async () => {
    const raw = nativeCall("read", 0, "provider-007").replace('{"function"', '{"type":"function","function"');
    const block = calls(await drain(decodeOllama(response([frame(messageCalls([raw])), last()]))))[0]!;
    const base = request(), body = ollamaChatEncoder.encode({ ...base, messages: [...base.messages,
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: block.id, toolName: "read", argumentsJson: block.arguments }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: block.id, isError: false, text: "native result" }] }] }).toString();
    const messages = JSON.parse(body).messages;
    expect(messages.find((message: { role: string }) => message.role === "assistant").tool_calls[0]).toMatchObject({ id: "provider-007", type: "function", function: { index: 0 } });
    expect(messages.at(-1)).toMatchObject({ tool_call_id: "provider-007", tool_name: "read" });
    expect(body).not.toContain(block.id);
  });
  test("tools remain open after final usage until transport EOF; early consumer return closes response", async () => {
    let eof = false, closed = false;
    const res: HttpResponse = { status: 200, headers: { "content-type": "application/x-ndjson" }, body: (async function* () {
      yield Buffer.from(frame(messageCalls([nativeCall("read", 0)])) + "\n" + last() + "\n"); eof = true;
    })(), close: async () => { closed = true; } };
    const iterator = decodeOllama(res)[Symbol.asyncIterator](), seen: StreamChunk[] = [];
    while (!seen.some(chunk => chunk.type === "usage")) { const next = await iterator.next(); if (next.done) throw new Error("usage missing"); seen.push(next.value); }
    expect(eof).toBe(false); expect(calls(seen)).toEqual([]);
    await iterator.return?.(); expect(closed).toBe(true); expect(calls(seen)).toEqual([]);
  });
  test.each([
    ["missing terminal", [frame(messageCalls([nativeCall("read", 0)]))]],
    ["malformed sibling", [frame(messageCalls([nativeCall("read", 0), nativeCall("other", 1, undefined, "[]")])), last()]],
    ["duplicate native ID", [frame(messageCalls([nativeCall("read", 0, "dup"), nativeCall("read", 1, "dup")])), last()]],
    ["duplicate index", [frame(messageCalls([nativeCall("read", 0), nativeCall("read", 0)])), last()]],
    ["trailing record", [frame(messageCalls([nativeCall("read", 0)])), last(), frame('{"role":"assistant","content":"late"}')]],
    ["duplicate done", [frame(messageCalls([nativeCall("read", 0)])), last(), last()]],
    ["truncated call", [frame(messageCalls([nativeCall("read", 0)])), last(undefined, "length")]],
    ["missing usage", [frame(messageCalls([nativeCall("read", 0)])), last('"eval_count":4')]],
    ["invalid cache", [frame(messageCalls([nativeCall("read", 0)])), last('"prompt_eval_count":4,"eval_count":4,"prompt_eval_cached_count":5')]],
    ["in-band error", [frame(messageCalls([nativeCall("read", 0)])), '{"error":"scripted provider failure"}']],
    ["duplicate JSON keys", [frame(messageCalls([nativeCall("read", 0, undefined, '{"x":1,"x":2}')])), last()]],
    ["unsupported output", [frame('{"role":"assistant","content":"x","images":["AAAA"]}'), last()]]
  ] as const)("%s never publishes a closed tool", async (_name, rows) => {
    const seen: StreamChunk[] = []; let closed = false;
    await expect(drain(decodeOllama(response([...rows], { onClose: () => { closed = true; } })), seen)).rejects.toBeDefined();
    expect(calls(seen)).toEqual([]); expect(closed).toBe(true);
  });
  test("trailing invalid UTF-8 cannot disappear after a valid terminal response", async () => {
    const seen: StreamChunk[] = [];
    await expect(drain(decodeOllama(response([frame(messageCalls([nativeCall("read", 0)])), last()], { suffix: Buffer.from([0xff]) })), seen)).rejects.toBeDefined();
    expect(calls(seen)).toEqual([]);
  });
  test.each(["\uFEFF", "\u2028", "{\"unfinished\":"])("trailing non-JSON bytes are not treated as ignorable whitespace (%s)", async suffix => {
    const seen: StreamChunk[] = [];
    await expect(drain(decodeOllama(response([frame(messageCalls([nativeCall("read", 0)])), last()], { suffix: Buffer.from(suffix) })), seen)).rejects.toBeDefined();
    expect(calls(seen)).toEqual([]);
  });
  test("non-streaming JSON and compatibility SSE are not accepted as native NDJSON", async () => {
    for (const contentType of ["application/json", "text/event-stream"]) {
      await expect(drain(decodeOllama(response([frame('{"role":"assistant","content":"x"}'), last()], { contentType })))).rejects.toThrow(/ndjson/);
    }
  });
  test("unknown cache is absent, explicit zero is retained, durations do not become counts", () => {
    expect(ollamaUsage({ prompt_eval_count: 12, eval_count: 4, load_duration: 123 })).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(ollamaUsage({ prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: 0 })).toEqual({ inputTokens: 12, outputTokens: 4, cacheReadTokens: 0 });
    for (const value of [null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => ollamaUsage({ prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: value })).toThrow();
    expect(() => ollamaUsage({ prompt_eval_count: 12 })).toThrow();
    expect(() => parseOllamaJson('{"tokens":9007199254740993}')).toThrow();
  });
  test("model capability requirements are declarations, while native thinking is replayable without offered tools", () => {
    const base = request(), replay: EncodableRequest = { ...base, messages: [...base.messages,
      { role: "assistant", parts: [{ kind: "thinking", text: "preserve" }, { kind: "text", text: "answer" }] },
      { role: "user", parts: [{ kind: "text", text: "continue" }] }] };
    expect(() => assertRequestCapabilities(OLLAMA_CAPABILITIES, replay)).not.toThrow();
    expect(JSON.parse(ollamaChatEncoder.encode(replay).toString()).messages[2].thinking).toBe("preserve");
    expect(providerToolWireName("fs.read")).not.toBe(providerToolWireName("fs_read"));
  });
});
