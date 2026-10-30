/**
 * `pi-ai:<provider>@1` — request bytes built by the pinned pi-ai, recorded by AMC before anything is sent (ADR-016).
 *
 * pi-ai's `stream()` builds its payload, then calls `onPayload(payload)` synchronously before its first await, and
 * only then sends `JSON.stringify(payload)` through its own client. This encoder calls `stream()` with an `onPayload`
 * that captures the payload and throws, so pi-ai stops before creating a request: no client call, no retry, no
 * network. The captured payload serialised the same way IS the request body; the P1-38 contract test proves those
 * bytes equal what pi-ai's own send path transmits through its documented `fetch` option.
 *
 * The result is a pure function of the signed request at the pinned version: no clock, environment (cache
 * retention is fixed to "none", so `PI_CACHE_RETENTION` is never read), credential or session id reaches it. So
 * derivation re-runs it and a matching digest is an honest `reconstructed`. A different pi-ai version is a different
 * encoder: bump PI_AI_ENCODER_VERSION with the pin.
 */
import { LlmError, LLM_FAILURE_CODE } from "../../llmFailure.js";
import type { RequestEncoder } from "../../request/requestEncoder.js";
import { encodeProviderToolNames } from "../../request/providerToolNames.js";
import { RequestEncodingError, type EncodableRequest } from "../../request/requestSpec.js";
import { PI_AI_VERSION, type PiAiLibrary, type PiAiModel, type PiAiProviderId } from "./piAiLoader.js";

/** Bound to PI_AI_VERSION 1.3.0. */
export const PI_AI_ENCODER_VERSION = 1;
const PI_API = "openai-completions";
/** pi-ai refuses to build a payload without some key; this value never leaves the process. */
const CAPTURE_ONLY_KEY = "amc-capture-only";

export function piAiEncoderId(provider: PiAiProviderId): string {
  return `pi-ai:${provider}`;
}

/** The pinned catalog entry for a model, or a refusal. Reasoning models are refused: AMC cannot record their output. */
export function piAiChatModel(library: PiAiLibrary, provider: PiAiProviderId, modelId: string): PiAiModel {
  const catalog = library.catalogs[provider];
  const model = Object.hasOwn(catalog, modelId) ? catalog[modelId] : undefined;
  if (model === undefined) {
    throw new RequestEncodingError(`pi-ai@${PI_AI_VERSION} has no ${provider} model ${JSON.stringify(modelId)}`);
  }
  if (model.api !== PI_API) throw new RequestEncodingError(`pi-ai ${provider} model ${modelId} uses ${model.api}, not ${PI_API}`);
  if (model.reasoning) {
    throw new RequestEncodingError(`pi-ai ${provider} model ${modelId} is a reasoning model; this route cannot record reasoning output`);
  }
  return model;
}

/** AMC params → pi StreamOptions. Only reviewed keys map; the output bound is required and checked against the catalog. */
function piAiStreamOptions(params: Record<string, unknown>, model: PiAiModel): Record<string, number> {
  for (const key of Object.keys(params)) {
    if (key !== "max_tokens" && key !== "temperature") {
      throw new RequestEncodingError(`pi-ai routes map only max_tokens and temperature; ${key} has no reviewed mapping`);
    }
  }
  const maxTokens = params.max_tokens;
  if (typeof maxTokens !== "number" || !Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    throw new RequestEncodingError("pi-ai routes require max_tokens as a positive integer");
  }
  const limit = Math.min(model.maxTokens, model.contextWindow);
  if (maxTokens > limit) {
    throw new RequestEncodingError(`max_tokens ${maxTokens} exceeds the pinned catalog limit ${limit} for ${model.id}`);
  }
  const temperature = params.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    throw new RequestEncodingError("pi-ai routes accept temperature only as a number from 0 to 2");
  }
  return { maxTokens, ...(temperature === undefined ? {} : { temperature }) };
}

/** Same check as a runtime refusal, before anything durable exists. */
export function assertPiAiParams(params: Record<string, unknown>, model: PiAiModel): void {
  try { piAiStreamOptions(params, model); }
  catch (error) { throw new LlmError(error instanceof Error ? error.message : String(error), LLM_FAILURE_CODE.INVALID_REQUEST); }
}

function toolArguments(raw: string, toolCallId: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RequestEncodingError(`tool call ${toolCallId} arguments are not a JSON object; pi-ai replays only parsed objects`);
  }
  return parsed as Record<string, unknown>;
}

/** AMC history → pi messages. Timestamps are 0 and usage is zero because neither is sent; both keep the bytes pure. */
function piMessages(request: EncodableRequest, provider: PiAiProviderId): unknown[] {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const toolNames = new Map<string, string>();
  const messages: unknown[] = [];
  for (const message of request.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", timestamp: 0, content: message.parts.map((part) => {
        if (part.kind !== "text") throw new RequestEncodingError(`pi-ai routes do not encode ${part.kind} user input`);
        return { type: "text", text: part.text };
      }) });
    } else if (message.role === "assistant") {
      const content = message.parts.map((part) => {
        if (part.kind === "text") return { type: "text", text: part.text };
        if (part.kind !== "tool_use") throw new RequestEncodingError(`pi-ai routes do not replay assistant ${part.kind}`);
        toolNames.set(part.toolCallId, part.toolName);
        return { type: "toolCall", id: part.toolCallId, name: part.toolName, arguments: toolArguments(part.argumentsJson, part.toolCallId) };
      });
      messages.push({ role: "assistant", content, api: PI_API, provider, model: request.model, usage,
        stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop", timestamp: 0 });
    } else if (message.role === "tool") {
      for (const part of message.parts) {
        if (part.kind !== "tool_result") throw new RequestEncodingError("pi-ai routes replay only keyed tool results");
        // The pinned openai-completions encoding has no error representation: refusing beats a failure the model reads as success.
        if (part.isError) throw new RequestEncodingError("pi-ai@1.3.0 drops the tool-result error flag; failed results are refused");
        const toolName = toolNames.get(part.toolCallId);
        if (toolName === undefined) throw new RequestEncodingError(`tool result ${part.toolCallId} has no preceding call`);
        messages.push({ role: "toolResult", toolCallId: part.toolCallId, toolName, content: [{ type: "text", text: part.text }],
          isError: false, timestamp: 0 });
      }
    } else {
      throw new RequestEncodingError(`pi-ai routes do not encode ${message.role} history`);
    }
  }
  return messages;
}

class PayloadCaptured extends Error {}

/** The encoder for one allowlisted provider at the pinned version. */
export function createPiAiEncoder(library: PiAiLibrary, provider: PiAiProviderId): RequestEncoder {
  return Object.freeze({
    id: piAiEncoderId(provider),
    version: PI_AI_ENCODER_VERSION,
    encode(request: EncodableRequest): Buffer {
      const model = piAiChatModel(library, provider, request.model);
      const options = piAiStreamOptions(request.params, model);
      // Wire-safe aliases, bound back by the runtime exactly as for the native Chat route.
      const named = encodeProviderToolNames(request, "openai-chat");
      const context = library.normalizeContext({
        ...(named.system === null || named.system.length === 0 ? {} : { systemPrompt: named.system }),
        ...(named.tools === null || named.tools.length === 0 ? {} : {
          tools: named.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
        }),
        messages: piMessages(named, provider)
      });
      let payload: unknown, captured = false;
      try {
        library.streamCompletions(model, context, { ...options, apiKey: CAPTURE_ONLY_KEY, cacheRetention: "none", maxRetries: 0,
          onPayload: (value: unknown) => { payload = value; captured = true; throw new PayloadCaptured(); } });
      } catch (error) {
        throw new RequestEncodingError(`pi-ai refused the request: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!captured) {
        throw new RequestEncodingError("pi-ai did not hand over its payload before sending; refusing bytes AMC could not record first");
      }
      return Buffer.from(JSON.stringify(payload), "utf8");
    }
  });
}
