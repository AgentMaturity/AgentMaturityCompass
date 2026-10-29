/**
 * Dated catalog facts and indicative pricing, not a model probe or billing data.
 * Snapshots bind exact requested route identity and replay their own historical rates.
 */
import { z } from "zod";
import { MODEL_PRICING, lookupModelPrice } from "../product/modelPricing.js";
import { isSha256HexDigest, sha256Hex } from "../utils/hash.js";
import { canonicalize, isExactIsoTime } from "../utils/json.js";

const text = z.string().min(1);
const date = text.refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && isExactIsoTime(`${value}T00:00:00.000Z`));
const tokens = z.number().int().positive();
const rate = z.number().finite().nonnegative().nullable();
const freshness = z.enum(["indicative-legacy", "verified", "unknown"]);
const modality = z.enum(["text", "image", "audio", "video"]);
const tierSchema = z.strictObject({
  upToInputTokens: tokens.nullable(), inputPer1kTokens: rate, outputPer1kTokens: rate,
  cacheReadPer1kTokens: rate, cacheWritePer1kTokens: rate
}).readonly();
const tiersSchema = z.array(tierSchema).min(1).refine((tiers) => {
  let previous = 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const ceiling = tiers[index]!.upToInputTokens;
    if (ceiling === null) return index === tiers.length - 1;
    if (ceiling <= previous) return false;
    previous = ceiling;
  }
  return false;
}, "Pricing tiers require increasing ceilings and a final uncapped tier").readonly();
const pricingSchema = z.strictObject({
  currency: z.literal("USD"), unit: z.literal("per-1000-tokens"), kind: z.literal("indicative"), scope: z.literal("reported-token-components-only"),
  inputPer1kTokens: rate, outputPer1kTokens: rate, cacheReadPer1kTokens: rate, cacheWritePer1kTokens: rate,
  tiers: tiersSchema.nullable(), source: text.nullable(), asOf: date.nullable(), freshness: freshness.nullable()
}).readonly();
const metadataSchema = z.strictObject({
  schemaVersion: z.literal(1), providerId: text, canonicalProviderId: text, protocol: text,
  model: text, canonicalModel: text, source: text, asOf: date, freshness,
  contextWindowTokens: tokens.nullable(), maxOutputTokens: tokens.nullable(),
  modalities: z.strictObject({ input: z.array(modality).readonly(), output: z.array(modality).readonly() }).readonly().nullable(),
  reasoning: z.boolean().nullable(), modelSupport: z.literal("catalog-not-probed"), pricing: pricingSchema.nullable(),
  digest: text.refine(isSha256HexDigest)
}).readonly();

export type ModelMetadataSnapshot = z.infer<typeof metadataSchema>;

/** Known encoder identifiers only. An unknown encoder is not a compatible protocol claim. */
export function catalogProtocolForEncoder(encoderId: string): string | null {
  switch (encoderId) {
    case "openai-chat": return "openai-chat-completions";
    case "openai-responses": return "openai-responses";
    case "anthropic-messages": return "anthropic-messages";
    case "gemini-generate-content": return "gemini-generate-content";
    case "deepseek-chat": return "deepseek-chat-completions";
    case "ollama-chat": return "ollama-chat";
    default: return null;
  }
}

/** Explicit provider/protocol rules; model-name equality alone never admits another route. */
function canonicalProvider(providerId: string, protocol: string): string | null {
  if (providerId === "openai" && ["openai-chat-completions", "openai-responses"].includes(protocol)) return "openai";
  if (providerId === "openai-responses" && protocol === "openai-responses") return "openai";
  if (providerId === "anthropic" && protocol === "anthropic-messages") return "anthropic";
  if ((providerId === "google" || providerId === "gemini") && protocol === "gemini-generate-content") return "google";
  return null;
}

/** No fuzzy model matching. The native Google resource-name prefix is an explicit alias. */
function canonicalModelFor(providerId: string, protocol: string, model: string): string {
  if (providerId === "google" && protocol === "gemini-generate-content") {
    switch (model) {
      case "models/gemini-flash": return "gemini-flash";
      case "models/gemini-1.5-pro": return "gemini-1.5-pro";
      case "models/gemini-1.5-flash": return "gemini-1.5-flash";
    }
  }
  return model;
}

/**
 * Validate and detach the persisted data, including its canonical SHA-256 digest.
 * Never consult today's catalog or recompute historical rates. A digest is integrity, not provider authentication.
 */
export function parseModelMetadataSnapshot(value: unknown): ModelMetadataSnapshot | null {
  try {
    const parsed = metadataSchema.safeParse(value);
    if (!parsed.success) return null;
    const { digest, ...payload } = parsed.data;
    return sha256Hex(canonicalize(payload)) === digest ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Capture one immutable, provider-aware pin from the existing shared pricing table. */
export function createModelMetadataSnapshot(providerId: string, protocol: string, model: string): ModelMetadataSnapshot | null {
  const canonicalProviderId = canonicalProvider(providerId, protocol);
  if (canonicalProviderId === null) return null;
  const canonicalModel = canonicalModelFor(canonicalProviderId, protocol, model);
  const entry = lookupModelPrice(canonicalModel);
  if (entry === null || entry.providerId !== canonicalProviderId || entry.pricingSource === null || entry.pricingAsOf === null
    || entry.pricingFreshness === null) return null;
  // OpenAI Responses is the sole alternate protocol declared for existing Chat catalog rows.
  if (entry.protocol !== protocol && !(entry.protocol === "openai-chat-completions" && protocol === "openai-responses")) return null;
  const payload = {
    schemaVersion: 1, providerId, canonicalProviderId, protocol, model, canonicalModel,
    source: entry.pricingSource, asOf: entry.pricingAsOf, freshness: entry.pricingFreshness,
    contextWindowTokens: entry.contextWindow, maxOutputTokens: entry.maxOutputTokens,
    modalities: entry.modalities, reasoning: entry.reasoning, modelSupport: "catalog-not-probed",
    pricing: { currency: "USD", unit: "per-1000-tokens", kind: "indicative", scope: "reported-token-components-only", inputPer1kTokens: entry.inputPer1kTokens,
      outputPer1kTokens: entry.outputPer1kTokens, cacheReadPer1kTokens: entry.cacheReadPer1kTokens,
      cacheWritePer1kTokens: entry.cacheWritePer1kTokens, tiers: entry.tiers,
      source: entry.pricingSource, asOf: entry.pricingAsOf, freshness: entry.pricingFreshness }
  };
  return parseModelMetadataSnapshot({ ...payload, digest: sha256Hex(canonicalize(payload)) });
}

/** Discovery reads the same records and snapshots as request preparation. */
export function listModelMetadata(providerId: string, protocol: string): readonly ModelMetadataSnapshot[] {
  return Object.freeze(Object.keys(MODEL_PRICING).flatMap((model) => {
    const snapshot = createModelMetadataSnapshot(providerId, protocol, model);
    return snapshot === null ? [] : [snapshot];
  }));
}
