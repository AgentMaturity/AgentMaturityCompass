import { describe, expect, test, vi } from "vitest";
import { computeAggregateStats, createConsortiumPool, addMember, submitContribution } from "../src/benchmarks/consortium.js";
import { benchmarkStats } from "../src/benchmarks/benchStats.js";
import { checkDeterminism } from "../src/product/determinism.js";

vi.mock("../src/benchmarks/benchStore.js", () => ({
  listImportedBenchmarks: () => [1, 3].map((overall) => ({
    bench: { benchId: `bench-${overall}`, agent: { riskTier: "low" }, run: { overall, integrityIndex: overall / 5 } },
  })),
}));

describe("AXE-30 remaining statistical compatibility", () => {
  test("benchmark groups retain upper medians and percentile ranks including ties", () => {
    const result = benchmarkStats({ workspace: "/unused" });
    expect(result.groups).toEqual([{ key: "low", count: 2, overallMedian: 3, integrityMedian: 0.6 }]);
    expect(result.scatter.map((row) => row.percentileOverall)).toEqual([50, 100]);
  });

  test("consortium distributions retain interpolated quartiles and rounded population SD", () => {
    const pool = createConsortiumPool();
    const member = addMember(pool, "stats-fixture");
    submitContribution(pool, member.memberId, [10, 20, 30, 40].map((compositeScore) => ({
      agentPseudonym: `agent-${compositeScore}`, compositeScore, layerScores: { L0: compositeScore },
      trustLabel: "MEDIUM TRUST", questionsAnswered: 1, amcVersion: "1.0.0",
    })));
    expect(computeAggregateStats(pool).scoreDistribution).toEqual({
      mean: 25, median: 25, stdDev: 11.18, min: 10, max: 40, p25: 17.5, p75: 32.5, p90: 37,
    });
  });

  test("IQR outliers retain floor(n*p) quartiles instead of interpolating", () => {
    // With four points, the legacy upper quartile is the maximum, so it is not an outlier.
    expect(checkDeterminism(["0", "1", "2", "100"]).outliers).toEqual([]);
  });

  test("numeric determinism uses sample variation and preserves zero-mean convention", () => {
    expect(checkDeterminism(["1", "3"]).coefficientOfVariation).toBe(Math.sqrt(2) / 2);
    expect(checkDeterminism(["-1", "1"]).coefficientOfVariation).toBe(0);
  });
});
