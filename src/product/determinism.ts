import { mean, standardDeviation } from "../experiments/stats.js";
/**
 * determinism.ts — Statistical analysis of output determinism.
 *
 * Measures Shannon entropy, coefficient of variation, outlier detection,
 * and provides a determinism verdict.
 */

export interface DeterminismResult {
  deterministic: boolean;
  variance: number;
  entropy: number;
  coefficientOfVariation: number;
  outliers: string[];
  uniqueCount: number;
  totalCount: number;
}

/* ── Shannon entropy ─────────────────────────────────────────────── */

function shannonEntropy(values: string[]): number {
  if (values.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / values.length;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/* ── Coefficient of variation (numeric arrays) ───────────────────── */

function coefficientOfVariation(nums: number[]): number {
  if (nums.length < 2) return 0;
  const center = mean(nums);
  if (center === 0) return 0;
  return standardDeviation(nums) / Math.abs(center);
}

/* ── Outlier detection (IQR for numeric, frequency for string) ──── */

function detectOutliers(values: string[]): string[] {
  const nums = values.map(Number);
  if (nums.every(n => !isNaN(n)) && nums.length >= 4) {
    const sorted = [...nums].sort((a, b) => a - b);
    // Unlike experiments/stats.ts quantile, IQR uses floor(n * p) order statistics, including the upper quartile.
    const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
    const q3 = sorted[Math.floor(sorted.length * 0.75)]!;
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    return values.filter((_, i) => nums[i]! < lo || nums[i]! > hi);
  }
  if (values.length < 3) return [];
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return values.filter(v => freq.get(v) === 1);
}

/* ── Main check ──────────────────────────────────────────────────── */

export function checkDeterminism(results: string[]): DeterminismResult {
  if (results.length === 0) {
    return { deterministic: true, variance: 0, entropy: 0, coefficientOfVariation: 0, outliers: [], uniqueCount: 0, totalCount: 0 };
  }

  const unique = new Set(results).size;
  const entropy = shannonEntropy(results);
  const nums = results.map(Number);
  const cv = nums.every(n => !isNaN(n)) ? coefficientOfVariation(nums) : unique / results.length;
  const outliers = detectOutliers(results);
  const variance = unique / Math.max(results.length, 1);

  return {
    deterministic: unique === 1,
    variance,
    entropy,
    coefficientOfVariation: cv,
    outliers: [...new Set(outliers)],
    uniqueCount: unique,
    totalCount: results.length,
  };
}
