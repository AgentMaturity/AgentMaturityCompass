/**
 * Indicative model pricing — a single source for the product cost estimators.
 *
 * INDICATIVE, NOT BILLING DATA. These figures are hand-maintained, dated, and
 * will drift from what a provider actually charges. Two tables previously
 * existed and disagreed with each other about the same model (gpt-4o was listed
 * at a blended 0.005 in one and 0.0025 input / 0.01 output in the other), so a
 * caller's estimate depended on which module it happened to reach.
 *
 * Use these for relative comparison between models, never to predict a bill.
 */

/** When these figures were last reviewed. Stale prices are a known limitation. */
export const MODEL_PRICING_AS_OF = "2026-08-21";

export interface ModelPrice {
  model: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  contextWindow: number;
  /** Rough end-to-end latency for a short completion, for routing heuristics. */
  typicalLatencyMs: number;
  /** Relative capability, 0-1, for routing heuristics only. */
  qualityScore: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "gpt-4o": {
    model: "gpt-4o",
    inputPer1kTokens: 0.0025,
    outputPer1kTokens: 0.01,
    contextWindow: 128000,
    typicalLatencyMs: 800,
    qualityScore: 0.95
  },
  "gpt-4o-mini": {
    model: "gpt-4o-mini",
    inputPer1kTokens: 0.00015,
    outputPer1kTokens: 0.0006,
    contextWindow: 128000,
    typicalLatencyMs: 400,
    qualityScore: 0.85
  },
  "claude-sonnet-4-20250514": {
    model: "claude-sonnet-4-20250514",
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
    contextWindow: 200000,
    typicalLatencyMs: 600,
    qualityScore: 0.93
  },
  "gemini-flash": {
    model: "gemini-flash",
    inputPer1kTokens: 0.0005,
    outputPer1kTokens: 0.0015,
    contextWindow: 1000000,
    typicalLatencyMs: 300,
    qualityScore: 0.82
  },
  "gpt-4-turbo": {
    model: "gpt-4-turbo",
    inputPer1kTokens: 0.01,
    outputPer1kTokens: 0.03,
    contextWindow: 128000,
    typicalLatencyMs: 1200,
    qualityScore: 0.9
  },
  "claude-3.5-sonnet": {
    model: "claude-3.5-sonnet",
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
    contextWindow: 200000,
    typicalLatencyMs: 700,
    qualityScore: 0.92
  },
  "claude-3-opus": {
    model: "claude-3-opus",
    inputPer1kTokens: 0.015,
    outputPer1kTokens: 0.075,
    contextWindow: 200000,
    typicalLatencyMs: 1500,
    qualityScore: 0.94
  },
  "claude-3-haiku": {
    model: "claude-3-haiku",
    inputPer1kTokens: 0.00025,
    outputPer1kTokens: 0.00125,
    contextWindow: 200000,
    typicalLatencyMs: 350,
    qualityScore: 0.8
  },
  "gemini-1.5-pro": {
    model: "gemini-1.5-pro",
    inputPer1kTokens: 0.00125,
    outputPer1kTokens: 0.005,
    contextWindow: 2000000,
    typicalLatencyMs: 900,
    qualityScore: 0.9
  },
  "gemini-1.5-flash": {
    model: "gemini-1.5-flash",
    inputPer1kTokens: 0.000075,
    outputPer1kTokens: 0.0003,
    contextWindow: 1000000,
    typicalLatencyMs: 300,
    qualityScore: 0.8
  }
};

/**
 * Blended per-1k cost assuming a 50/50 input-output split.
 *
 * Routing heuristics want one number; anything reporting money to a user should
 * use the input and output rates separately.
 */
export function blendedCostPer1k(price: ModelPrice): number {
  return (price.inputPer1kTokens + price.outputPer1kTokens) / 2;
}

/** Looks up a model, returning null rather than guessing at an unknown one. */
export function lookupModelPrice(model: string): ModelPrice | null {
  return MODEL_PRICING[model] ?? null;
}
