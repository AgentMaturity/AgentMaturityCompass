/**
 * Decision Explainability Score
 * Measures the quality and manager-interpretability of decision rationale chains.
 */

export interface DecisionExplainabilityInput {
  totalDecisions?: number;
  decisionsWithRationale?: number;
  rationaleLinkedToEvidence?: number;
  averageRationaleDepth?: number;
  counterfactualCoverage?: number; // 0..1
  managerReadableRate?: number; // 0..1
  policyReferenceRate?: number; // 0..1
  unresolvedContradictionRate?: number; // 0..1
}

export interface DecisionExplainabilityMetrics {
  totalDecisions: number;
  rationaleCoverage: number;
  evidenceLinkRate: number;
  rationaleDepthScore: number;
  counterfactualCoverage: number;
  managerReadableRate: number;
  policyReferenceRate: number;
  contradictionDiscipline: number;
}

export interface DecisionExplainabilityDiagnosticQuestion {
  id: string;
  question: string;
  whyItMatters: string;
}

export interface DecisionExplainabilityEvidenceGate {
  id: string;
  name: string;
  passed: boolean;
  required: boolean;
  observed: number;
  threshold: number;
  comparator: ">=" | "<=";
  reason: string;
}

export interface DecisionExplainabilityResult {
  score: number; // 0-100
  level: number; // 0-5
  metrics: DecisionExplainabilityMetrics;
  diagnosticQuestions: DecisionExplainabilityDiagnosticQuestion[];
  evidenceGates: DecisionExplainabilityEvidenceGate[];
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

function explainabilityDepthScore(depth: number | undefined): number {
  if (typeof depth !== "number" || !Number.isFinite(depth) || depth <= 0) {
    return 0;
  }
  if (depth >= 2 && depth <= 5) {
    return 1;
  }
  if (depth < 2) {
    return clamp01(depth / 2);
  }
  return clamp01(1 - (depth - 5) / 5);
}

function minGate(
  id: string,
  name: string,
  observed: number,
  threshold: number,
  required: boolean,
  passLabel: string,
  failLabel: string
): DecisionExplainabilityEvidenceGate {
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

const DIAGNOSTIC_QUESTIONS: DecisionExplainabilityDiagnosticQuestion[] = [
  {
    id: "AMC-DEX-1",
    question: "Can each high-impact decision be traced to explicit evidence and policy references?",
    whyItMatters: "Without explicit traceability, decisions cannot be defended to leadership or auditors."
  },
  {
    id: "AMC-DEX-2",
    question: "Can a non-technical manager explain why this option won over alternatives?",
    whyItMatters: "Explainability fails if rationale cannot be communicated outside engineering."
  }
];

export function scoreDecisionExplainability(input: DecisionExplainabilityInput = {}): DecisionExplainabilityResult {
  const totalDecisions =
    typeof input.totalDecisions === "number" && Number.isFinite(input.totalDecisions)
      ? Math.max(0, Math.round(input.totalDecisions))
      : 0;

  const decisionsWithRationale =
    typeof input.decisionsWithRationale === "number" && Number.isFinite(input.decisionsWithRationale)
      ? Math.max(0, input.decisionsWithRationale)
      : 0;

  const rationaleLinkedToEvidence =
    typeof input.rationaleLinkedToEvidence === "number" && Number.isFinite(input.rationaleLinkedToEvidence)
      ? Math.max(0, input.rationaleLinkedToEvidence)
      : 0;

  const rationaleCoverage = totalDecisions > 0 ? clamp01(decisionsWithRationale / totalDecisions) : 0;
  const evidenceLinkRate = decisionsWithRationale > 0
    ? clamp01(rationaleLinkedToEvidence / decisionsWithRationale)
    : 0;
  const rationaleDepthScore = explainabilityDepthScore(input.averageRationaleDepth);
  const counterfactualCoverage = clamp01(input.counterfactualCoverage);
  const managerReadableRate = clamp01(input.managerReadableRate);
  const policyReferenceRate = clamp01(input.policyReferenceRate);
  const contradictionDiscipline = 1 - clamp01(input.unresolvedContradictionRate);

  const metrics: DecisionExplainabilityMetrics = {
    totalDecisions,
    rationaleCoverage,
    evidenceLinkRate,
    rationaleDepthScore,
    counterfactualCoverage,
    managerReadableRate,
    policyReferenceRate,
    contradictionDiscipline
  };

  const evidenceGates: DecisionExplainabilityEvidenceGate[] = [
    minGate(
      "DEX-G1",
      "Decision sample sufficiency",
      totalDecisions,
      20,
      true,
      "Decision sample size is sufficient.",
      "Capture at least 20 decisions before judging explainability quality."
    ),
    minGate(
      "DEX-G2",
      "Rationale coverage",
      rationaleCoverage,
      0.8,
      true,
      "Most decisions include rationale chains.",
      "At least 80% of decisions need explicit rationale chains."
    ),
    minGate(
      "DEX-G3",
      "Evidence linkage",
      evidenceLinkRate,
      0.75,
      true,
      "Rationale chains are linked to evidence.",
      "At least 75% of rationale chains should cite direct evidence."
    ),
    minGate(
      "DEX-G4",
      "Manager readability",
      managerReadableRate,
      0.75,
      false,
      "Decision rationales are manager-readable.",
      "Improve manager-readable explanations to at least 75%."
    )
  ];

  const rawScore =
    rationaleCoverage * 25 +
    evidenceLinkRate * 20 +
    rationaleDepthScore * 10 +
    counterfactualCoverage * 15 +
    managerReadableRate * 15 +
    policyReferenceRate * 10 +
    contradictionDiscipline * 5;

  const requiredGateFailures = evidenceGates.filter((gate) => gate.required && !gate.passed).length;
  const score = Math.round(clamp100(rawScore - requiredGateFailures * 8));

  const gaps: string[] = [];
  const recommendations: string[] = [];

  for (const gate of evidenceGates) {
    if (!gate.passed) {
      pushUnique(gaps, gate.reason);
    }
  }

  if (metrics.counterfactualCoverage < 0.6) {
    pushUnique(gaps, "Decision records rarely include rejected alternatives/counterfactuals.");
    pushUnique(recommendations, "Add at least one considered alternative and rejection reason per major decision.");
  }
  if (metrics.policyReferenceRate < 0.7) {
    pushUnique(gaps, "Decision rationale chains are weakly connected to policy/guardrail references.");
    pushUnique(recommendations, "Attach policy identifiers to rationale steps for all high-risk decisions.");
  }
  if (metrics.contradictionDiscipline < 0.85) {
    pushUnique(gaps, "Contradictions are not consistently resolved in rationale chains.");
    pushUnique(recommendations, "Add contradiction checks before finalizing decision rationale outputs.");
  }
  if (metrics.rationaleDepthScore < 0.6) {
    pushUnique(recommendations, "Use multi-step rationale templates to avoid shallow one-line justifications.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Keep explainability reviews in release gates and monitor readability drift monthly.");
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
