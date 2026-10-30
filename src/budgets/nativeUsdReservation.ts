import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { BudgetsConfig } from "./budgets.js";

export interface NativeBudgetDispatch { readonly url: string; readonly body: Buffer }
type Budget = BudgetsConfig["budgets"]["perAgent"][string];
const PARAMETERS = new Set(["max_tokens", "max_completion_tokens", "max_output_tokens", "temperature", "top_p", "stop", "seed",
  "frequency_penalty", "presence_penalty", "logit_bias", "response_format", "user", "parallel_tool_calls", "tool_choice", "stream", "stream_options"]);
const TEXT_PARTS: Readonly<Record<string, ReadonlySet<string>>> = {
  "openai-chat": new Set(["text"]),
  "openai-responses": new Set(["input_text", "output_text"]),
  "anthropic-messages": new Set(["text", "tool_use", "tool_result"])
};
function isCacheMarker(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 1 && (value as Record<string, unknown>).type === "ephemeral";
}
function hasMedia(value: unknown, allowed?: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some(part => hasMedia(part, allowed));
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (allowed && row.type !== undefined && (typeof row.type !== "string" || !allowed.has(row.type))) return true;
  return Object.entries(row).some(([key, part]) => /(_url|file|source)$/i.test(key)
    || ["image", "audio", "video", "input_audio", "file_id", "file_data"].includes(key)
    || (allowed && key === "cache_control"
      ? allowed !== TEXT_PARTS["anthropic-messages"] || !isCacheMarker(part)
      : hasMedia(part, allowed)));
}
function textOnlyContent(value: unknown, encoderId: string): boolean {
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) return false;
  const allowed = TEXT_PARTS[encoderId];
  return value.every(part => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    const row = part as Record<string, unknown>;
    if (typeof row.type !== "string" || !allowed?.has(row.type)) return false;
    if (row.type === "tool_result") return textOnlyContent(row.content, "openai-chat");
    if (row.type === "tool_use") return !!row.input && typeof row.input === "object" && !Array.isArray(row.input)
      && (row.content === undefined || textOnlyContent(row.content, "openai-chat"));
    return typeof row.text === "string";
  }) && !hasMedia(value, allowed);
}
function textOnlyRequest(wire: Record<string, unknown>, encoderId: string): boolean {
  if (encoderId === "openai-responses" && wire.instructions !== undefined && typeof wire.instructions !== "string") return false;
  if (encoderId === "anthropic-messages" && wire.system !== undefined && !textOnlyContent(wire.system, encoderId)) return false;
  const messages = encoderId === "openai-responses" ? wire.input : wire.messages;
  if (encoderId === "openai-responses" && typeof messages === "string") return true;
  if (!Array.isArray(messages)) return false;
  return messages.every(message => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const row = message as Record<string, unknown>;
    if (encoderId === "openai-responses" && row.type === "function_call") return typeof row.arguments === "string" && row.content === undefined;
    if (encoderId === "openai-responses" && row.type === "function_call_output") return typeof row.output === "string" && row.content === undefined;
    if (row.type !== undefined && !(encoderId === "openai-responses" && row.type === "message")) return false;
    if (row.tool_calls !== undefined && (encoderId !== "openai-chat" || !Array.isArray(row.tool_calls)
      || row.tool_calls.some(call => !call || call.type !== "function" || typeof call.function?.arguments !== "string"))) return false;
    return (encoderId === "openai-chat" && row.role === "assistant" && row.content === null && Array.isArray(row.tool_calls))
      || textOnlyContent(row.content, encoderId);
  });
}

/** No price is inferred here. The signed policy attests a ceiling for every request within these byte/output limits. */
export function nativeUsdReservation(budget: Budget, headerJson: string, dispatch: NativeBudgetDispatch | undefined, now: number) {
  const header = parseRequestHeaderMeta(headerJson);
  if (!header || !dispatch || sha256Hex(dispatch.body) !== header.requestDigest) throw new Error("USD reservation requires the exact signed request bytes");
  const bounds = budget.nativeUsdBounds?.filter(bound => bound.providerId === header.providerId && bound.model === header.model
    && bound.encoderId === header.encoderId && bound.encoderVersion === header.encoderVersion && bound.endpoint === dispatch.url) ?? [];
  if (bounds.length !== 1) throw new Error("USD request bound is missing or ambiguous; indicative catalog prices are not upper bounds");
  const bound = bounds[0]!;
  if (Date.parse(bound.expiresAt) <= now || dispatch.body.length > bound.maxRequestBytes) throw new Error("USD request bound is expired or its byte ceiling is exceeded");
  const body: unknown = JSON.parse(dispatch.body.toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("USD request body is invalid");
  const wire = body as Record<string, unknown>;
  const outputKey = header.encoderId === "openai-chat" ? (wire.max_completion_tokens === undefined ? "max_tokens" : "max_completion_tokens")
    : header.encoderId === "openai-responses" ? "max_output_tokens" : header.encoderId === "anthropic-messages" ? "max_tokens" : null;
  const structural = header.encoderId === "openai-chat" ? ["model", "messages", "tools"]
    : header.encoderId === "openai-responses" ? ["model", "input", "instructions", "tools", "store"] : ["model", "messages", "system", "tools"];
  if (outputKey === null || wire.model !== header.model || Object.keys(header.params).some(key => !PARAMETERS.has(key))
    || Object.keys(wire).some(key => !PARAMETERS.has(key) && !structural.includes(key))) throw new Error("USD request bound does not cover this encoder or billing parameter");
  const output = wire[outputKey];
  if (typeof output !== "number" || !Number.isSafeInteger(output) || output <= 0 || output > bound.maxOutputTokens
    || (wire.max_tokens !== undefined && wire.max_completion_tokens !== undefined)) throw new Error("USD request bound requires an explicit covered output limit");
  // Reject hosted tools and media rather than silently applying a standard text tariff.
  if (hasMedia(wire) || !textOnlyRequest(wire, header.encoderId) || (Array.isArray(wire.tools) && wire.tools.some(value => {
    const tool = value as Record<string, unknown> | null;
    return !tool || (header.encoderId !== "anthropic-messages" && tool.type !== "function") || (header.encoderId === "anthropic-messages" && (tool.type !== undefined || (tool.cache_control !== undefined && !isCacheMarker(tool.cache_control))));
  }))) throw new Error("USD request bound does not cover media or hosted tools");
  return { reservedCostUsd: bound.maxCostUsd, usdBoundDigest: sha256Hex(canonicalize(bound)), usdBoundSource: bound.source,
    usdBoundExpiresAt: bound.expiresAt, usdBoundBasis: "auditor-attested-request-ceiling" as const };
}
