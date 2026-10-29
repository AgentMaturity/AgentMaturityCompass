import { describe, expect, it } from "vitest";
import { MODEL_PRICING, blendedCostPer1k, lookupModelPrice, MODEL_PRICING_AS_OF } from "../src/product/modelPricing.js";
import { compareModelCosts, estimateBatchCost, estimateCost, getModelPricing, listModels } from "../src/product/toolCostEstimator.js";
import { CostLatencyRouter } from "../src/product/costLatencyRouter.js";
import { ModelRouter } from "../src/ops/modelRouter.js";

/**
 * G3-32: two hardcoded pricing tables disagreed about the same model — gpt-4o
 * was a blended 0.005 in costLatencyRouter and 0.0025 input / 0.01 output in
 * toolCostEstimator — so an estimate depended on which module a caller reached.
 */
describe("model pricing has one source", () => {
  it("both consumers agree on gpt-4o", () => {
    const shared = lookupModelPrice("gpt-4o");
    expect(shared).not.toBeNull();

    // The router's blended figure must derive from the shared split rates.
    const router = new CostLatencyRouter();
    const routed = router.route("general");
    const routedProfile = routed.profile ?? routed;
    if (routedProfile && typeof routedProfile === "object" && "model" in routedProfile) {
      const price = lookupModelPrice(String((routedProfile as { model: string }).model));
      if (price) {
        expect(blendedCostPer1k(price)).toBeCloseTo(
          (price.inputPer1kTokens + price.outputPer1kTokens) / 2,
          10
        );
      }
    }
  });

  it("carries an as-of date so stale prices are visible", () => {
    expect(MODEL_PRICING_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("refuses to guess at an unknown model", () => {
    expect(lookupModelPrice("no-such-model-v9")).toBeNull();
  });

  it("keeps the models the estimator relied on", () => {
    for (const model of ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "claude-3-haiku", "gemini-1.5-flash"]) {
      expect(MODEL_PRICING).toHaveProperty(model);
    }
  });

  it("the estimator reads the same rates as the shared table", () => {
    const shared = lookupModelPrice("gpt-4o")!;
    const viaEstimator = getModelPricing("gpt-4o");
    expect(viaEstimator?.inputPer1kTokens).toBe(shared.inputPer1kTokens);
    expect(viaEstimator?.outputPer1kTokens).toBe(shared.outputPer1kTokens);
    // And it can still see every model it previously shipped.
    expect(listModels().length).toBeGreaterThanOrEqual(8);
  });

  it("the ops router shares indicative rates and context limits for overlapping models", () => {
    const overlaps = new ModelRouter().listModels().filter(model => Object.hasOwn(MODEL_PRICING, model.id));
    expect(overlaps.length).toBeGreaterThanOrEqual(3);
    for (const model of overlaps) {
      const price = MODEL_PRICING[model.id]!;
      expect(model.inputCostPer1K).toBe(price.inputPer1kTokens);
      expect(model.outputCostPer1K).toBe(price.outputPer1kTokens);
      expect(model.maxContext).toBe(price.contextWindow);
    }
  });

  it.each(["no-such-model-v9", "__proto__", "constructor", ""])("keeps explicit unknown model %j unpriced", model => {
    expect(getModelPricing(model)).toBeUndefined();
    const estimate = estimateCost("web_search", { query: "hello" }, model);
    expect(estimate.model).toBe(model);
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCost).toBeNull();
    const comparison = compareModelCosts([{ toolName: "web_search", args: { query: "hello" } }], [model]);
    expect(Object.hasOwn(comparison, model)).toBe(true);
    expect(comparison[model]?.totalCost).toBeNull();
  });

  it("keeps unknown model costs and remaining budget unknown through batch and comparison results", () => {
    const calls = [{ toolName: "web_search", args: { query: "hello" } }];
    const batch = estimateBatchCost(calls, "no-such-model-v9", 1);
    expect(batch.totalTokens).toBeGreaterThan(0);
    expect(batch.breakdown[0]?.estimatedCost).toBeNull();
    expect(batch.totalCost).toBeNull();
    expect(batch.budgetRemaining).toBeNull();
    const comparison = compareModelCosts(calls, ["gpt-4o", "no-such-model-v9"]);
    expect(comparison["gpt-4o"]?.totalCost).toBeGreaterThan(0);
    expect(comparison["no-such-model-v9"]?.totalCost).toBeNull();
  });

  it("retains legacy tool heuristics when no model is selected", () => {
    const batch = estimateBatchCost([{ toolName: "web_search", args: { query: "hello" } }], undefined, 1);
    expect(batch.breakdown[0]?.estimatedCost).toBeGreaterThan(0);
    expect(batch.totalCost).toBeGreaterThan(0);
    expect(batch.budgetRemaining).toBeLessThan(1);
  });
});
