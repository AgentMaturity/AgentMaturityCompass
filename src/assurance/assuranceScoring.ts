import {
  assuranceFindingCategorySchema,
  assuranceScoreSchema,
  type AssuranceFinding,
  type AssuranceFindingCategory,
  type AssuranceScore
} from "./assuranceSchema.js";
import type { AssurancePolicy } from "./assurancePolicySchema.js";
import { findingCounts } from "./assuranceFindings.js";

const PENALTY_BY_SEVERITY: Record<AssuranceFinding["severity"], number> = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 5,
  INFO: 1
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(4))));
}

function emptyCategoryScores(): Record<AssuranceFindingCategory, number> {
  const out = {} as Record<AssuranceFindingCategory, number>;
  for (const category of assuranceFindingCategorySchema.options) {
    out[category] = 100;
  }
  return out;
}

export interface AssuranceEvidenceGates {
  integrityIndex: number;
  /** Null when not measured; it blocks certificate issuance like a ratio below a minimum above 0. */
  correlationRatio: number | null;
  observedShare: number;
}

export function evaluateAssuranceEvidenceGates(params: {
  policy: AssurancePolicy;
  gates: AssuranceEvidenceGates;
}): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (params.gates.integrityIndex < params.policy.assurancePolicy.gates.minIntegrityIndex) {
    reasons.push(
      `integrityIndex ${params.gates.integrityIndex.toFixed(4)} < min ${params.policy.assurancePolicy.gates.minIntegrityIndex.toFixed(4)}`
    );
  }
  if (params.gates.correlationRatio === null) { // a minimum of 0 sets no requirement
    if (params.policy.assurancePolicy.gates.minCorrelationRatio > 0) reasons.push("correlationRatio not measured");
  } else if (params.gates.correlationRatio < params.policy.assurancePolicy.gates.minCorrelationRatio) {
    reasons.push(
      `correlationRatio ${params.gates.correlationRatio.toFixed(4)} < min ${params.policy.assurancePolicy.gates.minCorrelationRatio.toFixed(4)}`
    );
  }
  if (params.gates.observedShare < params.policy.assurancePolicy.gates.minObservedShare) {
    reasons.push(
      `observedShare ${params.gates.observedShare.toFixed(4)} < min ${params.policy.assurancePolicy.gates.minObservedShare.toFixed(4)}`
    );
  }
  return {
    ok: reasons.length === 0,
    reasons
  };
}

export function scoreAssuranceRun(params: {
  policy: AssurancePolicy;
  findings: AssuranceFinding[];
  gates: AssuranceEvidenceGates;
}): AssuranceScore {
  const evidence = evaluateAssuranceEvidenceGates({
    policy: params.policy,
    gates: params.gates
  });

  const counts = findingCounts(params.findings);
  if (!evidence.ok) {
    return assuranceScoreSchema.parse({
      status: "INSUFFICIENT_EVIDENCE",
      riskAssuranceScore: null,
      categoryScores: emptyCategoryScores(),
      findingCounts: counts,
      pass: false,
      reasons: evidence.reasons
    });
  }

  let score = 100;
  const categoryScores = emptyCategoryScores();
  for (const finding of params.findings) {
    const penalty = PENALTY_BY_SEVERITY[finding.severity];
    score -= penalty;
    categoryScores[finding.category] = clampScore(categoryScores[finding.category] - penalty);
  }
  const riskAssuranceScore = clampScore(score);

  const thresholdReasons: string[] = [];
  if (riskAssuranceScore < params.policy.assurancePolicy.thresholds.minRiskAssuranceScore) {
    thresholdReasons.push(
      `score ${riskAssuranceScore.toFixed(2)} < min ${params.policy.assurancePolicy.thresholds.minRiskAssuranceScore.toFixed(2)}`
    );
  }
  if (counts.critical > params.policy.assurancePolicy.thresholds.maxCriticalFindings) {
    thresholdReasons.push(
      `critical findings ${counts.critical} > max ${params.policy.assurancePolicy.thresholds.maxCriticalFindings}`
    );
  }
  if (counts.high > params.policy.assurancePolicy.thresholds.maxHighFindings) {
    thresholdReasons.push(
      `high findings ${counts.high} > max ${params.policy.assurancePolicy.thresholds.maxHighFindings}`
    );
  }

  const pass = thresholdReasons.length === 0;
  return assuranceScoreSchema.parse({
    status: pass ? "PASS" : "FAIL",
    riskAssuranceScore,
    categoryScores,
    findingCounts: counts,
    pass,
    reasons: thresholdReasons
  });
}
