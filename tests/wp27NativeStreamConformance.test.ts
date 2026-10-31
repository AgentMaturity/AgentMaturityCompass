import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { LLM_FAILURE_CODE } from "../dist/llm/llmFailure.js";
import { BlockAssembler, surfaceBlocks } from "../dist/llm/blockAssembler.js";
import { sseEvents } from "../dist/llm/adapter/sse.js";
import { openaiAdapter } from "../dist/llm/providers/openaiAdapter.js";
import { openaiResponsesAdapter } from "../dist/llm/providers/openaiResponsesAdapter.js";
import { anthropicAdapter } from "../dist/llm/providers/anthropicAdapter.js";
import { deepseekAdapter } from "../dist/llm/providers/deepseekAdapter.js";
import { geminiAdapter } from "../dist/llm/providers/geminiAdapter.js";
import { geminiAudioAdapter } from "../dist/llm/providers/geminiAudioAdapter.js";
import { ollamaAdapter } from "../dist/llm/providers/ollamaAdapter.js";
import { gatewayAdapter } from "../dist/llm/providers/gatewayAdapter.js";
import { readOllamaCallKey, OLLAMA_CALL_KEY_PREFIX } from "../dist/llm/providers/ollamaToolIdentity.js";
import { RequestEncoderRegistry } from "../dist/llm/request/requestEncoder.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../dist/llm/request/builtInEncoders.js";
import type { LlmAdapter } from "../dist/llm/adapter/adapterTypes.js";
import type { HttpResponse } from "../dist/llm/adapter/transport.js";
import type { StreamChunk, StreamTokenUsage } from "../dist/llm/streamChunk.js";
import type { EncodablePart, EncodableRequest } from "../dist/llm/request/requestSpec.js";

interface Frame { data: unknown; event?: string }
interface Fixture {
  key: string; adapterId: string; adapterVersion: number; encoderId: string; encoderVersion: number;
  model: string; modelSupport: string; frames: Frame[]; errorFrames: Frame[]; terminalFrames: number;
  expectedUsage: StreamTokenUsage; expectedTools: { name: string; arguments: string }[];
}
const corpus = JSON.parse(readFileSync(new URL("./fixtures/wp27-native-streams-v1.json", import.meta.url), "utf8")) as {
  version: number; captured: boolean; cases: Fixture[];
};
const adapters: Record<string, LlmAdapter> = {
  "openai-chat": openaiAdapter, anthropic: anthropicAdapter, deepseek: deepseekAdapter,
  "openai-responses": openaiResponsesAdapter, "gemini-v1": geminiAdapter,
  "gemini-v2": geminiAudioAdapter, ollama: ollamaAdapter
};
const encoders = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
function wire(fixture: Fixture, frames = fixture.frames, newline = "\r\n"): Buffer {
  return Buffer.from(frames.map(frame => {
    const data = typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data);
    return fixture.key === "ollama" ? data + newline
      : (frame.event ? `event: ${frame.event}${newline}` : "") + `data: ${data}${newline}${newline}`;
  }).join(""));
}
function response(fixture: Fixture, bytes: Buffer, cut?: number): HttpResponse {
  return { status: 200, headers: { "content-type": fixture.key === "ollama" ? "application/x-ndjson" : "text/event-stream" },
    body: (async function* () {
      if (cut === undefined) yield bytes;
      else if (cut === -1) { for (const byte of bytes) yield Uint8Array.of(byte); }
      else { yield bytes.subarray(0, cut); yield bytes.subarray(cut); }
    })() };
}
async function decode(fixture: Fixture, bytes: Buffer, cut?: number, adapter = adapters[fixture.key]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.decode(response(fixture, bytes, cut))) chunks.push(chunk);
  return chunks;
}
function normalized(chunks: StreamChunk[]): string {
  // Ollama's local join UUID is intentionally fresh; its reported identity and
  // ordinal, plus every other normalized byte, must remain invariant.
  return JSON.stringify(chunks, (_key, value: unknown) => {
    if (typeof value !== "string" || !value.startsWith(OLLAMA_CALL_KEY_PREFIX)) return value;
    const { stream: _stream, ...identity } = readOllamaCallKey(value);
    return identity;
  });
}
function assemble(chunks: StreamChunk[]) {
  const assembler = new BlockAssembler();
  for (const chunk of chunks) assembler.push(chunk);
  return assembler.complete();
}
function replay(fixture: Fixture, chunks: StreamChunk[]): Buffer {
  const blocks = surfaceBlocks(assemble(chunks));
  const parts: EncodablePart[] = blocks.map(block => {
    const gemini = "gemini" in block && block.gemini ? { gemini: { ...block.gemini, headerEventId: "fixture-original-header" } } : {};
    if (block.kind === "tool_use") return { kind: "tool_use", toolCallId: block.id, toolName: block.name, argumentsJson: block.arguments, ...gemini };
    if (block.kind === "text" || block.kind === "thinking") return { kind: block.kind, text: block.text, ...gemini };
    throw new Error("fixture emitted unsupported block");
  });
  const calls = blocks.filter(block => block.kind === "tool_use");
  const params = fixture.key.startsWith("gemini") ? { generationConfig: { maxOutputTokens: 64 } }
    : fixture.key === "openai-responses" ? { max_output_tokens: 64 } : { max_tokens: 64, ...(fixture.key === "anthropic" ? { stream: true } : fixture.key === "deepseek" ? { thinking: { type: "disabled" } } : {}) };
  const request: EncodableRequest = { model: fixture.model, params, system: null,
    tools: fixture.expectedTools.map(tool => ({ name: tool.name, description: "Fixture tool", parameters: { type: "object", properties: {} } })),
    messages: [{ role: "user", parts: [{ kind: "text", text: "Fixture input" }] }, { role: "assistant", parts },
      ...calls.map(call => ({ role: "tool" as const, parts: [{ kind: "tool_result" as const, toolCallId: call.id, isError: false, text: "fixture result" }] }))] };
  const encoder = encoders.get(fixture.encoderId, fixture.encoderVersion);
  if (!encoder) throw new Error("missing fixture encoder pin");
  return encoder.encode(request);
}

describe("WP27 native protocol fixtures (synthetic, remote models not probed)", () => {
  test("the corpus pins every native HTTP decoder and encoder version", () => {
    expect(corpus.version).toBe(1); expect(corpus.captured).toBe(false);
    expect(corpus.cases.map(fixture => fixture.key).sort()).toEqual(Object.keys(adapters).sort());
    for (const fixture of corpus.cases) {
      const adapter = adapters[fixture.key];
      expect([adapter.id, adapter.version, adapter.encoderId, adapter.encoderVersion])
        .toEqual([fixture.adapterId, fixture.adapterVersion, fixture.encoderId, fixture.encoderVersion]);
      expect(fixture.modelSupport).toBe("not-probed");
    }
  });
  for (const fixture of corpus.cases) {
    test(`${fixture.key}: every two-chunk byte cut preserves chunks, usage, tools and replay bytes`, async () => {
      const bytes = wire(fixture), baseline = await decode(fixture, bytes);
      const assembly = assemble(baseline);
      expect(assembly.finishReason).toEqual({ kind: "tool_calls" });
      expect(assembly.usage).toEqual(fixture.expectedUsage);
      expect(surfaceBlocks(assembly).flatMap(block => block.kind === "tool_use" ? [{ name: block.name, arguments: block.arguments }] : []))
        .toEqual(fixture.expectedTools);
      const expected = normalized(baseline);
      for (let cut = 1; cut < bytes.length; cut++) {
        expect(normalized(await decode(fixture, bytes, cut)), `byte cut ${cut}/${bytes.length}`).toBe(expected);
      }
      const oneByte = await decode(fixture, bytes, -1);
      expect(normalized(oneByte)).toBe(expected);
      expect(replay(fixture, oneByte)).toEqual(replay(fixture, baseline));
      const gateway = gatewayAdapter({ inner: adapters[fixture.key], prefix: "/fixture", agentId: "fixture-agent" });
      expect(normalized(await decode(fixture, bytes, -1, gateway))).toBe(expected);
    });
    test(`${fixture.key}: truncation retains partial tools without replay or executable authority`, async () => {
      const bytes = wire(fixture, fixture.frames.slice(0, -fixture.terminalFrames));
      const assembler = new BlockAssembler();
      await expect((async () => {
        for await (const chunk of adapters[fixture.key].decode(response(fixture, bytes, -1))) assembler.push(chunk);
      })()).rejects.toBeDefined();
      const assembly = assembler.abort("fixture_truncated");
      expect(assembly.blocks.filter(block => block.blockKind === "tool_use")).toHaveLength(2);
      expect(surfaceBlocks(assembly).some(block => block.kind === "tool_use")).toBe(false);
    });
    test(`${fixture.key}: in-band errors cannot complete the pending tool calls`, async () => {
      const frames = [...fixture.frames.slice(0, -fixture.terminalFrames), ...fixture.errorFrames];
      const assembler = new BlockAssembler();
      let thrown: unknown;
      try { for await (const chunk of adapters[fixture.key].decode(response(fixture, wire(fixture, frames), -1))) assembler.push(chunk); }
      catch (error) { thrown = error; }
      const assembly = thrown ? assembler.abort("fixture_in_band_error") : assembler.complete();
      if (thrown) expect(thrown).toMatchObject({ code: LLM_FAILURE_CODE.SERVER });
      else expect(assembly.finishReason).toMatchObject({ kind: "error", failure: { code: LLM_FAILURE_CODE.SERVER } });
      expect(surfaceBlocks(assembly).some(block => block.kind === "tool_use")).toBe(false);
    });
    test(`${fixture.key}: malformed UTF-8 refuses before publishing replacement text`, async () => {
      const bytes = wire(fixture, fixture.frames, "\n"), at = bytes.indexOf(Buffer.from("α"));
      expect(at).toBeGreaterThan(0);
      bytes[at] = 0xff;
      await expect(decode(fixture, bytes, -1)).rejects.toBeDefined();
    });
  }
  for (const key of ["openai-chat", "anthropic"]) {
    test.each(["eof", "transport-error"])(`${key}: known terminal usage survives missing terminal marker (%s)`, async ending => {
      const fixture = corpus.cases.find(value => value.key === key)!;
      const bytes = wire(fixture, fixture.frames.slice(0, -1), "\n");
      const assembler = new BlockAssembler();
      const input = { ...response(fixture, bytes), body: (async function* () { yield bytes; if (ending === "transport-error") throw new Error("fixture socket drop"); })() };
      await expect((async () => { for await (const chunk of adapters[key].decode(input)) assembler.push(chunk); })()).rejects.toBeDefined();
      expect(assembler.abort("missing_terminal_marker").usage).toEqual(fixture.expectedUsage);
    });
  }
  for (const key of ["openai-chat"]) {
    test(`${key}: terminal usage is visible before reading beyond its frame`, async () => {
      const fixture = corpus.cases.find(value => value.key === key)!;
      let advanced = false, observed = false;
      const input = { ...response(fixture, Buffer.alloc(0)), body: (async function* () {
        yield wire(fixture, fixture.frames.slice(0, -1), "\n");
        advanced = true; throw new Error("fixture socket drop after usage");
      })() };
      for await (const chunk of adapters[key].decode(input)) {
        if (chunk.type === "usage") { observed = true; break; }
      }
      expect(observed).toBe(true); expect(advanced).toBe(false);
    });
  }
  test("OpenAI refuses repeated final usage instead of overwriting measured counts", async () => {
    const fixture = corpus.cases.find(value => value.key === "openai-chat")!;
    const frames = [...fixture.frames.slice(0, -1), fixture.frames.at(-2)!, fixture.frames.at(-1)!];
    await expect(decode(fixture, wire(fixture, frames, "\n"))).rejects.toThrow(/repeated usage/);
  });
  // Official protocol: one or more cumulative message_delta events precede
  // message_stop. stop_reason does not freeze later usage updates.
  // https://platform.claude.com/docs/en/build-with-claude/streaming
  // https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/lib/MessageStream.ts
  test.each(["before-stop-reason", "after-stop-reason"])("Anthropic accumulates all cumulative output updates (%s)", async phase => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [...fixture.frames.slice(0, -3),
      ...[2, 4, 6].map((output, index) => ({ data: { type: "message_delta",
        delta: (phase === "before-stop-reason" ? index === 2 : index === 0) ? { stop_reason: "tool_use" } : {},
        usage: { output_tokens: output } } })), fixture.frames.at(-1)!];
    const chunks = await decode(fixture, wire(fixture, frames), -1);
    expect(chunks.filter(chunk => chunk.type === "usage")).toEqual([
      { type: "usage", usage: { ...fixture.expectedUsage, outputTokens: 6 } }
    ]);
    expect(assemble(chunks).finishReason).toEqual({ kind: "tool_calls" });
    expect(chunks.slice(-2).map(chunk => chunk.type)).toEqual(["usage", "finish"]);
  });
  test.each(["eof", "transport-error", "in-band-error"])("Anthropic retains the latest cumulative counts on failure (%s)", async ending => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [...fixture.frames.slice(0, -3),
      ...[2, 4, 6].map(output => ({ data: { type: "message_delta", delta: {}, usage: { output_tokens: output } } }))];
    if (ending === "in-band-error") frames.push(...fixture.errorFrames);
    const bytes = wire(fixture, frames), assembler = new BlockAssembler();
    const input = { ...response(fixture, bytes), body: (async function* () { yield bytes; if (ending === "transport-error") throw new Error("fixture cumulative socket drop"); })() };
    let failed = false;
    try { for await (const chunk of anthropicAdapter.decode(input)) assembler.push(chunk); } catch { failed = true; }
    const assembly = failed ? assembler.abort("fixture_cumulative_failure") : assembler.complete();
    expect(assembly.usage).toEqual({ ...fixture.expectedUsage, outputTokens: 6 });
    if (!failed) expect(assembly.finishReason?.kind).toBe("error");
  });
  test("Anthropic replaces reported cumulative input and cache totals without adding them", async () => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [...fixture.frames.slice(0, -3), { data: { type: "message_delta", delta: { stop_reason: "tool_use" },
      usage: { input_tokens: 10, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 } } }, fixture.frames.at(-1)!];
    const chunks = await decode(fixture, wire(fixture, frames), -1);
    expect(assemble(chunks).usage).toEqual({ inputTokens: 10, outputTokens: 6, cacheReadTokens: 7, cacheWriteTokens: 3 });
  });
  test("Anthropic nullable cumulative input and cache fields preserve prior reported counts", async () => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [...fixture.frames.slice(0, -3), { data: { type: "message_delta", delta: { stop_reason: "tool_use" },
      usage: { input_tokens: null, output_tokens: 6, cache_read_input_tokens: null, cache_creation_input_tokens: null } } }, fixture.frames.at(-1)!];
    const chunks = await decode(fixture, wire(fixture, frames), -1);
    expect(assemble(chunks).usage).toEqual({ ...fixture.expectedUsage, outputTokens: 6 });
  });
  test.each(["eof", "transport-error", "in-band-error"])("Anthropic retains an explicitly reported prefix lower bound only on failure (%s)", async ending => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [{ data: { type: "message_start", message: { usage: { input_tokens: 7, cache_read_input_tokens: 5, output_tokens: 0 } } } }];
    if (ending === "in-band-error") frames.push(...fixture.errorFrames);
    const bytes = wire(fixture, frames, "\n"), assembler = new BlockAssembler();
    const input = { ...response(fixture, bytes), body: (async function* () { yield bytes; if (ending === "transport-error") throw new Error("fixture socket drop"); })() };
    let failed = false;
    try { for await (const chunk of anthropicAdapter.decode(input)) assembler.push(chunk); } catch { failed = true; }
    const assembly = failed ? assembler.abort("fixture_prefix_failure") : assembler.complete();
    expect(assembly.usage).toEqual({ inputTokens: 7, outputTokens: 0, cacheReadTokens: 5 });
    if (!failed) expect(assembly.finishReason?.kind).toBe("error");
  });
  test("Anthropic prefix output cannot admit successful completion without terminal output usage", async () => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const frames: Frame[] = [
      { data: { type: "message_start", message: { usage: { input_tokens: 7, output_tokens: 0 } } } },
      { data: { type: "message_delta", delta: { stop_reason: "end_turn" } } },
      { data: { type: "message_stop" } }
    ];
    const assembler = new BlockAssembler();
    await expect((async () => { for await (const chunk of anthropicAdapter.decode(response(fixture, wire(fixture, frames, "\n")))) assembler.push(chunk); })())
      .rejects.toMatchObject({ code: "AMC_LLM_STREAM_USAGE_MISSING" });
  });
  test("Anthropic never invents an absent prefix output count", async () => {
    const fixture = corpus.cases.find(value => value.key === "anthropic")!;
    const assembler = new BlockAssembler();
    await expect((async () => { for await (const chunk of anthropicAdapter.decode(response(fixture, wire(fixture, fixture.frames.slice(0, 1), "\n")))) assembler.push(chunk); })()).rejects.toBeDefined();
    expect(assembler.abort("fixture_missing_output_usage").usage).toBeNull();
  });
  test("DeepSeek refuses Chat-shaped standalone usage instead of treating it as native final usage", async () => {
    const fixture = corpus.cases.find(value => value.key === "deepseek")!;
    const frames = [...fixture.frames.slice(0, -2), { data: { id: "fixture-response", model: "fixture-model", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } } }, { data: "[DONE]" }];
    await expect(decode(fixture, wire(fixture, frames), -1)).rejects.toThrow(/exactly one completion choice/);
  });
});

describe("shared SSE byte framing", () => {
  test.each(["\n", "\r\n", "\r"])("every byte cut preserves comments, multiline data, empty data and %j delimiters", async newline => {
    const bytes = Buffer.from(`: keepalive${newline}event: message${newline}data: α🙂${newline}data: tail${newline}${newline}data:${newline}${newline}`);
    const read = async (cut: number) => {
      const out = [];
      for await (const event of sseEvents((async function* () { yield bytes.subarray(0, cut); yield bytes.subarray(cut); })())) out.push(event);
      return out;
    };
    for (let cut = 0; cut <= bytes.length; cut++) expect(await read(cut), `byte cut ${cut}`).toEqual([
      { event: "message", data: "α🙂\ntail" }, { event: null, data: "" }
    ]);
  });
  test.each([Buffer.from([0xff]), Buffer.from([0xe2, 0x82])])("malformed or incomplete UTF-8 is not silently replaced: %j", async bytes => {
    await expect((async () => { for await (const _event of sseEvents((async function* () { yield bytes; })())) { /* drain */ } })()).rejects.toBeDefined();
  });
});
