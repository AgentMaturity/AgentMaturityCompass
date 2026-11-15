/** Tokens a model request can be billed at most: its bytes, an allowance for the provider's own prompt wrapping, its output limit. */
const PROVIDER_WRAPPING_ALLOWANCE = 4096; // ponytail: fixed allowance; a per-provider figure if one ever proves larger

/** The upper estimate for a request body, or null when the body names no output limit (then nothing bounds its usage). */
export function requestTokenCeiling(requestBody: Buffer): number | null {
  let body: Record<string, unknown>;
  try { body = JSON.parse(requestBody.toString("utf8")) as Record<string, unknown>; } catch { return null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const nested = (key: string, inner: string) => { const value = body[key]; return value && typeof value === "object" ? (value as Record<string, unknown>)[inner] : undefined; };
  // Every output limit an AMC encoder writes; a thinking budget is added in case a provider counts it apart.
  const limits = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens, nested("options", "num_predict"), nested("generationConfig", "maxOutputTokens")]
    .filter((value): value is number => Number.isSafeInteger(value) && (value as number) > 0);
  if (limits.length === 0) return null;
  const thinking = (nested("generationConfig", "thinkingConfig") as Record<string, unknown> | undefined)?.thinkingBudget;
  // A token is at least one byte for byte-level tokenizers, so the bytes sent bound the input.
  return requestBody.length + PROVIDER_WRAPPING_ALLOWANCE + Math.max(...limits) + (Number.isSafeInteger(thinking) && (thinking as number) > 0 ? thinking as number : 0);
}
