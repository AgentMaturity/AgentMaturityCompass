/** OpenAI Responses SSE. Text/function tools only; opaque reasoning/media explicitly refuse.
 * Wire references (retrieved 2026-09-08):
 * https://developers.openai.com/api/docs/guides/streaming-responses
 * https://developers.openai.com/api/docs/guides/function-calling
 * https://github.com/openai/openai-node/blob/master/src/resources/responses/responses.ts
 */
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import { toolCallId, type StreamChunk, type StreamTokenUsage } from "../streamChunk.js";
import type { LlmAdapter } from "../adapter/adapterTypes.js";
import { OPENAI_RESPONSES_CAPABILITIES } from "../adapter/providerCapabilities.js";
import { sseEvents } from "../adapter/sse.js";
import type { HttpResponse } from "../adapter/transport.js";
import { OPENAI_RESPONSES_ENCODER_ID } from "../request/openaiResponsesEncoder.js";
import { openaiAdapter } from "./openaiAdapter.js";
export const OPENAI_RESPONSES_ADAPTER_ID = "openai-responses";
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fail(detail: string): never { throw new LlmError(`openai-responses stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT); }
function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail(`invalid ${label}`);
  return value;
}
function string(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && value.length === 0)) return fail(`invalid ${label}`);
  return value;
}
function assertRepresentableItem(value: Record<string, unknown>): void {
  if (value.phase != null || value.async === true || value.namespace != null
      || (value.caller != null && object(value.caller)?.type !== "direct")) {
    throw new LlmError("openai-responses item requires phase, namespace or asynchronous caller replay that AMC cannot preserve", LLM_FAILURE_CODE.INVALID_REQUEST);
  }
}
function usage(value: unknown): StreamTokenUsage | null {
  if (value === null || value === undefined) return null;
  const u = object(value); if (!u) return fail("invalid usage");
  const input = integer(u.input_tokens, "input token count"), output = integer(u.output_tokens, "output token count");
  const details = object(u.input_tokens_details), outputDetails = object(u.output_tokens_details);
  const cached = details?.cached_tokens === undefined ? undefined : integer(details.cached_tokens, "cache read count");
  const written = details?.cache_write_tokens === undefined ? undefined : integer(details.cache_write_tokens, "cache write count");
  const reasoning = outputDetails?.reasoning_tokens === undefined ? undefined : integer(outputDetails.reasoning_tokens, "reasoning count");
  if ((cached ?? 0) + (written ?? 0) > input || (reasoning ?? 0) > output) return fail("usage breakdown exceeds reported total");
  if (u.total_tokens !== undefined && integer(u.total_tokens, "total token count") !== input + output) return fail("inconsistent total token count");
  return { inputTokens: input - (cached ?? 0) - (written ?? 0), outputTokens: output,
    ...(cached === undefined ? {} : { cacheReadTokens: cached }),
    ...(written === undefined ? {} : { cacheWriteTokens: written }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }) };
}
interface TextPart { index: number; text: string; textDone: boolean; closed: boolean }
interface Item {
  id: string; outputIndex: number; type: "message" | "function_call"; closed: boolean;
  parts: Map<number, TextPart>; callId: string; name: string; arguments: string; argumentsDone: boolean; blockIndex: number;
}
async function* decodeResponses(response: HttpResponse): AsyncIterable<StreamChunk> {
  const items = new Map<number, Item>(); const itemIds = new Set<string>(); const callIds = new Set<string>();
  let nextBlock = 0, sequence = -1, responseId: string | null = null;
  function itemFor(frame: Record<string, unknown>, expected?: Item["type"]): Item {
    const item = items.get(integer(frame.output_index, "output index"));
    if (!item || item.closed || (expected !== undefined && item.type !== expected)) return fail("event references an unknown, closed or incompatible output item");
    if (frame.item_id !== undefined && frame.item_id !== item.id) return fail("event item ID disagrees with output index");
    return item;
  }
  function partFor(frame: Record<string, unknown>): TextPart {
    const part = itemFor(frame, "message").parts.get(integer(frame.content_index, "content index"));
    if (!part || part.closed) return fail("event references an unknown or closed text part");
    return part;
  }
  function assertSnapshot(item: Item, raw: unknown): void {
    const value = object(raw);
    if (!value || value.id !== item.id || value.type !== item.type) return fail("output item snapshot identity mismatch");
    assertRepresentableItem(value);
    if (!["completed", "incomplete"].includes(String(value.status))) return fail("closed output item has no terminal status");
    if (item.type === "function_call") {
      if (value.status !== "completed") return fail("incomplete function call cannot be executed");
      if (value.call_id !== item.callId || value.name !== item.name || value.arguments !== item.arguments) return fail("function call snapshot disagrees with streamed arguments or identity");
    } else {
      if (value.role !== "assistant" || !Array.isArray(value.content) || value.content.length !== item.parts.size) return fail("message snapshot disagrees with content parts");
      value.content.forEach((rawPart, index) => {
        const part = object(rawPart), known = item.parts.get(index);
        if (!part || part.type !== "output_text" || !known || part.text !== known.text) return fail("message text snapshot mismatch");
        if (Array.isArray(part.annotations) && part.annotations.length) return fail("output annotations are unsupported");
      });
    }
  }
  for await (const event of sseEvents(response.body)) {
    let parsed: unknown; try { parsed = JSON.parse(event.data); } catch { return fail("event is not JSON"); }
    const frame = object(parsed); if (!frame) return fail("event is not an object");
    const type = string(frame.type, "event type", true);
    if (event.event !== null && event.event !== type) return fail("SSE and JSON event types disagree");
    if (frame.sequence_number !== undefined) {
      const current = integer(frame.sequence_number, "sequence number");
      if (current <= sequence) return fail("duplicate or out-of-order sequence number"); sequence = current;
    }
    if (frame.response_id !== undefined && responseId !== null && frame.response_id !== responseId) return fail("response ID changed mid-stream");
    if (["response.created", "response.in_progress", "response.queued"].includes(type)) {
      const value = object(frame.response); const id = string(value?.id, "response ID", true);
      if (responseId !== null && responseId !== id) return fail("response ID changed mid-stream"); responseId = id;
      continue;
    }
    if (type === "response.output_item.added") {
      const outputIndex = integer(frame.output_index, "output index"); const value = object(frame.item);
      if (!value || (value.type !== "message" && value.type !== "function_call")) {
        throw new LlmError("openai-responses emitted unsupported reasoning, media or hosted-tool output; this adapter supports text and function calls only", LLM_FAILURE_CODE.INVALID_REQUEST);
      }
      const id = string(value.id, "item ID", true);
      assertRepresentableItem(value);
      if (items.has(outputIndex) || itemIds.has(id)) return fail("duplicate output item"); itemIds.add(id);
      const item: Item = { id, outputIndex, type: value.type, closed: false, parts: new Map(), callId: "", name: "", arguments: "", argumentsDone: false, blockIndex: -1 };
      items.set(outputIndex, item);
      if (item.type === "message") {
        if (value.role !== "assistant" || !Array.isArray(value.content) || value.content.length !== 0) return fail("message must open as an empty assistant item");
      } else {
        item.callId = string(value.call_id, "function call ID", true); item.name = string(value.name, "function name", true);
        if (callIds.has(item.callId)) return fail("duplicate function call ID"); callIds.add(item.callId);
        item.arguments = string(value.arguments, "function arguments"); item.blockIndex = nextBlock++;
        yield { type: "block-start", index: item.blockIndex, blockKind: "tool_use" };
        yield { type: "tool-call-delta", index: item.blockIndex, id: toolCallId(item.callId), name: item.name, argumentsDelta: item.arguments };
      }
      continue;
    }
    if (type === "response.content_part.added") {
      const item = itemFor(frame, "message"), index = integer(frame.content_index, "content index"), part = object(frame.part);
      if (!part || part.type !== "output_text" || part.text !== "" || item.parts.has(index)) return fail("unsupported or duplicate content part");
      const state: TextPart = { index: nextBlock++, text: "", textDone: false, closed: false }; item.parts.set(index, state);
      yield { type: "block-start", index: state.index, blockKind: "text" }; continue;
    }
    if (type === "response.output_text.delta") {
      const part = partFor(frame); if (part.textDone) return fail("text delta follows completed text");
      if (Array.isArray(frame.logprobs) && frame.logprobs.length) return fail("output logprobs are unsupported");
      const delta = string(frame.delta, "text delta"); part.text += delta;
      yield { type: "text-delta", index: part.index, text: delta }; continue;
    }
    if (type === "response.output_text.done") {
      const part = partFor(frame);
      if (part.textDone || string(frame.text, "completed text") !== part.text) return fail("completed text disagrees with deltas");
      part.textDone = true; continue;
    }
    if (type === "response.content_part.done") {
      const part = partFor(frame), value = object(frame.part);
      if (!part.textDone || !value || value.type !== "output_text" || value.text !== part.text) return fail("content part closed before matching text completion");
      if (Array.isArray(value.annotations) && value.annotations.length) return fail("output annotations are unsupported");
      part.closed = true; yield { type: "block-end", index: part.index, block: { kind: "text", text: part.text } }; continue;
    }
    if (type === "response.function_call_arguments.delta") {
      const item = itemFor(frame, "function_call"); if (item.argumentsDone) return fail("arguments delta follows completion");
      const delta = string(frame.delta, "arguments delta"); item.arguments += delta;
      yield { type: "tool-call-delta", index: item.blockIndex, id: toolCallId(item.callId), argumentsDelta: delta }; continue;
    }
    if (type === "response.function_call_arguments.done") {
      const item = itemFor(frame, "function_call");
      if (item.argumentsDone || string(frame.arguments, "completed arguments") !== item.arguments) return fail("completed arguments disagree with deltas");
      item.argumentsDone = true; continue;
    }
    if (type === "response.output_item.done") {
      const item = itemFor(frame); assertSnapshot(item, frame.item);
      if (item.type === "function_call") {
        if (!item.argumentsDone) return fail("function item closed before arguments completion");
        yield { type: "block-end", index: item.blockIndex, block: { kind: "tool_use", id: toolCallId(item.callId), name: item.name, arguments: item.arguments } };
      } else if ([...item.parts.values()].some(part => !part.closed)) return fail("message closed with unfinished content");
      item.closed = true; continue;
    }
    if (["response.completed", "response.incomplete", "response.failed"].includes(type)) {
      const value = object(frame.response); if (!value) return fail("terminal event has no response");
      string(value.id, "terminal response ID", true);
      if (responseId !== null && value.id !== responseId) return fail("terminal response identity mismatch");
      const reported = usage(value.usage); if (reported !== null) yield { type: "usage", usage: reported };
      if (type === "response.failed") {
        yield { type: "finish", reason: { kind: "error", failure: { code: LLM_FAILURE_CODE.SERVER,
          message: typeof object(value.error)?.message === "string" ? String(object(value.error)?.message) : "OpenAI Responses failed" } } }; return;
      }
      const incomplete = type === "response.incomplete";
      const allClosed = [...items.values()].every(item => item.closed);
      if (incomplete && (object(value.incomplete_details)?.reason !== "max_output_tokens" || !allClosed || callIds.size > 0)) {
        yield { type: "finish", reason: { kind: "error", failure: { code: LLM_FAILURE_CODE.INVALID_REQUEST,
          message: "OpenAI Responses ended incomplete; partial output is not a completed tool call or answer" } } }; return;
      }
      if (value.status !== (incomplete ? "incomplete" : "completed") || !allClosed || !Array.isArray(value.output) || value.output.length !== items.size) return fail("terminal output is incomplete or disagrees with streamed items");
      value.output.forEach((output, index) => {
        const item = items.get(index); if (!item) return fail("terminal output index missing"); assertSnapshot(item, output);
        if (!incomplete && object(output)?.status !== "completed") return fail("completed response contains an incomplete output item");
      });
      // Missing usage stays missing: the shared grammar rejects this successful
      // finish with AMC_LLM_STREAM_USAGE_MISSING rather than inventing zeros.
      yield { type: "finish", reason: { kind: incomplete ? "max_tokens" : callIds.size > 0 ? "tool_calls" : "stop" } }; return;
    }
    if (type === "error") {
      yield { type: "finish", reason: { kind: "error", failure: { code: LLM_FAILURE_CODE.SERVER,
        message: typeof frame.message === "string" ? frame.message : "OpenAI Responses stream error" } } }; return;
    }
    // Only lifecycle events above are intentionally ignored. Unrecognized
    // content cannot disappear from an apparently successful signed response.
    return fail(`unsupported event type ${type}`);
  }
  return fail("connection ended before a terminal response event");
}
export const openaiResponsesAdapter: LlmAdapter = {
  id: OPENAI_RESPONSES_ADAPTER_ID, version: 1, encoderId: OPENAI_RESPONSES_ENCODER_ID, encoderVersion: 1,
  capabilities: OPENAI_RESPONSES_CAPABILITIES,
  envelope(input) {
    return { url: `${input.baseUrl}/v1/responses`, method: "POST", headers: { ...input.extraHeaders,
      "content-type": "application/json", accept: "text/event-stream",
      ...(input.credential === null ? {} : { authorization: `Bearer ${input.credential}` }) },
      body: input.body, ...(input.signal === undefined ? {} : { signal: input.signal }) };
  },
  decode: decodeResponses,
  describeFailure: input => openaiAdapter.describeFailure?.(input) ?? {}
};
