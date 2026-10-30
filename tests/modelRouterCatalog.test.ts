import { describe, expect, it } from "vitest";
import { ModelRouter } from "../src/ops/modelRouter.js";
import { createModelMetadataSnapshot, createReviewedModelMetadataSnapshot, parseModelMetadataSnapshot } from "../src/llm/modelCatalog.js";
import { lookupProviderCatalog } from "../src/llm/providerCatalog.js";

const reviewed = { providerId: "custom", protocol: "openai-chat-completions", model: "reviewed-model", source: "operator review of advisory snapshot", asOf: "2026-10-30", contextWindowTokens: 64000, maxOutputTokens: 8000, modalities: null, reasoning: null } as const;

describe("reviewed route metadata", () => {
  it("pins explicit review without inventing prices or model support", () => {
    const pin = createReviewedModelMetadataSnapshot(reviewed);
    expect(pin).toMatchObject({ ...reviewed, canonicalProviderId: "custom", canonicalModel: "reviewed-model", pricing: null, modelSupport: "catalog-not-probed", reviewKind: "operator-declared" });
    expect(parseModelMetadataSnapshot(pin)).toEqual(pin);
    expect(Object.isFrozen(pin)).toBe(true);
    expect(createReviewedModelMetadataSnapshot({ ...reviewed, contextWindowTokens: null, maxOutputTokens: null })).toMatchObject({ contextWindowTokens: null, maxOutputTokens: null, pricing: null });
  });

  it.each([{ asOf: "2026-02-30" }, { contextWindowTokens: 0 }, { maxOutputTokens: -1 }, { source: "" }, { source: "   " }, { contextWindowTokens: Number.MAX_SAFE_INTEGER + 1 }])("rejects invalid explicit review %j", invalid => {
    expect(() => createReviewedModelMetadataSnapshot({ ...reviewed, ...invalid })).toThrow();
  });
});

describe("catalog-driven ops routes", () => {
  it("uses reviewed pins and shared provider defaults", () => {
    const router = new ModelRouter();
    for (const model of router.listModels()) {
      const pin = model.modelMetadata;
      if (pin != null) {
        expect(pin).toEqual(createModelMetadataSnapshot(model.provider, pin.protocol, model.id));
        expect(model.maxContext).toBe(pin.contextWindowTokens);
        expect(model.inputCostPer1K).toBe(pin.pricing?.inputPer1kTokens ?? null);
      }
    }
    for (const provider of router.getProviders()) expect(provider.baseUrl).toBe(lookupProviderCatalog(provider.id)?.defaultBaseUrl);
  });

  it("preserves uncatalogued rows with unknown limits and prices", () => {
    const router = new ModelRouter();
    for (const id of ["claude-haiku-3.5", "gemini-2.5-pro", "gemini-2.5-flash", "llama-3.3-70b"]) {
      expect(router.listModels().find(model => model.id === id)).toMatchObject({ inputCostPer1K: null, outputCostPer1K: null, maxContext: null, modelMetadata: null });
    }
    expect(router.route({ strategy: "cheapest", requiredCapabilities: [] })?.selectedModel.id).not.toBe("llama-3.3-70b");
  });

  it.each([{ minContext: 1 }, { maxCostPer1K: 0 }])("does not admit unknown metadata for a constraint %j", constraint => {
    const router = new ModelRouter();
    expect(router.route({ strategy: "fallback", requiredCapabilities: [], excludeProviders: ["openai", "anthropic", "google"], ...constraint })).toBeUndefined();
  });

  it("can select an unknown model without manufacturing a cost statistic", () => {
    const router = new ModelRouter();
    const decision = router.route({ strategy: "fallback", requiredCapabilities: [], excludeProviders: ["openai", "anthropic", "google"] });
    expect(decision).toBeDefined();
    expect(decision?.estimatedCost).toEqual({ inputPer1K: null, outputPer1K: null });
    expect(router.getStats().avgCostPer1K).toBeNull();
  });

  it("does not rewrite historical unknown cost after a model configuration changes", () => {
    const router = new ModelRouter();
    const selected = router.route({ strategy: "fallback", requiredCapabilities: [], excludeProviders: ["openai", "anthropic", "google"] })!;
    selected.selectedModel.inputCostPer1K = 0;
    selected.selectedModel.outputCostPer1K = 0;
    router.route({ strategy: "fallback", requiredCapabilities: [], excludeProviders: ["openai", "anthropic", "google"] });
    expect(selected.estimatedCost).toEqual({ inputPer1K: null, outputPer1K: null });
    expect(router.getStats().avgCostPer1K).toBeNull();
  });

  it("keeps independent router instances independent", () => {
    const first = new ModelRouter(), second = new ModelRouter();
    first.addModel({ id: "extra", name: "Extra", provider: "openai", inputCostPer1K: 1, outputCostPer1K: 2, maxContext: 100, capabilities: [], avgLatencyMs: 10, qualityTier: 1 });
    expect(second.getProviders().find(provider => provider.id === "openai")?.models.some(model => model.id === "extra")).toBe(false);
  });
});
