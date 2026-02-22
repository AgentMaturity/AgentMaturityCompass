import type { DiagnosticQuestion } from "../types.js";
import { questionBank } from "./questionBank.js";

const RAPID_QUESTION_IDS = [
  "AMC-1.1",
  "AMC-2.1",
  "AMC-3.1.1",
  "AMC-4.1",
  "AMC-5.1"
] as const;

const LAYER_VALUE_MAP: Record<string, string> = {
  "Strategic Agent Operations": "It keeps day-to-day agent behavior tied to mission and policy boundaries.",
  "Leadership & Autonomy": "It controls when the agent can act alone versus when humans must review.",
  "Culture & Alignment": "It keeps organizational intent, ethics, and execution behavior aligned.",
  Resilience: "It prevents fragile or unsafe behavior under failures and adversarial pressure.",
  Skills: "It determines whether your team can operate, test, and improve the system consistently."
};

function findQuestionOrThrow(questionId: string): DiagnosticQuestion {
  const found = questionBank.find((row) => row.id === questionId);
  if (!found) {
    throw new Error(`Rapid quickscore missing question ${questionId}`);
  }
  return found;
}

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 5) {
    return 5;
  }
  return Math.round(value);
}

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return "Implement the control with repeatable evidence collection.";
  }
  const parts = normalized.split(/[.!?]\s+/).map((row) => row.trim()).filter(Boolean);
  return `${parts[0] ?? normalized}.`;
}

function preliminaryLevelFromPercent(percentage: number): "L1" | "L2" | "L3" | "L4" | "L5" {
  if (percentage >= 85) {
    return "L5";
  }
  if (percentage >= 70) {
    return "L4";
  }
  if (percentage >= 50) {
    return "L3";
  }
  if (percentage >= 30) {
    return "L2";
  }
  return "L1";
}

export interface RapidQuestionScore {
  questionId: string;
  title: string;
  layerName: string;
  level: number;
}

export interface RapidImprovementRecommendation {
  questionId: string;
  title: string;
  currentLevel: number;
  targetLevel: number;
  whyItMatters: string;
  howToImprove: string;
}

export interface RapidQuickscoreResult {
  questionCount: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  preliminaryLevel: "L1" | "L2" | "L3" | "L4" | "L5";
  questionScores: RapidQuestionScore[];
  recommendations: RapidImprovementRecommendation[];
}

export function getRapidQuestions(): DiagnosticQuestion[] {
  return RAPID_QUESTION_IDS.map((questionId) => findQuestionOrThrow(questionId));
}

export function scoreRapidAssessment(answers: Record<string, number>): RapidQuickscoreResult {
  const questions = getRapidQuestions();
  const scored = questions.map<RapidQuestionScore>((question) => ({
    questionId: question.id,
    title: question.title,
    layerName: question.layerName,
    level: clampLevel(answers[question.id] ?? 0)
  }));

  const totalScore = scored.reduce((sum, row) => sum + row.level, 0);
  const maxScore = scored.length * 5;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const preliminaryLevel = preliminaryLevelFromPercent(percentage);

  const recommendations = scored
    .filter((row) => row.level < 3)
    .sort((a, b) => a.level - b.level || a.questionId.localeCompare(b.questionId))
    .slice(0, 3)
    .map<RapidImprovementRecommendation>((row) => {
      const question = findQuestionOrThrow(row.questionId);
      return {
        questionId: row.questionId,
        title: row.title,
        currentLevel: row.level,
        targetLevel: Math.max(3, row.level + 1),
        whyItMatters: LAYER_VALUE_MAP[row.layerName] ?? "It directly affects your trust posture and production reliability.",
        howToImprove: firstSentence(question.upgradeHints)
      };
    });

  return {
    questionCount: scored.length,
    totalScore,
    maxScore,
    percentage,
    preliminaryLevel,
    questionScores: scored,
    recommendations
  };
}

