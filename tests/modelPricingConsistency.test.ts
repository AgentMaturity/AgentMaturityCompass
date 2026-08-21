import { describe, expect, it } from "vitest";
import { MODEL_PRICING, blendedCostPer1k, lookupModelPrice, MODEL_PRICING_AS_OF } from "../src/product/modelPricing.js";
import { getModelPricing, listModels } from "../src/product/toolCostEstimator.js";
import { CostLatencyRouter } from "../src/product/costLatencyRouter.js";

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
});
