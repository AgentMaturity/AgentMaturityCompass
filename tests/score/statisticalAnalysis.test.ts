import { describe, it, expect } from "vitest";
import {
  scoreConfidenceInterval,
  compareScores,
  recommendSampleSize,
  abTest,
  maturityConfidenceIntervals,
} from "../../src/score/statisticalAnalysis.js";

describe("scoreConfidenceInterval", () => {
  it("returns zero-width interval for empty input", () => {
    const ci = scoreConfidenceInterval([]);
    expect(ci.estimate).toBe(0);
    expect(ci.sampleSize).toBe(0);
    expect(ci.marginOfError).toBe(0);
  });

  it("returns point estimate for single value", () => {
    const ci = scoreConfidenceInterval([0.75]);
    expect(ci.estimate).toBe(0.75);
    expect(ci.lower).toBe(0.75);
    expect(ci.upper).toBe(0.75);
    expect(ci.sampleSize).toBe(1);
  });

  it("computes valid CI for known data", () => {
    const values = [0.7, 0.8, 0.75, 0.72, 0.78];
    const ci = scoreConfidenceInterval(values, 0.95);

    expect(ci.estimate).toBeCloseTo(0.75, 2);
    expect(ci.lower).toBeLessThan(ci.estimate);
    expect(ci.upper).toBeGreaterThan(ci.estimate);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(1);
    expect(ci.confidenceLevel).toBe(0.95);
    expect(ci.sampleSize).toBe(5);
  });

  it("wider CI at higher confidence level", () => {
    const values = [0.6, 0.65, 0.7, 0.62, 0.68, 0.66, 0.71, 0.63];
    const ci90 = scoreConfidenceInterval(values, 0.90);
    const ci99 = scoreConfidenceInterval(values, 0.99);

    expect(ci99.marginOfError).toBeGreaterThan(ci90.marginOfError);
  });

  it("narrower CI with more data", () => {
    const small = [0.5, 0.55, 0.52];
    const large = [0.5, 0.55, 0.52, 0.51, 0.53, 0.49, 0.54, 0.50, 0.52, 0.51];

    const ciSmall = scoreConfidenceInterval(small);
    const ciLarge = scoreConfidenceInterval(large);

    expect(ciLarge.marginOfError).toBeLessThan(ciSmall.marginOfError);
  });

  it("clamps bounds to [0, 1]", () => {
    // Very low scores with high variance could push lower bound below 0
    const values = [0.01, 0.02, 0.03, 0.15, 0.01];
    const ci = scoreConfidenceInterval(values, 0.99);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
  });
});

describe("compareScores", () => {
  it("throws with fewer than 2 observations", () => {
    expect(() => compareScores([0.5], [0.6, 0.7])).toThrow("at least 2 observations");
  });

  it("detects significant difference between clearly different groups", () => {
    const groupA = [0.3, 0.32, 0.28, 0.31, 0.29, 0.33, 0.30, 0.27, 0.34, 0.31];
    const groupB = [0.7, 0.72, 0.68, 0.71, 0.69, 0.73, 0.70, 0.67, 0.74, 0.71];

    const result = compareScores(groupA, groupB);

    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.difference).toBeGreaterThan(0.3);
    expect(result.effectSize).toBeGreaterThan(1); // large effect
    expect(result.scoreB).toBeGreaterThan(result.scoreA);
  });

  it("finds no significant difference for overlapping groups", () => {
    const groupA = [0.50, 0.55, 0.48, 0.52];
    const groupB = [0.51, 0.54, 0.49, 0.53];

    const result = compareScores(groupA, groupB);

    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(Math.abs(result.effectSize)).toBeLessThan(0.5);
  });

  it("returns correct direction of difference", () => {
    const groupA = [0.8, 0.82, 0.79, 0.81, 0.83];
    const groupB = [0.4, 0.42, 0.39, 0.41, 0.43];

    const result = compareScores(groupA, groupB);

    expect(result.difference).toBeLessThan(0); // B < A
    expect(result.scoreA).toBeGreaterThan(result.scoreB);
  });

  it("respects custom alpha", () => {
    const groupA = [0.50, 0.55, 0.53, 0.52, 0.54];
    const groupB = [0.56, 0.60, 0.58, 0.57, 0.59];

    const strict = compareScores(groupA, groupB, 0.001);
    const lenient = compareScores(groupA, groupB, 0.10);

    // Same p-value, different significance conclusions possible
    expect(strict.pValue).toBe(lenient.pValue);
    expect(strict.alpha).toBe(0.001);
    expect(lenient.alpha).toBe(0.10);
  });

  it("includes CI for difference", () => {
    const groupA = [0.3, 0.35, 0.32, 0.28, 0.31];
    const groupB = [0.6, 0.65, 0.62, 0.58, 0.61];

    const result = compareScores(groupA, groupB);

    expect(result.differenceCI.estimate).toBeCloseTo(result.difference, 10);
    expect(result.differenceCI.lower).toBeLessThan(result.differenceCI.upper);
    expect(result.differenceCI.confidenceLevel).toBe(0.95);
  });
});

describe("recommendSampleSize", () => {
  it("returns reasonable defaults", () => {
    const rec = recommendSampleSize({});

    expect(rec.perGroup).toBeGreaterThan(0);
    expect(rec.total).toBe(rec.perGroup * 2);
    expect(rec.confidenceLevel).toBe(0.95);
    expect(rec.power).toBe(0.80);
  });

  it("larger sample for tighter margin of error", () => {
    const loose = recommendSampleSize({ desiredMarginOfError: 0.10 });
    const tight = recommendSampleSize({ desiredMarginOfError: 0.02 });

    expect(tight.perGroup).toBeGreaterThan(loose.perGroup);
  });

  it("larger sample for higher confidence level", () => {
    const low = recommendSampleSize({ confidenceLevel: 0.90 });
    const high = recommendSampleSize({ confidenceLevel: 0.99 });

    expect(high.perGroup).toBeGreaterThan(low.perGroup);
  });

  it("larger sample for smaller detectable effect", () => {
    const big = recommendSampleSize({ minDetectableEffect: 0.8 });
    const small = recommendSampleSize({ minDetectableEffect: 0.2 });

    expect(small.perGroup).toBeGreaterThan(big.perGroup);
  });

  it("uses pilot SD when provided", () => {
    const lowVar = recommendSampleSize({ pilotSD: 0.05 });
    const highVar = recommendSampleSize({ pilotSD: 0.40 });

    expect(highVar.perGroup).toBeGreaterThan(lowVar.perGroup);
  });
});

describe("abTest", () => {
  it("detects overall winner when one version is clearly better", () => {
    const result = abTest(
      {
        label: "v1.0",
        samples: [
          { dimension: "security", values: [0.3, 0.32, 0.28, 0.31, 0.29] },
          { dimension: "reliability", values: [0.4, 0.42, 0.38, 0.41, 0.39] },
          { dimension: "overall", values: [0.35, 0.37, 0.33, 0.36, 0.34] },
        ],
      },
      {
        label: "v2.0",
        samples: [
          { dimension: "security", values: [0.7, 0.72, 0.68, 0.71, 0.69] },
          { dimension: "reliability", values: [0.8, 0.82, 0.78, 0.81, 0.79] },
          { dimension: "overall", values: [0.75, 0.77, 0.73, 0.76, 0.74] },
        ],
      },
    );

    expect(result.summary.winner).toBe("v2.0");
    expect(result.summary.overallSignificant).toBe(true);
    expect(result.summary.significantDimensions).toContain("security");
    expect(result.summary.significantDimensions).toContain("reliability");
    expect(result.overall.significant).toBe(true);
  });

  it("reports no winner when versions are equivalent", () => {
    const makeNoise = (base: number) =>
      Array.from({ length: 5 }, (_, i) => base + (i % 2 === 0 ? 0.01 : -0.01));

    const result = abTest(
      {
        label: "v1.0",
        samples: [
          { dimension: "security", values: makeNoise(0.5) },
          { dimension: "overall", values: makeNoise(0.5) },
        ],
      },
      {
        label: "v1.1",
        samples: [
          { dimension: "security", values: makeNoise(0.505) },
          { dimension: "overall", values: makeNoise(0.505) },
        ],
      },
    );

    expect(result.summary.winner).toBeNull();
    expect(result.summary.overallSignificant).toBe(false);
  });

  it("handles missing dimensions gracefully", () => {
    const result = abTest(
      {
        label: "v1",
        samples: [
          { dimension: "security", values: [0.5, 0.55, 0.52] },
        ],
      },
      {
        label: "v2",
        samples: [
          { dimension: "security", values: [0.7, 0.75, 0.72] },
          { dimension: "cost", values: [0.9, 0.92, 0.88] },
        ],
      },
    );

    expect(result.dimensions["security"]).toBeDefined();
    // cost only in B → should be in insignificant (insufficient data for A)
    expect(result.summary.insignificantDimensions).toContain("cost");
  });

  it("includes per-dimension breakdown", () => {
    const result = abTest(
      {
        label: "baseline",
        samples: [
          { dimension: "security", values: [0.3, 0.35, 0.32, 0.28, 0.31] },
          { dimension: "reliability", values: [0.6, 0.62, 0.58, 0.61, 0.59] },
          { dimension: "overall", values: [0.45, 0.48, 0.43, 0.46, 0.44] },
        ],
      },
      {
        label: "improved",
        samples: [
          { dimension: "security", values: [0.7, 0.75, 0.72, 0.68, 0.71] },
          { dimension: "reliability", values: [0.60, 0.63, 0.57, 0.62, 0.59] },
          { dimension: "overall", values: [0.66, 0.69, 0.63, 0.67, 0.65] },
        ],
      },
    );

    expect(result.dimensions["security"].significant).toBe(true);
    expect(result.dimensions["security"].effectSize).toBeGreaterThan(1);
    // reliability barely changed
    expect(result.dimensions["reliability"].effectSize).toBeLessThan(0.5);
  });
});

describe("maturityConfidenceIntervals", () => {
  it("returns CIs for all dimensions", () => {
    const samples = [
      { dimension: "security", values: [0.7, 0.72, 0.68, 0.71, 0.69] },
      { dimension: "reliability", values: [0.8, 0.82, 0.78, 0.81, 0.79] },
      { dimension: "governance", values: [0.5, 0.55, 0.48, 0.52, 0.51] },
    ];

    const cis = maturityConfidenceIntervals(samples);

    expect(Object.keys(cis)).toEqual(["security", "reliability", "governance"]);
    for (const [dim, ci] of Object.entries(cis)) {
      expect(ci.lower).toBeLessThanOrEqual(ci.estimate);
      expect(ci.upper).toBeGreaterThanOrEqual(ci.estimate);
      expect(ci.sampleSize).toBe(5);
      expect(ci.confidenceLevel).toBe(0.95);
    }
  });

  it("supports custom confidence level", () => {
    const samples = [
      { dimension: "eval", values: [0.6, 0.62, 0.58, 0.61, 0.59, 0.63, 0.57] },
    ];

    const ci90 = maturityConfidenceIntervals(samples, 0.90);
    const ci99 = maturityConfidenceIntervals(samples, 0.99);

    expect(ci99["eval"].marginOfError).toBeGreaterThan(ci90["eval"].marginOfError);
  });
});
