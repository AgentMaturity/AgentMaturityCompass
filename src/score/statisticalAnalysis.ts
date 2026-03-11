/**
 * Statistical Analysis Module — Confidence Intervals for AMC Scores
 *
 * Adds statistical rigor to maturity scoring:
 * - Confidence intervals for dimension and overall scores
 * - P-values for score comparisons (Welch's t-test)
 * - Sample size recommendations for desired precision
 * - A/B test support for comparing agent versions
 *
 * @module score/statisticalAnalysis
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConfidenceInterval {
  /** Point estimate (mean score) */
  estimate: number;
  /** Lower bound of CI */
  lower: number;
  /** Upper bound of CI */
  upper: number;
  /** Confidence level (e.g. 0.95) */
  confidenceLevel: number;
  /** Half-width of the interval */
  marginOfError: number;
  /** Number of observations used */
  sampleSize: number;
}

export interface ScoreComparisonResult {
  /** Score A point estimate */
  scoreA: number;
  /** Score B point estimate */
  scoreB: number;
  /** Difference (B - A) */
  difference: number;
  /** Two-sided p-value from Welch's t-test */
  pValue: number;
  /** Whether the difference is statistically significant at the given alpha */
  significant: boolean;
  /** Alpha level used */
  alpha: number;
  /** Effect size (Cohen's d) */
  effectSize: number;
  /** CI for the difference */
  differenceCI: ConfidenceInterval;
}

export interface SampleSizeRecommendation {
  /** Recommended minimum sample size per group */
  perGroup: number;
  /** Total across both groups */
  total: number;
  /** Desired margin of error */
  desiredMarginOfError: number;
  /** Confidence level */
  confidenceLevel: number;
  /** Statistical power (for comparison designs) */
  power: number;
  /** Minimum detectable effect size */
  minDetectableEffect: number;
}

export interface ABTestResult {
  /** Label for version A */
  versionA: string;
  /** Label for version B */
  versionB: string;
  /** Per-dimension comparison results */
  dimensions: Record<string, ScoreComparisonResult>;
  /** Overall score comparison */
  overall: ScoreComparisonResult;
  /** Summary: which version is better and by how much */
  summary: ABTestSummary;
}

export interface ABTestSummary {
  winner: string | null;
  significantDimensions: string[];
  insignificantDimensions: string[];
  overallSignificant: boolean;
  recommendation: string;
}

export interface ScoreSample {
  /** Dimension or overall label */
  dimension: string;
  /** Individual score observations */
  values: number[];
}

/* ------------------------------------------------------------------ */
/*  Math utilities (no external deps)                                  */
/* ------------------------------------------------------------------ */

/** Mean of an array */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Variance (Bessel-corrected, sample variance) */
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return ss / (xs.length - 1);
}

/** Standard deviation */
function stddev(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

/** Standard error of the mean */
function sem(xs: number[]): number {
  if (xs.length < 2) return 0;
  return stddev(xs) / Math.sqrt(xs.length);
}

/**
 * Approximate inverse of the standard normal CDF (probit function).
 * Rational approximation from Abramowitz & Stegun 26.2.23.
 * Accurate to ~4.5e-4 for 0.0027 < p < 0.9973.
 */
function normalInvCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const sign = p < 0.5 ? -1 : 1;
  const pp = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(pp));

  // Coefficients
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const z = t - (c0 + c1 * t + c2 * t * t) /
    (1 + d1 * t + d2 * t * t + d3 * t * t * t);

  return sign * z;
}

/**
 * Standard normal CDF approximation.
 * Uses Horner form of Hart's approximation (max error ~7.5e-8).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Approximate the t-distribution CDF using the normal approximation.
 * For df >= 30 this is quite accurate. For smaller df we use
 * a corrected approximation (Abramowitz & Stegun 26.7.5).
 */
function tCDF(t: number, df: number): number {
  if (df <= 0) return NaN;
  if (df >= 120) return normalCDF(t);

  // Better approximation for smaller df
  const g = df - 0.5;
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
  return normalCDF(z);
}

/**
 * Approximate inverse t-distribution CDF.
 * Uses normal approx with Cornish-Fisher correction for small df.
 */
function tInvCDF(p: number, df: number): number {
  if (df >= 120) return normalInvCDF(p);

  const z = normalInvCDF(p);
  // Cornish-Fisher expansion (first correction term)
  const g1 = (z ** 3 + z) / (4 * df);
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df * df);
  return z + g1 + g2;
}

/**
 * Welch–Satterthwaite degrees of freedom for unequal-variance t-test.
 */
function welchDF(n1: number, s1sq: number, n2: number, s2sq: number): number {
  const se1 = s1sq / n1;
  const se2 = s2sq / n2;
  const num = (se1 + se2) ** 2;
  const denom = (se1 ** 2) / (n1 - 1) + (se2 ** 2) / (n2 - 1);
  return denom > 0 ? num / denom : 1;
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Compute a confidence interval for a set of score observations.
 *
 * Uses the t-distribution for small samples, normal approximation for n >= 30.
 * Clamps bounds to [0, 1] since AMC scores are bounded.
 */
export function scoreConfidenceInterval(
  values: number[],
  confidenceLevel: number = 0.95,
): ConfidenceInterval {
  if (values.length === 0) {
    return {
      estimate: 0,
      lower: 0,
      upper: 0,
      confidenceLevel,
      marginOfError: 0,
      sampleSize: 0,
    };
  }

  if (values.length === 1) {
    return {
      estimate: values[0],
      lower: values[0],
      upper: values[0],
      confidenceLevel,
      marginOfError: 0,
      sampleSize: 1,
    };
  }

  const n = values.length;
  const m = mean(values);
  const se = sem(values);
  const alpha = 1 - confidenceLevel;
  const df = n - 1;

  // Critical value from t-distribution
  const tCrit = tInvCDF(1 - alpha / 2, df);
  const moe = tCrit * se;

  return {
    estimate: m,
    lower: Math.max(0, m - moe),
    upper: Math.min(1, m + moe),
    confidenceLevel,
    marginOfError: moe,
    sampleSize: n,
  };
}

/**
 * Compare two sets of scores using Welch's t-test (unequal variance).
 *
 * Returns a two-sided p-value and effect size (Cohen's d).
 */
export function compareScores(
  valuesA: number[],
  valuesB: number[],
  alpha: number = 0.05,
): ScoreComparisonResult {
  const nA = valuesA.length;
  const nB = valuesB.length;

  if (nA < 2 || nB < 2) {
    throw new Error(
      `compareScores requires at least 2 observations per group (got ${nA}, ${nB})`,
    );
  }

  const mA = mean(valuesA);
  const mB = mean(valuesB);
  const sA2 = variance(valuesA);
  const sB2 = variance(valuesB);

  const diff = mB - mA;
  const seDiff = Math.sqrt(sA2 / nA + sB2 / nB);

  // Welch's t-statistic
  const t = seDiff > 0 ? diff / seDiff : 0;
  const df = welchDF(nA, sA2, nB, sB2);

  // Two-sided p-value
  const pValue = seDiff > 0 ? 2 * (1 - tCDF(Math.abs(t), df)) : 1.0;

  // Cohen's d (pooled SD as denominator)
  const pooledSD = Math.sqrt(((nA - 1) * sA2 + (nB - 1) * sB2) / (nA + nB - 2));
  const effectSize = pooledSD > 0 ? diff / pooledSD : 0;

  // CI for the difference
  const tCrit = tInvCDF(1 - alpha / 2, df);
  const moeDiff = tCrit * seDiff;

  return {
    scoreA: mA,
    scoreB: mB,
    difference: diff,
    pValue: Math.max(0, Math.min(1, pValue)),
    significant: pValue < alpha,
    alpha,
    effectSize,
    differenceCI: {
      estimate: diff,
      lower: diff - moeDiff,
      upper: diff + moeDiff,
      confidenceLevel: 1 - alpha,
      marginOfError: moeDiff,
      sampleSize: nA + nB,
    },
  };
}

/**
 * Recommend sample size for a desired margin of error on a single score.
 *
 * Uses the formula: n = (z / E)^2 * s^2
 * where z is the critical value, E is margin of error, s is estimated SD.
 *
 * If no pilot SD is provided, uses 0.25 (conservative for [0,1] bounded scores).
 */
export function recommendSampleSize(opts: {
  desiredMarginOfError?: number;
  confidenceLevel?: number;
  pilotSD?: number;
  /** For comparison designs: desired power (default 0.80) */
  power?: number;
  /** For comparison designs: minimum detectable effect size (Cohen's d) */
  minDetectableEffect?: number;
}): SampleSizeRecommendation {
  const E = opts.desiredMarginOfError ?? 0.05;
  const cl = opts.confidenceLevel ?? 0.95;
  const sd = opts.pilotSD ?? 0.25; // conservative for [0,1]
  const power = opts.power ?? 0.80;
  const mde = opts.minDetectableEffect ?? 0.5; // medium effect

  const alpha = 1 - cl;
  const zAlpha = normalInvCDF(1 - alpha / 2);
  const zBeta = normalInvCDF(power);

  // Single-group sample size for margin of error
  const nEstimation = Math.ceil((zAlpha * sd / E) ** 2);

  // Two-group sample size for detecting effect size d with given power
  // n per group = ((z_alpha/2 + z_beta) / d)^2 * 2
  const nComparison = Math.ceil(2 * ((zAlpha + zBeta) / mde) ** 2);

  const perGroup = Math.max(nEstimation, nComparison);

  return {
    perGroup,
    total: perGroup * 2,
    desiredMarginOfError: E,
    confidenceLevel: cl,
    power,
    minDetectableEffect: mde,
  };
}

/**
 * Run a full A/B test comparing two agent versions across all dimensions.
 *
 * Each version provides a set of ScoreSamples (one per dimension + optional "overall").
 * Returns per-dimension comparisons and an overall summary.
 */
export function abTest(
  versionA: { label: string; samples: ScoreSample[] },
  versionB: { label: string; samples: ScoreSample[] },
  alpha: number = 0.05,
): ABTestResult {
  const dimensionsA = new Map(versionA.samples.map(s => [s.dimension, s.values]));
  const dimensionsB = new Map(versionB.samples.map(s => [s.dimension, s.values]));

  // Union of all dimensions
  const allDims = new Set([...dimensionsA.keys(), ...dimensionsB.keys()]);
  allDims.delete('overall'); // handle separately

  const dimensions: Record<string, ScoreComparisonResult> = {};
  const significantDims: string[] = [];
  const insignificantDims: string[] = [];

  for (const dim of allDims) {
    const vA = dimensionsA.get(dim);
    const vB = dimensionsB.get(dim);

    if (!vA || !vB || vA.length < 2 || vB.length < 2) {
      // Skip dimensions with insufficient data
      insignificantDims.push(dim);
      continue;
    }

    const result = compareScores(vA, vB, alpha);
    dimensions[dim] = result;

    if (result.significant) {
      significantDims.push(dim);
    } else {
      insignificantDims.push(dim);
    }
  }

  // Overall comparison
  const overallA = dimensionsA.get('overall');
  const overallB = dimensionsB.get('overall');

  let overall: ScoreComparisonResult;
  if (overallA && overallB && overallA.length >= 2 && overallB.length >= 2) {
    overall = compareScores(overallA, overallB, alpha);
  } else {
    // Synthesize overall from dimension means
    const allValsA: number[] = [];
    const allValsB: number[] = [];
    for (const dim of allDims) {
      const vA = dimensionsA.get(dim);
      const vB = dimensionsB.get(dim);
      if (vA) allValsA.push(mean(vA));
      if (vB) allValsB.push(mean(vB));
    }
    if (allValsA.length >= 2 && allValsB.length >= 2) {
      overall = compareScores(allValsA, allValsB, alpha);
    } else {
      overall = {
        scoreA: allValsA.length > 0 ? mean(allValsA) : 0,
        scoreB: allValsB.length > 0 ? mean(allValsB) : 0,
        difference: 0,
        pValue: 1,
        significant: false,
        alpha,
        effectSize: 0,
        differenceCI: {
          estimate: 0, lower: 0, upper: 0,
          confidenceLevel: 1 - alpha, marginOfError: 0, sampleSize: 0,
        },
      };
    }
  }

  // Build summary
  let winner: string | null = null;
  if (overall.significant) {
    winner = overall.difference > 0 ? versionB.label : versionA.label;
  }

  const effectDesc = Math.abs(overall.effectSize) < 0.2
    ? 'negligible'
    : Math.abs(overall.effectSize) < 0.5
      ? 'small'
      : Math.abs(overall.effectSize) < 0.8
        ? 'medium'
        : 'large';

  let recommendation: string;
  if (!overall.significant) {
    recommendation = `No statistically significant difference between ${versionA.label} and ${versionB.label} ` +
      `(p=${overall.pValue.toFixed(4)}, d=${overall.effectSize.toFixed(3)}). ` +
      `Consider collecting more data or the versions are equivalent.`;
  } else {
    recommendation = `${winner} outperforms the other with a ${effectDesc} effect ` +
      `(Δ=${overall.difference.toFixed(4)}, p=${overall.pValue.toFixed(4)}, d=${overall.effectSize.toFixed(3)}). ` +
      `${significantDims.length} of ${significantDims.length + insignificantDims.length} dimensions show significant improvement.`;
  }

  return {
    versionA: versionA.label,
    versionB: versionB.label,
    dimensions,
    overall,
    summary: {
      winner,
      significantDimensions: significantDims,
      insignificantDimensions: insignificantDims,
      overallSignificant: overall.significant,
      recommendation,
    },
  };
}

/**
 * Compute confidence intervals for all dimensions in a maturity assessment.
 *
 * Takes repeated score observations per dimension and returns CIs for each.
 */
export function maturityConfidenceIntervals(
  samples: ScoreSample[],
  confidenceLevel: number = 0.95,
): Record<string, ConfidenceInterval> {
  const result: Record<string, ConfidenceInterval> = {};
  for (const s of samples) {
    result[s.dimension] = scoreConfidenceInterval(s.values, confidenceLevel);
  }
  return result;
}
