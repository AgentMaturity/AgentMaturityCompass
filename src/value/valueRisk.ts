import type { ValuePolicy } from "./valuePolicySchema.js";

export interface EconomicSignificanceResult {
  score: number | null;
  risk: number | null;
  reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeEconomicSignificance(params: {
  policy: ValuePolicy;
  valueScore: number | null;
  economicValue: number | null;
  costScore: number | null;
  assuranceScore: number | null;
  insufficientEvidence: boolean;
  valueRegressing: boolean;
  costRising: boolean;
  noValueEventsLast30d: boolean;
}): EconomicSignificanceResult {
  if (params.insufficientEvidence) {
    return {
      score: null,
      risk: Number(
        clamp(
          params.policy.valuePolicy.formulas.riskIndices.economicSignificanceRisk.base +
            params.policy.valuePolicy.formulas.riskIndices.economicSignificanceRisk.penaltyIfEvidenceInsufficient,
          0,
          100
        ).toFixed(6)
      ),
      reasons: ["INSUFFICIENT_EVIDENCE"]
    };
  }

  const benefits = [params.valueScore, params.economicValue].filter((value): value is number => typeof value === "number");
  // No measured benefit: the score is not evaluated, never one built on a 0 benefit.
  const benefitScore = benefits.length === 0 ? null : benefits.reduce((sum, value) => sum + value, 0) / benefits.length;
  const normalizedCost = params.costScore ?? 50;
  const riskQuality = params.assuranceScore ?? 50;
  const weights = params.policy.valuePolicy.formulas.economicSignificance;

  const score = benefitScore === null ? null : clamp(
    benefitScore * weights.benefitWeight + normalizedCost * weights.costWeight + riskQuality * weights.riskWeight,
    0,
    100
  );

  const penalties = params.policy.valuePolicy.formulas.riskIndices.economicSignificanceRisk;
  let risk = penalties.base;
  const reasons: string[] = benefitScore === null ? ["VALUE_NOT_MEASURED"] : [];
  if (params.noValueEventsLast30d) {
    risk += penalties.penaltyIfNoValueEventsLast30d;
    reasons.push("NO_VALUE_EVENTS_30D");
  }
  if (params.valueRegressing) {
    risk += penalties.penaltyIfValueRegressing;
    reasons.push("VALUE_REGRESSING");
  }
  if (params.costRising) {
    risk += penalties.penaltyIfCostRising;
    reasons.push("COST_RISING");
  }

  return {
    score: score === null ? null : Number(score.toFixed(6)),
    risk: Number(clamp(risk, 0, 100).toFixed(6)),
    reasons
  };
}

export function detectValueRegression(params: {
  previousValueScore: number | null;
  nextValueScore: number | null;
  previousEconomicValue: number | null;
  nextEconomicValue: number | null;
  previousCost: number | null;
  nextCost: number | null;
  thresholdPoints?: number;
}): {
  regressed: boolean;
  reasons: string[];
} {
  const threshold = params.thresholdPoints ?? 5;
  const reasons: string[] = [];
  if (typeof params.previousValueScore === "number" && typeof params.nextValueScore === "number") {
    if (params.previousValueScore - params.nextValueScore > threshold) {
      reasons.push("VALUE_SCORE_DROP");
    }
  }
  if (
    typeof params.previousEconomicValue === "number" &&
    typeof params.nextEconomicValue === "number" &&
    typeof params.previousCost === "number" &&
    typeof params.nextCost === "number"
  ) {
    if (params.nextEconomicValue < params.previousEconomicValue && params.nextCost > params.previousCost) {
      reasons.push("ECONOMIC_DOWN_COST_UP");
    }
  }
  return {
    regressed: reasons.length > 0,
    reasons
  };
}
