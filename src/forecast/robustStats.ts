import { mean, median as arithmeticMedian, quantile as interpolatedQuantile } from "../experiments/stats.js";
export interface TheilSenResult {
  slope: number;
  intercept: number;
  residualMad: number;
  robustSigma: number;
  outlierIndexes: number[];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** @deprecated Use median from ../experiments/stats.js. */
export function median(values: number[]): number {
  return arithmeticMedian(values);
}

/** @deprecated Use quantile from ../experiments/stats.js. */
export function quantile(values: number[], q: number): number {
  return interpolatedQuantile(values, q);
}

export function mad(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const med = median(values);
  const abs = values.map((value) => Math.abs(value - med));
  return median(abs);
}

// Unlike experiments/stats.ts mean, discard a symmetric fraction of extreme observations first.
export function trimmedMean(values: number[], trim = 0.1): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.length <= 2) {
    return mean(values);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * clamp(trim, 0, 0.45));
  const kept = sorted.slice(trimCount, sorted.length - trimCount);
  const sample = kept.length > 0 ? kept : sorted;
  return mean(sample);
}

export function robustZ(value: number, center: number, sigma: number): number {
  const denom = sigma > 1e-9 ? sigma : 1e-9;
  return (value - center) / denom;
}

export function ewma(values: number[], alpha = 0.35): number {
  if (values.length === 0) {
    return 0;
  }
  const a = clamp(alpha, 0.01, 0.99);
  let acc = values[0]!;
  for (let idx = 1; idx < values.length; idx += 1) {
    acc = a * values[idx]! + (1 - a) * acc;
  }
  return acc;
}

export function theilSen(times: number[], values: number[]): TheilSenResult {
  if (times.length !== values.length) {
    throw new Error("times and values length mismatch");
  }
  if (times.length === 0) {
    return {
      slope: 0,
      intercept: 0,
      residualMad: 0,
      robustSigma: 0,
      outlierIndexes: []
    };
  }
  if (times.length === 1) {
    return {
      slope: 0,
      intercept: values[0]!,
      residualMad: 0,
      robustSigma: 0,
      outlierIndexes: []
    };
  }

  const initialSlopes: number[] = [];
  for (let i = 0; i < times.length - 1; i += 1) {
    for (let j = i + 1; j < times.length; j += 1) {
      const dt = times[j]! - times[i]!;
      if (dt === 0) {
        continue;
      }
      initialSlopes.push((values[j]! - values[i]!) / dt);
    }
  }
  const roughSlope = initialSlopes.length > 0 ? median(initialSlopes) : 0;
  const roughIntercept = median(values.map((value, idx) => value - roughSlope * times[idx]!));
  const roughResiduals = values.map((value, idx) => value - (roughIntercept + roughSlope * times[idx]!));
  const roughMad = mad(roughResiduals);
  const roughSigma = 1.4826 * (roughMad > 1e-9 ? roughMad : 1e-9);
  const outlierIndexes = roughResiduals
    .map((residual, idx) => ({ idx, z: Math.abs(robustZ(residual, 0, roughSigma)) }))
    .filter((row) => row.z > 4)
    .map((row) => row.idx);

  const inlierIndexes = times
    .map((_value, idx) => idx)
    .filter((idx) => !outlierIndexes.includes(idx));
  const fitIndexes = inlierIndexes.length >= 2 ? inlierIndexes : times.map((_value, idx) => idx);

  const slopes: number[] = [];
  for (let i = 0; i < fitIndexes.length - 1; i += 1) {
    for (let j = i + 1; j < fitIndexes.length; j += 1) {
      const a = fitIndexes[i]!;
      const b = fitIndexes[j]!;
      const dt = times[b]! - times[a]!;
      if (dt === 0) {
        continue;
      }
      slopes.push((values[b]! - values[a]!) / dt);
    }
  }
  const slope = slopes.length > 0 ? median(slopes) : 0;
  const intercept = median(fitIndexes.map((idx) => values[idx]! - slope * times[idx]!));
  const residuals = values.map((value, idx) => value - (intercept + slope * times[idx]!));
  const residualMad = mad(residuals);
  const robustSigma = 1.4826 * residualMad;

  return {
    slope,
    intercept,
    residualMad,
    robustSigma,
    outlierIndexes
  };
}

// Unlike experiments/stats.ts bootstrap/mean intervals, this is a MAD-scaled Theil-Sen prediction
// band with horizon inflation; it measures future observations rather than uncertainty in a mean.
export function predictWithBand(params: {
  model: TheilSenResult;
  atX: number;
  n: number;
  horizonFactor: number;
}): {
  value: number;
  low: number;
  high: number;
} {
  const value = params.model.intercept + params.model.slope * params.atX;
  const sigma = params.model.robustSigma;
  const n = Math.max(1, params.n);
  const spread = 1.96 * sigma * Math.sqrt(1 + params.horizonFactor / n);
  return {
    value,
    low: value - spread,
    high: value + spread
  };
}

export function stableHashId(input: string, bytes = 8): string {
  const digest = createHash("sha256").update(Buffer.from(input, "utf8")).digest("hex");
  return digest.slice(0, Math.max(4, Math.min(64, bytes * 2)));
}
import { createHash } from "node:crypto";
