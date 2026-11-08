/**
 * SH-PROVIDERS-02: `--thinking`, `--reasoning-effort` and `--thinking-budget` mapped to each native provider's wire.
 *
 * Pure and provider-honest: no effort name is remapped across providers (pi maps levels; AMC refuses an unknown one,
 * so the signed header never carries a value the operator did not write). A provider whose reasoning wire AMC cannot
 * yet decode or replay is refused here with the limit named, before any row exists:
 *
 *   - OpenAI Chat / Responses and every OpenAI-compatible route: `reasoning_effort` would be sent, but both decoders
 *     refuse reasoning output and admission marks `thinking-output` unsupported (deferred, D-05).
 *   - Anthropic: thinking blocks are recorded but `anthropic-messages@4` cannot replay them with a signature, so a
 *     thinking request (`adaptive`, or manual `enabled` with `budget_tokens`) is admitted only for a tools-free,
 *     single-turn run. A resumed or multi-turn session is refused at prepare by capability admission
 *     (`thinking-replay`), before spend (deferred signed replay, D-01). `--reasoning-effort` alone is
 *     `output_config.effort`, which asks for no thinking block, so it is admitted beside tools.
 *
 * The caller validates the result through the provider contract (`deepseekParams`, `geminiParams`, `ollamaParams`).
 */
import { deepseekParams } from "./providers/deepseekContract.js";

export interface ReasoningOptions {
  readonly thinking?: string;
  readonly reasoningEffort?: string;
  /** Token budget as typed on the command line, or a number from an SDK. */
  readonly thinkingBudget?: string | number;
}

export interface ReasoningContext {
  readonly maxTokens: number;
  /** The run's tool mode; undefined means a tool seam may be offered. */
  readonly tools?: string;
}

const ANTHROPIC_MIN_BUDGET = 1024;
/** `output_config.effort` as Anthropic documents it; sent verbatim, never mapped from another provider's levels. */
const ANTHROPIC_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const GEMINI_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
const OLLAMA_LEVELS = ["low", "medium", "high", "max"] as const;

function wants(options: ReasoningOptions): boolean {
  return options.thinking !== undefined || options.reasoningEffort !== undefined || options.thinkingBudget !== undefined;
}

function budget(options: ReasoningOptions): number | undefined {
  if (options.thinkingBudget === undefined) return undefined;
  const value = typeof options.thinkingBudget === "number" ? options.thinkingBudget : Number(options.thinkingBudget);
  if (!Number.isSafeInteger(value) || value < 0 || String(options.thinkingBudget).trim() === "") {
    throw new Error("--thinking-budget must be a non-negative integer token count.");
  }
  return value;
}

function mode(options: ReasoningOptions): "enabled" | "disabled" | undefined {
  if (options.thinking === undefined) return undefined;
  if (options.thinking !== "enabled" && options.thinking !== "disabled") throw new Error("--thinking must be enabled or disabled.");
  return options.thinking;
}

/** The provider-specific reasoning params for `providerId`, `{}` when none were asked for, or a thrown refusal. */
export function reasoningParamsFor(providerId: string, options: ReasoningOptions, context: ReasoningContext): Record<string, unknown> {
  if (!wants(options)) return {};
  switch (providerId) {
    case "deepseek": {
      if (options.thinkingBudget !== undefined) throw new Error("--thinking-budget is not a DeepSeek wire option; DeepSeek takes --thinking and --reasoning-effort.");
      const params = { ...(options.thinking === undefined ? {} : { thinking: { type: options.thinking } }),
        ...(options.reasoningEffort === undefined ? {} : { reasoning_effort: options.reasoningEffort }) };
      // The contract refuses an unknown mode or a remapped effort here, before any surface spawns or records anything.
      deepseekParams({ max_tokens: context.maxTokens, ...params });
      return params;
    }
    case "anthropic": {
      const effort = options.reasoningEffort;
      if (effort !== undefined && !(ANTHROPIC_EFFORTS as readonly string[]).includes(effort)) {
        throw new Error(`--reasoning-effort for Anthropic must be one of ${ANTHROPIC_EFFORTS.join(", ")} (sent verbatim as output_config.effort).`);
      }
      const outputConfig = effort === undefined ? {} : { output_config: { effort } };
      const on = mode(options);
      const tokens = budget(options);
      if (on === "disabled") {
        if (tokens !== undefined) throw new Error("--thinking disabled takes no --thinking-budget.");
        return { thinking: { type: "disabled" }, ...outputConfig };
      }
      if (on === undefined && tokens === undefined) return outputConfig;
      // A budget asks for manual thinking (Claude 4.5/4.6); none asks for adaptive thinking (Claude 4.6 and later).
      if (tokens !== undefined && (tokens < ANTHROPIC_MIN_BUDGET || tokens >= context.maxTokens)) {
        throw new Error(`--thinking-budget must be at least ${ANTHROPIC_MIN_BUDGET} and below --max-tokens (${context.maxTokens}).`);
      }
      if (context.tools !== "none") {
        throw new Error("Anthropic thinking is admitted only with --tools none: anthropic-messages@4 cannot replay a signed thinking block beside tool calls (signed replay is deferred, D-01). A resumed session is refused at prepare for the same reason.");
      }
      return { thinking: tokens === undefined ? { type: "adaptive" } : { type: "enabled", budget_tokens: tokens }, ...outputConfig };
    }
    case "gemini": case "gemini-audio": {
      const on = mode(options);
      const tokens = budget(options);
      const level = options.reasoningEffort;
      if (level !== undefined && !(GEMINI_LEVELS as readonly string[]).includes(level)) {
        throw new Error(`--reasoning-effort for Gemini must be one of ${GEMINI_LEVELS.join(", ")} (sent verbatim as thinkingLevel).`);
      }
      if (tokens !== undefined && level !== undefined) throw new Error("Gemini takes --thinking-budget or --reasoning-effort, not both.");
      if (on === "disabled" && (tokens !== undefined && tokens !== 0 || level !== undefined)) throw new Error("--thinking disabled conflicts with a Gemini budget or level.");
      const thinkingConfig = { ...(on === undefined ? {} : { includeThoughts: on === "enabled" }),
        ...(on === "disabled" ? { thinkingBudget: 0 } : tokens === undefined ? {} : { thinkingBudget: tokens }),
        ...(level === undefined ? {} : { thinkingLevel: level }) };
      return { generationConfig: { thinkingConfig } };
    }
    case "ollama": {
      if (options.thinkingBudget !== undefined) throw new Error("--thinking-budget is not an Ollama wire option; Ollama takes --thinking or --reasoning-effort.");
      const on = mode(options);
      const level = options.reasoningEffort;
      if (level !== undefined && !(OLLAMA_LEVELS as readonly string[]).includes(level)) {
        throw new Error(`--reasoning-effort for Ollama must be one of ${OLLAMA_LEVELS.join(", ")} (sent verbatim as think).`);
      }
      if (on !== undefined && level !== undefined) throw new Error("Ollama takes --thinking or --reasoning-effort, not both.");
      return { think: level ?? (on === "enabled") };
    }
    default:
      throw new Error(`--thinking, --reasoning-effort and --thinking-budget are not admitted for provider ${JSON.stringify(providerId)}: `
        + "native reasoning controls reach deepseek, anthropic (tools-free), gemini and ollama; OpenAI reasoning output is not decoded yet (D-05).");
  }
}
