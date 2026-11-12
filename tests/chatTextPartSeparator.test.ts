/**
 * Smoke M-1: a user message carries several text parts (the prompt, then the runtime-context snapshot). Chat-style
 * encoders used to concatenate them with no separator, so the model read "hello thereCurrent runtime context…" and a
 * prompt ending in JSON became invalid. New encoder versions separate them; historical versions keep their bytes.
 */
import { describe, expect, test } from "vitest";
import { openaiChatEncoderV4 } from "../src/llm/request/openaiChatEncoderV4.js";
import { openaiChatEncoderV6 } from "../src/llm/request/openaiChatEncoderV6.js";
import { openaiChatEncoderV5, openaiChatEncoderV7, cacheRetentionEncoderVersion } from "../src/llm/request/cacheRetentionEncoders.js";
import { deepseekChatEncoder, deepseekChatEncoderV2 } from "../src/llm/request/deepseekChatEncoder.js";
import { DEFAULT_REQUEST_ENCODERS } from "../src/llm/request/deriveRequest.js";
import { usesProviderToolNames } from "../src/llm/request/providerToolNames.js";
import { openaiAdapter } from "../src/llm/providers/openaiAdapter.js";
import { deepseekAdapter } from "../src/llm/providers/deepseekAdapter.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";

const request = (extra: Partial<EncodableRequest> = {}): EncodableRequest => ({
  model: "m", params: {}, system: "sys", tools: null,
  messages: [{ role: "user", parts: [{ kind: "text", text: "hello {\"a\":1}" }, { kind: "text", text: "" },
    { kind: "text", text: "Current runtime context." }] }], ...extra
});
const userContent = (bytes: Buffer): unknown =>
  (JSON.parse(bytes.toString("utf8")).messages as { role: string; content: unknown }[]).find(m => m.role === "user")!.content;

describe("chat encoders separate a user message's text parts (smoke M-1)", () => {
  test("openai-chat@6 and its retention version @7 join nonempty user text parts with a blank line", () => {
    expect(userContent(openaiChatEncoderV6.encode(request()))).toBe("hello {\"a\":1}\n\nCurrent runtime context.");
    expect(userContent(openaiChatEncoderV7.encode(request({ params: { cacheRetention: "short" } }))))
      .toBe("hello {\"a\":1}\n\nCurrent runtime context.");
    expect(cacheRetentionEncoderVersion("openai-chat", "openai-chat", 6)).toBe(7);
  });

  test("a single-part message encodes exactly as openai-chat@4 did", () => {
    const single = request({ messages: [{ role: "user", parts: [{ kind: "text", text: "one" }] }] });
    expect(openaiChatEncoderV6.encode(single)).toEqual(openaiChatEncoderV4.encode(single));
  });

  test("historical openai-chat@4/@5 and deepseek-chat@1 keep their unseparated bytes", () => {
    expect(userContent(openaiChatEncoderV4.encode(request()))).toBe("hello {\"a\":1}Current runtime context.");
    expect(userContent(openaiChatEncoderV5.encode(request()))).toBe("hello {\"a\":1}Current runtime context.");
    expect(userContent(deepseekChatEncoder.encode(request({ params: { max_tokens: 8 } })))).toBe("hello {\"a\":1}Current runtime context.");
  });

  test("deepseek-chat@2 joins nonempty user text parts with a blank line", () => {
    expect(userContent(deepseekChatEncoderV2.encode(request({ params: { max_tokens: 8 } })))).toBe("hello {\"a\":1}\n\nCurrent runtime context.");
  });

  test("new sessions pin the separating versions, and every version stays registered for replay", () => {
    expect(openaiAdapter.encoderVersion).toBe(6);
    expect(deepseekAdapter.encoderVersion).toBe(2);
    for (const [id, version] of [["openai-chat", 4], ["openai-chat", 5], ["openai-chat", 6], ["openai-chat", 7],
      ["deepseek-chat", 1], ["deepseek-chat", 2]] as const) {
      expect(DEFAULT_REQUEST_ENCODERS.get(id, version)?.version).toBe(version);
      expect(usesProviderToolNames(id, version)).toBe(true);
    }
  });
});
