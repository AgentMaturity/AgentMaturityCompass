import type { DiagnosticReport, QuestionScore } from "../../types.js";
import { autoAnswerRuleByQuestionId } from "./autoAnswerMappings.js";
import { controlsForScore } from "../confidenceControls.js";

export interface AutoAnswerQuestionResult {
  questionId: string;
  measuredScore: number;
  evidenceCoverage: number;
  requiredEvidenceTypes: string[];
  requiredMinEvents: number;
  unknown: boolean;
  reasons: string[];
  flags: string[];
  confidenceControls: ReturnType<typeof controlsForScore>;
}

function isObservedHeavy(report: DiagnosticReport): boolean {
  const observed = report.evidenceTrustCoverage.observed;
  const attested = report.evidenceTrustCoverage.attested;
  return observed + attested >= 0.8;
}

function unknownReasonsForScore(report: DiagnosticReport, score: QuestionScore, minEvents: number): string[] {
  const reasons: string[] = [];
  if (score.evidenceEventIds.length < minEvents) {
    reasons.push(`required >= ${minEvents} evidence events, found ${score.evidenceEventIds.length}`);
  }
  if (!isObservedHeavy(report)) {
    reasons.push("observed+attested coverage below 0.80");
  }
  if (score.flags.includes("FLAG_MISSING_LLM_EVIDENCE")) {
    reasons.push("missing observed bridge/gateway model-call evidence");
  }
  if (score.flags.includes("FLAG_ASSURANCE_EVIDENCE_MISSING")) {
    reasons.push("missing required assurance evidence for high-risk scoring");
  }
  if (score.flags.includes("FLAG_CORRELATION_LOW")) {
    reasons.push("correlation ratio too low for trusted elevation");
  }
  return reasons;
}

export function deriveAutoAnswerResults(report: DiagnosticReport): {
  questions: AutoAnswerQuestionResult[];
  measuredScores: Record<string, number>;
  evidenceCoverage: Record<string, number>;
  unknownReasons: Array<{ questionId: string; reasons: string[] }>;
} {
  const questions: AutoAnswerQuestionResult[] = [];
  const measuredScores: Record<string, number> = {};
  const evidenceCoverage: Record<string, number> = {};
  const unknownReasons: Array<{ questionId: string; reasons: string[] }> = [];

  for (const score of report.questionScores) {
    const rule = autoAnswerRuleByQuestionId(score.questionId);
    const coverage = Number(
      Math.min(1, score.evidenceEventIds.length / Math.max(1, rule.minEvents)).toFixed(4)
    );
    const reasons = unknownReasonsForScore(report, score, rule.minEvents);
    const unknown = reasons.length > 0;
    const measured = unknown ? Math.min(1, score.finalLevel) : score.finalLevel;
    questions.push({
      questionId: score.questionId,
      measuredScore: measured,
      evidenceCoverage: coverage,
      requiredEvidenceTypes: rule.requiredEvidenceTypes,
      requiredMinEvents: rule.minEvents,
      unknown,
      reasons,
      flags: [...score.flags],
      confidenceControls: controlsForScore(score)
    });
    measuredScores[score.questionId] = measured;
    evidenceCoverage[score.questionId] = coverage;
    if (unknown) {
      unknownReasons.push({
        questionId: score.questionId,
        reasons
      });
    }
  }

  questions.sort((a, b) => a.questionId.localeCompare(b.questionId));
  unknownReasons.sort((a, b) => a.questionId.localeCompare(b.questionId));
  return {
    questions,
    measuredScores,
    evidenceCoverage,
    unknownReasons
  };
}
