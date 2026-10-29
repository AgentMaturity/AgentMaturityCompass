import { describe, expect, it } from "vitest";
import { MODEL_PRICING, MODEL_PRICING_AS_OF, lookupModelPrice } from "../src/product/modelPricing.js";
import { catalogProtocolForEncoder, createModelMetadataSnapshot, listModelMetadata, parseModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";

function redigest(value: Record<string, unknown>): Record<string, unknown> & { digest: string } {
  const { digest: _digest, ...payload } = value;
  return { ...payload, digest: sha256Hex(canonicalize(payload)) };
}

function historicalFixture(): Record<string, unknown> {
  const snapshot = createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
  return redigest({ ...snapshot, asOf: "2024-01-01", pricing: {
    ...snapshot.pricing!, asOf: "2024-01-01", inputPer1kTokens: 0.123, outputPer1kTokens: 0.456,
    cacheReadPer1kTokens: 0.012, cacheWritePer1kTokens: 0.234,
    tiers: [
      { upToInputTokens: 1000, inputPer1kTokens: 0.123, outputPer1kTokens: 0.456,
        cacheReadPer1kTokens: 0.012, cacheWritePer1kTokens: null },
      { upToInputTokens: null, inputPer1kTokens: 0.246, outputPer1kTokens: 0.912,
        cacheReadPer1kTokens: 0.024, cacheWritePer1kTokens: 0.234 }
    ]
  } });
}

describe("provider-aware model metadata catalog", () => {
  it("maps only known encoder identifiers to their declared catalog protocol", () => {
    expect(catalogProtocolForEncoder("openai-chat")).toBe("openai-chat-completions");
    expect(catalogProtocolForEncoder("openai-responses")).toBe("openai-responses");
    expect(catalogProtocolForEncoder("anthropic-messages")).toBe("anthropic-messages");
    expect(catalogProtocolForEncoder("gemini-generate-content")).toBe("gemini-generate-content");
    expect(catalogProtocolForEncoder("deepseek-chat")).toBe("deepseek-chat-completions");
    expect(catalogProtocolForEncoder("ollama-chat")).toBe("ollama-chat");
    expect(catalogProtocolForEncoder("openai-chat-custom")).toBeNull();
    expect(catalogProtocolForEncoder("__proto__")).toBeNull();
  });
  it("extends the existing indicative table without changing the model-only rates", () => {
    const legacy = lookupModelPrice("gpt-4o")!;
    const snapshot = createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
    expect(snapshot).toMatchObject({ schemaVersion: 1, providerId: "openai", canonicalProviderId: "openai",
      protocol: "openai-chat-completions", model: "gpt-4o", canonicalModel: "gpt-4o",
      asOf: "2026-10-29", contextWindowTokens: legacy.contextWindow, modelSupport: "catalog-not-probed",
      maxOutputTokens: 16384, modalities: { input: ["text", "image"], output: ["text"] },
      reasoning: null, freshness: "verified" });
    expect(snapshot.pricing).toMatchObject({ currency: "USD", unit: "per-1000-tokens", kind: "indicative", scope: "reported-token-components-only",
      inputPer1kTokens: legacy.inputPer1kTokens, outputPer1kTokens: legacy.outputPer1kTokens,
      cacheReadPer1kTokens: 0.00125, cacheWritePer1kTokens: null, tiers: null,
      asOf: "2026-10-29", freshness: "verified" });
    expect(snapshot.source).toBe("https://developers.openai.com/api/docs/models/gpt-4o");
    expect(legacy).toMatchObject({ providerId: "openai", protocol: "openai-chat-completions",
      cacheReadPer1kTokens: 0.00125, cacheWritePer1kTokens: null, pricingAsOf: "2026-10-29",
      pricingFreshness: "verified" });
    expect(legacy.inputPer1kTokens).toBe(0.0025);
    expect(legacy.outputPer1kTokens).toBe(0.01);
    expect(MODEL_PRICING_AS_OF).toBe("2026-08-21");
    const unverified = createModelMetadataSnapshot("anthropic", "anthropic-messages", "claude-3-opus")!;
    expect(unverified).toMatchObject({ asOf: MODEL_PRICING_AS_OF, maxOutputTokens: null,
      modalities: null, reasoning: null, freshness: "indicative-legacy" });
    expect(unverified.source).toContain("src/product/modelPricing.ts");
    expect(unverified.pricing).toMatchObject({ cacheReadPer1kTokens: null, cacheWritePer1kTokens: null });
    expect(createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o-mini")!.pricing)
      .toMatchObject({ cacheReadPer1kTokens: 0.000075, cacheWritePer1kTokens: null });
  });

  it("binds lookup and aliases to the exact provider and protocol", () => {
    const direct = createModelMetadataSnapshot("openai", "openai-responses", "gpt-4o")!;
    const alias = createModelMetadataSnapshot("openai-responses", "openai-responses", "gpt-4o")!;
    expect(alias).toMatchObject({ providerId: "openai-responses", canonicalProviderId: "openai", model: "gpt-4o" });
    expect(alias.digest).not.toBe(direct.digest);
    expect(createModelMetadataSnapshot("openai-responses", "openai-chat-completions", "gpt-4o")).toBeNull();
    expect(createModelMetadataSnapshot("openai", "anthropic-messages", "gpt-4o")).toBeNull();
    expect(createModelMetadataSnapshot("unknown-compatible", "openai-chat-completions", "gpt-4o")).toBeNull();
    expect(createModelMetadataSnapshot("anthropic", "anthropic-messages", "gpt-4o")).toBeNull();
    expect(createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o-unknown-suffix")).toBeNull();
    expect(createModelMetadataSnapshot("openai", "openai-chat-completions", "__proto__")).toBeNull();
    expect(lookupModelPrice("__proto__")).toBeNull();
    expect(createModelMetadataSnapshot("OpenAI", "openai-chat-completions", "gpt-4o")).toBeNull();
  });

  it("uses explicit Google/Gemini provider and model aliases without changing requested identity", () => {
    const google = createModelMetadataSnapshot("google", "gemini-generate-content", "gemini-1.5-flash")!;
    const gemini = createModelMetadataSnapshot("gemini", "gemini-generate-content", "models/gemini-1.5-flash")!;
    expect(gemini).toMatchObject({ providerId: "gemini", canonicalProviderId: "google",
      model: "models/gemini-1.5-flash", canonicalModel: "gemini-1.5-flash" });
    expect(gemini.pricing).toEqual(google.pricing);
    expect(gemini.digest).not.toBe(google.digest);
    expect(createModelMetadataSnapshot("google", "openai-chat-completions", "gemini-1.5-flash")).toBeNull();
    expect(createModelMetadataSnapshot("openai", "gemini-generate-content", "gemini-1.5-flash")).toBeNull();
    expect(createModelMetadataSnapshot("gemini", "gemini-generate-content", "models/unknown")).toBeNull();
  });

  it("lists only matching provider/protocol catalog entries for discovery", () => {
    const snapshots = listModelMetadata("openai-responses", "openai-responses");
    expect(snapshots.map((snapshot) => snapshot.model)).toEqual(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]);
    expect(snapshots.every((snapshot) => snapshot.providerId === "openai-responses"
      && snapshot.protocol === "openai-responses")).toBe(true);
    expect(listModelMetadata("unknown-compatible", "openai-chat-completions")).toEqual([]);
    expect(listModelMetadata("openai", "anthropic-messages")).toEqual([]);
  });

  it("computes a stable canonical digest and rejects corruption or unknown schema fields", () => {
    const snapshot = createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
    expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(redigest({ ...snapshot }).digest).toBe(snapshot.digest);
    expect(createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!.digest).toBe(snapshot.digest);
    expect(parseModelMetadataSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(parseModelMetadataSnapshot({ ...snapshot, model: "gpt-4o-mini" })).toBeNull();
    expect(parseModelMetadataSnapshot({ ...snapshot, digest: "0".repeat(64) })).toBeNull();
    expect(parseModelMetadataSnapshot(redigest({ ...snapshot, schemaVersion: 2 }))).toBeNull();
    expect(parseModelMetadataSnapshot(redigest({ ...snapshot, extra: true }))).toBeNull();
    expect(parseModelMetadataSnapshot(null)).toBeNull();
    expect(parseModelMetadataSnapshot("not a snapshot")).toBeNull();
  });

  it("replays historical rates and tiers without consulting today's catalog", () => {
    const fixture = historicalFixture();
    const parsed = parseModelMetadataSnapshot(fixture)!;
    expect(parsed).not.toBeNull();
    expect(parsed.asOf).toBe("2024-01-01");
    expect(parsed.pricing!.inputPer1kTokens).toBe(0.123);
    expect(parsed.pricing!.cacheReadPer1kTokens).toBe(0.012);
    expect(parsed.pricing!.cacheWritePer1kTokens).toBe(0.234);
    expect(parsed.pricing!.tiers![1]!.inputPer1kTokens).toBe(0.246);
    expect(parsed.digest).toBe(fixture.digest);
    expect(parseModelMetadataSnapshot(redigest({ ...fixture, pricing: null }))!.pricing).toBeNull();
  });

  it("rejects invalid rates, dates, token facts, and tier ordering even with a matching digest", () => {
    const fixture = historicalFixture();
    const pricing = fixture.pricing as Record<string, unknown>;
    for (const invalid of [
      { ...fixture, asOf: "2026-02-30" },
      { ...fixture, contextWindowTokens: -1 },
      { ...fixture, maxOutputTokens: 0 },
      { ...fixture, reasoning: "probed" },
      { ...fixture, pricing: { ...pricing, inputPer1kTokens: -1 } },
      { ...fixture, pricing: { ...pricing, currency: "EUR" } },
      { ...fixture, pricing: { ...pricing, tiers: [] } },
      { ...fixture, pricing: { ...pricing, tiers: [...(pricing.tiers as unknown[])].reverse() } }
    ]) expect(parseModelMetadataSnapshot(redigest(invalid))).toBeNull();
  });

  it("detaches and deeply freezes snapshots so catalog or caller changes cannot alter pins", () => {
    const snapshot = createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!;
    const original = MODEL_PRICING["gpt-4o"]!.inputPer1kTokens;
    try {
      MODEL_PRICING["gpt-4o"]!.inputPer1kTokens = 99;
      expect(snapshot.pricing!.inputPer1kTokens).toBe(original);
      expect(createModelMetadataSnapshot("openai", "openai-chat-completions", "gpt-4o")!.digest).not.toBe(snapshot.digest);
    } finally {
      MODEL_PRICING["gpt-4o"]!.inputPer1kTokens = original;
    }
    const fixture = historicalFixture();
    const parsed = parseModelMetadataSnapshot(fixture)!;
    const pricing = fixture.pricing as { tiers: Array<{ inputPer1kTokens: number }> };
    pricing.tiers[0]!.inputPer1kTokens = 9;
    expect(parsed.pricing!.tiers![0]!.inputPer1kTokens).toBe(0.123);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pricing)).toBe(true);
    expect(Object.isFrozen(parsed.pricing!.tiers)).toBe(true);
    expect(Object.isFrozen(parsed.pricing!.tiers![0])).toBe(true);
  });
});
