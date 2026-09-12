/** AMC-owned DeepSeek Chat wire contract, documentation retrieved 2026-09-10.
 * https://api-docs.deepseek.com/guides/thinking_mode/
 * https://api-docs.deepseek.com/api/create-chat-completion/
 * Native source contract; model/endpoint behavior still requires qualification.
 */
import { RequestEncodingError } from "../request/requestSpec.js";

export const DEEPSEEK_CHAT_ID = "deepseek-chat";
export const DEEPSEEK_CHAT_VERSION = 1;

/** Wire limitations complement the runtime's conditional ProviderCapabilities;
 * this declaration is not live-provider or installed-package acceptance. */
export const DEEPSEEK_WIRE_CONTRACT = Object.freeze({
  protocol: "deepseek-chat-completions",
  input: "text-and-function-history",
  output: "text-thinking-and-function-calls",
  thinkingReplay: "full-assistant-text-only-when-nonempty-tools",
  toolErrors: "amc-text-envelope-v1",
  usage: "reported-required",
  cache: "automatic-read-usage-no-write-count",
  modelSupport: "not-probed",
  integration: "native-runtime"
} as const);

export function deepseekObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Refuse JSON's lossy cases rather than signing a different input. */
export function assertDeepseekJson(value: unknown, path = "request", ancestors = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || ancestors.has(value)) {
    throw new RequestEncodingError(`DeepSeek ${path} is not finite, acyclic JSON`);
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new RequestEncodingError(`DeepSeek ${path} requires plain JSON objects`);
  }
  if (Object.getOwnPropertySymbols(value).length) throw new RequestEncodingError(`DeepSeek ${path} contains symbol keys`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw new RequestEncodingError(`DeepSeek ${path} contains a sparse array`);
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !("value" in descriptor)) throw new RequestEncodingError(`DeepSeek ${path} contains an accessor`);
      assertDeepseekJson(descriptor.value, `${path}[${i}]`, ancestors);
    }
    if (Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) {
      throw new RequestEncodingError(`DeepSeek ${path} contains non-index array properties`);
    }
  } else {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new RequestEncodingError(`DeepSeek ${path} contains an accessor`);
      assertDeepseekJson(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function assertDeepseekKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new RequestEncodingError(`DeepSeek ${label}.${key} is unsupported; it will not be silently dropped`);
  }
}

const PARAMS = ["max_tokens", "thinking", "reasoning_effort", "tool_choice", "stop", "response_format",
  "temperature", "top_p", "presence_penalty", "frequency_penalty"] as const;

/** Raw HTTP body params, not OpenAI SDK extra_body. Defaults are emitted explicitly
 * so upstream default changes cannot alter an unchanged recorded request's intent.
 */
export function deepseekParams(params: Record<string, unknown>): Record<string, unknown> {
  if (!deepseekObject(params)) throw new RequestEncodingError("DeepSeek params must be an object");
  assertDeepseekJson(params, "params");
  assertDeepseekKeys(params, PARAMS, "params");
  if (!Number.isSafeInteger(params.max_tokens) || (params.max_tokens as number) <= 0) {
    throw new RequestEncodingError("DeepSeek requires an explicit positive safe-integer max_tokens budget");
  }
  const thinking = params.thinking ?? { type: "enabled" };
  if (params.thinking === null || !deepseekObject(thinking) || (thinking.type !== "enabled" && thinking.type !== "disabled")) {
    throw new RequestEncodingError("DeepSeek thinking must be {type: enabled} or {type: disabled}");
  }
  assertDeepseekKeys(thinking, ["type"], "thinking");
  const enabled = thinking.type === "enabled";
  if (params.reasoning_effort !== undefined && (!enabled || typeof params.reasoning_effort !== "string" || !["low", "high", "max"].includes(params.reasoning_effort))) {
    throw new RequestEncodingError("DeepSeek reasoning_effort requires enabled thinking and exact low/high/max; remapped aliases are refused");
  }
  for (const key of ["presence_penalty", "frequency_penalty"] as const) {
    if (params[key] !== undefined) throw new RequestEncodingError(`DeepSeek ignores deprecated ${key} in every mode; remove it`);
  }
  for (const key of ["temperature", "top_p"] as const) {
    const value = params[key];
    if (value === undefined) continue;
    if (enabled) throw new RequestEncodingError(`DeepSeek ignores ${key} in thinking mode; remove it or explicitly disable thinking`);
    const max = key === "top_p" ? 1 : 2;
    if (typeof value !== "number" || value < 0 || value > max) throw new RequestEncodingError(`DeepSeek ${key} is outside its documented range`);
  }
  if (params.stop !== undefined) {
    const stops = typeof params.stop === "string" ? [params.stop] : params.stop;
    if (!Array.isArray(stops) || stops.length === 0 || stops.length > 16 || stops.some(s => typeof s !== "string" || s.length === 0)) {
      throw new RequestEncodingError("DeepSeek stop requires a nonempty string or up to 16 nonempty strings");
    }
  }
  if (params.response_format !== undefined) {
    const format = params.response_format;
    if (!deepseekObject(format) || (format.type !== "text" && format.type !== "json_object")) {
      throw new RequestEncodingError("DeepSeek response_format supports text/json_object only");
    }
    assertDeepseekKeys(format, ["type"], "response_format");
  }
  return { ...params, thinking: { type: thinking.type }, ...(enabled ? { reasoning_effort: params.reasoning_effort ?? "high" } : {}) };
}
