import type { MechanicGapReport } from "./mechanicSchema.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RewardSignal {
  questionId: string;
  dimension: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
  weight: number;
  rewardSignal: number;
}

export interface RewardFunctionExport {
  version: 1;
  generatedTs: number;
  scope: { type: string; id: string };
  totalGaps: number;
  rewardSignals: RewardSignal[];
  metadata: {
    integrityIndex: number;
    readiness: string;
  };
}

export interface DSPyMetric {
  name: string;
  description: string;
  currentValue: number;
  targetValue: number;
  optimizationDirection: "maximize" | "minimize";
}

export interface DSPyTargetExport {
  version: 1;
  metrics: DSPyMetric[];
  constraints: string[];
}

export interface FocusArea {
  dimension: string;
  gapCount: number;
  avgGap: number;
  suggestedTrainingTopics: string[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface FineTuneRecipe {
  version: 1;
  recipeName: string;
  focusAreas: FocusArea[];
  estimatedTrainingHours: number;
  dataRequirements: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dimensionForQuestion(qId: string): string {
  if (qId.startsWith("AMC-1.") || qId.startsWith("AMC-COST-") || qId.startsWith("AMC-SPORT-") || qId.startsWith("AMC-OPS-") || qId.startsWith("AMC-OINT-")) return "DIM-1";
  if (qId.startsWith("AMC-2.") || qId.startsWith("AMC-HOQ-") || qId.startsWith("AMC-GOV-PROACTIVE-") || qId.startsWith("AMC-BCON-") || qId.startsWith("AMC-EUAI-")) return "DIM-2";
  if (qId.startsWith("AMC-3.") || qId.startsWith("AMC-SOCIAL-")) return "DIM-3";
  if (qId.startsWith("AMC-4.") || qId.startsWith("AMC-MEM-") || qId.startsWith("AMC-RES-") || qId.startsWith("AMC-SK-") || qId.startsWith("AMC-THR-")) return "DIM-4";
  return "DIM-5";
}

function weightFromGap(gap: number): number {
  if (gap <= 0) return 0;
  if (gap <= 1) return 0.25;
  if (gap <= 2) return 0.5;
  if (gap <= 3) return 0.75;
  return 1.0;
}

function priorityFromAvgGap(avgGap: number): "critical" | "high" | "medium" | "low" {
  if (avgGap >= 3) return "critical";
  if (avgGap >= 2) return "high";
  if (avgGap >= 1) return "medium";
  return "low";
}

const DIMENSION_TOPICS: Record<string, string[]> = {
  "DIM-1": ["operational autonomy", "cost efficiency", "infrastructure resilience", "deployment orchestration"],
  "DIM-2": ["governance frameworks", "human oversight", "behavioral contracts", "EU AI Act compliance"],
  "DIM-3": ["social impact assessment", "stakeholder communication", "ethical reasoning", "bias mitigation"],
  "DIM-4": ["memory management", "reasoning chains", "skill acquisition", "threat modeling"],
  "DIM-5": ["security hardening", "assurance testing", "compliance verification", "audit readiness"],
};

/* ------------------------------------------------------------------ */
/*  Export Functions                                                    */
/* ------------------------------------------------------------------ */

export function exportAsRewardFunction(gapReport: MechanicGapReport): RewardFunctionExport {
  const gappedQuestions = gapReport.perQuestion.filter((q) => q.gap > 0);

  const rewardSignals: RewardSignal[] = gappedQuestions.map((q) => ({
    questionId: q.qId,
    dimension: dimensionForQuestion(q.qId),
    currentLevel: q.measured,
    targetLevel: q.desired,
    gap: q.gap,
    weight: weightFromGap(q.gap),
    rewardSignal: q.gap > 0 ? q.gap * weightFromGap(q.gap) : -(Math.abs(q.gap) * 0.5),
  }));

  return {
    version: 1,
    generatedTs: gapReport.generatedTs,
    scope: { type: gapReport.scope.type, id: gapReport.scope.id },
    totalGaps: gappedQuestions.length,
    rewardSignals,
    metadata: {
      integrityIndex: gapReport.global.integrityIndex,
      readiness: gapReport.readiness,
    },
  };
}

export function exportAsDSPyTargets(gapReport: MechanicGapReport): DSPyTargetExport {
  const metrics: DSPyMetric[] = gapReport.perQuestion
    .filter((q) => q.gap > 0)
    .map((q) => ({
      name: `amc_${q.qId.replace(/[.-]/g, "_").toLowerCase()}`,
      description: `AMC maturity score for ${q.qId} (dimension ${dimensionForQuestion(q.qId)})`,
      currentValue: q.measured,
      targetValue: q.desired,
      optimizationDirection: "maximize" as const,
    }));

  const constraints: string[] = [];
  for (const dim of gapReport.perDimension) {
    if (dim.unknownCount > 0) {
      constraints.push(`${dim.dimensionId}: ${dim.unknownCount} question(s) with unknown status — resolve evidence gaps before optimization`);
    }
    if (dim.targetAverage - dim.measuredAverage > 2) {
      constraints.push(`${dim.dimensionId}: large average gap (${(dim.targetAverage - dim.measuredAverage).toFixed(1)}) — consider phased optimization`);
    }
  }
  if (gapReport.readiness === "UNTRUSTED") {
    constraints.push("Overall readiness is UNTRUSTED — improve integrity index before training");
  }

  return {
    version: 1,
    metrics,
    constraints,
  };
}

export function exportAsFineTuneRecipe(gapReport: MechanicGapReport): FineTuneRecipe {
  const gapped = gapReport.perQuestion.filter((q) => q.gap > 0);

  const dimGroups = new Map<string, { gaps: number[]; count: number }>();
  for (const q of gapped) {
    const dim = dimensionForQuestion(q.qId);
    const existing = dimGroups.get(dim) ?? { gaps: [], count: 0 };
    existing.gaps.push(q.gap);
    existing.count++;
    dimGroups.set(dim, existing);
  }

  const focusAreas: FocusArea[] = [...dimGroups.entries()]
    .map(([dim, data]) => {
      const avgGap = data.gaps.reduce((s, g) => s + g, 0) / data.gaps.length;
      return {
        dimension: dim,
        gapCount: data.count,
        avgGap: Number(avgGap.toFixed(2)),
        suggestedTrainingTopics: DIMENSION_TOPICS[dim] ?? ["general agent improvement"],
        priority: priorityFromAvgGap(avgGap),
      };
    })
    .sort((a, b) => b.avgGap - a.avgGap);

  const totalGapScore = gapped.reduce((s, q) => s + q.gap, 0);
  const estimatedTrainingHours = Number((totalGapScore * 2.5).toFixed(1));

  const dataRequirements: string[] = [];
  if (focusAreas.some((f) => f.priority === "critical")) {
    dataRequirements.push("High-quality labeled examples for critical dimensions");
  }
  if (gapReport.readiness === "NEEDS_EVIDENCE") {
    dataRequirements.push("Additional evidence artifacts to improve integrity index");
  }
  if (gapReport.readiness === "UNTRUSTED") {
    dataRequirements.push("Trusted ground-truth scoring data to re-establish baseline");
  }
  if (gapped.length > 50) {
    dataRequirements.push("Broad training corpus covering multiple dimensions");
  }
  if (gapped.length > 0) {
    dataRequirements.push("Evaluation dataset for regression testing after fine-tuning");
  }

  return {
    version: 1,
    recipeName: `amc-finetune-${gapReport.scope.type.toLowerCase()}-${gapReport.scope.id}`,
    focusAreas,
    estimatedTrainingHours,
    dataRequirements,
  };
}
