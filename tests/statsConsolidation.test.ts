import { describe, expect, test } from "vitest";
import {
  bootstrapDifferenceCI, cohensD, mean, median, nearestRank, percentileRank,
  populationVariance, quantile, sampleVariance, standardDeviation, wilsonInterval,
} from "../src/experiments/stats.js";

describe("AXE-30 shared statistics", () => {
  test("descriptive moments distinguish sample and population denominators", () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(values)).toBe(5);
    expect(populationVariance(values)).toBe(4);
    expect(sampleVariance(values)).toBe(32 / 7);
    expect(standardDeviation(values, false)).toBe(2);
    expect(standardDeviation(values)).toBe(Math.sqrt(32 / 7));
    expect(populationVariance([1, 3], 1)).toBe(2);
    expect(sampleVariance([1, 3], 1)).toBe(4);
    expect(mean([])).toBe(0);
    expect(sampleVariance([9])).toBe(0);
    expect(standardDeviation([])).toBe(0);
  });

  test("quantiles, nearest ranks and percentile ranks remain different operations", () => {
    const values = [40, 10, 30, 20];
    expect(quantile(values, 0.25)).toBe(17.5);
    expect(nearestRank(values, 0.25)).toBe(10);
    expect(percentileRank(values, 20)).toBe(50);
    expect(median(values)).toBe(25);
    expect(values).toEqual([40, 10, 30, 20]);
    expect(quantile(values, -1)).toBe(10);
    expect(quantile(values, 2)).toBe(40);
    expect(nearestRank(values, 0)).toBe(10);
    expect(nearestRank(values, 2)).toBe(40);
    expect(percentileRank([10, 20, 20, 40], 20)).toBe(75);
    expect(quantile([], 0.5)).toBe(0);
    expect(nearestRank([], 0.5)).toBe(0);
    expect(percentileRank([], 2)).toBe(0);
    expect(median([Number.MIN_VALUE, Number.MIN_VALUE])).toBe(Number.MIN_VALUE);
  });

  test("independent standardized effects retain direction and pooled sample SD", () => {
    expect(cohensD([1, 2, 3], [2, 3, 4])).toBe(-1);
    expect(cohensD([2, 3, 4], [1, 2, 3])).toBe(1);
    expect(cohensD([1, 1], [3, 3])).toBe(0);
    expect(cohensD([], [1, 2])).toBe(0);
  });

  test("Wilson binomial bounds differ from a mean bootstrap at zero successes", () => {
    const zero = wilsonInterval(0, 10);
    expect(zero.lower).toBe(0);
    expect(zero.upper).toBeCloseTo(0.2775401687666166, 14);
    expect(wilsonInterval(5, 10).center).toBe(0.5);
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 0, center: 0 });
  });

  test("empty independent cohorts cannot produce a fabricated numeric interval", () => {
    for (const [baseline, candidate] of [[[], [1, 2]], [[1, 2], []], [[], []]]) {
      expect(bootstrapDifferenceCI({ baseline: baseline!, candidate: candidate!, seed: 7 }))
        .toMatchObject({ status: "insufficient", interval: null });
    }
    // Nonempty independent-cohort reports preserve their tuple and six-decimal representation.
    expect(bootstrapDifferenceCI({ baseline: [1, 1], candidate: [3, 3], seed: 7 })).toEqual([2, 2]);
  });
});
