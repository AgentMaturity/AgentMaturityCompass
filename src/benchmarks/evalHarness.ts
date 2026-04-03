/**
 * Research Rigor Program — Eval Harness + Paper (AMC-435)
 *
 * Provides a standardized evaluation harness for reproducible AMC research.
 * Generates evaluation configs, manages experiment runs, and exports
 * results in formats suitable for academic papers.
 *
 * Components:
 * - EvalConfig: declarative experiment specification
 * - EvalRunner: executes experiments with controlled conditions
 * - EvalReport: structured output for paper-ready tables/figures
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface EvalConfig {
  experimentId: string;
  name: string;
  description: string;
  /** Hypotheses to test */
  hypotheses: string[];
  /** Independent variables */
  independentVars: EvalVariable[];
  /** Dependent variables (metrics) */
  dependentVars: string[];
  /** Number of trials per condition */
  trialsPerCondition: number;
  /** Random seed for reproducibility */
  seed: number;
  /** AMC version */
  amcVersion: string;
  /** Created timestamp */
  createdAt: string;
}

export interface EvalVariable {
  name: string;
  values: (string | number | boolean)[];
  description?: string;
}

export interface EvalTrial {
  trialId: string;
  conditionId: string;
  variables: Record<string, string | number | boolean>;
  metrics: Record<string, number>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

export interface EvalReport {
  experimentId: string;
  name: string;
  config: EvalConfig;
  trials: EvalTrial[];
  summary: EvalSummary;
  generatedAt: string;
}

export interface EvalSummary {
  totalTrials: number;
  completedTrials: number;
  failedTrials: number;
  /** Per-condition aggregate metrics */
  conditions: EvalConditionSummary[];
  /** Statistical tests (simplified) */
  significanceTests: SignificanceTest[];
}

export interface EvalConditionSummary {
  conditionId: string;
  variables: Record<string, string | number | boolean>;
  metrics: Record<
    string,
    {
      mean: number;
      stdDev: number;
      min: number;
      max: number;
      n: number;
    }
  >;
}

export interface SignificanceTest {
  metric: string;
  conditionA: string;
  conditionB: string;
  meanDifference: number;
  /** Cohen's d effect size */
  effectSize: number;
  /** Whether the difference is practically significant (|d| > 0.2) */
  practicallySignificant: boolean;
}

export interface EvalExecutionResult {
  metrics: Record<string, number>;
}

export type EvalRunner = (args: {
  conditionId: string;
  variables: Record<string, string | number | boolean>;
  trialIndex: number;
  seed: number;
  config: EvalConfig;
}) => Promise<EvalExecutionResult>;

// ── Config builder ─────────────────────────────────────────────────────────

export function createEvalConfig(params: {
  name: string;
  description: string;
  hypotheses: string[];
  independentVars: EvalVariable[];
  dependentVars: string[];
  trialsPerCondition?: number;
  seed?: number;
  amcVersion?: string;
}): EvalConfig {
  return {
    experimentId: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: params.name,
    description: params.description,
    hypotheses: params.hypotheses,
    independentVars: params.independentVars,
    dependentVars: params.dependentVars,
    trialsPerCondition: params.trialsPerCondition ?? 5,
    seed: params.seed ?? 42,
    amcVersion: params.amcVersion ?? "1.0.0",
    createdAt: new Date().toISOString(),
  };
}

// ── Condition generation ───────────────────────────────────────────────────

export interface EvalCondition {
  conditionId: string;
  variables: Record<string, string | number | boolean>;
}

/**
 * Generate all experimental conditions (cartesian product of independent variables).
 */
export function generateConditions(
  config: EvalConfig,
): EvalCondition[] {
  const vars = config.independentVars;
  if (vars.length === 0) return [];

  const product = vars.reduce<Record<string, string | number | boolean>[]>(
    (acc, v) => {
      const expanded: Record<string, string | number | boolean>[] = [];
      for (const existing of acc) {
        for (const value of v.values) {
          expanded.push({ ...existing, [v.name]: value });
        }
      }
      return expanded;
    },
    [{}],
  );

  return product.map((variables, i) => ({
    conditionId: `cond-${i}`,
    variables,
  }));
}

// ── Statistical helpers ────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Cohen's d effect size between two groups.
 */
export function cohensD(
  groupA: number[],
  groupB: number[],
): number {
  if (groupA.length === 0 || groupB.length === 0) return 0;
  const meanA = mean(groupA);
  const meanB = mean(groupB);
  const sdA = stdDev(groupA);
  const sdB = stdDev(groupB);
  const pooledSD = Math.sqrt(
    ((groupA.length - 1) * sdA ** 2 + (groupB.length - 1) * sdB ** 2) /
      (groupA.length + groupB.length - 2),
  );
  if (pooledSD === 0) return 0;
  return Math.round(((meanA - meanB) / pooledSD) * 1000) / 1000;
}

// ── Report builder ─────────────────────────────────────────────────────────

/**
 * Build a structured eval report from completed trials.
 */
export function buildEvalReport(
  config: EvalConfig,
  trials: EvalTrial[],
): EvalReport {
  const completed = trials.filter((t) => !t.error);
  const conditions = generateConditions(config);

  const conditionSummaries: EvalConditionSummary[] = conditions.map(
    (cond) => {
      const condTrials = completed.filter(
        (t) => t.conditionId === cond.conditionId,
      );
      const metrics: EvalConditionSummary["metrics"] = {};

      for (const dep of config.dependentVars) {
        const values = condTrials
          .map((t) => t.metrics[dep])
          .filter((v): v is number => v !== undefined);
        metrics[dep] = {
          mean: Math.round(mean(values) * 1000) / 1000,
          stdDev: Math.round(stdDev(values) * 1000) / 1000,
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0,
          n: values.length,
        };
      }

      return {
        conditionId: cond.conditionId,
        variables: cond.variables,
        metrics,
      };
    },
  );

  // Pairwise significance tests
  const significanceTests: SignificanceTest[] = [];
  for (const metric of config.dependentVars) {
    for (let i = 0; i < conditions.length; i++) {
      for (let j = i + 1; j < conditions.length; j++) {
        const trialsA = completed
          .filter((t) => t.conditionId === conditions[i]!.conditionId)
          .map((t) => t.metrics[metric] ?? 0);
        const trialsB = completed
          .filter((t) => t.conditionId === conditions[j]!.conditionId)
          .map((t) => t.metrics[metric] ?? 0);
        const d = cohensD(trialsA, trialsB);
        significanceTests.push({
          metric,
          conditionA: conditions[i]!.conditionId,
          conditionB: conditions[j]!.conditionId,
          meanDifference: Math.round((mean(trialsA) - mean(trialsB)) * 1000) / 1000,
          effectSize: d,
          practicallySignificant: Math.abs(d) > 0.2,
        });
      }
    }
  }

  return {
    experimentId: config.experimentId,
    name: config.name,
    config,
    trials,
    summary: {
      totalTrials: trials.length,
      completedTrials: completed.length,
      failedTrials: trials.length - completed.length,
      conditions: conditionSummaries,
      significanceTests,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── LaTeX export ───────────────────────────────────────────────────────────

/**
 * Export condition summaries as a LaTeX table for paper inclusion.
 */
export function toLatexTable(
  report: EvalReport,
  metric: string,
): string {
  const conditions = report.summary.conditions;
  const varNames = report.config.independentVars.map((v) => v.name);
  const header =
    varNames.map((v) => `\\textbf{${v}}`).join(" & ") +
    ` & \\textbf{Mean} & \\textbf{StdDev} & \\textbf{N}`;
  const rows = conditions.map((c) => {
    const vars = varNames.map((v) => String(c.variables[v] ?? "")).join(" & ");
    const m = c.metrics[metric];
    return `${vars} & ${m?.mean ?? "—"} & ${m?.stdDev ?? "—"} & ${m?.n ?? 0}`;
  });

  return [
    "\\begin{table}[h]",
    "\\centering",
    `\\caption{${report.name} — ${metric}}`,
    `\\begin{tabular}{${"l".repeat(varNames.length)}rrr}`,
    "\\hline",
    header + " \\\\",
    "\\hline",
    ...rows.map((r) => r + " \\\\"),
    "\\hline",
    "\\end{tabular}",
    "\\end{table}",
  ].join("\n");
}

export async function executeEvalHarness(
  config: EvalConfig,
  runner: EvalRunner,
): Promise<EvalReport> {
  const conditions = generateConditions(config);
  const trials: EvalTrial[] = [];

  for (const condition of conditions) {
    for (let trialIndex = 0; trialIndex < config.trialsPerCondition; trialIndex += 1) {
      const startedAtIso = new Date().toISOString();
      const startedAtMs = Date.now();
      try {
        const result = await runner({
          conditionId: condition.conditionId,
          variables: condition.variables,
          trialIndex,
          seed: config.seed + trialIndex,
          config,
        });
        trials.push({
          trialId: `${condition.conditionId}-trial-${trialIndex}`,
          conditionId: condition.conditionId,
          variables: condition.variables,
          metrics: result.metrics,
          startedAt: startedAtIso,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
        });
      } catch (error) {
        trials.push({
          trialId: `${condition.conditionId}-trial-${trialIndex}`,
          conditionId: condition.conditionId,
          variables: condition.variables,
          metrics: {},
          startedAt: startedAtIso,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAtMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return buildEvalReport(config, trials);
}

export function renderEvalSummaryMarkdown(report: EvalReport): string {
  return [
    "# Eval Harness Summary",
    "",
    `- experimentId: ${report.experimentId}`,
    `- name: ${report.name}`,
    `- completedTrials: ${report.summary.completedTrials}`,
    `- failedTrials: ${report.summary.failedTrials}`,
    `- totalTrials: ${report.summary.totalTrials}`,
    "",
    "## Conditions",
    ...report.summary.conditions.map((condition) =>
      `- ${condition.conditionId}: ${JSON.stringify({ variables: condition.variables, metrics: condition.metrics })}`,
    ),
  ].join("\n");
}
