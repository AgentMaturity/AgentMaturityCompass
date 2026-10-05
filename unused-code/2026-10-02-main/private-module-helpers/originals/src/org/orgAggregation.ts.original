import type { WeightedDistribution, WeightedScore } from "./orgSchema.js";

export interface WeightedPoint {
  value: number;
  weight: number;
}

function sanitize(points: WeightedPoint[]): WeightedPoint[] {
  return points
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.weight) && point.weight > 0)
    .map((point) => ({ value: point.value, weight: point.weight }))
    .sort((a, b) => a.value - b.value || a.weight - b.weight);
}

function totalWeight(points: WeightedPoint[]): number {
  return points.reduce((sum, point) => sum + point.weight, 0);
}

export function weightedMean(points: WeightedPoint[]): number {
  const rows = sanitize(points);
  const total = totalWeight(rows);
  if (total <= 0) {
    return 0;
  }
  return rows.reduce((sum, point) => sum + point.value * point.weight, 0) / total;
}

export function weightedPercentile(points: WeightedPoint[], percentile: number): number {
  const rows = sanitize(points);
  if (rows.length === 0) {
    return 0;
  }
  if (rows.length === 1) {
    return rows[0]!.value;
  }
  const q = Math.max(0, Math.min(1, percentile));
  const total = totalWeight(rows);
  const target = q * total;
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.weight;
    if (cumulative >= target) {
      return row.value;
    }
  }
  return rows[rows.length - 1]!.value;
}

export function weightedMedian(points: WeightedPoint[]): number {
  return weightedPercentile(points, 0.5);
}

export function weightedTrimmedMean(points: WeightedPoint[], trimRatio = 0.1): number {
  const rows = sanitize(points);
  if (rows.length === 0) {
    return 0;
  }
  const total = totalWeight(rows);
  if (total <= 0) {
    return 0;
  }
  const trim = Math.max(0, Math.min(0.49, trimRatio));
  const lower = total * trim;
  const upper = total * (1 - trim);
  let acc = 0;
  let weightedSum = 0;
  let usedWeight = 0;
  for (const row of rows) {
    const start = acc;
    const end = acc + row.weight;
    acc = end;
    const overlapStart = Math.max(start, lower);
    const overlapEnd = Math.min(end, upper);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    if (overlap > 0) {
      weightedSum += row.value * overlap;
      usedWeight += overlap;
    }
  }
  if (usedWeight <= 0) {
    return weightedMean(rows);
  }
  return weightedSum / usedWeight;
}

export function weightedDistribution(points: WeightedPoint[]): WeightedDistribution {
  const rows = sanitize(points);
  if (rows.length === 0) {
    return {
      p10: 0,
      p50: 0,
      p90: 0,
      iqr: 0
    };
  }
  const p10 = weightedPercentile(rows, 0.1);
  const p50 = weightedPercentile(rows, 0.5);
  const p90 = weightedPercentile(rows, 0.9);
  const q1 = weightedPercentile(rows, 0.25);
  const q3 = weightedPercentile(rows, 0.75);
  return {
    p10: Number(p10.toFixed(4)),
    p50: Number(p50.toFixed(4)),
    p90: Number(p90.toFixed(4)),
    iqr: Number((q3 - q1).toFixed(4))
  };
}

export function robustScore(points: WeightedPoint[], trimRatio = 0.1): WeightedScore {
  return {
    median: Number(weightedMedian(points).toFixed(4)),
    trimmedMean: Number(weightedTrimmedMean(points, trimRatio).toFixed(4))
  };
}
