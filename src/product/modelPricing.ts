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

/** Legacy review date; per-model provenance records any later review. */
export const MODEL_PRICING_AS_OF = "2026-08-21";
const MODEL_PRICING_SOURCE = "src/product/modelPricing.ts (indicative legacy catalog)";

type ModelCatalogFreshness = "indicative-legacy" | "verified" | "unknown";
type ModelModality = "text" | "image" | "audio" | "video";
interface ModelModalities {
  readonly input: readonly ModelModality[];
  readonly output: readonly ModelModality[];
}
interface ModelPriceTier {
  /** Inclusive input-token ceiling. The last tier has no ceiling (null). */
  readonly upToInputTokens: number | null;
  readonly inputPer1kTokens: number | null;
  readonly outputPer1kTokens: number | null;
  readonly cacheReadPer1kTokens: number | null;
  readonly cacheWritePer1kTokens: number | null;
}

export interface ModelPrice {
  model: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  contextWindow: number;
  /** Rough end-to-end latency for a short completion, for routing heuristics. */
  typicalLatencyMs: number;
  /** Relative capability, 0-1, for routing heuristics only. */
  qualityScore: number;
  providerId: string | null;
  /** Primary native protocol; the catalog declares any alternate protocol explicitly. */
  protocol: string | null;
  cacheReadPer1kTokens: number | null;
  cacheWritePer1kTokens: number | null;
  pricingSource: string | null;
  pricingAsOf: string | null;
  pricingFreshness: ModelCatalogFreshness | null;
  tiers: readonly ModelPriceTier[] | null;
  maxOutputTokens: number | null;
  modalities: ModelModalities | null;
  reasoning: boolean | null;
}

type LegacyModelPrice = Pick<ModelPrice, "model" | "inputPer1kTokens" | "outputPer1kTokens" | "contextWindow" | "typicalLatencyMs" | "qualityScore">;
function catalogPrice(providerId: string, protocol: string, price: LegacyModelPrice,
  reviewed: Partial<ModelPrice> = {}): ModelPrice {
  return { ...price, providerId, protocol, cacheReadPer1kTokens: null, cacheWritePer1kTokens: null,
    pricingSource: MODEL_PRICING_SOURCE, pricingAsOf: MODEL_PRICING_AS_OF, pricingFreshness: "indicative-legacy",
    tiers: null, maxOutputTokens: null, modalities: null, reasoning: null, ...reviewed };
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "gpt-4o": catalogPrice("openai", "openai-chat-completions", {
    model: "gpt-4o",
    inputPer1kTokens: 0.0025,
    outputPer1kTokens: 0.01,
    contextWindow: 128000,
    typicalLatencyMs: 800,
    qualityScore: 0.95
  }, {
    // Official model page reviewed 2026-10-29; USD per 1M normalized to per 1k.
    pricingSource: "https://developers.openai.com/api/docs/models/gpt-4o",
    pricingAsOf: "2026-10-29", pricingFreshness: "verified", cacheReadPer1kTokens: 0.00125,
    maxOutputTokens: 16384, modalities: { input: ["text", "image"], output: ["text"] }
  }),
  "gpt-4o-mini": catalogPrice("openai", "openai-chat-completions", {
    model: "gpt-4o-mini",
    inputPer1kTokens: 0.00015,
    outputPer1kTokens: 0.0006,
    contextWindow: 128000,
    typicalLatencyMs: 400,
    qualityScore: 0.85
  }, {
    // Official model page reviewed 2026-10-29; USD per 1M normalized to per 1k.
    pricingSource: "https://developers.openai.com/api/docs/models/gpt-4o-mini",
    pricingAsOf: "2026-10-29", pricingFreshness: "verified", cacheReadPer1kTokens: 0.000075,
    maxOutputTokens: 16384, modalities: { input: ["text", "image"], output: ["text"] }
  }),
  "claude-sonnet-4-20250514": catalogPrice("anthropic", "anthropic-messages", {
    model: "claude-sonnet-4-20250514",
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
    contextWindow: 200000,
    typicalLatencyMs: 600,
    qualityScore: 0.93
  }),
  "gemini-flash": catalogPrice("google", "gemini-generate-content", {
    model: "gemini-flash",
    inputPer1kTokens: 0.0005,
    outputPer1kTokens: 0.0015,
    contextWindow: 1000000,
    typicalLatencyMs: 300,
    qualityScore: 0.82
  }),
  "gpt-4-turbo": catalogPrice("openai", "openai-chat-completions", {
    model: "gpt-4-turbo",
    inputPer1kTokens: 0.01,
    outputPer1kTokens: 0.03,
    contextWindow: 128000,
    typicalLatencyMs: 1200,
    qualityScore: 0.9
  }),
  "claude-3.5-sonnet": catalogPrice("anthropic", "anthropic-messages", {
    model: "claude-3.5-sonnet",
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
    contextWindow: 200000,
    typicalLatencyMs: 700,
    qualityScore: 0.92
  }),
  "claude-3-opus": catalogPrice("anthropic", "anthropic-messages", {
    model: "claude-3-opus",
    inputPer1kTokens: 0.015,
    outputPer1kTokens: 0.075,
    contextWindow: 200000,
    typicalLatencyMs: 1500,
    qualityScore: 0.94
  }),
  "claude-3-haiku": catalogPrice("anthropic", "anthropic-messages", {
    model: "claude-3-haiku",
    inputPer1kTokens: 0.00025,
    outputPer1kTokens: 0.00125,
    contextWindow: 200000,
    typicalLatencyMs: 350,
    qualityScore: 0.8
  }),
  "gemini-1.5-pro": catalogPrice("google", "gemini-generate-content", {
    model: "gemini-1.5-pro",
    inputPer1kTokens: 0.00125,
    outputPer1kTokens: 0.005,
    contextWindow: 2000000,
    typicalLatencyMs: 900,
    qualityScore: 0.9
  }),
  "gemini-1.5-flash": catalogPrice("google", "gemini-generate-content", {
    model: "gemini-1.5-flash",
    inputPer1kTokens: 0.000075,
    outputPer1kTokens: 0.0003,
    contextWindow: 1000000,
    typicalLatencyMs: 300,
    qualityScore: 0.8
  })
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
  return Object.hasOwn(MODEL_PRICING, model) ? MODEL_PRICING[model]! : null;
}
