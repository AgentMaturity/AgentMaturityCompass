/** Native Ollama REST contract, official wire docs retrieved 2026-09-11:
 * https://docs.ollama.com/api/chat
 * https://docs.ollama.com/capabilities/tool-calling
 * https://docs.ollama.com/capabilities/vision
 * https://github.com/ollama/ollama/blob/main/api/types.go
 * Protocol implementation is not qualification of a particular server/model.
 */
import { RequestEncodingError } from "../request/requestSpec.js";
import { assertOllamaJsonValue } from "./ollamaJson.js";

export const OLLAMA_CHAT_ID = "ollama-chat";
export const OLLAMA_CHAT_VERSION = 1;
export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434";
export const OLLAMA_WIRE_CONTRACT = Object.freeze({
  protocol: "ollama-chat", endpoint: "/api/chat", framing: "application/x-ndjson",
  orderedInput: "one-user-message-per-signed-part",
  imageMimeTypes: Object.freeze(["image/png", "image/jpeg", "image/webp"] as const),
  imageBytes: "original-base64-no-fetch-or-conversion", audio: "unsupported",
  thinkingReplay: "full-text-before-content-and-tools",
  toolIdentity: "labelled-native-join-key-with-optional-original-wire-id",
  toolArguments: "original-json-object-substring", toolErrors: "amc-text-envelope-v1",
  toolCompletion: "all-calls-terminal-usage-and-eof-before-authority",
  usage: "reported-required", cache: "optional-reported-read-no-invented-write",
  budgetParameter: "max_tokens-maps-to-options.num_predict-with-conflicts-refused",
  modelSupport: "not-probed"
} as const);

export function ollamaFail(detail: string): never { throw new RequestEncodingError(`Ollama request: ${detail}`); }
export function ollamaObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function ollamaKeys(value: unknown, allowed: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!ollamaObject(value)) ollamaFail(`${label} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !allowed.includes(key) || !("value" in descriptor) || !descriptor.enumerable) {
      ollamaFail(`${label} has an unsupported, hidden or active field; nothing was discarded`);
    }
  }
}
export function ollamaText(value: unknown, label: string, identity = false): string {
  if (typeof value !== "string" || Buffer.from(value, "utf8").toString("utf8") !== value
      || (identity && (!value.trim() || value.length > 512 || /[\u0000-\u0020\u007f]/.test(value)))) ollamaFail(`invalid ${label}`);
  return value;
}
export function ollamaArray(value: unknown, label: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) ollamaFail(`${label} requires a bounded array`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) ollamaFail(`${label} must be dense passive data`);
  }
  if (Reflect.ownKeys(value).some(key => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)
      || Number(key) >= value.length))) ollamaFail(`${label} has extra fields`);
  return value;
}

/** Syntax validation only; deployment egress policy remains the runtime's job. */
export function ollamaOrigin(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return ollamaFail("baseUrl requires an explicit HTTP(S) origin"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    ollamaFail("baseUrl must be an HTTP(S) origin, not a compatibility path, credential, query or fragment");
  }
  return url.origin;
}

/** Reject unsupported aliases rather than let the server silently ignore them.
 * The sole AMC budget alias is explicit and reproducible from the signed header.
 */
export function ollamaParams(params: Record<string, unknown>): Record<string, unknown> {
  ollamaKeys(params, ["max_tokens", "options", "stream", "think", "format", "keep_alive"], "params");
  try { assertOllamaJsonValue(params); } catch { ollamaFail("params are not lossless JSON"); }
  if (params.stream !== undefined && params.stream !== true) ollamaFail("stream must be true; this adapter speaks NDJSON");
  const options = params.options ?? {};
  if (params.options === null) ollamaFail("options cannot be null");
  ollamaKeys(options, ["num_predict", "num_ctx", "seed", "temperature", "top_k", "top_p", "min_p", "typical_p",
    "repeat_last_n", "repeat_penalty", "presence_penalty", "frequency_penalty", "stop"], "options");
  const limit = params.max_tokens ?? options.num_predict;
  if (!Number.isSafeInteger(limit) || (limit as number) <= 0) ollamaFail("an explicit positive max_tokens or options.num_predict budget is required");
  if (params.max_tokens !== undefined && options.num_predict !== undefined && params.max_tokens !== options.num_predict) ollamaFail("max_tokens and options.num_predict disagree");
  if (params.max_tokens === null) ollamaFail("max_tokens cannot be null");
  for (const name of ["num_ctx", "top_k"] as const) {
    if (options[name] !== undefined && (!Number.isSafeInteger(options[name]) || (options[name] as number) <= 0)) ollamaFail(`${name} must be a positive integer`);
  }
  for (const name of ["seed", "repeat_last_n"] as const) {
    if (options[name] !== undefined && (!Number.isSafeInteger(options[name]) || (options[name] as number) < -1)) ollamaFail(`${name} must be an integer >= -1`);
  }
  for (const name of ["temperature", "repeat_penalty", "presence_penalty", "frequency_penalty", "top_p", "min_p", "typical_p"] as const) {
    const number = options[name];
    if (number === undefined) continue;
    if (typeof number !== "number" || !Number.isFinite(number)) ollamaFail(`${name} must be finite`);
    if (["top_p", "min_p", "typical_p"].includes(name) && (number < 0 || number > 1)) ollamaFail(`${name} must be in [0,1]`);
    if (["temperature", "repeat_penalty"].includes(name) && number < 0) ollamaFail(`${name} cannot be negative`);
  }
  if (options.stop !== undefined) {
    const stops = ollamaArray(options.stop, "stop", 64);
    if (!stops.length || stops.some(stop => typeof stop !== "string" || !stop)) ollamaFail("stop needs nonempty strings");
  }
  if (params.think !== undefined && typeof params.think !== "boolean"
      && !["low", "medium", "high", "max"].includes(params.think as string)) ollamaFail("think requires a boolean or exact low/medium/high/max");
  if (params.format !== undefined && params.format !== "json" && !ollamaObject(params.format)) ollamaFail("format requires json or a JSON Schema object");
  if (params.keep_alive !== undefined) {
    const keep = params.keep_alive;
    if (!(typeof keep === "number" && Number.isSafeInteger(keep) && keep >= -1)
        && !(typeof keep === "string" && /^(?:-1|0|(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+)$/.test(keep))) ollamaFail("keep_alive requires seconds or a bounded duration string");
    if (typeof keep === "string" && keep.length > 64) ollamaFail("keep_alive duration exceeds its bound");
  }
  const { max_tokens: _budget, ...wire } = params;
  return { ...wire, options: { ...options, num_predict: limit }, stream: true };
}
