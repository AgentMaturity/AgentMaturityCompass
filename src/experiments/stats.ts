function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function sampleWithReplacement(values: number[], rng: () => number): number[] {
  if (values.length === 0) {
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const idx = Math.floor(rng() * values.length);
    out.push(values[idx] ?? values[values.length - 1]!);
  }
  return out;
}

/** Descriptive arithmetic mean; empty collections retain the legacy zero sentinel. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}


/** Sample variance (n - 1), optionally about a caller's already computed center. */
export function sampleVariance(values: readonly number[], center = mean(values)): number {
  if (values.length < 2) return 0;
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
}

/** Population variance (n); descriptive empty collections retain the legacy zero sentinel. */
export function populationVariance(values: readonly number[], center = mean(values)): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
}

export function standardDeviation(values: readonly number[], sample = true): number {
  if (values.length < 2) return 0;
  return Math.sqrt(sample ? sampleVariance(values) : populationVariance(values));
}

/** Midpoint median, preserving addition-before-division arithmetic for even samples. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Linearly interpolated quantile at (n - 1) * q; q is clamped to [0, 1]. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo]!;
  const fraction = index - lo;
  return sorted[lo]! * (1 - fraction) + sorted[hi]! * fraction;
}

/** Inverse empirical CDF using ceil(n * q) - 1, with both endpoints clamped. */
export function nearestRank(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))] ?? 0;
}

/** Empirical percentile rank (ties included), on a 0..100 scale. */
export function percentileRank(values: readonly number[], value: number): number {
  if (values.length === 0) return 0;
  return (values.filter((item) => item <= value).length / values.length) * 100;
}

/** Independent-group Cohen's d (A - B), using the pooled sample standard deviations. */
export function cohensD(groupA: readonly number[], groupB: readonly number[]): number {
  if (groupA.length < 2 || groupB.length < 2) return 0;
  const sdA = standardDeviation(groupA);
  const sdB = standardDeviation(groupB);
  const pooledSD = Math.sqrt(
    ((groupA.length - 1) * sdA ** 2 + (groupB.length - 1) * sdB ** 2) /
      (groupA.length + groupB.length - 2),
  );
  return pooledSD === 0 ? 0 : (mean(groupA) - mean(groupB)) / pooledSD;
}

/** Wilson binomial score bounds; the legacy empty sentinel is descriptive, not an estimated interval. */
export function wilsonInterval(successes: number, total: number, z = 1.96): { lower: number; upper: number; center: number } {
  if (total === 0) return { lower: 0, upper: 0, center: 0 };
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin), center };
}

export type InsufficientInterval = { status: "insufficient"; interval: null; reason: string };

export function bootstrapDifferenceCI(params: {
  baseline: number[];
  candidate: number[];
  seed: number;
  iterations?: number;
}): [number, number] | InsufficientInterval {
  if (params.baseline.length === 0 || params.candidate.length === 0) {
    return { status: "insufficient", interval: null, reason: "both independent cohorts require observations" };
  }
  const rng = seeded(params.seed);
  const iterations = Math.max(100, params.iterations ?? 1500);
  const diffs: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const a = sampleWithReplacement(params.baseline, rng);
    const b = sampleWithReplacement(params.candidate, rng);
    diffs.push(mean(b) - mean(a));
  }
  diffs.sort((x, y) => x - y);
  const low = diffs[Math.floor(iterations * 0.025)] ?? 0;
  const high = diffs[Math.floor(iterations * 0.975)] ?? 0;
  return [Number(low.toFixed(6)), Number(high.toFixed(6))];
}

/** Raw difference of means (candidate - baseline), in the metric's own units. Not a standardized effect size. */
export function meanDifference(baseline: number[], candidate: number[]): number {
  return Number((mean(candidate) - mean(baseline)).toFixed(6));
}

/**
 * @deprecated The name is wrong: this is the raw mean difference, not a standardized effect size. Use
 * meanDifference, or pairedStandardizedEffect for matched cases.
 */
export const effectSizeDifference = meanDifference;

/** Fewer matched pairs than this cannot support a resampled interval. */
const MIN_BOOTSTRAP_PAIRS = 2;

export type PairedInterval =
  | { status: "estimated"; interval: [number, number]; pairs: number }
  | { status: "insufficient"; interval: null; pairs: number; reason: string };

function pairDeltas(pairs: ReadonlyArray<readonly [number, number]>): number[] {
  return pairs.map(([baseline, candidate]) => {
    if (!Number.isFinite(baseline) || !Number.isFinite(candidate)) throw new Error("paired statistics require finite values");
    return candidate - baseline;
  });
}

/**
 * Paired bootstrap over matched (baseline, candidate) cases: every draw resamples one pair index, so a case keeps its
 * own baseline/candidate association. Too few pairs is an explicit insufficient result, never a [0, 0] interval.
 */
export function pairedBootstrapCI(params: {
  pairs: ReadonlyArray<readonly [number, number]>;
  seed: number;
  iterations?: number;
}): PairedInterval {
  const deltas = pairDeltas(params.pairs);
  if (deltas.length < MIN_BOOTSTRAP_PAIRS) {
    return { status: "insufficient", interval: null, pairs: deltas.length, reason: `${deltas.length} matched pair(s); at least ${MIN_BOOTSTRAP_PAIRS} required` };
  }
  const rng = seeded(params.seed);
  const iterations = Math.max(100, params.iterations ?? 1500);
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) means.push(mean(sampleWithReplacement(deltas, rng)));
  means.sort((x, y) => x - y);
  const low = means[Math.floor(iterations * 0.025)]!;
  const high = means[Math.floor(iterations * 0.975)]!;
  return { status: "estimated", interval: [Number(low.toFixed(6)), Number(high.toFixed(6))], pairs: deltas.length };
}

/** Standardized paired effect (Cohen's d_z: mean delta / sample SD of deltas). Null when it is undefined. */
export function pairedStandardizedEffect(pairs: ReadonlyArray<readonly [number, number]>): number | null {
  const deltas = pairDeltas(pairs);
  if (deltas.length < MIN_BOOTSTRAP_PAIRS) return null;
  const m = mean(deltas);
  const sd = Math.sqrt(sampleVariance(deltas, m));
  return sd > 0 ? Number((m / sd).toFixed(6)) : null;
}

export function deterministicSeed(parts: Array<string | number>): number {
  const text = parts.map((part) => String(part)).join("|");
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
