import { randomUUID } from "node:crypto";
import type { AdapterEnvelopeInput, AdapterFailureInput, LlmAdapter } from "../adapter/adapterTypes.js";
import { OLLAMA_CAPABILITIES } from "../adapter/providerCapabilities.js";
import type { HttpRequest, HttpResponse } from "../adapter/transport.js";
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import { toolCallId, type StreamChunk, type StreamTokenUsage, type ToolUseContentBlock } from "../streamChunk.js";
import { OLLAMA_CHAT_ID, OLLAMA_CHAT_VERSION, ollamaOrigin, ollamaParams } from "./ollamaContract.js";
import { parseOllamaJson, type OllamaJsonNode } from "./ollamaJson.js";
import { ollamaCallKey } from "./ollamaToolIdentity.js";
import { ollamaUsage } from "./ollamaUsage.js";

function fail(detail: string): never { throw new LlmError(`Ollama stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT); }
function fields(node: OllamaJsonNode | undefined, allowed: readonly string[], label: string): ReadonlyMap<string, OllamaJsonNode> {
  if (!node?.fields || [...node.fields.keys()].some(key => !allowed.includes(key))) return fail(`unsupported or malformed ${label}`);
  return node.fields;
}
function text(value: unknown, label: string, identity = false): string {
  if (typeof value !== "string" || (identity && (!value.trim() || value.length > 512 || /[\u0000-\u0020\u007f]/.test(value)))) return fail(`invalid ${label}`);
  return value;
}
const METRICS = ["total_duration", "load_duration", "prompt_eval_count", "prompt_eval_cached_count", "prompt_eval_duration", "eval_count", "eval_duration"] as const;

/** Native NDJSON, not SSE. Bounded and fatal UTF-8 across arbitrary byte splits.
 * A final complete JSON record without LF is valid; partial/trailing data is not.
 */
async function* records(body: AsyncIterable<Uint8Array>): AsyncIterable<OllamaJsonNode> {
  // Keep BOM visible to the JSON parser instead of silently discarding bytes.
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let buffer = "", bytes = 0, count = 0;
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (bytes > 32 * 1024 * 1024) fail("response exceeds native byte bound");
    try { buffer += decoder.decode(chunk, { stream: true }); } catch { fail("invalid UTF-8"); }
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (++count > 65536) fail("NDJSON record bound exceeded");
      if (!/^[\x20\t\r]*$/.test(line)) yield parseOllamaJson(line);
    }
    if (Buffer.byteLength(buffer, "utf8") > 8 * 1024 * 1024) fail("incomplete NDJSON record exceeds its bound");
  }
  try { buffer += decoder.decode(); } catch { fail("truncated UTF-8"); }
  if (!/^[\x20\t\r]*$/.test(buffer)) {
    if (++count > 65536) fail("NDJSON record bound exceeded");
    yield parseOllamaJson(buffer);
  }
}

export function ollamaEnvelope(input: AdapterEnvelopeInput): HttpRequest {
  const origin = ollamaOrigin(input.baseUrl);
  const headers: Record<string, string> = Object.create(null);
  headers["content-type"] = "application/json"; headers.accept = "application/x-ndjson";
  const reserved = new Set(["content-type", "accept", "authorization", "proxy-authorization", "x-api-key", "api-key",
    "host", "content-length", "transfer-encoding", "connection", "cookie", "trailer", "upgrade", "te"]);
  for (const [name, value] of Object.entries(input.extraHeaders)) {
    const key = name.toLowerCase();
    if (reserved.has(key) || Object.hasOwn(headers, key) || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key)
        || typeof value !== "string" || /[\r\n\0]/.test(value)) {
      throw new LlmError("Ollama route headers cannot override transport/credential ownership", LLM_FAILURE_CODE.INVALID_REQUEST);
    }
    headers[key] = value;
  }
  if (input.credential !== null) {
    if (typeof input.credential !== "string" || !input.credential || /[\x00-\x20\x7f]/.test(input.credential)) {
      throw new LlmError("Ollama resolved credential has an invalid header representation", LLM_FAILURE_CODE.INVALID_CREDENTIAL);
    }
    headers.authorization = `Bearer ${input.credential}`;
  }
  return { method: "POST", url: `${origin}/api/chat`, headers, body: input.body,
    redirect: "error", cancelBodyOnReturn: true, ...(input.signal === undefined ? {} : { signal: input.signal }) };
}

/** Complete native tool objects arrive in chunks; arguments are NOT OpenAI
 * string deltas. All tools remain open until done:true, exact usage and EOF.
 * created_at is per chunk and may change; a local UUID labels the join scope,
 * never pretends to be a provider response ID and never enters request bytes.
 */
export async function* decodeOllama(response: HttpResponse): AsyncIterable<StreamChunk> {
  let usage: StreamTokenUsage | null = null, usagePublished = false;
  try {
    if (response.status < 200 || response.status >= 300
        || response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/x-ndjson") fail("expected successful application/x-ndjson");
    const stream = randomUUID(), tools: ToolUseContentBlock[] = [], ids = new Set<string>();
    let model: string | null = null, thinking: string | null = null, content: string | null = null, phase = 0;
    let terminal = false, reason: string | null = null;
    for await (const node of records(response.body)) {
      if (terminal) fail("data arrived after done:true");
      const frame = fields(node, ["model", "created_at", "message", "done", "done_reason", "error", ...METRICS], "record");
      if (frame.has("error")) {
        throw new LlmError(`Ollama reported an in-band error: ${text(frame.get("error")!.value, "error")}`, LLM_FAILURE_CODE.SERVER);
      }
      const currentModel = text(frame.get("model")?.value, "model", true);
      if (model !== null && model !== currentModel) fail("model identity changed mid-stream");
      model = currentModel;
      const timestamp = text(frame.get("created_at")?.value, "created_at", true);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) fail("invalid created_at");
      const done = frame.get("done")?.value;
      if (typeof done !== "boolean") fail("done must be explicit boolean");
      if (!done && (METRICS.some(name => frame.has(name)) || (frame.has("done_reason") && frame.get("done_reason")!.value !== ""))) fail("terminal metrics/reason arrived before done:true");
      if (done) {
        usage = ollamaUsage(node.value as Record<string, unknown>);
        for (const name of ["total_duration", "load_duration", "prompt_eval_duration", "eval_duration"]) {
          if (frame.has(name) && (!Number.isSafeInteger(frame.get(name)!.value) || (frame.get(name)!.value as number) < 0)) fail("invalid native duration");
        }
        reason = text(frame.get("done_reason")?.value, "done_reason", true);
      }
      const message = fields(frame.get("message"), ["role", "content", "thinking", "tool_calls"], "assistant message");
      if (message.get("role")?.value !== "assistant") fail("non-assistant output role");
      for (const key of ["thinking", "content"] as const) {
        if (!message.has(key)) continue;
        const delta = text(message.get(key)!.value, key);
        if (!delta.length) continue;
        if (key === "thinking") {
          if (phase > 0) fail("thinking followed content/tools; replay would reorder output");
          if (thinking === null) { thinking = ""; yield { type: "block-start", index: 0, blockKind: "thinking" }; }
          thinking += delta; yield { type: "thinking-delta", index: 0, text: delta };
        } else {
          if (phase > 1) fail("content followed tools; replay would reorder output");
          phase = 1;
          if (content === null) { content = ""; yield { type: "block-start", index: 1, blockKind: "text" }; }
          content += delta; yield { type: "text-delta", index: 1, text: delta };
        }
      }
      const toolCalls = message.get("tool_calls");
      if (toolCalls !== undefined && !toolCalls.items) fail("tool_calls must be an array");
      for (const callNode of toolCalls?.items ?? []) {
        phase = 2;
        const call = fields(callNode, ["function", "id", "type"], "tool call");
        const fn = fields(call.get("function"), ["name", "arguments", "index"], "tool function");
        const name = text(fn.get("name")?.value, "tool name", true), args = fn.get("arguments");
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(name) || !args?.fields || tools.length >= 128) fail("tool name/arguments/count is unsupported");
        const wireIndex = fn.has("index") ? fn.get("index")!.value : null;
        if (wireIndex !== null && wireIndex !== tools.length) fail("tool indices must preserve contiguous original order");
        if (fn.has("index") && wireIndex === null) fail("native tool index cannot be null");
        const wireType = call.has("type") ? call.get("type")!.value : null;
        if (call.has("type") && wireType !== "function") fail("unsupported native call type");
        const wireId = call.has("id") ? text(call.get("id")!.value, "native tool ID", true) : null;
        if (wireId !== null) { if (ids.has(wireId)) fail("duplicate provider tool ID"); ids.add(wireId); }
        const index = tools.length + 2;
        const id = toolCallId(ollamaCallKey({ stream, ordinal: tools.length, wireId,
          wireIndex: wireIndex as number | null, wireType: wireType as "function" | null }));
        tools.push({ kind: "tool_use", id, name, arguments: args.raw });
        yield { type: "block-start", index, blockKind: "tool_use" };
        yield { type: "tool-call-delta", index, id, name, argumentsDelta: args.raw };
      }
      if (done) { terminal = true; usagePublished = true; yield { type: "usage", usage: usage! }; }
    }
    if (!terminal || usage === null) fail("stream ended without done:true and complete reported usage");
    if (reason !== "stop" && reason !== "length") throw new LlmError(`Ollama finished with unsupported ${reason}; not successful generation`, LLM_FAILURE_CODE.INVALID_REQUEST);
    if (reason === "length" && tools.length) throw new LlmError("Ollama truncated a tool response; no tool authority was admitted", LLM_FAILURE_CODE.INVALID_REQUEST);
    if (thinking === null && content === null && !tools.length) throw new LlmError("Ollama completed without supported output", LLM_FAILURE_CODE.EMPTY_RESPONSE);
    if (thinking !== null) yield { type: "block-end", index: 0, block: { kind: "thinking", text: thinking } };
    if (content !== null) yield { type: "block-end", index: 1, block: { kind: "text", text: content } };
    for (const [ordinal, block] of tools.entries()) yield { type: "block-end", index: ordinal + 2, block };
    yield { type: "finish", reason: { kind: reason === "length" ? "max_tokens" : tools.length ? "tool_calls" : "stop" } };
  } catch (error) {
    if (usage !== null && !usagePublished) { usagePublished = true; yield { type: "usage", usage }; }
    if (error instanceof LlmError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    fail("malformed NDJSON or unsupported native call provenance");
  } finally { await response.close?.(); }
}

export const ollamaAdapter: LlmAdapter = Object.freeze({
  id: OLLAMA_CHAT_ID, version: OLLAMA_CHAT_VERSION,
  encoderId: OLLAMA_CHAT_ID, encoderVersion: OLLAMA_CHAT_VERSION,
  capabilities: OLLAMA_CAPABILITIES, assertParams: ollamaParams,
  envelope: ollamaEnvelope, decode: decodeOllama,
  describeFailure(input: AdapterFailureInput) {
    // Shared HTTP/retry classification retains authority; no local retry loop.
    try {
      const error = parseOllamaJson(input.bodyText).fields?.get("error")?.value;
      return typeof error === "string" ? { message: error } : {};
    } catch { return {}; }
  }
});
