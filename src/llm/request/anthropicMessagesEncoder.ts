/**
 * `anthropic-messages@1` — the first concrete request encoder (plan P3.1).
 *
 * Produces a Messages API request body as canonical JSON: keys sorted at every
 * depth, arrays in order. Sorting is safe because JSON object key order carries
 * no meaning to any HTTP API, and it is necessary because the alternative —
 * emitting keys in whatever order a value happened to be built — makes the bytes
 * a function of construction history rather than of content, and therefore
 * unreconstructable from a log.
 *
 * DECLARED LIMITS OF v1. Each is a refusal or an omission, never a guess,
 * because an encoder that guesses produces bytes that stop reconstructing:
 *
 *  - `thinking` parts are OMITTED from the request. Replaying a thinking block
 *    to Anthropic requires the provider's `signature`, and AMC does not record
 *    one on `assistant/block` rows yet. Sending an unsigned thinking block is
 *    rejected by the API, and inventing a signature is not an option, so v1 does
 *    not send them. Recording the signature (and bumping to v2) belongs with the
 *    adapter that first receives one.
 *  - `image` parts are REFUSED. An image block needs a media type, which no
 *    signed row carries today; encoding one would mean choosing a media type on
 *    the model's behalf.
 *  - `system` role entries in the projected history are NOT emitted as messages.
 *    Anthropic carries system text in its own top-level field, and the header
 *    row already names the `system/prompt` event that supplied it. Emitting both
 *    would send the system prompt twice.
 *
 * Ordering of these rules is itself part of the wire shape: change any of them
 * and the version must change with it.
 */
import { canonicalize } from "../../utils/json.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError } from "./requestSpec.js";
import type { EncodableMessage, EncodablePart, EncodableRequest } from "./requestSpec.js";

export const ANTHROPIC_MESSAGES_ENCODER_ID = "anthropic-messages";

/**
 * Body keys this encoder owns. A param of the same name would be silently
 * overwritten by (or would silently overwrite) the encoder's own value, so it is
 * refused instead — the caller has to say which one they meant.
 */
const RESERVED_BODY_KEYS: ReadonlySet<string> = new Set(["model", "system", "tools", "messages"]);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Reject values `JSON.stringify` would silently transform.
 *
 * `undefined` members vanish, `NaN` and `Infinity` become `null`, functions
 * disappear. Every one of those makes the encoded bytes disagree with the value
 * the caller believed they were sending — and the disagreement only surfaces
 * much later, as a reconstruction that does not match. Fail at the boundary.
 */
function assertJsonSafe(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RequestEncodingError(`request param ${path} is ${String(value)}, which JSON cannot represent`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      assertJsonSafe(entry, `${path}.${key}`);
    }
    return;
  }
  throw new RequestEncodingError(`request param ${path} is a ${typeof value}, which JSON cannot represent`);
}

/** Parse a tool call's raw arguments, failing loudly rather than sending a string. */
function parseArguments(part: Extract<EncodablePart, { kind: "tool_use" }>): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(part.argumentsJson);
  } catch {
    throw new RequestEncodingError(
      `tool call ${part.toolCallId} has arguments that are not JSON, so they cannot be encoded as \`input\``
    );
  }
  assertJsonSafe(parsed, `tool_use(${part.toolCallId}).input`);
  return parsed;
}

/** One surface part as an Anthropic content block, or null when v1 omits it. */
function encodePart(part: EncodablePart): JsonValue | null {
  switch (part.kind) {
    case "text":
      return { type: "text", text: part.text };
    case "thinking":
      // Omitted by declared limit — see the module header.
      return null;
    case "tool_use":
      return { type: "tool_use", id: part.toolCallId, name: part.toolName, input: parseArguments(part) };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: part.toolCallId,
        is_error: part.isError,
        content: [{ type: "text", text: part.text }]
      };
    case "image":
      throw new RequestEncodingError(
        `image part ${part.sha256} cannot be encoded: no signed row records its media type (encoder v1 limit)`
      );
  }
}

/** Surface role → Anthropic role. Tool results are carried by the user turn. */
function providerRole(role: EncodableMessage["role"]): "user" | "assistant" | null {
  switch (role) {
    case "system":
      return null;
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool":
      return "user";
  }
}

/**
 * Build the `messages` array.
 *
 * Adjacent messages that collapse onto the same provider role are MERGED — a
 * tool result immediately after an assistant tool call becomes one user turn —
 * because the API expects alternating roles and because merging is the only rule
 * here that is a total function of the input order.
 */
function encodeMessages(messages: readonly EncodableMessage[]): JsonValue[] {
  type ProviderMessage = { readonly role: "user" | "assistant"; readonly content: readonly JsonValue[] };
  const merged = messages.reduce<readonly ProviderMessage[]>((out, message) => {
    const role = providerRole(message.role);
    if (role === null) {
      return out;
    }
    const content = message.parts.map(encodePart).filter((block): block is JsonValue => block !== null);
    if (content.length === 0) {
      // A message whose every part was omitted (an assistant turn of pure
      // thinking) is dropped rather than sent empty: the API rejects empty
      // content, and an empty turn tells the model nothing.
      return out;
    }
    const last = out[out.length - 1];
    if (last !== undefined && last.role === role) {
      return [...out.slice(0, -1), { role, content: [...last.content, ...content] }];
    }
    return [...out, { role, content }];
  }, []);
  return merged.map((message) => ({ role: message.role, content: [...message.content] }));
}

export const anthropicMessagesEncoder: RequestEncoder = {
  id: ANTHROPIC_MESSAGES_ENCODER_ID,
  version: 1,
  encode(request: EncodableRequest): Buffer {
    const body: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(request.params)) {
      if (RESERVED_BODY_KEYS.has(key)) {
        throw new RequestEncodingError(
          `request param "${key}" collides with a body field ${ANTHROPIC_MESSAGES_ENCODER_ID} sets itself`
        );
      }
      assertJsonSafe(value, `params.${key}`);
      body[key] = value;
    }
    body.model = request.model;
    if (request.system !== null) {
      body.system = request.system;
    }
    if (request.tools !== null) {
      body.tools = request.tools.map((tool) => {
        assertJsonSafe(tool.parameters, `tools.${tool.name}.parameters`);
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as JsonValue
        };
      });
    }
    body.messages = encodeMessages(request.messages);
    // canonicalize() sorts every key at every depth, so the assembly order above
    // is a readability choice and not part of the wire shape.
    return Buffer.from(canonicalize(body), "utf8");
  }
};

/**
 * `anthropic-messages@2` — v1's exact wire shape plus prompt-cache breakpoints.
 *
 * Three deterministic `cache_control: {type: "ephemeral"}` markers: the system
 * block, the last tool, and the last content block of the last message. Each
 * turn's request thereby seeds the cache that the next turn's shared prefix
 * reads — without a marker no cache entry is ever created, and an agent loop
 * re-pays the full input price on every step. Three of Anthropic's four
 * allowed breakpoints, leaving one for a future caller-placed marker.
 *
 * A separate VERSION, not a change to v1: v1's bytes are frozen by every
 * `requestDigest` recorded under `anthropic-messages@1`, and a marker anywhere
 * would un-reconstruct all of them.
 */
export const anthropicMessagesEncoderV2: RequestEncoder = {
  id: ANTHROPIC_MESSAGES_ENCODER_ID,
  version: 2,
  encode(request: EncodableRequest): Buffer {
    const CACHE_MARK = { type: "ephemeral" } as const;
    const body: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(request.params)) {
      if (RESERVED_BODY_KEYS.has(key)) {
        throw new RequestEncodingError(
          `request param "${key}" collides with a body field ${ANTHROPIC_MESSAGES_ENCODER_ID} sets itself`
        );
      }
      assertJsonSafe(value, `params.${key}`);
      body[key] = value;
    }
    body.model = request.model;
    if (request.system !== null) {
      // The block-array form of `system`, which is where the API accepts a marker.
      body.system = [{ type: "text", text: request.system, cache_control: CACHE_MARK }];
    }
    if (request.tools !== null) {
      const last = request.tools.length - 1;
      body.tools = request.tools.map((tool, index) => {
        assertJsonSafe(tool.parameters, `tools.${tool.name}.parameters`);
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters as JsonValue,
          // Marking the last tool caches the whole tools-array prefix.
          ...(index === last ? { cache_control: CACHE_MARK } : {})
        };
      });
    }
    const messages = encodeMessages(request.messages);
    const lastMessage = messages[messages.length - 1] as { content: JsonValue[] } | undefined;
    if (lastMessage !== undefined && lastMessage.content.length > 0) {
      const lastBlock = lastMessage.content[lastMessage.content.length - 1] as Record<string, JsonValue>;
      lastMessage.content[lastMessage.content.length - 1] = { ...lastBlock, cache_control: CACHE_MARK };
    }
    body.messages = messages;
    return Buffer.from(canonicalize(body), "utf8");
  }
};
