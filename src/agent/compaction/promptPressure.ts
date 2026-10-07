/**
 * Prompt pressure: how full the declared context window was for the request a
 * step just sent, measured from the provider's reported usage.
 *
 * The window is operator-declared and never inferred from a model name. Tokens
 * are never estimated from bytes: a step without reported usage is "not
 * measured", and no automatic compaction runs at that boundary.
 */
import type { TokenUsage } from "../../session/sessionTypes.js";
import { PROMPT_TOKENS_FORMULA, promptTokensFor } from "../../session/surfaceCompactionValidation.js";
import type { CompactionConfig } from "../loopTypes.js";

export const DEFAULT_COMPACTION: CompactionConfig = Object.freeze({
  contextWindowTokens: null,
  threshold: 0.8,
  keepRecentSteps: 2,
  pruneMinBytes: 4096,
  summarize: true,
  maxPerTurn: 3
});

/** Fill defaults and refuse anything out of bounds: a typo must not silently loosen or disable compaction. */
export function resolveCompactionConfig(input: Partial<CompactionConfig>): CompactionConfig {
  const given = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const config: CompactionConfig = { ...DEFAULT_COMPACTION, ...given };
  const int = (value: number, min: number, max: number): boolean => Number.isSafeInteger(value) && value >= min && value <= max;
  if ((config.contextWindowTokens !== null && !int(config.contextWindowTokens, 1, Number.MAX_SAFE_INTEGER))
    || typeof config.threshold !== "number" || !(config.threshold >= 0.5 && config.threshold <= 0.95)
    || !int(config.keepRecentSteps, 1, 1024) || !int(config.pruneMinBytes, 1, 1_000_000_000)
    || typeof config.summarize !== "boolean" || !int(config.maxPerTurn, 1, 64)) {
    throw new Error("Automatic compaction needs a positive integer context window, a threshold from 0.5 through 0.95, "
      + "1-1024 recent steps kept, a positive prune size and 1-64 compactions per turn.");
  }
  return Object.freeze(config);
}

/** Operator flags to config. `--context-window` turns compaction on; the flags that refine it are refused without it. */
export function compactionFromFlags(flags: { readonly contextWindow?: string | undefined; readonly compactThreshold?: string | undefined;
  readonly autoSummary?: boolean | undefined }): CompactionConfig | undefined {
  if (flags.contextWindow === undefined) {
    if (flags.compactThreshold !== undefined || flags.autoSummary === false) {
      throw new Error("--compact-threshold and --no-auto-summary require --context-window; unused options are not ignored.");
    }
    return undefined;
  }
  return resolveCompactionConfig({ contextWindowTokens: Number(flags.contextWindow), summarize: flags.autoSummary !== false,
    ...(flags.compactThreshold === undefined ? {} : { threshold: Number(flags.compactThreshold) }) });
}

export interface PromptPressure {
  readonly promptTokens: number;
  readonly ratio: number;
  readonly formula: typeof PROMPT_TOKENS_FORMULA;
}

/** Null when the provider reported no usage for the step: not measured, never zero. */
export function measurePromptPressure(usage: TokenUsage | null, contextWindowTokens: number): PromptPressure | null {
  const promptTokens = promptTokensFor(usage);
  return promptTokens === null ? null : { promptTokens, ratio: promptTokens / contextWindowTokens, formula: PROMPT_TOKENS_FORMULA };
}
