/** AUTHORED UNEXECUTED. Exact native contract and hostile-wire regressions. */
import { describe, expect, test } from "vitest";
import { geminiAdapter, decodeGemini } from "../src/llm/providers/geminiAdapter.js";
import type { AdapterEnvelopeInput } from "../src/llm/adapter/adapterTypes.js";
import { geminiContentEncoder } from "../src/llm/request/geminiContentEncoder.js";
import { geminiContentEncoderV2 } from "../src/llm/request/geminiContentEncoderV2.js";
import { geminiParams } from "../src/llm/providers/geminiContract.js";
import { geminiUsage } from "../src/llm/providers/geminiUsage.js";
import { parseGeminiJson } from "../src/llm/providers/geminiJson.js";
import { geminiCallKey, readGeminiPart } from "../src/session/geminiPartMeta.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import { assertRequestCapabilities, GEMINI_CAPABILITIES, OPENAI_CHAT_CAPABILITIES, snapshotCapabilities } from "../src/llm/adapter/providerCapabilities.js";
import { acpSupportsImageInput } from "../src/acp/acpPromptInput.js";
import { acpRouteFor } from "../src/acp/acpStdioMain.js";
import { paramsFor } from "../src/cli-agent-options.js";
import { providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import { sha256Hex } from "../src/utils/hash.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";
import { geminiFrame, geminiResponse, geminiCallPart, GEMINI_RAW_ARGS, GEMINI_USAGE } from "./fixtures/nativeGeminiStream.js";

const base = (): EncodableRequest => ({ model: "fixture-model", system: null, tools: null,
  params: { generationConfig: { maxOutputTokens: 64 } }, messages: [{ role: "user", parts: [{ kind: "text", text: "hi" }] }] });
const decode = async (frames: string[], suffix = "", seen: StreamChunk[] = []) => {
  for await (const chunk of decodeGemini(geminiResponse(frames, suffix))) seen.push(chunk);
  return seen;
};
describe("Gemini GenerateContent@1 native wire (unexecuted)", () => {
  test("actual cold registry, exact public route and historical identities", () => {
    const registry = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
    expect(registry.get("gemini-generate-content", 1)).toBe(geminiContentEncoder);
    expect(registry.get("gemini-generate-content", 2)).toBe(geminiContentEncoderV2);
    expect(registry.get("gemini-generate-content", 3)).toBeNull();
    for (const [id, versions] of [["openai-chat", [1, 2, 3, 4]], ["openai-responses", [1, 2, 3]], ["anthropic-messages", [1, 2, 3, 4]], ["deepseek-chat", [1]]] as const) {
      for (const version of versions) expect(registry.get(id, version)).not.toBeNull();
    }
    expect(acpRouteFor({ workspace: "/disposable-fixture", agentId: "default", systemPrompt: "fixture", providerId: "gemini", model: "fixture-model" })).toMatchObject({ adapter: geminiAdapter,
      baseUrl: "https://generativelanguage.googleapis.com", credentialRef: "GEMINI_API_KEY" });
    expect(paramsFor("gemini", 64)).toEqual(base().params);
    expect(snapshotCapabilities(GEMINI_CAPABILITIES)).toMatchObject({ modelSupport: "not-probed", usage: "reported-required",
      thinking: "signed-parts-replay", features: { "audio-input": "unsupported", "video-input": "unsupported", "image-output": "unsupported", "prompt-cache-control": "unsupported" } });
    const route = { encoderId: geminiAdapter.encoderId, encoderVersion: 1, capabilities: GEMINI_CAPABILITIES };
    // gemini-generate-content@2 (native audio) still admits ordered image input; the boundary is the unregistered version 3.
    expect(acpSupportsImageInput(route)).toBe(true); expect(acpSupportsImageInput({ ...route, encoderVersion: 2 })).toBe(true);
    expect(acpSupportsImageInput({ ...route, encoderVersion: 3 })).toBe(false);
    expect(usesProviderToolNames("gemini-generate-content", 1)).toBe(true);
  });
  test("body has native ordered contents, no Chat model/messages/stream fields, nullable system and exact schema", () => {
    const request = base(), bytes = Buffer.from(IMAGE_PNG_BASE64, "base64");
    const value = { ...request, tools: [{ name: "fs.read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } }],
      messages: [{ role: "user" as const, parts: [{ kind: "text" as const, text: "before" }, { kind: "image" as const, bytes,
        mediaType: "image/png", sha256: sha256Hex(bytes) }, { kind: "text" as const, text: "after" }] }] };
    const encoded = geminiContentEncoder.encode(value), body = JSON.parse(encoded.toString());
    expect(body).toEqual({ generationConfig: { maxOutputTokens: 64 }, contents: [{ role: "user", parts: [
      { text: "before" }, { inlineData: { mimeType: "image/png", data: IMAGE_PNG_BASE64 } }, { text: "after" }] }],
      tools: [{ functionDeclarations: [{ name: providerToolWireName("fs.read"), description: "Read", parametersJsonSchema: value.tools[0]!.parameters }] }] });
    expect(geminiContentEncoder.encode(value)).toEqual(encoded);
    expect(() => geminiContentEncoder.encode({ ...value, messages: [{ role: "user", parts: [{ kind: "image", bytes,
      mediaType: "image/png", sha256: "0".repeat(64) }] }] })).toThrow(/digest/);
  });
  test("raw arguments, thought/signature-only parts and optional IDs survive exact replay", async () => {
    const wire = providerToolWireName("fs.read"), callPart = geminiCallPart(wire);
    const parts = ['{"text":"reason α","thought":true,"thoughtSignature":"YQ=="}', callPart, '{"thoughtSignature":"Yg=="}'];
    const chunks = await decode([geminiFrame(parts)]);
    const blocks = chunks.flatMap(chunk => chunk.type === "block-end" ? [chunk.block] : []);
    expect(blocks.map(block => block.kind)).toEqual(["thinking", "tool_use", "thinking"]);
    const call = blocks[1]!; if (call.kind !== "tool_use") throw new Error("missing call");
    expect(call.arguments).toBe(GEMINI_RAW_ARGS); expect(call.id).toMatch(/^amc-gemini-local-/);
    const request: EncodableRequest = { ...base(), messages: [...base().messages,
      { role: "assistant", parts: blocks.map(block => {
        if (block.kind === "tool_use") return { kind: block.kind, toolName: "fs.read", toolCallId: block.id,
          argumentsJson: block.arguments, gemini: { ...block.gemini!, headerEventId: "original-header" } };
        if (block.kind !== "text" && block.kind !== "thinking") throw new Error("unexpected block");
        return { kind: block.kind, text: block.text, gemini: { ...block.gemini!, headerEventId: "original-header" } };
      }) }, { role: "tool", parts: [{ kind: "tool_result", toolCallId: call.id, isError: true, text: '{"isError":false}' }] }] };
    const raw = geminiContentEncoder.encode(request).toString();
    for (const part of parts) expect(raw).toContain(part);
    expect(JSON.parse(raw).contents.at(-1).parts).toEqual([{ functionResponse: { name: wire, response: { error: '{"isError":false}' } } }]);
    expect(raw).not.toContain(call.id); // labelled local key is not a fabricated provider id
    expect(() => assertRequestCapabilities(OPENAI_CHAT_CAPABILITIES, request)).toThrow(/gemini-signed-part-protocol-replay/);
    const original = request.messages[1]!;
    expect(() => geminiContentEncoder.encode({ ...request, messages: [request.messages[0]!, { ...original, parts: [...original.parts].reverse() }, request.messages[2]!] })).toThrow(/order/);
    expect(() => geminiContentEncoder.encode({ ...request, messages: request.messages.slice(0, 2) })).toThrow(/without every keyed result/);
  });
  test("cache prompt partition and separately charged thought output are neither omitted nor doubled", () => {
    expect(geminiUsage(GEMINI_USAGE)).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 7, reasoningTokens: 3 });
    expect(geminiUsage({ promptTokenCount: 12, candidatesTokenCount: 4 })).toEqual({ inputTokens: 12, outputTokens: 4 });
    for (const value of [{ ...GEMINI_USAGE, cachedContentTokenCount: 13 }, { ...GEMINI_USAGE, totalTokenCount: 16 },
      { ...GEMINI_USAGE, thoughtsTokenCount: -1 }, { promptTokenCount: 12 }, { ...GEMINI_USAGE, toolUsePromptTokenCount: 1 },
      { ...GEMINI_USAGE, candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 4 }] }]) expect(() => geminiUsage(value)).toThrow();
  });
  test.each(['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"x":9007199254740993}', '{"x":"\\ud800"}', '{"x":1} trailing', '{"x":1e999}'])("hostile JSON is rejected without normalization: %s", raw => {
    expect(() => parseGeminiJson(raw)).toThrow();
  });
  test.each([
    { cachedContent: "cachedContents/uncommitted" }, { safetySettings: [] }, { tools: [{ googleSearch: {} }] },
    { generationConfig: { maxOutputTokens: 64, responseModalities: ["AUDIO"] } },
    { generationConfig: { maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 8, thinkingLevel: "LOW" } } },
    { generationConfig: { maxOutputTokens: 64, candidateCount: 2 } }
  ])("unsupported parameters refuse explicitly: %j", addition => {
    expect(() => geminiParams({ ...base().params, ...addition })).toThrow();
  });
  test.each([
    geminiFrame(['{"inlineData":{"mimeType":"image/png","data":"AAAA"}}']),
    geminiFrame(['{"executableCode":{"language":"PYTHON","code":"pass"}}']),
    geminiFrame(['{"text":"ok","functionCall":{"name":"x","args":{}}}']),
    geminiFrame(['{"text":"ok","thoughtSignature":"not-base64"}']),
    geminiFrame(['{"functionCall":{"name":"x","args":{"a":1,"a":2}}}']),
    geminiFrame(['{"text":"ok"}'], "fixture-response", null),
    geminiFrame(['{"text":"ok"}'], "fixture-response", "STOP", null)
  ])("malformed or unsupported output never publishes executable blocks", async frame => {
    const seen: StreamChunk[] = [];
    await expect(decode([frame], "", seen)).rejects.toBeDefined();
    expect(seen.filter(chunk => chunk.type === "block-end")).toEqual([]);
  });
  test("no complete tool block before terminal EOF and a hostile sibling/trailer invalidates authority", async () => {
    const call = geminiCallPart("safe", "original-id");
    for (const [frames, suffix] of [
      [[geminiFrame([call, '{"toolCall":{"name":"server_tool"}}'])], ""],
      [[geminiFrame([call])], "data: {incomplete"],
      [[geminiFrame([call]), geminiFrame(['{"text":"late"}'])], ""],
      [[geminiFrame([call, call])], ""]
    ] as const) {
      const seen: StreamChunk[] = [];
      await expect(decode([...frames], suffix, seen)).rejects.toBeDefined();
      expect(seen.filter(chunk => chunk.type === "block-end")).toEqual([]);
    }
  });
  test("blocked terminal is failure, not successful content; disposal also covers pre-body refusal", async () => {
    const seen = await decode([geminiFrame(['{"text":"partial"}'], "fixture-response", "SAFETY")]);
    expect(seen.at(-1)).toMatchObject({ type: "finish", reason: { kind: "error" } });
    expect(seen.filter(chunk => chunk.type === "block-end")).toEqual([]);
    let closed = false;
    const response = { ...geminiResponse([]), headers: { "content-type": "application/json" }, close: async () => { closed = true; } };
    await expect((async () => { for await (const _ of decodeGemini(response)) { /* drain */ } })()).rejects.toBeDefined();
    expect(closed).toBe(true);
  });
  test("native endpoint, custom credential ownership, redirect refusal and signal are explicit", () => {
    const signal = new AbortController().signal, body = geminiContentEncoder.encode(base());
    const input = { baseUrl: "https://generativelanguage.googleapis.com", model: "models/fixture-model", credential: "disposable-fixture-key", body, signal, extraHeaders: {} };
    const request = geminiAdapter.envelope(input);
    expect(request).toMatchObject({ url: "https://generativelanguage.googleapis.com/v1beta/models/fixture-model:streamGenerateContent?alt=sse",
      redirect: "error", cancelBodyOnReturn: true, signal, body, headers: { "x-goog-api-key": "disposable-fixture-key" } });
    expect(request.url).not.toContain("key=");
    for (const change of [{ baseUrl: "https://user:secret@example.invalid" }, { model: "../escape" }, { extraHeaders: { "X-Goog-Api-Key": "override" } },
      { extraHeaders: { Authorization: "override" } }, { baseUrl: "https://example.invalid?key=hidden" }] as ReadonlyArray<Partial<AdapterEnvelopeInput>>) expect(() => geminiAdapter.envelope({ ...input, ...change })).toThrow();
    const meta = { version: 1 as const, responseId: "r", partIndex: 0, partJson: geminiCallPart("safe", "raw:key") };
    expect(geminiCallKey(meta, readGeminiPart(meta).fields!.get("functionCall")!)).toBe("raw:key");
  });
});
