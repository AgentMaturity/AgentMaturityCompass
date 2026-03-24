/**
 * Full Interactive Diagnostic — walks all 235 questions grouped by layer.
 * Designed to complete in ~1 minute with clean progress UX.
 */
import type { DiagnosticQuestion } from "../types.js";
import { questionBank } from "./questionBank.js";

/* ── Layer ordering (canonical) ─────────────────────────────────────── */
const LAYER_ORDER: string[] = [
  "Strategic Agent Operations",
  "Leadership & Autonomy",
  "Culture & Alignment",
  "Resilience",
  "Skills",
];

const LAYER_EMOJI: Record<string, string> = {
  "Strategic Agent Operations": "🎯",
  "Leadership & Autonomy": "👑",
  "Culture & Alignment": "🧭",
  Resilience: "🛡️",
  Skills: "⚡",
};

const LAYER_DESCRIPTION: Record<string, string> = {
  "Strategic Agent Operations": "Day-to-day agent behavior tied to mission and policy boundaries",
  "Leadership & Autonomy": "When the agent acts alone versus when humans must review",
  "Culture & Alignment": "Organizational intent, ethics, and execution behavior alignment",
  Resilience: "Behavior under failures, adversarial pressure, and edge cases",
  Skills: "Team capability to operate, test, and improve the system",
};

/* ── Result types ───────────────────────────────────────────────────── */
export interface FullDiagnosticLayerScore {
  layerName: string;
  questionCount: number;
  avgLevel: number;
  totalScore: number;
  maxScore: number;
}

export interface FullDiagnosticQuestionScore {
  questionId: string;
  title: string;
  layerName: string;
  level: number;
}

export interface FullDiagnosticRecommendation {
  questionId: string;
  title: string;
  layerName: string;
  currentLevel: number;
  targetLevel: number;
  howToImprove: string;
}

export interface FullDiagnosticResult {
  questionCount: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  overallLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5";
  layerScores: FullDiagnosticLayerScore[];
  questionScores: FullDiagnosticQuestionScore[];
  recommendations: FullDiagnosticRecommendation[];
  durationMs: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function levelFromPercent(pct: number): FullDiagnosticResult["overallLevel"] {
  if (pct >= 85) return "L5";
  if (pct >= 70) return "L4";
  if (pct >= 50) return "L3";
  if (pct >= 30) return "L2";
  if (pct > 0) return "L1";
  return "L0";
}

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "Implement the control with repeatable evidence collection.";
  const parts = normalized.split(/[.!?]\s+/).map((r) => r.trim()).filter(Boolean);
  return `${parts[0] ?? normalized}.`;
}

/* ── Group questions by layer ────────────────────────────────────────── */
export interface LayerGroup {
  layerName: string;
  emoji: string;
  description: string;
  questions: DiagnosticQuestion[];
}

export function getQuestionsByLayer(): LayerGroup[] {
  const byLayer = new Map<string, DiagnosticQuestion[]>();
  for (const q of questionBank) {
    const arr = byLayer.get(q.layerName) ?? [];
    arr.push(q);
    byLayer.set(q.layerName, arr);
  }

  const groups: LayerGroup[] = [];
  for (const layerName of LAYER_ORDER) {
    const questions = byLayer.get(layerName);
    if (questions && questions.length > 0) {
      groups.push({
        layerName,
        emoji: LAYER_EMOJI[layerName] ?? "📋",
        description: LAYER_DESCRIPTION[layerName] ?? "",
        questions,
      });
    }
  }

  // Any layers not in LAYER_ORDER (future-proof)
  for (const [layerName, questions] of byLayer) {
    if (!LAYER_ORDER.includes(layerName)) {
      groups.push({
        layerName,
        emoji: "📋",
        description: "",
        questions,
      });
    }
  }

  return groups;
}

export function getTotalQuestionCount(): number {
  return questionBank.length;
}

export function getAllQuestions() {
  return [...questionBank];
}

/* ── Score a completed diagnostic ────────────────────────────────────── */
export function scoreFullDiagnostic(
  answers: Record<string, number>,
  durationMs: number,
): FullDiagnosticResult {
  const groups = getQuestionsByLayer();
  const questionScores: FullDiagnosticQuestionScore[] = [];
  const layerScores: FullDiagnosticLayerScore[] = [];

  for (const group of groups) {
    let layerTotal = 0;
    for (const q of group.questions) {
      const level = clampLevel(answers[q.id] ?? 0);
      questionScores.push({
        questionId: q.id,
        title: q.title,
        layerName: q.layerName,
        level,
      });
      layerTotal += level;
    }
    const layerMax = group.questions.length * 5;
    layerScores.push({
      layerName: group.layerName,
      questionCount: group.questions.length,
      avgLevel: group.questions.length > 0 ? layerTotal / group.questions.length : 0,
      totalScore: layerTotal,
      maxScore: layerMax,
    });
  }

  const totalScore = questionScores.reduce((s, q) => s + q.level, 0);
  const maxScore = questionScores.length * 5;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const overallLevel = levelFromPercent(percentage);

  // Recommendations: lowest-scoring questions, up to 10
  const recommendations = questionScores
    .filter((q) => q.level < 3)
    .sort((a, b) => a.level - b.level || a.questionId.localeCompare(b.questionId))
    .slice(0, 5)
    .map<FullDiagnosticRecommendation>((q) => {
      const question = questionBank.find((row) => row.id === q.questionId)!;
      return {
        questionId: q.questionId,
        title: q.title,
        layerName: q.layerName,
        currentLevel: q.level,
        targetLevel: Math.max(3, q.level + 1),
        howToImprove: firstSentence(question.upgradeHints),
      };
    });

  return {
    questionCount: questionScores.length,
    totalScore,
    maxScore,
    percentage,
    overallLevel,
    layerScores,
    questionScores,
    recommendations,
    durationMs,
  };
}
