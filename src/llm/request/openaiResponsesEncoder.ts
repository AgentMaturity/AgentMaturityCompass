/** Explicit stateless Responses wire shape. No remote conversation state or opaque reasoning replay. */
import { canonicalize } from "../../utils/json.js";
import { assertRequestCapabilities, OPENAI_RESPONSES_CAPABILITIES } from "../adapter/providerCapabilities.js";
import type { RequestEncoder } from "./requestEncoder.js";
import { RequestEncodingError, type EncodableRequest } from "./requestSpec.js";
import { toolResultTextEnvelope } from "./toolResultTextEnvelope.js";
export const OPENAI_RESPONSES_ENCODER_ID = "openai-responses";
const RESERVED = new Set(["model", "input", "instructions", "tools", "stream", "store", "previous_response_id", "conversation", "background", "include", "max_tokens", "max_completion_tokens", "stream_options", "top_logprobs"]);
function jsonSafe(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new RequestEncodingError("Responses input contains a non-JSON value or cycle");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new RequestEncodingError("Responses input requires plain JSON objects");
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { if (!(i in value)) throw new RequestEncodingError("Responses input contains a sparse array"); jsonSafe(value[i], ancestors); }
  } else for (const part of Object.values(value)) jsonSafe(part, ancestors);
  ancestors.delete(value);
}
export const openaiResponsesEncoder: RequestEncoder = {
  id: OPENAI_RESPONSES_ENCODER_ID, version: 1,
  encode(request: EncodableRequest): Buffer {
    assertRequestCapabilities(OPENAI_RESPONSES_CAPABILITIES, request);
    jsonSafe(request.params);
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(request.params)) {
      if (RESERVED.has(key)) throw new RequestEncodingError(`Responses param ${key} is owned by the encoder or requires unreconstructable state; use max_output_tokens for the output budget`);
      body[key] = value;
    }
    const input: Record<string, unknown>[] = [];
    const calls = new Set<string>(); const results = new Set<string>();
    for (const message of request.messages) for (const part of message.parts) {
      switch (part.kind) {
        case "text": input.push({ role: message.role, content: part.text }); break;
        case "tool_use":
          if (!part.toolCallId || !part.toolName || calls.has(part.toolCallId)) throw new RequestEncodingError("Responses tool call requires a unique provider call ID and name");
          calls.add(part.toolCallId);
          input.push({ type: "function_call", call_id: part.toolCallId, name: part.toolName, arguments: part.argumentsJson });
          break;
        case "tool_result":
          if (!calls.has(part.toolCallId) || results.has(part.toolCallId)) throw new RequestEncodingError("Responses tool result requires exactly one preceding matching call");
          results.add(part.toolCallId);
          input.push({ type: "function_call_output", call_id: part.toolCallId, output: toolResultTextEnvelope(part) });
          break;
        default: throw new RequestEncodingError("Responses cannot replay this content kind without dropping signed input");
      }
    }
    if (request.tools !== null) {
      jsonSafe(request.tools);
      body.tools = request.tools.map(tool => ({ type: "function", name: tool.name, description: tool.description,
        parameters: tool.parameters, strict: false }));
    }
    if (body.tool_choice !== undefined && !["auto", "none", "required"].includes(body.tool_choice as string)) {
      const choice = body.tool_choice as { type?: unknown; name?: unknown } | null;
      if (choice?.type !== "function" || !request.tools?.some(tool => tool.name === choice.name)) {
        throw new RequestEncodingError("Responses tool_choice must select an offered function");
      }
    }
    body.model = request.model; body.input = input; body.stream = true; body.store = false;
    if (request.system !== null) body.instructions = request.system;
    return Buffer.from(canonicalize(body), "utf8");
  }
};
