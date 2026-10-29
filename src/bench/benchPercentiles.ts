import { percentileRank } from "../experiments/stats.js";
import type { BenchArtifact } from "./benchSchema.js";

export interface BenchComparablePoint {
  benchId: string;
  overall: number;
  integrityIndex: number;
  correlationRatio: number;
  strategicOps: number;
  leadership: number;
  culture: number;
  resilience: number;
  skills: number;
  ecosystemFocusRisk: number;
  clarityPathRisk: number;
  economicSignificanceRisk: number;
  riskAssuranceRisk: number;
  digitalDualityRisk: number;
  emotionalValue: number;
  functionalValue: number;
  economicValue: number;
  brandValue: number;
  lifetimeValue: number;
  valueScore: number;
}

export function flattenBenchMetrics(bench: BenchArtifact): BenchComparablePoint {
  const valueScore =
    typeof bench.metrics.valueDimensions.valueScore === "number"
      ? bench.metrics.valueDimensions.valueScore
      : Number(
          (
            (bench.metrics.valueDimensions.emotionalValue +
              bench.metrics.valueDimensions.functionalValue +
              bench.metrics.valueDimensions.economicValue +
              bench.metrics.valueDimensions.brandValue +
              bench.metrics.valueDimensions.lifetimeValue) /
            5
          ).toFixed(6)
        );
  return {
    benchId: bench.benchId,
    overall: bench.metrics.maturity.overall,
    integrityIndex: bench.evidence.integrityIndex,
    correlationRatio: bench.evidence.correlationRatio,
    strategicOps: bench.metrics.maturity.fiveLayers.strategicOps,
    leadership: bench.metrics.maturity.fiveLayers.leadership,
    culture: bench.metrics.maturity.fiveLayers.culture,
    resilience: bench.metrics.maturity.fiveLayers.resilience,
    skills: bench.metrics.maturity.fiveLayers.skills,
    ecosystemFocusRisk: bench.metrics.strategyFailureRisks.ecosystemFocusRisk,
    clarityPathRisk: bench.metrics.strategyFailureRisks.clarityPathRisk,
    economicSignificanceRisk: bench.metrics.strategyFailureRisks.economicSignificanceRisk,
    riskAssuranceRisk: bench.metrics.strategyFailureRisks.riskAssuranceRisk,
    digitalDualityRisk: bench.metrics.strategyFailureRisks.digitalDualityRisk,
    emotionalValue: bench.metrics.valueDimensions.emotionalValue,
    functionalValue: bench.metrics.valueDimensions.functionalValue,
    economicValue: bench.metrics.valueDimensions.economicValue,
    brandValue: bench.metrics.valueDimensions.brandValue,
    lifetimeValue: bench.metrics.valueDimensions.lifetimeValue,
    valueScore
  };
}

// Unlike experiments/stats.ts quantile, this is the empirical percentile rank (fraction <= value), in percent.
/** @deprecated Use percentileRank from ../experiments/stats.js for unrounded ranks. */
export function percentile(values: number[], value: number): number {
  return Number(percentileRank(values, value).toFixed(4));
}

export function percentileTable(
  local: BenchComparablePoint,
  population: BenchComparablePoint[]
): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = Object.keys(local).filter((key) => key !== "benchId") as Array<keyof BenchComparablePoint>;
  for (const key of keys) {
    const values = population.map((entry) => Number(entry[key]));
    out[key] = percentile(values, Number(local[key]));
  }
  return out;
}

export interface PeerCluster {
  id: string;
  size: number;
  medoidBenchId: string;
  distance: number;
}

function riskComposite(point: BenchComparablePoint): number {
  return (
    point.ecosystemFocusRisk +
    point.clarityPathRisk +
    point.economicSignificanceRisk +
    point.riskAssuranceRisk +
    point.digitalDualityRisk
  ) / 5;
}

function normalizedVector(point: BenchComparablePoint): [number, number, number, number] {
  return [
    point.overall / 5,
    point.integrityIndex,
    riskComposite(point) / 100,
    point.valueScore / 100
  ];
}

function euclidean(a: [number, number, number, number], b: [number, number, number, number]): number {
  const d0 = a[0] - b[0];
  const d1 = a[1] - b[1];
  const d2 = a[2] - b[2];
  const d3 = a[3] - b[3];
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3);
}

function chooseInitialMedoids(points: BenchComparablePoint[], k: number): BenchComparablePoint[] {
  const vectors = points.map((point) => normalizedVector(point));
  const center: [number, number, number, number] = [
    vectors.reduce((sum, row) => sum + row[0], 0) / Math.max(1, vectors.length),
    vectors.reduce((sum, row) => sum + row[1], 0) / Math.max(1, vectors.length),
    vectors.reduce((sum, row) => sum + row[2], 0) / Math.max(1, vectors.length),
    vectors.reduce((sum, row) => sum + row[3], 0) / Math.max(1, vectors.length)
  ];
  const ranked = points
    .map((point, index) => ({
      point,
      score: euclidean(vectors[index]!, center)
    }))
    .sort((a, b) => b.score - a.score || a.point.benchId.localeCompare(b.point.benchId));
  return ranked.slice(0, k).map((row) => row.point);
}

function assignClusters(points: BenchComparablePoint[], medoids: BenchComparablePoint[]): Map<string, BenchComparablePoint[]> {
  const out = new Map<string, BenchComparablePoint[]>();
  for (const medoid of medoids) {
    out.set(medoid.benchId, []);
  }
  for (const point of points) {
    const vector = normalizedVector(point);
    let bestMedoid = medoids[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const medoid of medoids) {
      const distance = euclidean(vector, normalizedVector(medoid));
      if (distance < bestDistance || (distance === bestDistance && medoid.benchId.localeCompare(bestMedoid.benchId) < 0)) {
        bestMedoid = medoid;
        bestDistance = distance;
      }
    }
    const cluster = out.get(bestMedoid.benchId)!;
    cluster.push(point);
  }
  for (const [key, value] of out.entries()) {
    value.sort((a, b) => a.benchId.localeCompare(b.benchId));
    out.set(key, value);
  }
  return out;
}

function recomputeMedoid(cluster: BenchComparablePoint[]): BenchComparablePoint {
  if (cluster.length === 1) {
    return cluster[0]!;
  }
  let best = cluster[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of cluster) {
    const candidateVector = normalizedVector(candidate);
    const score = cluster.reduce((sum, other) => sum + euclidean(candidateVector, normalizedVector(other)), 0);
    if (score < bestScore || (score === bestScore && candidate.benchId.localeCompare(best.benchId) < 0)) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function kMedoidsPeerGroup(
  local: BenchComparablePoint,
  population: BenchComparablePoint[],
  desiredK = 5
): PeerCluster {
  const points = population.slice().sort((a, b) => a.benchId.localeCompare(b.benchId));
  if (points.length === 0) {
    return {
      id: "A",
      size: 1,
      medoidBenchId: local.benchId,
      distance: 0
    };
  }
  const k = Math.max(1, Math.min(desiredK, points.length));
  let medoids = chooseInitialMedoids(points, k);
  for (let i = 0; i < 5; i += 1) {
    const clusters = assignClusters(points, medoids);
    const next = Array.from(clusters.values())
      .filter((cluster) => cluster.length > 0)
      .map((cluster) => recomputeMedoid(cluster))
      .sort((a, b) => a.benchId.localeCompare(b.benchId));
    if (next.length === medoids.length && next.every((row, idx) => row.benchId === medoids[idx]!.benchId)) {
      break;
    }
    medoids = next;
  }

  const finalClusters = assignClusters(points, medoids);
  const sortedMedoidIds = Array.from(finalClusters.keys()).sort((a, b) => a.localeCompare(b));
  const localVector = normalizedVector(local);
  let localMedoidId = sortedMedoidIds[0]!;
  let localDistance = Number.POSITIVE_INFINITY;
  for (const medoidId of sortedMedoidIds) {
    const medoid = points.find((row) => row.benchId === medoidId);
    if (!medoid) {
      continue;
    }
    const distance = euclidean(localVector, normalizedVector(medoid));
    if (distance < localDistance || (distance === localDistance && medoidId.localeCompare(localMedoidId) < 0)) {
      localMedoidId = medoidId;
      localDistance = distance;
    }
  }
  const labelIndex = Math.max(0, sortedMedoidIds.indexOf(localMedoidId));
  return {
    id: String.fromCharCode("A".charCodeAt(0) + labelIndex),
    size: finalClusters.get(localMedoidId)?.length ?? 1,
    medoidBenchId: localMedoidId,
    distance: Number(localDistance.toFixed(6))
  };
}
