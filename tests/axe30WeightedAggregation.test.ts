import { describe, expect, it } from "vitest";
import { robustScore, weightedMean, weightedMedian, weightedPercentile } from "../src/org/orgAggregation.js";

describe("AXE-30 organizational weighted statistics", () => {
  it("selects cumulative-weight quantiles rather than interpolated quantiles or midpoint medians", () => {
    const equal = [{ value: 0, weight: 1 }, { value: 10, weight: 1 }];
    expect(weightedMedian(equal)).toBe(0);
    expect(weightedPercentile(equal, 0.50000001)).toBe(10);
    expect(weightedPercentile(equal, -1)).toBe(0);
    expect(weightedPercentile(equal, 2)).toBe(10);
    expect(weightedMedian([{ value: 0, weight: 0.1 }, { value: 10, weight: 0.9 }])).toBe(10);
  });

  it("weights means and trims partial row weight rather than whole observations", () => {
    const points = [{ value: 0, weight: 0.2 }, { value: 10, weight: 0.8 }];
    expect(weightedMean(points)).toBe(8);
    expect(robustScore(points, 0.1)).toEqual({ median: 10, trimmedMean: 8.75 });
  });

  it("excludes nonfinite values and nonpositive or nonfinite weights before aggregation", () => {
    const points = [
      { value: 0, weight: 1 }, { value: 10, weight: 1 },
      { value: 100, weight: 0 }, { value: 100, weight: -1 },
      { value: Number.NaN, weight: 1 }, { value: 100, weight: Infinity },
    ];
    expect(weightedMean(points)).toBe(5);
    expect(weightedMedian(points)).toBe(0);
    expect(robustScore(points)).toEqual({ median: 0, trimmedMean: 5 });
    expect(weightedPercentile([], 0.5)).toBe(0);
  });
});
