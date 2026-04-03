/**
 * Parameter Matrix — Stress testing engine (AMC-430)
 *
 * Generates a cartesian product of LLM parameter combinations
 * (temperature, top_p, frequency_penalty, etc.) and runs each
 * through the steer pipeline for systematic quality comparison.
 *
 * Designed for offline eval, not live traffic.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParameterRange {
  name: string;
  values: number[];
}

export interface ParameterCombination {
  id: string;
  params: Record<string, number>;
}

export interface MatrixRunResult {
  combinationId: string;
  params: Record<string, number>;
  responseText: string;
  microScore: number;
  latencyMs: number;
  error?: string;
}

export interface MatrixReport {
  totalCombinations: number;
  completed: number;
  failed: number;
  bestCombination: MatrixRunResult | null;
  worstCombination: MatrixRunResult | null;
  averageScore: number;
  results: MatrixRunResult[];
  parameterSensitivity: Record<string, number>;
  generatedAt: number;
}

export interface MatrixOptions {
  ranges: ParameterRange[];
  /** Maximum combinations to test (caps cartesian explosion) */
  maxCombinations?: number;
  /** Prompt to use for all combinations */
  prompt: string;
  /** Model ID to embed in request body */
  model?: string;
}

// ── Cartesian product ──────────────────────────────────────────────────────

export function generateCombinations(
  ranges: ParameterRange[],
  maxCombinations?: number,
): ParameterCombination[] {
  if (ranges.length === 0) return [];

  const cartesian = ranges.reduce<Record<string, number>[]>(
    (acc, range) => {
      const expanded: Record<string, number>[] = [];
      for (const existing of acc) {
        for (const value of range.values) {
          expanded.push({ ...existing, [range.name]: value });
        }
      }
      return expanded;
    },
    [{}],
  );

  const limited = maxCombinations
    ? cartesian.slice(0, maxCombinations)
    : cartesian;

  return limited.map((params, i) => ({
    id: `combo-${i}`,
    params,
  }));
}

// ── Parameter sensitivity analysis ─────────────────────────────────────────

/**
 * Calculate how much each parameter affects the score.
 * Returns a score variance per parameter (higher = more sensitive).
 */
export function analyzeParameterSensitivity(
  results: MatrixRunResult[],
  ranges: ParameterRange[],
): Record<string, number> {
  const sensitivity: Record<string, number> = {};

  for (const range of ranges) {
    const scoresByValue: Record<number, number[]> = {};
    for (const result of results) {
      const value = result.params[range.name];
      if (value !== undefined) {
        if (!scoresByValue[value]) scoresByValue[value] = [];
        scoresByValue[value]!.push(result.microScore);
      }
    }

    // Calculate variance across value groups
    const groupMeans = Object.values(scoresByValue).map((scores) => {
      const sum = scores.reduce((a, b) => a + b, 0);
      return sum / scores.length;
    });

    if (groupMeans.length < 2) {
      sensitivity[range.name] = 0;
      continue;
    }

    const overallMean =
      groupMeans.reduce((a, b) => a + b, 0) / groupMeans.length;
    const variance =
      groupMeans.reduce((sum, m) => sum + (m - overallMean) ** 2, 0) /
      groupMeans.length;
    sensitivity[range.name] = Math.round(variance * 10000) / 10000;
  }

  return sensitivity;
}

/**
 * Build a matrix request body for a given combination.
 */
export function buildMatrixRequestBody(
  combination: ParameterCombination,
  prompt: string,
  model?: string,
): Record<string, unknown> {
  return {
    model: model ?? "gpt-4",
    messages: [{ role: "user", content: prompt }],
    ...combination.params,
  };
}

/**
 * Generate a MatrixReport from completed results.
 */
export function buildMatrixReport(
  results: MatrixRunResult[],
  ranges: ParameterRange[],
): MatrixReport {
  const completed = results.filter((r) => !r.error);
  const failed = results.filter((r) => !!r.error);

  const scores = completed.map((r) => r.microScore);
  const averageScore =
    scores.length > 0
      ? Math.round(
          (scores.reduce((a, b) => a + b, 0) / scores.length) * 1000,
        ) / 1000
      : 0;

  const sorted = [...completed].sort((a, b) => b.microScore - a.microScore);
  const best = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;

  return {
    totalCombinations: results.length,
    completed: completed.length,
    failed: failed.length,
    bestCombination: best,
    worstCombination: worst,
    averageScore,
    results,
    parameterSensitivity: analyzeParameterSensitivity(completed, ranges),
    generatedAt: Date.now(),
  };
}
