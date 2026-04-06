import { describe, expect, test } from "vitest";
import {
  FRONTIER_BASELINES,
  compareAgainstBaselines,
  calculatePercentile,
  analyzeGaps,
} from "../src/benchmarks/frontierBaseline.js";

describe("FRONTIER_BASELINES", () => {
  test("contains reference baselines for major models", () => {
    expect(FRONTIER_BASELINES.length).toBeGreaterThanOrEqual(5);
    const providers = FRONTIER_BASELINES.map((b) => b.provider);
    expect(providers).toContain("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google");
  });

  test("all baselines have valid layer scores", () => {
    for (const baseline of FRONTIER_BASELINES) {
      expect(baseline.compositeScore).toBeGreaterThan(0);
      expect(baseline.compositeScore).toBeLessThanOrEqual(100);
      expect(Object.keys(baseline.layerScores).length).toBeGreaterThan(0);
    }
  });
});

describe("compareAgainstBaselines", () => {
  test("returns comparisons sorted by gap proximity", () => {
    const comparisons = compareAgainstBaselines(75, { L0: 85, L1: 78, L2: 70, L3: 65, L4: 60 });
    expect(comparisons.length).toBe(FRONTIER_BASELINES.length);
    // First comparison should have smallest absolute gap
    expect(Math.abs(comparisons[0]!.gap)).toBeLessThanOrEqual(Math.abs(comparisons[1]!.gap));
  });

  test("calculates per-layer gaps correctly", () => {
    const comparisons = compareAgainstBaselines(
      80,
      { L0: 90, L1: 85, L2: 75, L3: 70, L4: 65 },
    );
    const first = comparisons[0]!;
    for (const [layer, gap] of Object.entries(first.layerGaps)) {
      const agentScore = { L0: 90, L1: 85, L2: 75, L3: 70, L4: 65 }[layer] ?? 0;
      const baselineScore = first.baseline.layerScores[layer] ?? 0;
      expect(gap).toBeCloseTo(agentScore - baselineScore, 1);
    }
  });
});

describe("calculatePercentile", () => {
  test("high scorer gets high percentile", () => {
    const percentile = calculatePercentile(95);
    expect(percentile).toBe(100); // above all baselines
  });

  test("low scorer gets low percentile", () => {
    const percentile = calculatePercentile(50);
    expect(percentile).toBe(0); // below all baselines
  });

  test("mid-range scorer gets middle percentile", () => {
    const percentile = calculatePercentile(75);
    expect(percentile).toBeGreaterThan(0);
    expect(percentile).toBeLessThan(100);
  });
});

describe("analyzeGaps", () => {
  test("produces a complete gap analysis", () => {
    const result = analyzeGaps(
      "test-agent",
      70,
      { L0: 80, L1: 72, L2: 65, L3: 60, L4: 55 },
    );
    expect(result.agentId).toBe("test-agent");
    expect(result.agentComposite).toBe(70);
    expect(result.nearestBaseline).toBeDefined();
    expect(typeof result.percentile).toBe("number");
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(Array.isArray(result.weaknesses)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  test("identifies weaknesses for low-scoring layers", () => {
    const result = analyzeGaps(
      "weak-agent",
      50,
      { L0: 50, L1: 45, L2: 40, L3: 35, L4: 30 },
    );
    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
