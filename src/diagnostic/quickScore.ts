import type { DiagnosticQuestion, LayerName } from "../types.js";
import { questionBank } from "./questionBank.js";

export type ScoringTier = "quick" | "standard" | "deep";

// Quick Score: 2 questions per layer = 10 questions
const QUICK_QUESTION_IDS: string[] = [
  "AMC-1.1", "AMC-1.7",   // Strategic Agent Operations
  "AMC-2.1", "AMC-2.5",   // Leadership & Autonomy
  "AMC-3.1.1", "AMC-3.2.1", // Culture & Alignment
  "AMC-4.1", "AMC-4.5",   // Resilience
  "AMC-5.1", "AMC-5.5",   // Skills
];

// Canonical standard/deep assessments use the full signed bank.
const CANONICAL_BANK_COUNT = questionBank.length;

export function getQuestionsForTier(tier: ScoringTier): DiagnosticQuestion[] {
  switch (tier) {
    case "quick":
      return questionBank.filter(q => QUICK_QUESTION_IDS.includes(q.id));
    case "standard":
    case "deep":
      return questionBank.slice(0, CANONICAL_BANK_COUNT);
  }
}

export interface QuickScoreResult {
  tier: ScoringTier;
  totalScore: number;
  maxScore: number;
  percentage: number;
  layerScores: Record<string, { score: number; max: number; avg: number }>;
  gaps: Array<{ questionId: string; title: string; currentLevel: number; targetLevel: number }>;
  roadmap: string[];
}

export function computeQuickScore(
  answers: Record<string, number>,
  tier: ScoringTier = "quick"
): QuickScoreResult {
  const questions = getQuestionsForTier(tier);
  const layerScores: Record<string, { score: number; max: number; count: number }> = {};
  const gaps: QuickScoreResult["gaps"] = [];
  let totalScore = 0;
  const maxScore = questions.length * 5;

  for (const q of questions) {
    const level = answers[q.id] ?? 0;
    totalScore += level;
    const layer = layerScores[q.layerName] ?? { score: 0, max: 0, count: 0 };
    layer.score += level;
    layer.max += 5;
    layer.count += 1;
    layerScores[q.layerName] = layer;
    if (level < 3) {
      gaps.push({ questionId: q.id, title: q.title, currentLevel: level, targetLevel: 3 });
    }
  }

  // Sort gaps by severity (lowest score first)
  gaps.sort((a, b) => a.currentLevel - b.currentLevel);

  const layerResult: Record<string, { score: number; max: number; avg: number }> = {};
  for (const [name, data] of Object.entries(layerScores)) {
    layerResult[name] = { score: data.score, max: data.max, avg: data.count > 0 ? data.score / data.count : 0 };
  }

  const topGaps = gaps.slice(0, 5);
  const roadmap = generateRoadmap(topGaps);

  return {
    tier,
    totalScore,
    maxScore,
    percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0,
    layerScores: layerResult,
    gaps: topGaps,
    roadmap,
  };
}

function generateRoadmap(gaps: QuickScoreResult["gaps"]): string[] {
  const items: string[] = [];
  if (gaps.length === 0) {
    items.push("All areas at L3+. Focus on advancing to L4/L5 with evidence-backed improvements.");
    return items;
  }
  items.push("30-Day Improvement Roadmap:");
  for (const [index, g] of gaps.slice(0, 5).entries()) {
    const week = index < 2 ? "Week 1-2" : "Week 3-4";
    items.push(`  ${week}: ${g.title} — advance from L${g.currentLevel} to L${g.targetLevel}`);
  }
  return items;
}

export function renderAsciiRadar(layerScores: Record<string, { score: number; max: number; avg: number }>): string {
  const lines: string[] = ["", "  📊 Maturity Radar", "  ─────────────────"];
  const layers = Object.entries(layerScores);
  const maxBarLen = 20;
  for (const [name, data] of layers) {
    const pct = data.max > 0 ? data.avg / 5 : 0;
    const filled = Math.round(pct * maxBarLen);
    const bar = "█".repeat(filled) + "░".repeat(maxBarLen - filled);
    const label = name.length > 25 ? name.slice(0, 22) + "..." : name.padEnd(25);
    lines.push(`  ${label} ${bar} ${data.avg.toFixed(1)}/5`);
  }
  lines.push("");
  return lines.join("\n");
}
