/** A ratio needs a finite numerator and a positive, finite evidence denominator. */
export function ratioOrNull(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : null;
}

/** Exclude unavailable components and normalize the remaining weights. */
export function weightedMean(components: ReadonlyArray<readonly [number | null, number]>): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const [value, weight] of components) {
    if (value === null || !Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return ratioOrNull(numerator, denominator);
}
