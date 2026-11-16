/**
 * Why a provider's reply stopped, and whether it was a refusal, only where the reply says so (Watch's refusal rate).
 * - Anthropic Messages: `stop_reason`; "refusal" is a documented stop reason, any other one is not a refusal.
 * - OpenAI-compatible chat: `finish_reason` is kept as the stop reason but is not a refusal signal on its own; a reply
 *   is refused when `message.refusal` holds text or `finish_reason` is "content_filter", and known not refused only
 *   when the message carries `refusal: null`. Anything else leaves the refusal unknown.
 */
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function replyStopInfo(parsed: Record<string, unknown>): { stopReason?: string; refusal?: boolean } {
  if (typeof parsed.stop_reason === "string") return { stopReason: parsed.stop_reason.slice(0, 64), refusal: parsed.stop_reason === "refusal" };
  const choice = Array.isArray(parsed.choices) ? record(parsed.choices[0]) : null;
  if (!choice) return {};
  const finish = typeof choice.finish_reason === "string" ? choice.finish_reason.slice(0, 64) : null;
  const message = record(choice.message);
  const refused = finish === "content_filter" || (typeof message?.refusal === "string" && message.refusal.length > 0);
  const known = refused || (message !== null && "refusal" in message && message.refusal === null);
  return { ...(finish !== null ? { stopReason: finish } : {}), ...(known ? { refusal: refused } : {}) };
}
