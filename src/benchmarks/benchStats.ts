import { percentileRank } from "../experiments/stats.js";
import { listImportedBenchmarks } from "./benchStore.js";
import type { BenchmarkArtifact } from "./benchSchema.js";

function percentile(values: number[], value: number): number {
  return Number(percentileRank(values, value).toFixed(2));
}

export function benchmarkStats(params: {
  workspace: string;
  groupBy?: "archetype" | "riskTier" | "trustLabel";
}): {
  count: number;
  groups: Array<{
    key: string;
    count: number;
    overallMedian: number;
    integrityMedian: number;
  }>;
  scatter: Array<{
    benchId: string;
    overall: number;
    integrityIndex: number;
    percentileOverall: number;
  }>;
} {
  const list = listImportedBenchmarks(params.workspace);
  const benchmarks = list.map((row) => row.bench);
  const overallValues = benchmarks.map((bench) => bench.run.overall);
  const scatter = benchmarks.map((bench) => ({
    benchId: bench.benchId,
    overall: bench.run.overall,
    integrityIndex: bench.run.integrityIndex,
    percentileOverall: percentile(overallValues, bench.run.overall)
  }));

  const keyFor = (bench: BenchmarkArtifact): string => {
    if (params.groupBy === "archetype") {
      return bench.agent.archetypeId ?? "unknown";
    }
    if (params.groupBy === "trustLabel") {
      return bench.run.trustLabel;
    }
    return bench.agent.riskTier;
  };
  const groups = new Map<string, BenchmarkArtifact[]>();
  for (const bench of benchmarks) {
    const key = keyFor(bench);
    const arr = groups.get(key) ?? [];
    arr.push(bench);
    groups.set(key, arr);
  }
  return {
    count: benchmarks.length,
    groups: [...groups.entries()].map(([key, arr]) => {
      const sortedOverall = arr.map((item) => item.run.overall).sort((a, b) => a - b);
      const sortedIntegrity = arr.map((item) => item.run.integrityIndex).sort((a, b) => a - b);
      // Upper order statistic for even groups, unlike the midpoint median in experiments/stats.ts.
      const mid = Math.floor(arr.length / 2);
      return {
        key,
        count: arr.length,
        overallMedian: Number((sortedOverall[mid] ?? 0).toFixed(3)),
        integrityMedian: Number((sortedIntegrity[mid] ?? 0).toFixed(3))
      };
    }),
    scatter
  };
}

