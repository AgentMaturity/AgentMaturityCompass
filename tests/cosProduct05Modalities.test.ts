/** Authored, UNEXECUTED. Version isolation and original-byte modality contracts;
 * no network, model inference, conversion, file upload or generated-media claim.
 */
import { describe, expect, test } from "vitest";
import { sha256Hex } from "../src/utils/hash.js";
import { snapshotNativeInputParts, materializeNativeInputParts } from "../src/attachments/nativeOrderedInput.js";
import { snapshotNativeAudioParts, materializeNativeAudioParts, type NativeAudioPart } from "../src/attachments/nativeAudioInput.js";
import { ollamaChatEncoder } from "../src/llm/request/ollamaChatEncoder.js";
import { openaiChatEncoderV4 } from "../src/llm/request/openaiChatEncoderV4.js";
import { openaiResponsesEncoderV3 } from "../src/llm/request/openaiResponsesEncoderV3.js";
import { anthropicMessagesEncoderV4 } from "../src/llm/request/anthropicMessagesEncoderV4.js";
import { geminiContentEncoder } from "../src/llm/request/geminiContentEncoder.js";
import { geminiContentEncoderV2 } from "../src/llm/request/geminiContentEncoderV2.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";
import { RequestEncoderRegistry } from "../src/llm/request/requestEncoder.js";
import type { EncodablePart, EncodableRequest } from "../src/llm/request/requestSpec.js";
import { OLLAMA_CAPABILITIES, GEMINI_CAPABILITIES, GEMINI_AUDIO_CAPABILITIES, OPENAI_CHAT_CAPABILITIES,
  assertRequestCapabilities } from "../src/llm/adapter/providerCapabilities.js";
import { ollamaCallKey } from "../src/llm/providers/ollamaToolIdentity.js";
import { ollamaUsage } from "../src/llm/providers/ollamaUsage.js";
import { deepseekUsage } from "../src/llm/providers/deepseekUsage.js";
import { geminiUsage } from "../src/llm/providers/geminiUsage.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=";
function image(): Extract<EncodablePart, { kind: "image" }> {
  const bytes = Buffer.from(PNG, "base64"); return { kind: "image", mediaType: "image/png", sha256: sha256Hex(bytes), bytes };
}
function ordered(): EncodablePart[] {
  return [{ kind: "text", text: "Before α" }, image(), { kind: "text", text: "" }, { kind: "text", text: "After" }];
}
function request(parts = ordered(), params: Record<string, unknown> = { max_tokens: 64 }): EncodableRequest {
  return { model: "p05-fixture-model", params, system: "Preserve original ordered input.", tools: null, messages: [{ role: "user", parts }] };
}
function wav(): Buffer {
  const bytes = Buffer.alloc(48);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(40, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(4, 40); bytes.writeInt16LE(100, 44); bytes.writeInt16LE(-100, 46);
  return bytes;
}
const geminiParams = { generationConfig: { maxOutputTokens: 64 } };

describe("P05 native modalities and version boundaries (unexecuted)", () => {
  test("Ollama preserves the exact signed part sequence using explicit native message framing", () => {
    const bytes = ollamaChatEncoder.encode(request()), messages = JSON.parse(bytes.toString()).messages;
    expect(messages.slice(1)).toEqual([
      { role: "user", content: "Before α" }, { role: "user", content: "", images: [PNG] },
      { role: "user", content: "" }, { role: "user", content: "After" }
    ]);
    expect(bytes).toEqual(ollamaChatEncoder.encode(request()));
    expect(bytes.toString()).not.toContain("image_url"); expect(bytes.toString()).not.toContain("data:image");
  });
  test("queued image snapshots, not later caller Buffer changes, supply native originals", () => {
    const bytes = Buffer.from(PNG, "base64");
    const queued = snapshotNativeInputParts([{ type: "text", text: "" },
      { type: "image", image: { filename: "original.png", mediaType: "image/png", bytes } }, { type: "text", text: "last" }]);
    bytes.fill(0);
    const materialized = materializeNativeInputParts(queued);
    expect(materialized.map(part => part.type)).toEqual(["text", "image", "text"]);
    expect(materialized[0]).toEqual({ type: "text", text: "" });
    const restored = materialized[1]!; if (restored.type !== "image") throw new Error("Missing original image");
    expect(restored.image.bytes.toString("base64")).toBe(PNG);
  });
  test("existing image-wire identities preserve original parts, empty text and provider-specific shapes", () => {
    const chat = JSON.parse(openaiChatEncoderV4.encode(request()).toString());
    expect(chat.messages[1].content).toEqual([{ type: "text", text: "Before α" },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}`, detail: "auto" } },
      { type: "text", text: "" }, { type: "text", text: "After" }]);
    const responses = JSON.parse(openaiResponsesEncoderV3.encode(request(ordered(), { max_output_tokens: 64 })).toString());
    expect(responses.input[0].content).toEqual([{ type: "input_text", text: "Before α" },
      { type: "input_image", image_url: `data:image/png;base64,${PNG}`, detail: "auto" },
      { type: "input_text", text: "" }, { type: "input_text", text: "After" }]);
    const anthropic = JSON.parse(anthropicMessagesEncoderV4.encode(request()).toString());
    expect(anthropic.messages[0].content).toEqual([{ type: "text", text: "Before α" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "text", text: "" }, { type: "text", text: "After", cache_control: { type: "ephemeral" } }]);
    const geminiRequest = request(ordered(), geminiParams), v1 = geminiContentEncoder.encode(geminiRequest);
    expect(JSON.parse(v1.toString()).contents[0].parts).toEqual([{ text: "Before α" },
      { inlineData: { mimeType: "image/png", data: PNG } }, { text: "" }, { text: "After" }]);
    expect(geminiContentEncoderV2.encode(geminiRequest)).toEqual(v1);
  });
  test("new registration does not replace old encoder identities or admit modalities under historical versions", () => {
    const registry = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);
    expect(registry.get("openai-chat", 4)).toBe(openaiChatEncoderV4);
    expect(registry.get("openai-responses", 3)).toBe(openaiResponsesEncoderV3);
    expect(registry.get("anthropic-messages", 4)).toBe(anthropicMessagesEncoderV4);
    expect(registry.get("gemini-generate-content", 1)).toBe(geminiContentEncoder);
    expect(registry.get("gemini-generate-content", 2)).toBe(geminiContentEncoderV2);
    for (const [id, versions, params] of [
      ["openai-chat", [1, 2, 3], { max_tokens: 64 }],
      ["openai-responses", [1, 2], { max_output_tokens: 64 }],
      ["anthropic-messages", [1, 2, 3], { max_tokens: 64 }]
    ] as const) for (const version of versions) {
      const encoder = registry.get(id, version); expect(encoder).not.toBeNull();
      expect(() => encoder!.encode(request(ordered(), { ...params }))).toThrow();
    }
    expect(registry.get("ollama-chat", 2)).toBeNull();
  });
  test.each(["digest", "mime", "no-bytes", "gif", "assistant", "too-many"])("Ollama refuses %s instead of substituting or discarding an image", mutation => {
    let part: Extract<EncodablePart, { kind: "image" }> = image();
    if (mutation === "digest") part = { ...part, sha256: "0".repeat(64) };
    if (mutation === "mime") part = { ...part, mediaType: "image/jpeg" };
    if (mutation === "no-bytes") { const { bytes: _bytes, ...reference } = part; part = reference; }
    if (mutation === "gif") { const bytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"); part = { kind: "image", bytes, mediaType: "image/gif", sha256: sha256Hex(bytes) }; }
    const input = request(mutation === "too-many" ? Array.from({ length: 9 }, () => part) : [part]);
    expect(() => ollamaChatEncoder.encode(mutation === "assistant" ? { ...input, messages: [{ role: "assistant", parts: [part] }] } : input)).toThrow();
  });
  test("Gemini audio v2 retains original WAV samples and neighboring ordered images/text; all other routes refuse", () => {
    const original = wav(), originalBase64 = original.toString("base64");
    const parts: NativeAudioPart[] = [{ type: "text", text: "Before" },
      { type: "audio", audio: { filename: "original.wav", mediaType: "audio/wav", bytes: original } },
      { type: "image", image: { filename: "original.png", mediaType: "image/png", bytes: Buffer.from(PNG, "base64") } },
      { type: "text", text: "" }, { type: "text", text: "After" }];
    const snapshot = snapshotNativeAudioParts(parts); original.fill(0);
    const restored = materializeNativeAudioParts(snapshot);
    const encodable: EncodablePart[] = restored.map(part => {
      if (part.type === "text") return { kind: "text", text: part.text };
      const media = part.type === "image" ? part.image : part.audio;
      return { kind: part.type, mediaType: media.mediaType, sha256: sha256Hex(media.bytes), bytes: media.bytes };
    });
    const input = request(encodable, geminiParams);
    expect(() => assertRequestCapabilities(GEMINI_AUDIO_CAPABILITIES, input)).not.toThrow();
    expect(() => assertRequestCapabilities(GEMINI_CAPABILITIES, input)).toThrow();
    expect(() => assertRequestCapabilities(OLLAMA_CAPABILITIES, input)).toThrow();
    expect(JSON.parse(geminiContentEncoderV2.encode(input).toString()).contents[0].parts).toEqual([
      { text: "Before" }, { inlineData: { mimeType: "audio/wav", data: originalBase64 } },
      { inlineData: { mimeType: "image/png", data: PNG } }, { text: "" }, { text: "After" }
    ]);
    for (const encoder of [geminiContentEncoder, ollamaChatEncoder, openaiChatEncoderV4, openaiResponsesEncoderV3, anthropicMessagesEncoderV4]) {
      const params = encoder.id === "gemini-generate-content" ? geminiParams : encoder.id === "openai-responses" ? { max_output_tokens: 64 } : { max_tokens: 64 };
      expect(() => encoder.encode(request(encodable, params))).toThrow();
    }
  });
  test("a labelled native Ollama call cannot be treated as a provider-issued OpenAI call ID", () => {
    const key = ollamaCallKey({ stream: "00000000-0000-4000-8000-000000000001", ordinal: 0, wireId: null, wireIndex: null, wireType: null });
    const base = request([{ kind: "text", text: "input" }]);
    const input: EncodableRequest = { ...base, messages: [...base.messages,
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: key, toolName: "read", argumentsJson: "{}" }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: key, isError: false, text: "result" }] }] };
    expect(() => assertRequestCapabilities(OPENAI_CHAT_CAPABILITIES, input)).toThrow(/ollama-native-call-protocol-replay/);
  });
  test("provider-specific cache and reasoning accounting remain different rather than borrowing fabricated counters", () => {
    expect(ollamaUsage({ prompt_eval_count: 12, eval_count: 4 })).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(ollamaUsage({ prompt_eval_count: 12, eval_count: 4, prompt_eval_cached_count: 5 })).toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 4 });
    expect(deepseekUsage({ prompt_tokens: 12, prompt_cache_hit_tokens: 5, prompt_cache_miss_tokens: 7,
      completion_tokens: 4, total_tokens: 16, completion_tokens_details: { reasoning_tokens: 3 } }))
      .toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 4, reasoningTokens: 3 });
    expect(geminiUsage({ promptTokenCount: 12, cachedContentTokenCount: 5, candidatesTokenCount: 4, thoughtsTokenCount: 3, totalTokenCount: 19 }))
      .toEqual({ inputTokens: 7, cacheReadTokens: 5, outputTokens: 7, reasoningTokens: 3 });
    expect(geminiUsage({ promptTokenCount: 12, candidatesTokenCount: 4 })).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(() => deepseekUsage({ prompt_tokens: 12, completion_tokens: 4, prompt_cache_hit_tokens: 5 })).toThrow();
  });
});
