import type { AdapterEnvelopeInput, LlmAdapter } from "../adapter/adapterTypes.js";
import { GEMINI_CAPABILITIES } from "../adapter/providerCapabilities.js";
import type { HttpRequest, HttpResponse } from "../adapter/transport.js";
import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import { toolCallId, type ContentBlock, type StreamChunk, type StreamTokenUsage } from "../streamChunk.js";
import { geminiCallKey, readGeminiPart, type GeminiPartMeta } from "../../session/geminiPartMeta.js";
import { GEMINI_CONTENT_ID, GEMINI_CONTENT_VERSION, geminiModel, geminiParams } from "./geminiContract.js";
import { parseGeminiJson, type GeminiJsonNode } from "./geminiJson.js";
import { geminiUsage } from "./geminiUsage.js";

function fail(detail: string): never { throw new LlmError(`Gemini stream: ${detail}`, LLM_FAILURE_CODE.TRANSPORT); }
function fields(node: GeminiJsonNode | undefined, allowed: readonly string[], label: string): ReadonlyMap<string, GeminiJsonNode> {
  if (!node?.fields || [...node.fields.keys()].some(key => !allowed.includes(key))) return fail(`unsupported or malformed ${label}`);
  return node.fields;
}
function identity(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) return fail("invalid response identity");
  return value;
}

function safetyRatings(node: GeminiJsonNode | undefined): void {
  if (node === undefined) return;
  if (!node.items) fail("safetyRatings must be an array");
  const categories = new Set<string>();
  for (const rating of node.items!) {
    const value = fields(rating, ["category", "probability", "blocked"], "safety rating");
    const category = identity(value.get("category")?.value), probability = value.get("probability")?.value;
    if (categories.has(category) || typeof probability !== "string"
        || !["HARM_PROBABILITY_UNSPECIFIED", "NEGLIGIBLE", "LOW", "MEDIUM", "HIGH"].includes(probability)) fail("invalid or duplicate safety rating");
    categories.add(category);
    const blocked = value.get("blocked")?.value;
    if (blocked !== undefined && typeof blocked !== "boolean") fail("invalid safety blocked flag");
    if (blocked === true) throw new LlmError("Gemini safety metadata blocked output; no tool authority was admitted", LLM_FAILURE_CODE.INVALID_REQUEST);
  }
}

/** Strict framing: fatal UTF-8, split CRLF, bounded memory and no discarded
 * trailing frame. GenerateContent has no Chat [DONE] sentinel.
 */
async function* frames(body: AsyncIterable<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", held = "", bytes = 0, count = 0;
  const data = (frame: string): string | null => {
    const lines: string[] = []; let event: string | undefined;
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":"), name = colon < 0 ? line : line.slice(0, colon);
      const raw = colon < 0 ? "" : line.slice(colon + 1), value = raw.startsWith(" ") ? raw.slice(1) : raw;
      if (name === "data") lines.push(value);
      else if (name === "event") { if (event !== undefined) fail("repeated SSE event name"); event = value; }
      else if (!["id", "retry"].includes(name)) fail("unsupported SSE field");
    }
    if (event !== undefined && event !== "message") fail("unsupported SSE event");
    return lines.length === 0 ? null : lines.join("\n");
  };
  for await (const chunk of body) {
    bytes += chunk.byteLength; if (bytes > 32 * 1024 * 1024) fail("response exceeds native byte bound");
    let decoded: string;
    try { decoded = held + decoder.decode(chunk, { stream: true }); } catch { return fail("malformed UTF-8"); }
    held = decoded.endsWith("\r") ? "\r" : "";
    buffer += (held ? decoded.slice(0, -1) : decoded).replace(/\r\n|\r/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      if (end > 8 * 1024 * 1024 || ++count > 16384) fail("SSE framing bound exceeded");
      const result = data(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
      if (result !== null) yield result;
    }
    if (buffer.length > 8 * 1024 * 1024) fail("incomplete SSE frame exceeds its bound");
  }
  try { buffer += (held + decoder.decode()).replace(/\r\n|\r/g, "\n"); } catch { return fail("truncated UTF-8"); }
  // A CR held at the final byte can finish the delimiter.
  let end: number;
  while ((end = buffer.indexOf("\n\n")) !== -1) {
    if (++count > 16384) fail("SSE frame count exceeded");
    const result = data(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
    if (result !== null) yield result;
  }
  if (buffer.trim().length !== 0) fail("trailing incomplete SSE frame");
}

function envelope(input: AdapterEnvelopeInput): HttpRequest {
  const origin = new URL(input.baseUrl);
  if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
    throw new LlmError("Gemini baseUrl must be an HTTP(S) origin without credentials, path, query or fragment", LLM_FAILURE_CODE.INVALID_REQUEST);
  }
  const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream" };
  const reserved = new Set(["content-type", "accept", "authorization", "x-goog-api-key", "host", "content-length", "transfer-encoding", "connection", "cookie"]);
  for (const [name, value] of Object.entries(input.extraHeaders)) {
    const key = name.toLowerCase();
    if (reserved.has(key) || headers[key] !== undefined || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key) || /[\r\n\0]/.test(value)) {
      throw new LlmError("Gemini route headers cannot override transport or credential ownership", LLM_FAILURE_CODE.INVALID_REQUEST);
    }
    headers[key] = value;
  }
  if (input.credential !== null) {
    if (!input.credential || /[\x00-\x20\x7f]/.test(input.credential)) throw new LlmError("Gemini credential is malformed", LLM_FAILURE_CODE.INVALID_CREDENTIAL);
    headers["x-goog-api-key"] = input.credential;
  }
  return { method: "POST", url: `${origin.origin}/v1beta/models/${encodeURIComponent(geminiModel(input.model))}:streamGenerateContent?alt=sse`,
    headers, body: input.body, redirect: "error", cancelBodyOnReturn: true,
    ...(input.signal === undefined ? {} : { signal: input.signal }) };
}

async function* decodeGeminiBody(response: HttpResponse, readUsage: (value: unknown) => StreamTokenUsage): AsyncIterable<StreamChunk> {
  if (response.status < 200 || response.status >= 300 || response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "text/event-stream") fail("expected a successful text/event-stream response");
  let responseId: string | null = null, modelVersion: string | null = null, finish: string | null = null;
  let usage: StreamTokenUsage | null = null, finalUsage = false, usagePublished = false;
  const blocks: ContentBlock[] = [], callIds = new Set<string>();
  try {
    for await (const data of frames(response.body)) {
      const tree = parseGeminiJson(data);
      const frame = fields(tree, ["candidates", "usageMetadata", "modelVersion", "responseId", "promptFeedback", "modelStatus", "error"], "response");
      if (frame.has("error")) throw new LlmError("Gemini returned an in-band API error; no tool authority was admitted", LLM_FAILURE_CODE.SERVER);
      if (frame.has("responseId")) {
        const id = identity(frame.get("responseId")!.value);
        if (responseId !== null && responseId !== id) fail("responseId changed mid-stream"); responseId = id;
      }
      if (frame.has("modelVersion")) {
        const model = identity(frame.get("modelVersion")!.value);
        if (modelVersion !== null && modelVersion !== model) fail("modelVersion changed mid-stream"); modelVersion = model;
      }
      if (frame.has("modelStatus")) {
        const status = fields(frame.get("modelStatus"), ["modelStage", "retirementTime", "message"], "model status");
        const stage = status.get("modelStage")?.value;
        if (stage !== undefined && (typeof stage !== "string" || !["MODEL_STAGE_UNSPECIFIED", "UNSTABLE_EXPERIMENTAL", "EXPERIMENTAL", "PREVIEW", "STABLE", "LEGACY"].includes(stage))) fail("unusable or unsupported model stage");
        if (status.has("message") && typeof status.get("message")!.value !== "string") fail("invalid model status message");
        if (status.has("retirementTime") && (typeof status.get("retirementTime")!.value !== "string"
            || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(status.get("retirementTime")!.value as string))) fail("invalid model retirement timestamp");
      }
      if (frame.has("promptFeedback")) {
        const feedback = fields(frame.get("promptFeedback"), ["blockReason", "safetyRatings"], "prompt feedback");
        if (feedback.has("blockReason") && feedback.get("blockReason")!.value !== "BLOCK_REASON_UNSPECIFIED") throw new LlmError("Gemini blocked the prompt; this is not successful completion", LLM_FAILURE_CODE.INVALID_REQUEST);
        safetyRatings(feedback.get("safetyRatings"));
      }
      const candidates = frame.get("candidates");
      if (candidates !== undefined && (!candidates.items || candidates.items.length > 1)) fail("exactly one candidate is supported");
      for (const candidateNode of candidates?.items ?? []) {
        if (finish !== null) fail("candidate data arrived after terminal finishReason");
        const candidate = fields(candidateNode, ["index", "content", "finishReason", "finishMessage", "safetyRatings", "tokenCount", "avgLogprobs"], "candidate");
        if (candidate.has("index") && candidate.get("index")!.value !== 0) fail("unsupported candidate index");
        if (candidate.has("tokenCount") && (!Number.isSafeInteger(candidate.get("tokenCount")!.value) || (candidate.get("tokenCount")!.value as number) < 0)) fail("invalid candidate tokenCount");
        if (candidate.has("avgLogprobs") && typeof candidate.get("avgLogprobs")!.value !== "number") fail("invalid average log probability");
        if (candidate.has("finishMessage") && (!candidate.has("finishReason") || typeof candidate.get("finishMessage")!.value !== "string")) fail("invalid finish message");
        safetyRatings(candidate.get("safetyRatings"));
        const content = candidate.get("content");
        if (content !== undefined) {
          const value = fields(content, ["role", "parts"], "content");
          if (value.get("role")?.value !== "model" || !value.get("parts")?.items) fail("content requires model role and parts array");
          for (const part of value.get("parts")!.items!) {
            if (responseId === null || blocks.length >= 4096) fail("part lacks response identity or exceeds native count bound");
            const meta: GeminiPartMeta = Object.freeze({ version: 1, responseId, partIndex: blocks.length, partJson: part.raw });
            const checked = readGeminiPart(meta), fn = checked.fields!.get("functionCall");
            const index = blocks.length;
            if (fn) {
              const id = geminiCallKey(meta, fn);
              if (callIds.has(id)) fail("duplicate function-call identity"); callIds.add(id);
              const name = fn.fields!.get("name")!.value as string, args = fn.fields!.get("args")?.raw ?? "{}";
              const block = { kind: "tool_use" as const, id: toolCallId(id), name, arguments: args, gemini: meta };
              blocks.push(block);
              yield { type: "block-start", index, blockKind: "tool_use" };
              yield { type: "tool-call-delta", index, id: block.id, name, argumentsDelta: args, gemini: meta };
            } else {
              const text = (checked.fields!.get("text")?.value ?? "") as string;
              const kind = checked.fields!.get("thought")?.value === true || !checked.fields!.has("text") ? "thinking" : "text";
              blocks.push({ kind, text, gemini: meta });
              yield { type: "block-start", index, blockKind: kind };
              yield { type: kind === "text" ? "text-delta" : "thinking-delta", index, text, gemini: meta };
            }
          }
        }
        if (candidate.has("finishReason")) {
          const reason = candidate.get("finishReason")!.value;
          if (typeof reason !== "string" || !reason || reason === "FINISH_REASON_UNSPECIFIED") fail("invalid terminal finishReason");
          finish = reason;
        }
      }
      if (frame.has("usageMetadata")) {
        const next = readUsage(frame.get("usageMetadata")!.value);
        if (usage !== null && (next.inputTokens + (next.cacheReadTokens ?? 0) < usage.inputTokens + (usage.cacheReadTokens ?? 0)
            || next.outputTokens < usage.outputTokens || (usage.cacheReadTokens !== undefined && (next.cacheReadTokens === undefined || next.cacheReadTokens < usage.cacheReadTokens))
            || (usage.reasoningTokens !== undefined && (next.reasoningTokens === undefined || next.reasoningTokens < usage.reasoningTokens)))) fail("cumulative usage regressed or lost reported fields");
        usage = next; if (finish !== null) finalUsage = true;
      }
    }
    if (finish === null) fail("stream ended without finishReason");
    if (usage === null || !finalUsage) fail("terminal response omitted complete reported usage");
    usagePublished = true; yield { type: "usage", usage };
    if (!["STOP", "MAX_TOKENS"].includes(finish)) {
      yield { type: "finish", reason: { kind: "error", failure: { code: LLM_FAILURE_CODE.INVALID_REQUEST,
        message: `Gemini finished with ${finish}; unsupported, blocked or malformed output is not successful task completion` } } }; return;
    }
    if (blocks.length === 0) throw new LlmError("Gemini completed without supported content", LLM_FAILURE_CODE.EMPTY_RESPONSE);
    // Every part, sibling call, terminal usage and trailing frame was checked.
    // Until this point tools remained OPEN and therefore non-executable.
    for (const [index, block] of blocks.entries()) yield { type: "block-end", index, block };
    yield { type: "finish", reason: { kind: finish === "MAX_TOKENS" ? "max_tokens" : callIds.size > 0 ? "tool_calls" : "stop" } };
  } catch (error) {
    if (!usagePublished && usage !== null) { usagePublished = true; yield { type: "usage", usage }; }
    if (error instanceof LlmError) throw error;
    fail("malformed JSON or unsupported part provenance");
  }
}

export async function* decodeGemini(response: HttpResponse): AsyncIterable<StreamChunk> {
  yield* decodeGeminiWithUsage(response, geminiUsage);
}

/** Versioned adapters share the exact raw-Part/EOF/tool/cancellation parser.
 * Only their explicitly supported usage modalities differ. */
export async function* decodeGeminiWithUsage(response: HttpResponse, readUsage: (value: unknown) => StreamTokenUsage): AsyncIterable<StreamChunk> {
  try { yield* decodeGeminiBody(response, readUsage); }
  finally { await response.close?.(); }
}

export const geminiAdapter: LlmAdapter = {
  id: GEMINI_CONTENT_ID, version: GEMINI_CONTENT_VERSION,
  encoderId: GEMINI_CONTENT_ID, encoderVersion: GEMINI_CONTENT_VERSION,
  capabilities: GEMINI_CAPABILITIES, assertParams: geminiParams, envelope, decode: decodeGemini,
  describeFailure: input => {
    const requestId = input.headers["x-request-id"] ?? input.headers["x-goog-request-id"];
    return requestId === undefined ? {} : { requestId };
  }
};
