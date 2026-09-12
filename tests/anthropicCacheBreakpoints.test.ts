import { describe, expect, test } from "vitest";
import {
  anthropicMessagesEncoder,
  anthropicMessagesEncoderV2
} from "../src/llm/request/anthropicMessagesEncoder.js";
import { anthropicMessagesEncoderV3 } from "../src/llm/request/anthropicMessagesEncoderV3.js";
import { anthropicMessagesEncoderV4 } from "../src/llm/request/anthropicMessagesEncoderV4.js";
import { DEFAULT_REQUEST_ENCODERS } from "../src/llm/request/deriveRequest.js";
import { anthropicAdapter } from "../src/llm/providers/anthropicAdapter.js";
import type { EncodableRequest } from "../src/llm/request/requestSpec.js";

/**
 * `anthropic-messages@2` — prompt-cache breakpoints (§5b G4).
 *
 * AMC captured cacheRead/cacheWrite from the FIRST adapter it shipped, but no
 * encoder ever emitted a `cache_control` marker, so no cache entry was ever
 * created and every turn of an agent loop re-paid the full input price. The
 * comparator digest priced this as a per-token cost multiple vs pi.
 *
 * v2 marks three deterministic breakpoints — the system block, the last tool,
 * and the last content block of the last message — so each turn's request seeds
 * the cache the next turn's shared prefix reads. v1 stays registered and
 * byte-stable: recorded requests must reconstruct under the encoder that wrote
 * them, forever. v3 maps provider-safe tool names while preserving v2 caching;
 * both historical encoders remain registered for cold reconstruction.
 */

const REQUEST: EncodableRequest = {
  model: "claude-opus-5",
  params: { max_tokens: 512, stream: true },
  system: "You are the agent under test.",
  tools: [
    { name: "shell", description: "run a command", parameters: { type: "object" } },
    { name: "read", description: "read a file", parameters: { type: "object" } }
  ],
  messages: [
    { role: "user", parts: [{ kind: "text", text: "first" }] },
    { role: "assistant", parts: [{ kind: "text", text: "reply" }] },
    { role: "user", parts: [{ kind: "text", text: "second" }] }
  ]
};

function decode(buffer: Buffer): Record<string, any> {
  return JSON.parse(buffer.toString("utf8"));
}

describe("Anthropic versioned cache breakpoints", () => {
  test.each([anthropicMessagesEncoderV2, anthropicMessagesEncoderV3])("v$version marks system, last tool, and the last block of the last message", (encoder) => {
    const body = decode(encoder.encode(REQUEST));
    expect(body.system).toEqual([
      { type: "text", text: "You are the agent under test.", cache_control: { type: "ephemeral" } }
    ]);
    expect(body.tools[0].cache_control).toBeUndefined();
    expect(body.tools[1].cache_control).toEqual({ type: "ephemeral" });
    const lastMessage = body.messages[body.messages.length - 1];
    const lastBlock = lastMessage.content[lastMessage.content.length - 1];
    expect(lastBlock.cache_control).toEqual({ type: "ephemeral" });
    // Exactly three markers: Anthropic allows four, and spending them all here
    // would leave none for a future caller-placed breakpoint.
    const markers = JSON.stringify(body).match(/"cache_control"/g) ?? [];
    expect(markers).toHaveLength(3);
  });

  test.each([anthropicMessagesEncoderV2, anthropicMessagesEncoderV3])("v$version omits absent system/tool markers without crashing", (encoder) => {
    const body = decode(
      encoder.encode({ ...REQUEST, system: null, tools: null })
    );
    expect(body.system).toBeUndefined();
    expect(body.tools).toBeUndefined();
    const markers = JSON.stringify(body).match(/"cache_control"/g) ?? [];
    expect(markers).toHaveLength(1);
  });

  test.each([anthropicMessagesEncoderV2, anthropicMessagesEncoderV3])("v$version is deterministic", (encoder) => {
    const first = encoder.encode(REQUEST);
    const second = encoder.encode(REQUEST);
    expect(first.equals(second)).toBe(true);
  });

  test("v1 output is unchanged — recorded requests still reconstruct", () => {
    const body = decode(anthropicMessagesEncoder.encode(REQUEST));
    // v1 predates cache markers, and its bytes are frozen by recorded digests.
    expect(JSON.stringify(body)).not.toContain("cache_control");
    expect(body.system).toBe("You are the agent under test.");
  });

  test("frozen v1/v2/v3 and active v4 are registered; the adapter writes v4", () => {
    expect(DEFAULT_REQUEST_ENCODERS.get("anthropic-messages", 1)).toBe(anthropicMessagesEncoder);
    expect(DEFAULT_REQUEST_ENCODERS.get("anthropic-messages", 2)).toBe(anthropicMessagesEncoderV2);
    expect(DEFAULT_REQUEST_ENCODERS.get("anthropic-messages", 3)).toBe(anthropicMessagesEncoderV3);
    expect(DEFAULT_REQUEST_ENCODERS.get("anthropic-messages", 4)).toBe(anthropicMessagesEncoderV4);
    expect(anthropicAdapter.encoderId).toBe("anthropic-messages");
    expect(anthropicAdapter.encoderVersion).toBe(4);
  });
});
