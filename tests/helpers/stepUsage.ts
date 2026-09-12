import type { StreamTokenUsage } from "../../src/llm/streamChunk.js";
import type { TokenUsage } from "../../src/session/sessionTypes.js";

/**
 * Copy stream usage into the session vocabulary exactly as
 * `src/agent/stepRunner.ts` does: an unreported cache count stays null and is
 * never flattened to a zero on the way into a signed `step/end` row.
 */
export function stepUsage(usage: StreamTokenUsage | null | undefined): TokenUsage | null {
  if (usage === null || usage === undefined) return null;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheRead: usage.cacheReadTokens ?? null,
    cacheWrite: usage.cacheWriteTokens ?? null
  };
}
