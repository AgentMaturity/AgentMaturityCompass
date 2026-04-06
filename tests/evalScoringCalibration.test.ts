import { describe, it, expect } from "vitest";
import {
  evaluateMonotonicity,
  evaluateTierDiscrimination,
  evaluateScoringCalibration,
  computePercentiles,
} from "../src/steer/research/eval_scoring_calibration.js";

describe("eval_scoring_calibration", () => {
  it("monotonicity: better inputs score higher than worse inputs", () => {
    const result = evaluateMonotonicity();
    expect(result.total).toBeGreaterThanOrEqual(8);
    expect(result.passRate).toBeGreaterThan(0.6);
  });

  it("tier discrimination: excellent > good > mediocre > poor in means", () => {
    const result = evaluateTierDiscrimination();
    expect(result.orderingCorrect).toBe(true);
    expect(result.minTierGap).toBeGreaterThan(0);
  });

  it("tier discrimination: large effect size between excellent and poor", () => {
    const result = evaluateTierDiscrimination();
    expect(result.effectSize).toBeGreaterThan(1.0); // Cohen's d > 1 = large
  });

  it("percentiles span a reasonable range", () => {
    const pct = computePercentiles();
    expect(pct.p5).toBeLessThan(pct.p95);
    expect(pct.p25).toBeLessThan(pct.p75);
    expect(pct.p50).toBeGreaterThan(0);
    expect(pct.p50).toBeLessThanOrEqual(1);
  });

  it("full calibration evaluation returns all fields", () => {
    const result = evaluateScoringCalibration();
    expect(result.monotonicity.total).toBeGreaterThan(0);
    expect(result.tierDiscrimination.tiers.excellent.n).toBeGreaterThan(0);
    expect(result.percentiles.p50).toBeDefined();
    expect(result.totalSamples).toBeGreaterThan(0);
  });
});
