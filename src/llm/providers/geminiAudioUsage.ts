import { LLM_FAILURE_CODE, LlmError } from "../llmFailure.js";
import type { StreamTokenUsage } from "../streamChunk.js";
import { geminiObject } from "./geminiContract.js";

function fail(): never { throw new LlmError("Gemini audio usage is unsupported, malformed or inconsistent", LLM_FAILURE_CODE.TRANSPORT); }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail(); return value; }
/** Version2 adds AUDIO only to INPUT/cache details. Generated audio and hosted
 * tool usage remain unsupported. No absent counter is invented as a measured zero.
 */
export function geminiAudioUsage(value: unknown): StreamTokenUsage {
  if (!geminiObject(value)) return fail();
  const allowed = ["promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "cachedContentTokenCount", "totalTokenCount", "toolUsePromptTokenCount",
    "promptTokensDetails", "cacheTokensDetails", "candidatesTokensDetails", "toolUsePromptTokensDetails", "serviceTier"];
  if (Object.keys(value).some(key => !allowed.includes(key))) return fail();
  const prompt = count(value.promptTokenCount), candidates = count(value.candidatesTokenCount);
  const thoughts = value.thoughtsTokenCount === undefined ? undefined : count(value.thoughtsTokenCount);
  const cached = value.cachedContentTokenCount === undefined ? undefined : count(value.cachedContentTokenCount);
  const output = candidates + (thoughts ?? 0);
  if (!Number.isSafeInteger(prompt + output) || (cached !== undefined && cached > prompt)) return fail();
  if (value.totalTokenCount !== undefined && count(value.totalTokenCount) !== prompt + output) return fail();
  if (value.toolUsePromptTokenCount !== undefined && count(value.toolUsePromptTokenCount) !== 0) return fail();
  for (const [key, total, modalities] of [["promptTokensDetails", prompt, ["TEXT", "IMAGE", "AUDIO"]],
    ["cacheTokensDetails", cached, ["TEXT", "IMAGE", "AUDIO"]], ["candidatesTokensDetails", candidates, ["TEXT"]],
    ["toolUsePromptTokensDetails", 0, []]] as const) {
    const details = value[key]; if (details === undefined) continue;
    if (!Array.isArray(details) || total === undefined) return fail();
    const seen = new Set<string>(); let sum = 0;
    for (const detail of details) {
      if (!geminiObject(detail) || Object.keys(detail).some(field => !["modality", "tokenCount"].includes(field))
          || typeof detail.modality !== "string" || !(modalities as readonly string[]).includes(detail.modality) || seen.has(detail.modality)) return fail();
      seen.add(detail.modality); sum += count(detail.tokenCount);
      if (!Number.isSafeInteger(sum)) return fail();
    }
    if (sum !== total) return fail();
  }
  if (value.serviceTier !== undefined && typeof value.serviceTier !== "string") return fail();
  return { inputTokens: prompt - (cached ?? 0), outputTokens: output,
    ...(thoughts === undefined ? {} : { reasoningTokens: thoughts }), ...(cached === undefined ? {} : { cacheReadTokens: cached }) };
}
