/** Independent DeepSeek Chat SSE decoder for the canonical native runtime.
 * https://api-docs.deepseek.com/api/create-chat-completion/ (2026-09-10)
 * Output is the existing AMC stream contract; no network, keys, policy or retry
 * decisions occur here. Completed tools are withheld until the terminal sentinel.
 */
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import { LlmStreamProtocolError } from "../streamProtocol.js";
import { toolCallId, type StreamChunk, type StreamTokenUsage, type FinishReason } from "../streamChunk.js";
import type { LlmAdapter, AdapterEnvelopeInput, AdapterFailureInput, AdapterFailureHint } from "../adapter/adapterTypes.js";
import { sseEvents } from "../adapter/sse.js";
import { DEEPSEEK_CAPABILITIES } from "../adapter/providerCapabilities.js";
import type { HttpRequest, HttpResponse } from "../adapter/transport.js";
import { assertDeepseekJson, deepseekObject, deepseekParams, DEEPSEEK_CHAT_ID, DEEPSEEK_CHAT_VERSION } from "./deepseekContract.js";
import { deepseekUsage } from "./deepseekUsage.js";

function fail(detail: string): never { throw new LlmError(`deepseek-chat stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!deepseekObject(value)) return fail(`invalid ${label}`);
  return value;
}
function text(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && (value.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(value)))) return fail(`invalid ${label}`);
  // JSON may escape a lone surrogate even on a valid UTF-8 wire. Persisting that
  // string as an AMC text payload would replace it, so refuse before publication.
  if (Buffer.from(value, "utf8").toString("utf8") !== value) return fail(`unrepresentable Unicode in ${label}`);
  return value;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unsupported ${label} field ${key}`);
}
interface ToolState { index: number; id: string; name: string; arguments: string }

/** Keep the existing shared SSE framing, but normalize its input across byte
 * boundaries. In particular a CR/LF split must not disappear from a delimiter.
 * Fatal UTF-8 avoids signing replacement text for malformed provider bytes.
 */
async function* normalizedSseBody(body: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let held = "";
  for await (const bytes of body) {
    let decoded: string;
    try { decoded = decoder.decode(bytes, { stream: true }); } catch { fail("malformed UTF-8"); }
    const combined = held + decoded;
    held = combined.endsWith("\r") ? "\r" : "";
    const ready = held ? combined.slice(0, -1) : combined;
    if (ready) yield Buffer.from(ready.replace(/\r\n|\r/g, "\n"), "utf8");
  }
  let tail: string;
  try { tail = held + decoder.decode(); } catch { fail("incomplete UTF-8"); }
  if (tail) yield Buffer.from(tail.replace(/\r\n|\r/g, "\n"), "utf8");
}

function terminalReason(reason: string, calls: number): FinishReason {
  if (reason === "content_filter" || reason === "insufficient_system_resource") return { kind: "error",
    failure: { code: reason === "content_filter" ? LLM_FAILURE_CODE.INVALID_REQUEST : LLM_FAILURE_CODE.SERVER,
      message: `DeepSeek stopped with ${reason}; this is not successful task completion` } };
  if (reason === "length" && calls > 0) return { kind: "error", failure: {
    code: LLM_FAILURE_CODE.INVALID_REQUEST, message: "DeepSeek truncated a function-call response; partial tools cannot execute" } };
  if (reason === "stop" && calls === 0) return { kind: "stop" };
  if (reason === "length") return { kind: "max_tokens" };
  if (reason === "tool_calls" && calls > 0) return { kind: "tool_calls" };
  return fail(`unsupported or inconsistent finish_reason ${reason}`);
}

export async function* decodeDeepseek(response: HttpResponse): AsyncIterable<StreamChunk> {
  if (response.status < 200 || response.status >= 300) fail("non-success HTTP response belongs to the shared failure classifier");
  const contentType = response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "text/event-stream") fail("expected text/event-stream");
  const tools = new Map<number, ToolState>(), ids = new Set<string>();
  let reasoning: string | null = null, content: string | null = null, phase = 0;
  let finish: string | null = null, usage: StreamTokenUsage | null = null;
  let responseId: string | null = null, model: string | null = null;
  for await (const event of sseEvents(normalizedSseBody(response.body))) {
    if (event.event !== null && event.event !== "message") fail("unsupported named SSE event");
    if (event.data === "[DONE]") {
      if (finish === null) fail("received [DONE] without finish_reason");
      const reason = terminalReason(finish, tools.size);
      if (reason.kind === "error") { yield { type: "finish", reason }; return; }
      if (usage === null) throw new LlmStreamProtocolError("AMC_LLM_STREAM_USAGE_MISSING", "DeepSeek successful response did not report usage");
      // Validate every call before closing any: a malformed sibling cannot turn
      // an earlier call into executable authority in a failed response.
      for (const call of tools.values()) {
        let parsed: unknown;
        try { parsed = JSON.parse(call.arguments); } catch { fail("function arguments are malformed JSON"); }
        if (!deepseekObject(parsed)) fail("function arguments must be an object");
        try { assertDeepseekJson(parsed); } catch { fail("function arguments contain non-finite JSON values"); }
      }
      if (reasoning !== null) yield { type: "block-end", index: 0, block: { kind: "thinking", text: reasoning } };
      if (content !== null) yield { type: "block-end", index: 1, block: { kind: "text", text: content } };
      for (const call of tools.values()) yield { type: "block-end", index: call.index + 2,
        block: { kind: "tool_use", id: toolCallId(call.id), name: call.name, arguments: call.arguments } };
      yield { type: "finish", reason }; return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(event.data); } catch { fail("SSE data is not JSON"); }
    const frame = object(parsed, "frame");
    if (frame.error !== undefined) {
      const error = object(frame.error, "in-band error");
      const reported = deepseekUsage(frame.usage);
      if (reported !== null) {
        if (usage !== null) fail("repeated usage");
        usage = reported; yield { type: "usage", usage };
      }
      yield { type: "finish", reason: { kind: "error", failure: { code: LLM_FAILURE_CODE.SERVER,
        message: typeof error.message === "string" ? error.message : "DeepSeek reported an in-band error" } } }; return;
    }
    if (finish !== null) fail("data arrived after finish_reason instead of [DONE]");
    const id = text(frame.id, "response id", true), currentModel = text(frame.model, "model", true);
    if ((responseId !== null && responseId !== id) || (model !== null && model !== currentModel)) fail("response identity changed mid-stream");
    responseId = id; model = currentModel;
    if (frame.object !== "chat.completion.chunk") fail("wrong completion object kind");
    if (!Array.isArray(frame.choices) || frame.choices.length !== 1) fail("exactly one completion choice is required");
    const choice = object(frame.choices[0], "choice");
    keys(choice, ["index", "delta", "finish_reason", "logprobs"], "choice");
    if (choice.index !== 0 || choice.logprobs != null) fail("multiple choices or output logprobs are unsupported");
    const delta = object(choice.delta, "delta");
    keys(delta, ["role", "content", "reasoning_content", "tool_calls"], "delta");
    if (delta.role !== undefined && delta.role !== "assistant") fail("non-assistant delta role");
    if (choice.finish_reason != null) finish = text(choice.finish_reason, "finish_reason", true);
    const reported = deepseekUsage(frame.usage);
    if (reported !== null) {
      if (finish === null || usage !== null) fail("usage must occur once on the final finish frame");
      usage = reported;
      // Emit known final usage now, even if [DONE] is subsequently lost or the
      // caller cancels. The shared recorder can retain counts on failed requests.
      yield { type: "usage", usage };
    }
    for (const key of ["reasoning_content", "content"] as const) {
      if (delta[key] == null) continue;
      const value = text(delta[key], key);
      if (finish !== null && value.length) fail("finish frame carries new content");
      if (value.length === 0 && phase > (key === "reasoning_content" ? 0 : 1)) continue;
      if (key === "reasoning_content") {
        if (phase > 0 && value.length) fail("reasoning followed text or tools and cannot be faithfully replayed");
        if (reasoning === null) { reasoning = ""; yield { type: "block-start", index: 0, blockKind: "thinking" }; }
        reasoning += value; yield { type: "thinking-delta", index: 0, text: value };
      } else {
        if (phase > 1 && value.length) fail("text followed tools and cannot be faithfully replayed");
        // A role/keepalive chunk often carries content:"" before any reasoning.
        // It has no text content and must not start the text phase prematurely.
        if (value.length === 0 && content === null) continue;
        phase = Math.max(phase, 1);
        if (content === null) { content = ""; yield { type: "block-start", index: 1, blockKind: "text" }; }
        content += value; yield { type: "text-delta", index: 1, text: value };
      }
    }
    if (delta.tool_calls == null) continue;
    if (!Array.isArray(delta.tool_calls)) fail("tool_calls is not an array");
    if (finish !== null && delta.tool_calls.length) fail("finish frame carries new tool content");
    for (const raw of delta.tool_calls) {
      phase = 2;
      const call = object(raw, "tool call");
      keys(call, ["index", "id", "type", "function"], "tool call");
      if (!Number.isSafeInteger(call.index) || (call.index as number) < 0) fail("invalid tool index");
      const index = call.index as number;
      const fn = object(call.function, "function"); keys(fn, ["name", "arguments"], "function");
      let state = tools.get(index);
      if (!state) {
        if (index !== tools.size || index >= 128 || call.type !== "function") fail("new tool indices must be contiguous and type function");
        const callId = text(call.id, "tool id", true), name = text(fn.name, "tool name", true);
        if (ids.has(callId) || !/^[A-Za-z0-9_-]{1,64}$/.test(name)) fail("duplicate tool ID or invalid wire name");
        ids.add(callId); state = { index, id: callId, name, arguments: "" }; tools.set(index, state);
        yield { type: "block-start", index: index + 2, blockKind: "tool_use" };
      }
      if ((call.id !== undefined && call.id !== state.id) || (call.type !== undefined && call.type !== "function")
          || (fn.name !== undefined && fn.name !== state.name)) fail("tool identity changed mid-stream");
      const fragment = text(fn.arguments, "function arguments fragment");
      state.arguments += fragment;
      yield { type: "tool-call-delta", index: index + 2, id: toolCallId(state.id), name: state.name, argumentsDelta: fragment };
    }
  }
  fail("connection ended before [DONE]");
}

/** Origin syntax only, NOT an SSRF policy. Runtime signed endpoint/transport
 * controls remain required; this function neither dials nor changes an allowlist.
 */
export function deepseekEnvelope(input: AdapterEnvelopeInput): HttpRequest {
  let url: URL;
  try { url = new URL(input.baseUrl); } catch { throw new LlmError("DeepSeek requires an explicit HTTP(S) origin", LLM_FAILURE_CODE.INVALID_REQUEST); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new LlmError("DeepSeek baseUrl must be a credential-free HTTP(S) origin, not a path or query", LLM_FAILURE_CODE.INVALID_REQUEST);
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.extraHeaders)) {
    const lower = key.toLowerCase();
    if (["authorization", "proxy-authorization", "x-api-key", "api-key", "content-type", "accept"].includes(lower)) {
      throw new LlmError("DeepSeek route headers cannot override credential or wire headers", LLM_FAILURE_CODE.INVALID_REQUEST);
    }
    if (Object.hasOwn(headers, lower)) throw new LlmError("DeepSeek route has duplicate header names", LLM_FAILURE_CODE.INVALID_REQUEST);
    headers[lower] = value;
  }
  if (input.credential !== null && (typeof input.credential !== "string" || !input.credential || /[\r\n]/.test(input.credential))) {
    throw new LlmError("DeepSeek resolved credential has an invalid header representation", LLM_FAILURE_CODE.INVALID_REQUEST);
  }
  return { url: `${url.origin}/chat/completions`, method: "POST", headers: { ...headers,
    "content-type": "application/json", accept: "text/event-stream",
    ...(input.credential === null ? {} : { authorization: `Bearer ${input.credential}` }) },
    body: input.body, ...(input.signal === undefined ? {} : { signal: input.signal }) };
}

export function deepseekFailure(input: AdapterFailureInput): AdapterFailureHint {
  const requestId = input.headers["x-request-id"] ?? input.headers["request-id"];
  let message: string | undefined;
  try { const frame: unknown = JSON.parse(input.bodyText);
    if (deepseekObject(frame) && deepseekObject(frame.error) && typeof frame.error.message === "string") message = frame.error.message;
  } catch { /* HTTP classification still works for a non-JSON error body. */ }
  // No code override: shared HTTP/quota/retry classification retains authority.
  return { ...(requestId === undefined ? {} : { requestId }), ...(message === undefined ? {} : { message }) };
}

/** Exact-version runtime registration pairs conditional admission with the
 * canonical offered-tool binder; endpoint/model behavior remains unprobed. */
export const deepseekAdapter: LlmAdapter = {
  id: DEEPSEEK_CHAT_ID, version: DEEPSEEK_CHAT_VERSION,
  encoderId: DEEPSEEK_CHAT_ID, encoderVersion: DEEPSEEK_CHAT_VERSION,
  capabilities: DEEPSEEK_CAPABILITIES,
  assertParams: params => { deepseekParams(params); },
  envelope: deepseekEnvelope, decode: decodeDeepseek, describeFailure: deepseekFailure
};
