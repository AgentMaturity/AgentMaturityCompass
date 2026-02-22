/**
 * Cost Predictability Score
 * Measures spend variance, budget adherence, and run-to-run cost stability.
 */

export interface CostPredictabilityInput {
  predictedCostUsd?: number;
  actualCostUsd?: number;
  budgetUsd?: number;
  runCount?: number;
  overBudgetRuns?: number;
  actualCostSeriesUsd?: number[];
  predictedCostSeriesUsd?: number[];
  spikeRunCount?: number;
}

export interface CostPredictabilityMetrics {
  runCount: number;
  totalVarianceRate: number;
  forecastAccuracy: number;
  budgetAdherence: number;
  overBudgetRunRate: number;
  volatilityIndex: number;
  volatilityControl: number;
  spikeRunRate: number;
  spikeControl: number;
}

export interface CostPredictabilityDiagnosticQuestion {
  id: string;
  question: string;
  whyItMatters: string;
}

export interface CostPredictabilityEvidenceGate {
  id: string;
  name: string;
  passed: boolean;
  required: boolean;
  observed: number;
  threshold: number;
  comparator: ">=" | "<=";
  reason: string;
}

export interface CostPredictabilityResult {
  score: number; // 0-100
  level: number; // 0-5
  metrics: CostPredictabilityMetrics;
  diagnosticQuestions: CostPredictabilityDiagnosticQuestion[];
  evidenceGates: CostPredictabilityEvidenceGate[];
  gaps: string[];
  recommendations: string[];
}

function clamp01(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function levelFromScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  if (score >= 10) return 1;
  return 0;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, value) => {
    const delta = value - m;
    return sum + delta * delta;
  }, 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const a = sorted[mid - 1] ?? 0;
    const b = sorted[mid] ?? 0;
    return (a + b) / 2;
  }
  return sorted[mid] ?? 0;
}

function maxGate(
  id: string,
  name: string,
  observed: number,
  threshold: number,
  required: boolean,
  passLabel: string,
  failLabel: string
): CostPredictabilityEvidenceGate {
  const passed = observed <= threshold;
  return {
    id,
    name,
    passed,
    required,
    observed,
    threshold,
    comparator: "<=",
    reason: passed ? passLabel : failLabel
  };
}

function minGate(
  id: string,
  name: string,
  observed: number,
  threshold: number,
  required: boolean,
  passLabel: string,
  failLabel: string
): CostPredictabilityEvidenceGate {
  const passed = observed >= threshold;
  return {
    id,
    name,
    passed,
    required,
    observed,
    threshold,
    comparator: ">=",
    reason: passed ? passLabel : failLabel
  };
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function finitePositive(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

const DIAGNOSTIC_QUESTIONS: CostPredictabilityDiagnosticQuestion[] = [
  {
    id: "AMC-CPR-1",
    question: "How far did actual spend deviate from forecast across recent runs?",
    whyItMatters: "Large forecast error makes budgets and planning unreliable."
  },
  {
    id: "AMC-CPR-2",
    question: "How often did runs exceed budget or produce cost spikes?",
    whyItMatters: "Frequent overruns indicate insufficient budget controls."
  }
];

export function scoreCostPredictability(input: CostPredictabilityInput = {}): CostPredictabilityResult {
  const actualSeries = (input.actualCostSeriesUsd ?? []).filter((value) => Number.isFinite(value) && value >= 0);
  const predictedSeries = (input.predictedCostSeriesUsd ?? []).filter((value) => Number.isFinite(value) && value >= 0);

  const runCount =
    typeof input.runCount === "number" && Number.isFinite(input.runCount)
      ? Math.max(0, Math.round(input.runCount))
      : actualSeries.length;

  const predictedCostUsd = finitePositive(input.predictedCostUsd);
  const actualCostUsd = finitePositive(input.actualCostUsd);
  const budgetUsd = finitePositive(input.budgetUsd);

  const totalVarianceRate =
    predictedCostUsd > 0 ? clamp01(Math.abs(actualCostUsd - predictedCostUsd) / predictedCostUsd) : 1;

  let forecastAccuracy = 0;
  if (actualSeries.length > 0 && predictedSeries.length === actualSeries.length && actualSeries.length > 0) {
    let mape = 0;
    for (let i = 0; i < actualSeries.length; i++) {
      const actual = actualSeries[i] ?? 0;
      const predicted = predictedSeries[i] ?? 0;
      mape += Math.abs(actual - predicted) / Math.max(predicted, 1);
    }
    mape = mape / actualSeries.length;
    forecastAccuracy = clamp01(1 - Math.min(1, mape));
  } else if (predictedCostUsd > 0) {
    forecastAccuracy = clamp01(1 - totalVarianceRate);
  }

  const budgetAdherence = budgetUsd > 0 ? clamp01(1 - Math.max(0, actualCostUsd - budgetUsd) / budgetUsd) : 0;

  const overBudgetRuns =
    typeof input.overBudgetRuns === "number" && Number.isFinite(input.overBudgetRuns)
      ? Math.max(0, input.overBudgetRuns)
      : 0;
  const overBudgetRunRate = runCount > 0 ? clamp01(overBudgetRuns / runCount) : 1;

  const volatilityIndex = (() => {
    if (actualSeries.length < 2) return 1;
    const avg = mean(actualSeries);
    if (avg <= 0) return 1;
    return Math.min(1, stddev(actualSeries) / avg);
  })();
  const volatilityControl = 1 - volatilityIndex;

  const spikeRunCount = (() => {
    if (typeof input.spikeRunCount === "number" && Number.isFinite(input.spikeRunCount)) {
      return Math.max(0, input.spikeRunCount);
    }
    if (actualSeries.length === 0) return 0;
    const med = median(actualSeries);
    if (med <= 0) return 0;
    return actualSeries.filter((cost) => cost > med * 2).length;
  })();
  const spikeRunRate = runCount > 0 ? clamp01(spikeRunCount / runCount) : 1;
  const spikeControl = 1 - spikeRunRate;

  const metrics: CostPredictabilityMetrics = {
    runCount,
    totalVarianceRate,
    forecastAccuracy,
    budgetAdherence,
    overBudgetRunRate,
    volatilityIndex,
    volatilityControl,
    spikeRunRate,
    spikeControl
  };

  const evidenceGates: CostPredictabilityEvidenceGate[] = [
    minGate(
      "CPR-G1",
      "Budget declared",
      budgetUsd,
      1,
      true,
      "Budget exists for this scoring window.",
      "Define a positive budget before cost predictability can be trusted."
    ),
    minGate(
      "CPR-G2",
      "Run sample sufficiency",
      runCount,
      20,
      true,
      "Run sample is sufficient.",
      "Collect at least 20 runs to stabilize cost predictability metrics."
    ),
    maxGate(
      "CPR-G3",
      "Forecast variance",
      totalVarianceRate,
      0.2,
      true,
      "Forecast variance is within tolerance.",
      "Cost variance exceeds 20% between forecast and actual spend."
    ),
    maxGate(
      "CPR-G4",
      "Over-budget run rate",
      overBudgetRunRate,
      0.1,
      true,
      "Over-budget run rate is controlled.",
      "More than 10% of runs exceed budget limits."
    ),
    maxGate(
      "CPR-G5",
      "Cost spike rate",
      spikeRunRate,
      0.1,
      false,
      "Cost spike rate is acceptable.",
      "Cost spikes exceed 10% of runs."
    )
  ];

  const rawScore =
    forecastAccuracy * 35 +
    budgetAdherence * 25 +
    (1 - totalVarianceRate) * 15 +
    (1 - overBudgetRunRate) * 15 +
    volatilityControl * 5 +
    spikeControl * 5;

  const requiredGateFailures = evidenceGates.filter((gate) => gate.required && !gate.passed).length;
  const score = Math.round(clamp100(rawScore - requiredGateFailures * 8));

  const gaps: string[] = [];
  const recommendations: string[] = [];

  for (const gate of evidenceGates) {
    if (!gate.passed) {
      pushUnique(gaps, gate.reason);
    }
  }

  if (metrics.forecastAccuracy < 0.8) {
    pushUnique(recommendations, "Retrain cost forecasts with production token/tool usage distributions.");
  }
  if (metrics.budgetAdherence < 0.9) {
    pushUnique(recommendations, "Enforce hard budget guards and preflight cost estimation before execution.");
  }
  if (metrics.volatilityIndex > 0.4) {
    pushUnique(recommendations, "Reduce routing/model volatility to lower run-to-run cost swings.");
  }
  if (metrics.spikeRunRate > 0.1) {
    pushUnique(recommendations, "Add alerts and automatic fallback routing when run cost exceeds spike threshold.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Keep monthly variance reviews and alerting thresholds aligned with budget policy.");
  }

  return {
    score,
    level: levelFromScore(score),
    metrics,
    diagnosticQuestions: DIAGNOSTIC_QUESTIONS,
    evidenceGates,
    gaps,
    recommendations
  };
}
