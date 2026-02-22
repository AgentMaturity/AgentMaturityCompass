/**
 * Test-Production Parity Score
 * Measures how consistently agent behavior transfers from evaluation to production.
 */

export interface TestProdParityInput {
  evalSampleSize?: number;
  prodSampleSize?: number;
  evalSuccessRate?: number; // 0..1
  prodSuccessRate?: number; // 0..1
  evalP95LatencyMs?: number;
  prodP95LatencyMs?: number;
  evalCostPerRunUsd?: number;
  prodCostPerRunUsd?: number;
  schemaMismatchRate?: number; // 0..1
  toolAvailabilityParity?: number; // 0..1
  incidentEscapeRate?: number; // 0..1, production incidents not reproduced in evals
}

export interface TestProdParityMetrics {
  evalSampleSize: number;
  prodSampleSize: number;
  successRateGap: number;
  successParity: number;
  latencyDrift: number;
  latencyParity: number;
  costDrift: number;
  costParity: number;
  schemaParity: number;
  toolingParity: number;
  incidentContainment: number;
}

export interface TestProdParityDiagnosticQuestion {
  id: string;
  question: string;
  whyItMatters: string;
}

export interface TestProdParityEvidenceGate {
  id: string;
  name: string;
  passed: boolean;
  required: boolean;
  observed: number;
  threshold: number;
  comparator: ">=" | "<=";
  reason: string;
}

export interface TestProdParityResult {
  score: number; // 0-100
  level: number; // 0-5
  metrics: TestProdParityMetrics;
  diagnosticQuestions: TestProdParityDiagnosticQuestion[];
  evidenceGates: TestProdParityEvidenceGate[];
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

function relativeDrift(evalValue: number | undefined, prodValue: number | undefined): number {
  if (
    typeof evalValue !== "number" ||
    !Number.isFinite(evalValue) ||
    typeof prodValue !== "number" ||
    !Number.isFinite(prodValue)
  ) {
    return 1;
  }
  const baseline = Math.max(Math.abs(evalValue), 1e-9);
  return Math.min(1, Math.abs(prodValue - evalValue) / baseline);
}

function minGate(
  id: string,
  name: string,
  observed: number,
  threshold: number,
  required: boolean,
  passLabel: string,
  failLabel: string
): TestProdParityEvidenceGate {
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

function maxGate(
  id: string,
  name: string,
  observed: number,
  threshold: number,
  required: boolean,
  passLabel: string,
  failLabel: string
): TestProdParityEvidenceGate {
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

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

const DIAGNOSTIC_QUESTIONS: TestProdParityDiagnosticQuestion[] = [
  {
    id: "AMC-TPP-1",
    question: "Which production failures had no equivalent test/eval scenario coverage?",
    whyItMatters: "Parity fails when test suites miss real production conditions."
  },
  {
    id: "AMC-TPP-2",
    question: "How far do latency, success, and cost metrics drift between eval and production?",
    whyItMatters: "Large metric drift indicates that go-live confidence is overstated."
  }
];

export function scoreTestProdParity(input: TestProdParityInput = {}): TestProdParityResult {
  const evalSampleSize =
    typeof input.evalSampleSize === "number" && Number.isFinite(input.evalSampleSize)
      ? Math.max(0, Math.round(input.evalSampleSize))
      : 0;
  const prodSampleSize =
    typeof input.prodSampleSize === "number" && Number.isFinite(input.prodSampleSize)
      ? Math.max(0, Math.round(input.prodSampleSize))
      : 0;

  const evalSuccessRate = clamp01(input.evalSuccessRate);
  const prodSuccessRate = clamp01(input.prodSuccessRate);
  const successRateGap = Math.abs(evalSuccessRate - prodSuccessRate);
  const successParity = 1 - successRateGap;

  const latencyDrift = relativeDrift(input.evalP95LatencyMs, input.prodP95LatencyMs);
  const latencyParity = 1 - latencyDrift;

  const hasCostInputs =
    typeof input.evalCostPerRunUsd === "number" && Number.isFinite(input.evalCostPerRunUsd) &&
    typeof input.prodCostPerRunUsd === "number" && Number.isFinite(input.prodCostPerRunUsd);
  const costDrift = hasCostInputs ? relativeDrift(input.evalCostPerRunUsd, input.prodCostPerRunUsd) : 1;
  const costParity = hasCostInputs ? 1 - costDrift : 0;

  const schemaParity = 1 - clamp01(input.schemaMismatchRate);
  const toolingParity = clamp01(input.toolAvailabilityParity);
  const incidentContainment = 1 - clamp01(input.incidentEscapeRate);

  const metrics: TestProdParityMetrics = {
    evalSampleSize,
    prodSampleSize,
    successRateGap,
    successParity,
    latencyDrift,
    latencyParity,
    costDrift,
    costParity,
    schemaParity,
    toolingParity,
    incidentContainment
  };

  const evidenceGates: TestProdParityEvidenceGate[] = [
    minGate(
      "TPP-G1",
      "Eval sample sufficiency",
      evalSampleSize,
      30,
      true,
      "Eval sample size is sufficient.",
      "Run at least 30 eval cases before relying on parity score."
    ),
    minGate(
      "TPP-G2",
      "Production sample sufficiency",
      prodSampleSize,
      30,
      true,
      "Production sample size is sufficient.",
      "Collect at least 30 production runs to assess parity reliably."
    ),
    maxGate(
      "TPP-G3",
      "Success-rate drift",
      successRateGap,
      0.1,
      true,
      "Success-rate drift is within tolerance.",
      "Reduce success-rate drift to <=10% between eval and production."
    ),
    maxGate(
      "TPP-G4",
      "Incident escape rate",
      1 - incidentContainment,
      0.05,
      true,
      "Production incident escape rate is controlled.",
      "More than 5% of production incidents are escaping eval coverage."
    ),
    minGate(
      "TPP-G5",
      "Tool availability parity",
      toolingParity,
      0.85,
      false,
      "Tool availability parity is healthy.",
      "Align eval tool availability with production to >=85%."
    )
  ];

  const rawScore =
    successParity * 30 +
    latencyParity * 20 +
    costParity * 15 +
    schemaParity * 10 +
    toolingParity * 15 +
    incidentContainment * 10;

  const requiredGateFailures = evidenceGates.filter((gate) => gate.required && !gate.passed).length;
  const score = Math.round(clamp100(rawScore - requiredGateFailures * 8));

  const gaps: string[] = [];
  const recommendations: string[] = [];

  for (const gate of evidenceGates) {
    if (!gate.passed) {
      pushUnique(gaps, gate.reason);
    }
  }

  if (metrics.successRateGap > 0.1) {
    pushUnique(recommendations, "Replay production failure cases in eval suite until success-rate drift is <=10%.");
  }
  if (metrics.latencyDrift > 0.25) {
    pushUnique(
      recommendations,
      "Mirror production tool/network latency in eval harness to reduce unrealistic test performance."
    );
  }
  if (hasCostInputs && metrics.costDrift > 0.25) {
    pushUnique(recommendations, "Re-estimate routing/token assumptions; production cost drift exceeds acceptable band.");
  }
  if (!hasCostInputs) {
    pushUnique(gaps, "Cost parity could not be measured because eval/production cost data is missing.");
    pushUnique(recommendations, "Track per-run eval and production cost to enable cost parity gating.");
  }
  if (metrics.schemaParity < 0.9) {
    pushUnique(recommendations, "Apply identical schema validation in eval and production pipelines.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Maintain parity checks in CI and alert when any drift metric breaches thresholds.");
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
