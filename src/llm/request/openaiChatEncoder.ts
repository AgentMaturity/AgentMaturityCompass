/**
 * `openai-chat@1` — an OpenAI Chat Completions request body, canonically.
 *
 * Same contract as `anthropic-messages@1` next door: canonical JSON (keys sorted
 * at every depth, array order preserved), so the bytes are a function of the
 * request's CONTENT and not of the order a value happened to be built in. That
 * is what makes the transmitted bytes reconstructable from the log.
 *
 * THIS ENCODER OWNS `stream` AND `stream_options`, and that is a deliberate
 * difference from the Anthropic encoder. AMC's stream grammar requires token
 * accounting before a successful finish, and OpenAI reports usage on a streamed
 * response ONLY when `stream_options.include_usage` is set. Leaving that to a
 * caller's params would mean every request that forgot it produced a response
 * that could never be recorded — so the encoder sets both and REFUSES a param of
 * either name rather than letting one silently disagree.
 *
 * DECLARED LIMITS OF v1, each a refusal or an omission and never a guess:
 *
 *  - `thinking` parts are OMITTED. Replaying reasoning content to OpenAI needs
 *    provider-issued reasoning item ids, which no signed row records.
 *  - `image` parts are REFUSED. An image part carries a digest and no media
 *    type, and choosing one on the model's behalf is a guess.
 *  - `system` role entries in the projected history are NOT emitted from the
 *    message list. The system text arrives through `EncodableRequest.system`,
 *    which the header row already names a `system/prompt` event for; emitting
 *    both would send it twice.
 *  - Each tool result becomes its OWN `role: "tool"` message, because the API
 *    requires one `tool_call_id` per message. That is a shape difference from
 *    Anthropic, where tool results ride inside a user turn.
 */
import { canonicalize } from "../../utils/json.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError } from "./requestSpec.js";
import type { EncodableMessage, EncodablePart, EncodableRequest } from "./requestSpec.js";

export const OPENAI_CHAT_ENCODER_ID = "openai-chat";

/** Body keys this encoder sets itself. A param of the same name is refused. */
const RESERVED_BODY_KEYS: ReadonlySet<string> = new Set([
  "model",
  "messages",
  "tools",
  "stream",
  "stream_options"
]);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Reject values `JSON.stringify` would silently transform. See the Anthropic encoder. */
function assertJsonSafe(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
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

/** Text parts of one message, concatenated. Refuses what v1 cannot encode. */
function messageText(parts: readonly EncodablePart[]): string {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.kind === "image") {
        throw new RequestEncodingError(
          `image part ${part.sha256} cannot be encoded: no signed row records its media type (encoder v1 limit)`
        );
      }
      // thinking / tool_use / tool_result contribute no text here.
      return "";
    })
    .join("");
}

/** Tool calls of one assistant message, in order. */
function toolCalls(parts: readonly EncodablePart[]): JsonValue[] {
  return parts
    .filter((part): part is Extract<EncodablePart, { kind: "tool_use" }> => part.kind === "tool_use")
    .map((part) => ({
      id: part.toolCallId,
      type: "function",
      // `arguments` stays the RAW JSON STRING the model produced. OpenAI defines
      // it as a string, and re-parsing then re-serialising it would change the
      // bytes the model actually emitted.
      function: { name: part.toolName, arguments: part.argumentsJson }
    }));
}

/**
 * Build the `messages` array.
 *
 * Structured as a flatMap rather than a merge because OpenAI's roles do not
 * collapse the way Anthropic's do: a tool result is its own message, and two
 * adjacent assistant messages are legal.
 */
function encodeMessages(messages: readonly EncodableMessage[], system: string | null): JsonValue[] {
  const out: JsonValue[] = [];
  if (system !== null) out.push({ role: "system", content: system });
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      for (const part of message.parts) {
        if (part.kind !== "tool_result") continue;
        out.push({ role: "tool", tool_call_id: part.toolCallId, content: part.text });
      }
      continue;
    }
    const content = messageText(message.parts);
    if (message.role === "user") {
      if (content.length > 0) out.push({ role: "user", content });
      continue;
    }
    const calls = toolCalls(message.parts);
    if (content.length === 0 && calls.length === 0) {
      // An assistant turn of pure thinking encodes to nothing; sending an empty
      // message tells the model less than omitting it and some deployments
      // reject it outright.
      continue;
    }
    out.push({
      role: "assistant",
      // Explicit null, not an omitted key: the API distinguishes "no text
      // content, only tool calls" from "content absent", and canonical JSON has
      // to state which one this is.
      content: content.length > 0 ? content : null,
      ...(calls.length > 0 ? { tool_calls: calls } : {})
    });
  }
  return out;
}

export const openaiChatEncoder: RequestEncoder = {
  id: OPENAI_CHAT_ENCODER_ID,
  version: 1,
  encode(request: EncodableRequest): Buffer {
    const body: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(request.params)) {
      if (RESERVED_BODY_KEYS.has(key)) {
        throw new RequestEncodingError(
          `request param "${key}" collides with a body field ${OPENAI_CHAT_ENCODER_ID} sets itself`
        );
      }
      assertJsonSafe(value, `params.${key}`);
      body[key] = value;
    }
    body.model = request.model;
    if (request.tools !== null) {
      body.tools = request.tools.map((tool) => {
        assertJsonSafe(tool.parameters, `tools.${tool.name}.parameters`);
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as JsonValue
          }
        };
      });
    }
    body.messages = encodeMessages(request.messages, request.system);
    body.stream = true;
    body.stream_options = { include_usage: true };
    return Buffer.from(canonicalize(body), "utf8");
  }
};
