import type {
  DiagnosticConfidenceSummary,
  QuestionConfidenceControls,
  QuestionScore,
  RecommendationConfidenceControl
} from "../types.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function confidenceControlsForQuestion(input: {
  questionId: string;
  claimedLevel: number;
  supportedMaxLevel: number;
  finalLevel: number;
  confidence: number;
  evidenceEventIds: string[];
  flags: string[];
}): QuestionConfidenceControls {
  const unsupported = input.flags.includes("FLAG_UNSUPPORTED_CLAIM") || input.claimedLevel > input.supportedMaxLevel;
  const contradiction = input.flags.includes("FLAG_CONTRADICTION_RISK");
  const missingEvidence = input.flags.includes("FLAG_MISSING_LLM_EVIDENCE") || input.flags.includes("FLAG_ASSURANCE_EVIDENCE_MISSING");
  const evidenceSufficiency = round(clamp(input.evidenceEventIds.length / 3 - (missingEvidence ? 0.25 : 0) - (unsupported ? 0.2 : 0)));
  const contradictionRisk = round(clamp((contradiction ? 0.85 : 0) + (unsupported ? 0.2 : 0)));
  const judgeAgreement = round(clamp(input.confidence + (unsupported ? -0.25 : 0.05) - input.flags.length * 0.04));
  const decisivenessRisk = round(clamp(1 - input.confidence * 0.45 - evidenceSufficiency * 0.35 + contradictionRisk * 0.3 + (unsupported ? 0.25 : 0)));
  const uncertaintyLevel: QuestionConfidenceControls["uncertaintyLevel"] =
    decisivenessRisk >= 0.65 || evidenceSufficiency < 0.25
      ? "high"
      : decisivenessRisk >= 0.4 || evidenceSufficiency < 0.5
        ? "medium"
        : "low";
  const presentationStatus: QuestionConfidenceControls["presentationStatus"] =
    uncertaintyLevel === "high"
      ? "needs_review"
      : unsupported || missingEvidence || evidenceSufficiency < 0.5
        ? "downgraded"
        : "verified";
  const autoFixAllowed =
    presentationStatus === "verified" &&
    input.confidence >= 0.55 &&
    evidenceSufficiency >= 0.5 &&
    contradictionRisk < 0.5 &&
    decisivenessRisk < 0.55;
  let downgradeReason: string | null = null;
  if (unsupported) {
    downgradeReason = "Claim exceeds supported evidence.";
  } else if (missingEvidence || evidenceSufficiency < 0.5) {
    downgradeReason = "Evidence is too thin for a confident finding.";
  } else if (contradictionRisk >= 0.5) {
    downgradeReason = "Contradictory evidence increases uncertainty.";
  } else if (uncertaintyLevel === "high") {
    downgradeReason = "Decisiveness risk is high.";
  }
  return {
    evidenceSufficiency,
    contradictionRisk,
    judgeAgreement,
    decisivenessRisk,
    uncertaintyLevel,
    presentationStatus,
    downgradeReason,
    autoFixAllowed
  };
}

export function controlsForScore(score: QuestionScore): QuestionConfidenceControls {
  return score.confidenceControls ?? confidenceControlsForQuestion(score);
}

export function recommendationControlForScore(input: {
  action: string;
  score: QuestionScore;
}): RecommendationConfidenceControl {
  const controls = controlsForScore(input.score);
  const autoFixAllowed = controls.autoFixAllowed && input.score.finalLevel >= 2;
  const reason = autoFixAllowed
    ? "Auto-propose allowed: confidence and evidence gates passed."
    : controls.downgradeReason ?? "Review required before auto-fix because confidence or uncertainty gates did not pass.";
  return {
    questionId: input.score.questionId,
    action: input.action,
    confidence: round(input.score.confidence),
    uncertaintyLevel: controls.uncertaintyLevel,
    autoFixAllowed,
    reason
  };
}

export function summarizeConfidenceControls(
  scores: QuestionScore[],
  recommendationControls: RecommendationConfidenceControl[]
): DiagnosticConfidenceSummary {
  const controls = scores.map(controlsForScore);
  const avg = (values: number[]): number =>
    values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    lowConfidenceFindings: scores.filter((score) => score.confidence < 0.5).length,
    highUncertaintyFindings: controls.filter((control) => control.uncertaintyLevel === "high").length,
    downgradedFindings: controls.filter((control) => control.presentationStatus !== "verified").length,
    autoFixBlockedRecommendations: recommendationControls.filter((control) => !control.autoFixAllowed).length,
    averageEvidenceSufficiency: avg(controls.map((control) => control.evidenceSufficiency)),
    averageJudgeAgreement: avg(controls.map((control) => control.judgeAgreement))
  };
}
