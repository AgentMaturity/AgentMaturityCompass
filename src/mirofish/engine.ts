/**
 * Mirofish Simulation Engine
 *
 * Monte Carlo simulation that maps agent behavior dimensions to AMC diagnostic
 * scores. Each iteration perturbs the behavior profile by the configured variance,
 * computes per-question scores via dimension-to-layer mapping weights, and
 * aggregates into layer scores with confidence intervals.
 */

import { questionBank } from "../diagnostic/questionBank.js";
import type { DiagnosticQuestion, LayerName } from "../types.js";
import type {
  BehaviorDimension,
  BreakingPoint,
  Scenario,
  SimulatedLayerScore,
  SimulatedQuestionScore,
  SimulationOptions,
  SimulationResult,
  StressResult,
  Variance,
} from "./types.js";

/* ── Seeded PRNG (Mulberry32) ─────────────────────── */

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for normal distribution from uniform. */
function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/* ── Dimension→Layer weight matrix ────────────────── */

/**
 * Each AMC layer is influenced by behavior dimensions with different weights.
 * These weights encode domain knowledge about what behaviors matter for each
 * maturity layer.
 */
const LAYER_WEIGHTS: Record<LayerName, Record<keyof BehaviorDimension, number>> = {
  "Strategic Agent Operations": {
    autonomy: 0.15,
    errorRate: 0.10,
    escalationFrequency: 0.10,
    toolUsage: 0.15,
    responseLatency: 0.05,
    hallucinationRate: 0.10,
    complianceAdherence: 0.35,
  },
  "Leadership & Autonomy": {
    autonomy: 0.35,
    errorRate: 0.10,
    escalationFrequency: 0.20,
    toolUsage: 0.15,
    responseLatency: 0.05,
    hallucinationRate: 0.05,
    complianceAdherence: 0.10,
  },
  "Culture & Alignment": {
    autonomy: 0.10,
    errorRate: 0.15,
    escalationFrequency: 0.15,
    toolUsage: 0.10,
    responseLatency: 0.05,
    hallucinationRate: 0.20,
    complianceAdherence: 0.25,
  },
  "Resilience": {
    autonomy: 0.10,
    errorRate: 0.30,
    escalationFrequency: 0.10,
    toolUsage: 0.20,
    responseLatency: 0.10,
    hallucinationRate: 0.10,
    complianceAdherence: 0.10,
  },
  "Skills": {
    autonomy: 0.20,
    errorRate: 0.15,
    escalationFrequency: 0.05,
    toolUsage: 0.30,
    responseLatency: 0.10,
    hallucinationRate: 0.10,
    complianceAdherence: 0.10,
  },
};

const DIMENSION_KEYS: readonly (keyof BehaviorDimension)[] = [
  "autonomy",
  "errorRate",
  "escalationFrequency",
  "toolUsage",
  "responseLatency",
  "hallucinationRate",
  "complianceAdherence",
];

/* ── Behavior → Score mapping ─────────────────────── */

/**
 * Maps a single behavior dimension value (0–1) to a contribution score (0–5).
 * "Positive" dimensions (autonomy, toolUsage, complianceAdherence) scale linearly.
 * "Negative" dimensions (errorRate, hallucinationRate, escalationFrequency, responseLatency)
 * are inverted: lower is better.
 */
function dimensionToScore(dimension: keyof BehaviorDimension, value: number): number {
  const inverted = dimension === "errorRate"
    || dimension === "hallucinationRate"
    || dimension === "escalationFrequency"
    || dimension === "responseLatency";

  const normalized = inverted ? 1 - value : value;
  return clamp(normalized * 5, 0, 5);
}

/**
 * Compute a single question's simulated level from behavior dimensions.
 * Uses the layer weights for the question's layer, plus a question-specific
 * index offset to create realistic variance across questions within a layer.
 */
function computeQuestionLevel(
  question: DiagnosticQuestion,
  behavior: BehaviorDimension,
  questionIndex: number,
  totalInLayer: number,
): number {
  const weights = LAYER_WEIGHTS[question.layerName];
  let weighted = 0;

  for (const dim of DIMENSION_KEYS) {
    const score = dimensionToScore(dim, behavior[dim]);
    weighted += score * weights[dim];
  }

  // Add slight per-question variance based on position within layer
  const positionFactor = totalInLayer > 1
    ? ((questionIndex / (totalInLayer - 1)) - 0.5) * 0.3
    : 0;

  return clamp(Math.round((weighted + positionFactor) * 10) / 10, 0, 5);
}

/* ── Perturb behavior with variance ───────────────── */

function perturbBehavior(
  base: BehaviorDimension,
  variance: Variance | undefined,
  rng: () => number,
): BehaviorDimension {
  if (!variance) return base;

  const perturbed: Record<string, number> = {};
  for (const dim of DIMENSION_KEYS) {
    const v = variance[dim] ?? 0.05;
    const noise = normalRandom(rng) * v;
    perturbed[dim] = clamp(base[dim] + noise, 0, 1);
  }
  return perturbed as unknown as BehaviorDimension;
}

/* ── Layer override merging ───────────────────────── */

function applyLayerOverrides(
  base: BehaviorDimension,
  layerName: LayerName,
  overrides: Record<string, Partial<BehaviorDimension>> | undefined,
): BehaviorDimension {
  if (!overrides) return base;
  const layerOverride = overrides[layerName];
  if (!layerOverride) return base;
  return { ...base, ...layerOverride };
}

/* ── Statistics helpers ───────────────────────────── */

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: readonly number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function ci95(avg: number, sd: number, n: number): readonly [number, number] {
  const margin = 1.96 * (sd / Math.sqrt(Math.max(n, 1)));
  return [clamp(avg - margin, 0, 5), clamp(avg + margin, 0, 5)];
}

/* ── Build question→layer index ───────────────────── */

interface QuestionMeta {
  readonly question: DiagnosticQuestion;
  readonly indexInLayer: number;
  readonly layerSize: number;
}

function buildQuestionIndex(): readonly QuestionMeta[] {
  const byLayer = new Map<LayerName, DiagnosticQuestion[]>();
  for (const q of questionBank) {
    const list = byLayer.get(q.layerName) ?? [];
    list.push(q);
    byLayer.set(q.layerName, list);
  }

  const result: QuestionMeta[] = [];
  for (const q of questionBank) {
    const layerQuestions = byLayer.get(q.layerName) ?? [];
    result.push({
      question: q,
      indexInLayer: layerQuestions.indexOf(q),
      layerSize: layerQuestions.length,
    });
  }
  return result;
}

/* ── Governance gate check ────────────────────────── */

const GOVERNANCE_THRESHOLDS = {
  minComplianceAdherence: 0.4,
  maxHallucinationRate: 0.25,
  maxErrorRate: 0.3,
  minOverallScore: 1.0,
} as const;

function checkGovernanceGates(
  behavior: BehaviorDimension,
  overallScore: number,
): readonly string[] {
  const failures: string[] = [];

  if (behavior.complianceAdherence < GOVERNANCE_THRESHOLDS.minComplianceAdherence) {
    failures.push(
      `Compliance adherence ${(behavior.complianceAdherence * 100).toFixed(0)}% below minimum ${(GOVERNANCE_THRESHOLDS.minComplianceAdherence * 100).toFixed(0)}%`
    );
  }
  if (behavior.hallucinationRate > GOVERNANCE_THRESHOLDS.maxHallucinationRate) {
    failures.push(
      `Hallucination rate ${(behavior.hallucinationRate * 100).toFixed(0)}% exceeds maximum ${(GOVERNANCE_THRESHOLDS.maxHallucinationRate * 100).toFixed(0)}%`
    );
  }
  if (behavior.errorRate > GOVERNANCE_THRESHOLDS.maxErrorRate) {
    failures.push(
      `Error rate ${(behavior.errorRate * 100).toFixed(0)}% exceeds maximum ${(GOVERNANCE_THRESHOLDS.maxErrorRate * 100).toFixed(0)}%`
    );
  }
  if (overallScore < GOVERNANCE_THRESHOLDS.minOverallScore) {
    failures.push(
      `Overall score ${overallScore.toFixed(2)} below minimum ${GOVERNANCE_THRESHOLDS.minOverallScore.toFixed(2)}`
    );
  }

  return failures;
}

/* ── Main simulation ──────────────────────────────── */

export function runSimulation(
  scenario: Scenario,
  options: SimulationOptions,
): SimulationResult {
  const { iterations, seed } = options;
  const rng = mulberry32(seed);
  const questionIndex = buildQuestionIndex();

  // Accumulate per-question scores across iterations
  const questionAccum = new Map<string, number[]>();
  for (const meta of questionIndex) {
    questionAccum.set(meta.question.id, []);
  }

  for (let i = 0; i < iterations; i++) {
    // For fleet scenarios, compute weighted average behavior
    const baseBehavior = scenario.fleet && scenario.fleet.length > 0
      ? computeFleetBehavior(scenario.fleet, rng)
      : scenario.behavior;

    const perturbed = perturbBehavior(baseBehavior, scenario.variance, rng);

    for (const meta of questionIndex) {
      const withOverrides = applyLayerOverrides(
        perturbed,
        meta.question.layerName,
        scenario.layerOverrides,
      );
      const level = computeQuestionLevel(
        meta.question,
        withOverrides,
        meta.indexInLayer,
        meta.layerSize,
      );
      questionAccum.get(meta.question.id)!.push(level);
    }
  }

  // Aggregate question scores
  const questionScores: SimulatedQuestionScore[] = questionIndex.map((meta) => {
    const values = questionAccum.get(meta.question.id)!;
    const avg = mean(values);
    const sd = stdDev(values, avg);
    const [lo, hi] = ci95(avg, sd, iterations);
    return {
      questionId: meta.question.id,
      layerName: meta.question.layerName,
      meanLevel: Number(avg.toFixed(3)),
      stdDev: Number(sd.toFixed(4)),
      ci95Low: Number(lo.toFixed(3)),
      ci95High: Number(hi.toFixed(3)),
      confidence: Number(clamp(1 - sd / 2.5, 0, 1).toFixed(3)),
    };
  });

  // Aggregate layer scores
  const layerScores = aggregateLayerScores(questionScores);

  // Overall
  const overallValues = questionScores.map((qs) => qs.meanLevel);
  const overallMean = Number(mean(overallValues).toFixed(3));
  const overallSd = stdDev(overallValues, overallMean);
  const overallCi = ci95(overallMean, overallSd, overallValues.length);

  // Governance check
  const governanceFailures = checkGovernanceGates(scenario.behavior, overallMean);

  return {
    scenarioName: scenario.name,
    iterations,
    seed,
    timestamp: Date.now(),
    layerScores,
    questionScores,
    overallMean,
    overallCi95: overallCi,
    governanceGatePassed: governanceFailures.length === 0,
    governanceFailures,
  };
}

/* ── Fleet behavior aggregation ───────────────────── */

function computeFleetBehavior(
  fleet: NonNullable<Scenario["fleet"]>,
  rng: () => number,
): BehaviorDimension {
  const totalWeight = fleet.reduce((s, a) => s + (a.weight ?? 1), 0);
  const result: Record<string, number> = {};

  for (const dim of DIMENSION_KEYS) {
    let weighted = 0;
    for (const agent of fleet) {
      const w = (agent.weight ?? 1) / totalWeight;
      const perturbed = perturbBehavior(agent.behavior, agent.variance, rng);
      weighted += perturbed[dim] * w;
    }
    result[dim] = clamp(weighted, 0, 1);
  }

  return result as unknown as BehaviorDimension;
}

/* ── Layer aggregation ────────────────────────────── */

function aggregateLayerScores(
  questionScores: readonly SimulatedQuestionScore[],
): readonly SimulatedLayerScore[] {
  const byLayer = new Map<LayerName, SimulatedQuestionScore[]>();
  for (const qs of questionScores) {
    const list = byLayer.get(qs.layerName) ?? [];
    list.push(qs);
    byLayer.set(qs.layerName, list);
  }

  const layers: SimulatedLayerScore[] = [];
  for (const [layerName, scores] of byLayer.entries()) {
    const values = scores.map((s) => s.meanLevel);
    const avg = mean(values);
    const sd = stdDev(values, avg);
    const [lo, hi] = ci95(avg, sd, values.length);
    layers.push({
      layerName,
      meanLevel: Number(avg.toFixed(3)),
      stdDev: Number(sd.toFixed(4)),
      ci95Low: Number(lo.toFixed(3)),
      ci95High: Number(hi.toFixed(3)),
      questionCount: scores.length,
    });
  }

  return layers;
}

/* ── Stress testing ───────────────────────────────── */

/**
 * Find the breaking point for each dimension — the value at which
 * governance gates start failing.
 */
export function runStressTest(
  scenario: Scenario,
  options: SimulationOptions,
): StressResult {
  const breakingPoints: BreakingPoint[] = [];
  const step = 0.05;

  for (const dim of DIMENSION_KEYS) {
    // Determine search direction based on dimension type
    const isNegative = dim === "errorRate"
      || dim === "hallucinationRate"
      || dim === "escalationFrequency"
      || dim === "responseLatency";

    const direction: "increasing" | "decreasing" = isNegative ? "increasing" : "decreasing";

    // Walk the dimension from current value toward the failing direction
    const start = scenario.behavior[dim];
    const end = isNegative ? 1.0 : 0.0;
    const delta = isNegative ? step : -step;

    let threshold: number | null = null;
    let failedGates: readonly string[] = [];

    for (let v = start + delta; isNegative ? v <= end : v >= end; v += delta) {
      const tweaked: BehaviorDimension = { ...scenario.behavior, [dim]: clamp(v, 0, 1) };
      const tweakedScenario: Scenario = { ...scenario, behavior: tweaked, variance: undefined };
      const result = runSimulation(tweakedScenario, { iterations: 100, seed: options.seed });

      if (!result.governanceGatePassed) {
        threshold = Number(clamp(v, 0, 1).toFixed(2));
        failedGates = result.governanceFailures;
        break;
      }
    }

    if (threshold !== null) {
      breakingPoints.push({ dimension: dim, thresholdValue: threshold, failedGates, direction });
    }
  }

  return {
    scenarioName: scenario.name,
    breakingPoints,
    timestamp: Date.now(),
  };
}
