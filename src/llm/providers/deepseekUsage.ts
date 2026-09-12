import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import type { StreamTokenUsage } from "../streamChunk.js";
import { deepseekObject } from "./deepseekContract.js";

function fail(detail: string): never {
  throw new LlmError(`deepseek-chat usage: ${detail}`, LLM_FAILURE_CODE.TRANSPORT);
}
function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail(`invalid ${label}`);
  return value;
}

/** DeepSeek's hit/miss fields partition prompt_tokens. Missing is not zero;
 * reasoning is a subset of completion_tokens, never an additional billable count.
 */
export function deepseekUsage(value: unknown): StreamTokenUsage | null {
  if (value === undefined || value === null) return null;
  if (!deepseekObject(value)) return fail("expected an object");
  const input = count(value.prompt_tokens, "prompt_tokens");
  const output = count(value.completion_tokens, "completion_tokens");
  if (!Number.isSafeInteger(input + output)) return fail("token total overflows safe-integer range");
  if (value.total_tokens !== undefined && count(value.total_tokens, "total_tokens") !== input + output) return fail("inconsistent total_tokens");
  const hit = value.prompt_cache_hit_tokens === undefined ? undefined : count(value.prompt_cache_hit_tokens, "prompt_cache_hit_tokens");
  const miss = value.prompt_cache_miss_tokens === undefined ? undefined : count(value.prompt_cache_miss_tokens, "prompt_cache_miss_tokens");
  // Partial cache reports are refused: otherwise a missing component could be
  // mistaken for an explicit measured zero when deriving the complementary count.
  if ((hit === undefined) !== (miss === undefined)) return fail("cache hit and miss must be reported together");
  if (hit !== undefined && miss !== undefined && (hit > input || miss > input || hit + miss !== input)) return fail("cache breakdown disagrees with prompt_tokens");
  if (value.completion_tokens_details !== undefined && !deepseekObject(value.completion_tokens_details)) return fail("invalid completion_tokens_details");
  const details = deepseekObject(value.completion_tokens_details) ? value.completion_tokens_details : null;
  const reasoning = details?.reasoning_tokens === undefined ? undefined : count(details.reasoning_tokens, "reasoning_tokens");
  if (reasoning !== undefined && reasoning > output) return fail("reasoning exceeds completion_tokens");
  return { inputTokens: miss ?? input, outputTokens: output,
    ...(hit === undefined ? {} : { cacheReadTokens: hit }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }) };
}
