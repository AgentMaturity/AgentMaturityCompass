import { percentileRank } from "../experiments/stats.js";
import type { BenchArtifact } from "./benchSchema.js";

/** One bench flattened for ranking; null where the bench did not measure the metric (not evaluated). */
export interface BenchComparablePoint {
  benchId: string;
  overall: number | null;
  integrityIndex: number | null;
  correlationRatio: number | null;
  strategicOps: number | null;
  leadership: number | null;
  culture: number | null;
  resilience: number | null;
  skills: number | null;
  ecosystemFocusRisk: number;
  clarityPathRisk: number;
  economicSignificanceRisk: number;
  riskAssuranceRisk: number;
  digitalDualityRisk: number;
  emotionalValue: number | null;
  functionalValue: number | null;
  economicValue: number | null;
  brandValue: number | null;
  lifetimeValue: number | null;
  valueScore: number | null;
}

export function flattenBenchMetrics(bench: BenchArtifact): BenchComparablePoint {
  const dims = bench.metrics.valueDimensions;
  // A bench without a stored score averages its measured dimensions; with none measured the score is not evaluated.
  const measured = [dims.emotionalValue, dims.functionalValue, dims.economicValue, dims.brandValue, dims.lifetimeValue]
    .filter((value): value is number => typeof value === "number");
  const valueScore = typeof dims.valueScore === "number" ? dims.valueScore
    : measured.length > 0 ? Number((measured.reduce((sum, value) => sum + value, 0) / measured.length).toFixed(6)) : null;
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
    emotionalValue: dims.emotionalValue,
    functionalValue: dims.functionalValue,
    economicValue: dims.economicValue,
    brandValue: dims.brandValue,
    lifetimeValue: dims.lifetimeValue,
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
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const keys = Object.keys(local).filter((key) => key !== "benchId") as Array<Exclude<keyof BenchComparablePoint, "benchId">>;
  for (const key of keys) {
    // Rank only measured values: an unmeasured local metric has no rank, and unmeasured peers are not 0s to beat.
    const value = local[key];
    const values = population.flatMap((entry) => (entry[key] === null ? [] : [entry[key]]));
    out[key] = value === null || values.length === 0 ? null : percentile(values, value);
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

type PeerVector = [number | null, number | null, number, number | null];

function normalizedVector(point: BenchComparablePoint): PeerVector {
  return [
    point.overall === null ? null : point.overall / 5,
    point.integrityIndex,
    riskComposite(point) / 100,
    point.valueScore === null ? null : point.valueScore / 100
  ];
}

/** Distance over the dimensions both points measured; an unmeasured dimension adds no distance rather than a fake 0. */
function euclidean(a: PeerVector, b: PeerVector): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i], right = b[i];
    if (left !== null && left !== undefined && right !== null && right !== undefined) sum += (left - right) ** 2;
  }
  return Math.sqrt(sum);
}

/** Mean of the measured values; null when none is measured. */
function meanMeasured(values: Array<number | null>): number | null {
  const measured = values.filter((value): value is number => value !== null);
  return measured.length === 0 ? null : measured.reduce((sum, value) => sum + value, 0) / measured.length;
}

function chooseInitialMedoids(points: BenchComparablePoint[], k: number): BenchComparablePoint[] {
  const vectors = points.map((point) => normalizedVector(point));
  const center: PeerVector = [
    meanMeasured(vectors.map((row) => row[0])),
    meanMeasured(vectors.map((row) => row[1])),
    meanMeasured(vectors.map((row) => row[2])) ?? 0,
    meanMeasured(vectors.map((row) => row[3]))
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
