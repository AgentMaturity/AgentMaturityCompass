import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import type { StreamTokenUsage } from "../streamChunk.js";

/** https://docs.ollama.com/api/usage (2026-09-11).
 * Cached prompt tokens are a subset of prompt_eval_count. Older servers omit
 * the optional cache field: absence is unknown, not a measured miss or zero.
 * Nanosecond timings are not token counts, prices or cache-write evidence.
 */
export function ollamaUsage(frame: Readonly<Record<string, unknown>>): StreamTokenUsage {
  const count = (name: string): number => {
    const value = frame[name];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new LlmError(`Ollama omitted or malformed reported ${name}`, LLM_FAILURE_CODE.TRANSPORT);
    }
    return value;
  };
  const prompt = count("prompt_eval_count"), output = count("eval_count");
  if (!Number.isSafeInteger(prompt + output)) throw new LlmError("Ollama token total exceeds safe integer range", LLM_FAILURE_CODE.TRANSPORT);
  const cached = Object.hasOwn(frame, "prompt_eval_cached_count") ? count("prompt_eval_cached_count") : undefined;
  if (cached !== undefined && cached > prompt) throw new LlmError("Ollama cached input exceeds reported prompt tokens", LLM_FAILURE_CODE.TRANSPORT);
  return { inputTokens: cached === undefined ? prompt : prompt - cached, outputTokens: output,
    ...(cached === undefined ? {} : { cacheReadTokens: cached }) };
}
