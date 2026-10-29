import { parseRequestHeaderMeta } from "../session/requestHeaderMeta.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { BudgetsConfig } from "./budgets.js";

export interface NativeBudgetDispatch { readonly url: string; readonly body: Buffer }
type Budget = BudgetsConfig["budgets"]["perAgent"][string];
const PARAMETERS = new Set(["max_tokens", "max_completion_tokens", "max_output_tokens", "temperature", "top_p", "stop", "seed",
  "frequency_penalty", "presence_penalty", "logit_bias", "response_format", "user", "parallel_tool_calls", "tool_choice", "stream", "stream_options"]);
const MEDIA = new Set(["image", "input_image", "image_url", "audio", "input_audio", "video", "document", "file"]);
function hasMedia(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMedia);
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return MEDIA.has(String(row.type)) || Object.entries(row).some(([key, part]) =>
    ["image_url", "input_audio", "file_id", "file_data", "image", "audio", "video"].includes(key) || hasMedia(part));
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
  if (hasMedia(wire) || (Array.isArray(wire.tools) && wire.tools.some(value => {
    const tool = value as Record<string, unknown> | null;
    return !tool || (header.encoderId !== "anthropic-messages" && tool.type !== "function") || (header.encoderId === "anthropic-messages" && tool.type !== undefined);
  }))) throw new Error("USD request bound does not cover media or hosted tools");
  return { reservedCostUsd: bound.maxCostUsd, usdBoundDigest: sha256Hex(canonicalize(bound)), usdBoundSource: bound.source,
    usdBoundExpiresAt: bound.expiresAt, usdBoundBasis: "auditor-attested-request-ceiling" as const };
}
