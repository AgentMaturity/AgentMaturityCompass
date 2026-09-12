import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { bindProviderToolNames, encodeProviderToolNames, providerToolWireName, usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import { RequestEncodingError, type EncodableRequest, type ToolSchema } from "../src/llm/request/requestSpec.js";
import { anthropicMessagesEncoder, anthropicMessagesEncoderV2 } from "../src/llm/request/anthropicMessagesEncoder.js";
import { anthropicMessagesEncoderV3 } from "../src/llm/request/anthropicMessagesEncoderV3.js";
import { openaiChatEncoder } from "../src/llm/request/openaiChatEncoder.js";
import { openaiChatEncoderV2 } from "../src/llm/request/openaiChatEncoderV2.js";
import { openaiChatEncoderV3 } from "../src/llm/request/openaiChatEncoderV3.js";
import { openaiResponsesEncoder } from "../src/llm/request/openaiResponsesEncoder.js";
import { openaiResponsesEncoderV2 } from "../src/llm/request/openaiResponsesEncoderV2.js";
import { BUILT_IN_REQUEST_ENCODERS } from "../src/llm/request/builtInEncoders.js";

const schema = (name: string): ToolSchema => ({ name, description: "read", parameters: { type: "object" } });
const request = (names = ["fs.read"]): EncodableRequest => ({ model: "m", params: {}, system: "s", tools: names.map(schema), messages: [] });
const CURRENT = [openaiChatEncoderV3, anthropicMessagesEncoderV3, openaiResponsesEncoderV2];

describe("stable canonical-to-provider tool identities", () => {
  test("safe nonreserved names retain their exact bytes", () => {
    for (const name of ["read", "fs_read", "tool-1", "A".repeat(64), "Amc_read"]) expect(providerToolWireName(name)).toBe(name);
  });

  test("the unsafe-name digest covers exact UTF-8 bytes with all 256 bits", () => {
    // Explicit independent bytes, not a call back into the mapping helper.
    const digest = createHash("sha256").update(Buffer.from([102, 115, 46, 114, 101, 97, 100])).digest("base64url");
    expect(providerToolWireName("fs.read")).toBe(`amc_fs_read_${digest}`);
    expect(digest).toHaveLength(43);
    expect(providerToolWireName("fs.read")).not.toBe(providerToolWireName("fs_read"));
  });

  test("reserved canonical names cannot impersonate another function's alias", () => {
    const dotted = "fs.read", spoof = providerToolWireName(dotted);
    const bindings = bindProviderToolNames([schema(dotted), schema(spoof), schema("amc_read")]);
    expect(bindings.size).toBe(3);
    expect(bindings.get(spoof)).toBe(dotted);
    expect(bindings.get(providerToolWireName(spoof))).toBe(spoof);
    expect(providerToolWireName(spoof)).not.toBe(spoof);
    expect(providerToolWireName("amc_read")).not.toBe("amc_read");
  });

  test("Unicode, long and MCP names stay bounded, distinct and independent of offered-set changes", () => {
    const names = ["café", "cafe\u0301", "🧭.read", "mcp:reviewed-server:files/read", "tool." + "x".repeat(1000), "tool." + "x".repeat(999) + "y"];
    const bound = bindProviderToolNames(names.map(schema));
    expect(bound.size).toBe(names.length);
    for (const name of names) {
      const wire = providerToolWireName(name);
      expect(wire).toMatch(/^[A-Za-z0-9_-]{1,63}$/);
      expect(bound.get(wire)).toBe(name);
      expect(bindProviderToolNames([schema("unrelated"), schema(name)]).get(wire)).toBe(name);
    }
    expect(providerToolWireName(names[0]!)).not.toBe(providerToolWireName(names[1]!));
    expect(providerToolWireName(names[4]!)).not.toBe(providerToolWireName(names[5]!));
  });

  test.each(["", " ", "line\nbreak", "zero\0byte", "delete\u007f", "\ud800", "x\udc00", "\ud800x", "\ud800\ud800"])("refuses invalid identity %j before UTF-8 replacement", name => {
    expect(() => providerToolWireName(name)).toThrow(RequestEncodingError);
  });

  test("non-string identity and duplicate canonical schema names refuse", () => {
    expect(() => providerToolWireName(null as unknown as string)).toThrow(RequestEncodingError);
    expect(() => providerToolWireName(12 as unknown as string)).toThrow(RequestEncodingError);
    expect(() => bindProviderToolNames([schema("fs.read"), { ...schema("fs.read"), description: "different" }])).toThrow(/Duplicate canonical/);
    expect(() => openaiChatEncoderV3.encode(request(["read", "read"]))).toThrow(/Duplicate canonical/);
  });
});

describe("versioned outbound mapping and current offered authority", () => {
  test("historical-only identities replay stably without appearing in the current offered reverse map", () => {
    const input: EncodableRequest = { ...request(["read"]), messages: [
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "old1", toolName: "fs.read", argumentsJson: "{}" }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "old1", isError: false, text: "old result" }] },
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "old2", toolName: "fs.read", argumentsJson: "{}" }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "old2", isError: true, text: "denied after revocation" }] }
    ] };
    const original = JSON.stringify(input);
    const mapped = encodeProviderToolNames(input, "openai-chat");
    expect(mapped.messages[0]!.parts[0]).toMatchObject({ toolName: providerToolWireName("fs.read"), toolCallId: "old1" });
    expect(mapped.messages[2]!.parts[0]).toMatchObject({ toolName: providerToolWireName("fs.read"), toolCallId: "old2" });
    expect(mapped.tools).toEqual([schema("read")]);
    expect(bindProviderToolNames(input.tools!).has(providerToolWireName("fs.read"))).toBe(false);
    expect(JSON.stringify(input)).toBe(original);
  });

  test.each([
    { id: "openai-chat" as const, encoder: openaiChatEncoderV3, choice: { type: "function", function: { name: "fs.read" } },
      expected: { type: "function", function: { name: providerToolWireName("fs.read") } } },
    { id: "openai-responses" as const, encoder: openaiResponsesEncoderV2, choice: { type: "function", name: "fs.read" },
      expected: { type: "function", name: providerToolWireName("fs.read") } },
    { id: "anthropic-messages" as const, encoder: anthropicMessagesEncoderV3, choice: { type: "tool", name: "fs.read", disable_parallel_tool_use: true },
      expected: { type: "tool", name: providerToolWireName("fs.read"), disable_parallel_tool_use: true } }
  ])("$id maps explicit choice to the same alias as the offered schema without mutating params", ({ id, encoder, choice, expected }) => {
    const input = { ...request(), params: { tool_choice: choice } };
    const original = JSON.stringify(input);
    expect(encodeProviderToolNames(input, id).params.tool_choice).toEqual(expected);
    const body = JSON.parse(encoder.encode(input).toString());
    expect(body.tool_choice).toEqual(expected);
    expect(id === "openai-chat" ? body.tools[0].function.name : body.tools[0].name).toBe(providerToolWireName("fs.read"));
    expect(JSON.stringify(input)).toBe(original);
    expect(() => encoder.encode({ ...input, tools: [schema("different")] })).toThrow(/offered canonical/);
  });

  test("automatic choices survive while unknown shapes and historical-only forced choices refuse", () => {
    for (const id of ["openai-chat", "openai-responses"] as const) for (const choice of ["auto", "none", "required"]) {
      expect(encodeProviderToolNames({ ...request(), params: { tool_choice: choice } }, id).params.tool_choice).toBe(choice);
    }
    for (const type of ["auto", "any", "none"]) {
      const choice = { type, disable_parallel_tool_use: true };
      expect(encodeProviderToolNames({ ...request(), params: { tool_choice: choice } }, "anthropic-messages").params.tool_choice).toEqual(choice);
    }
    expect(() => encodeProviderToolNames({ ...request(), params: { tool_choice: { type: "future", name: "fs.read" } } }, "openai-chat")).toThrow(RequestEncodingError);
    expect(() => encodeProviderToolNames({ ...request([]), messages: [{ role: "assistant", parts: [
      { kind: "tool_use", toolCallId: "old", toolName: "fs.read", argumentsJson: "{}" }
    ] }], params: { tool_choice: { type: "function", name: "fs.read" } } }, "openai-responses")).toThrow(/offered canonical/);
  });

  test.each(CURRENT)("$id@$version maps replay names while preserving arguments, call IDs and error results", encoder => {
    const args = '{ "path": "repo/a.txt" }';
    const input: EncodableRequest = { ...request(), messages: [
      { role: "assistant", parts: [{ kind: "tool_use", toolCallId: "call_1", toolName: "fs.read", argumentsJson: args }] },
      { role: "tool", parts: [{ kind: "tool_result", toolCallId: "call_1", isError: true, text: "denied" }] }
    ] };
    const body = JSON.parse(encoder.encode(input).toString());
    const wire = providerToolWireName("fs.read");
    if (encoder.id === "openai-chat") {
      expect(body.messages[1].tool_calls[0]).toEqual({ id: "call_1", type: "function", function: { name: wire, arguments: args } });
      expect(JSON.parse(body.messages[2].content)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "denied" });
    } else if (encoder.id === "openai-responses") {
      expect(body.input[0]).toEqual({ type: "function_call", call_id: "call_1", name: wire, arguments: args });
      expect(body.input[1].call_id).toBe("call_1");
      expect(JSON.parse(body.input[1].output)).toEqual({ type: "amc.tool-result", version: 1, isError: true, output: "denied" });
    } else {
      expect(body.messages[0].content[0]).toEqual({ type: "tool_use", id: "call_1", name: wire, input: { path: "repo/a.txt" } });
      expect(body.messages[1].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call_1", is_error: true,
        content: [{ type: "text", text: "denied" }] });
      expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
    }
  });

  test("capability admission still refuses unsupported image input after name transformation", () => {
    const input: EncodableRequest = { ...request(), messages: [{ role: "user", parts: [{ kind: "image", sha256: "0".repeat(64) }] }] };
    for (const encoder of [openaiChatEncoderV3, openaiResponsesEncoderV2]) expect(() => encoder.encode(input)).toThrow(/image-input/);
  });
});

describe("historical bytes and exact new version recognition", () => {
  test("all five historical encoders retain fixed canonical bytes including original dotted schema names", () => {
    const chat = '{"messages":[{"content":"s","role":"system"}],"model":"m","stream":true,"stream_options":{"include_usage":true},"tools":[{"function":{"description":"read","name":"fs.read","parameters":{"type":"object"}},"type":"function"}]}';
    const cases = [
      [openaiChatEncoder, chat], [openaiChatEncoderV2, chat],
      [anthropicMessagesEncoder, '{"messages":[],"model":"m","system":"s","tools":[{"description":"read","input_schema":{"type":"object"},"name":"fs.read"}]}'],
      [anthropicMessagesEncoderV2, '{"messages":[],"model":"m","system":[{"cache_control":{"type":"ephemeral"},"text":"s","type":"text"}],"tools":[{"cache_control":{"type":"ephemeral"},"description":"read","input_schema":{"type":"object"},"name":"fs.read"}]}'],
      [openaiResponsesEncoder, '{"input":[],"instructions":"s","model":"m","store":false,"stream":true,"tools":[{"description":"read","name":"fs.read","parameters":{"type":"object"},"strict":false,"type":"function"}]}']
    ] as const;
    for (const [encoder, bytes] of cases) {
      expect(BUILT_IN_REQUEST_ENCODERS.find(candidate => candidate.id === encoder.id && candidate.version === encoder.version)).toBe(encoder);
      expect(encoder.encode(request()).toString()).toBe(bytes);
    }
    for (const encoder of CURRENT) {
      expect(BUILT_IN_REQUEST_ENCODERS.find(candidate => candidate.id === encoder.id && candidate.version === encoder.version)).toBe(encoder);
      expect(encoder.encode(request()).toString()).toContain(providerToolWireName("fs.read"));
    }
    for (const [encoder, bytes] of cases) expect(encoder.encode(request()).toString()).toBe(bytes);
  });

  test("only exact named new versions select reverse binding, never historical or future versions", () => {
    for (const encoder of CURRENT) expect(usesProviderToolNames(encoder.id, encoder.version)).toBe(true);
    // The named image/audio encoders (openai-chat@4, anthropic-messages@4, openai-responses@3, deepseek-chat@1,
    // ollama-chat@1, gemini-generate-content@1/2) bind provider tool names; versions beyond them are still refused.
    for (const [id, version] of [["openai-chat", 4], ["anthropic-messages", 4], ["openai-responses", 3], ["deepseek-chat", 1],
      ["ollama-chat", 1], ["gemini-generate-content", 1], ["gemini-generate-content", 2]] as const) {
      expect(usesProviderToolNames(id, version)).toBe(true);
    }
    for (const [id, version] of [["openai-chat", 1], ["openai-chat", 2], ["openai-chat", 5], ["anthropic-messages", 2],
      ["anthropic-messages", 5], ["openai-responses", 1], ["openai-responses", 4], ["deepseek-chat", 2], ["ollama-chat", 2],
      ["gemini-generate-content", 3], ["stub", 3], ["OPENAI-CHAT", 3]] as const) {
      expect(usesProviderToolNames(id, version)).toBe(false);
    }
  });
});
