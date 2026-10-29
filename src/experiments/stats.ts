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

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function bootstrapDifferenceCI(params: {
  baseline: number[];
  candidate: number[];
  seed: number;
  iterations?: number;
}): [number, number] {
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
export const MIN_BOOTSTRAP_PAIRS = 2;

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
  const sd = Math.sqrt(deltas.reduce((acc, d) => acc + (d - m) ** 2, 0) / (deltas.length - 1));
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
