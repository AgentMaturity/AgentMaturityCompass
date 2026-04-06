/**
 * Score Explainability Engine — MF-06
 *
 * Makes every AMC score transparent and auditable:
 * 1. Score decomposition — break score into contributing factors
 * 2. Evidence tracing — link score to exact evidence
 * 3. Natural language explanations — human-readable rationale
 * 4. Confidence intervals — uncertainty quantification
 * 5. Benchmark comparison — how score compares to population
 * 6. Audit-friendly export — format for compliance auditors
 */

import { randomUUID } from "node:crypto";
import type { DiagnosticReport, LayerScore, QuestionScore } from "../types.js";
import { sha256Hex } from "../utils/hash.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreContribution {
  factor: string;
  weight: number;
  rawValue: number;
  weightedValue: number;
  description: string;
  evidenceIds: string[];
}

export interface ScoreDecomposition {
  questionId: string;
  layerName: string;
  claimedLevel: number;
  finalLevel: number;
  contributions: ScoreContribution[];
  adjustmentDelta: number;
  confidence: number;
  evidenceChain: string[];
}

export interface NaturalLanguageExplanation {
  questionId: string;
  summary: string;
  details: string;
  strengthAreas: string[];
  weaknessAreas: string[];
  improvementSuggestions: string[];
  confidenceStatement: string;
}

export interface ConfidenceInterval {
  questionId: string;
  pointEstimate: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
  evidenceQuality: "strong" | "moderate" | "weak" | "insufficient";
  sampleSize: number;
}

export interface BenchmarkComparison {
  questionId: string;
  agentScore: number;
  benchmarkMean: number;
  benchmarkMedian: number;
  percentile: number;
  category: "top-10%" | "above-average" | "average" | "below-average" | "bottom-10%";
}

export interface ScoreExplanationReport {
  reportId: string;
  ts: number;
  agentId: string;
  overallScore: number;
  overallExplanation: string;
  layerExplanations: Array<{
    layerName: string;
    score: number;
    explanation: string;
    questionCount: number;
  }>;
  questionDecompositions: ScoreDecomposition[];
  naturalLanguageExplanations: NaturalLanguageExplanation[];
  confidenceIntervals: ConfidenceInterval[];
  benchmarkComparisons: BenchmarkComparison[];
  auditTrail: AuditTrailEntry[];
  reportSha256: string;
}

export interface AuditTrailEntry {
  ts: number;
  action: string;
  questionId: string;
  fromValue: number;
  toValue: number;
  reason: string;
  evidenceId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function levelDescription(level: number): string {
  if (level >= 4.5) return "Exceptional — industry-leading practices";
  if (level >= 3.5) return "Strong — well-established capabilities";
  if (level >= 2.5) return "Adequate — basic requirements met with room for improvement";
  if (level >= 1.5) return "Developing — significant gaps requiring attention";
  return "Minimal — fundamental capabilities missing";
}

/**
 * Infer the layer for a question based on its questionId prefix.
 * Falls back to "Unknown" if no layerScores provided.
 */
function inferLayerForQuestion(
  q: QuestionScore,
  layerScores: LayerScore[],
): string {
  // Try to match question to a layer by prefix convention (e.g. "sao-001" → "Strategic Agent Ops")
  for (const l of layerScores) {
    const prefix = l.layerName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
    if (q.questionId.toLowerCase().startsWith(prefix)) return l.layerName;
  }
  // Fallback: distribute evenly
  return layerScores.length > 0 ? layerScores[0]!.layerName : "Unknown";
}

// ---------------------------------------------------------------------------
// Score decomposition
// ---------------------------------------------------------------------------

export function decomposeScore(
  question: QuestionScore,
  layerName: string,
): ScoreDecomposition {
  const contributions: ScoreContribution[] = [];

  // Base score from claimed assessment
  contributions.push({
    factor: "base_assessment",
    weight: 0.6,
    rawValue: question.claimedLevel,
    weightedValue: question.claimedLevel * 0.6,
    description: "Direct assessment of agent capability for this question",
    evidenceIds: question.evidenceEventIds.slice(0, 3),
  });

  // Evidence coverage contribution
  const evidenceCount = question.evidenceEventIds.length;
  const evidenceQuality = Math.min(evidenceCount / 5, 1);
  contributions.push({
    factor: "evidence_quality",
    weight: 0.2,
    rawValue: evidenceQuality * 5,
    weightedValue: evidenceQuality * 5 * 0.2,
    description: `${evidenceCount} evidence items supporting this score`,
    evidenceIds: question.evidenceEventIds,
  });

  // Confidence factor
  contributions.push({
    factor: "confidence",
    weight: 0.1,
    rawValue: question.confidence * 5,
    weightedValue: question.confidence * 5 * 0.1,
    description: `Assessment confidence: ${(question.confidence * 100).toFixed(0)}%`,
    evidenceIds: [],
  });

  // Adjustment delta (claimed vs final)
  const delta = question.finalLevel - question.claimedLevel;
  contributions.push({
    factor: "adjustments",
    weight: 0.1,
    rawValue: delta,
    weightedValue: delta * 0.1,
    description: delta > 0
      ? `Score boosted by +${delta.toFixed(1)} from evidence correlation`
      : delta < 0
        ? `Score reduced by ${delta.toFixed(1)} (evidence did not fully support claimed level)`
        : "No adjustments applied",
    evidenceIds: [],
  });

  return {
    questionId: question.questionId,
    layerName,
    claimedLevel: question.claimedLevel,
    finalLevel: question.finalLevel,
    contributions,
    adjustmentDelta: delta,
    confidence: question.confidence,
    evidenceChain: question.evidenceEventIds,
  };
}

// ---------------------------------------------------------------------------
// Natural language explanation
// ---------------------------------------------------------------------------

function generateExplanation(
  question: QuestionScore,
  layerName: string,
): NaturalLanguageExplanation {
  const level = question.finalLevel;
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  if (level >= 4) strengths.push("Strong evidence of mature practices");
  if (level >= 3) strengths.push("Core capabilities are in place");
  if (question.confidence >= 0.8) strengths.push("High confidence in assessment accuracy");
  if (question.evidenceEventIds.length >= 5) strengths.push("Rich evidence base supporting the score");

  if (level < 3) weaknesses.push("Below target maturity level");
  if (question.confidence < 0.5) weaknesses.push("Low confidence — limited evidence available");
  if (question.evidenceEventIds.length < 2) weaknesses.push("Insufficient evidence for reliable scoring");
  if (question.finalLevel < question.claimedLevel) weaknesses.push("Final score lower than claimed — evidence gap detected");

  if (level < 3) improvements.push("Implement fundamental capabilities for this dimension");
  if (level >= 3 && level < 4) improvements.push("Add systematic processes and documentation");
  if (level >= 4 && level < 5) improvements.push("Achieve continuous improvement and innovation");
  if (question.evidenceEventIds.length < 3) improvements.push("Collect more evidence to increase assessment confidence");

  const confidenceStatement = question.confidence >= 0.8
    ? "This score is based on strong evidence and has high reliability."
    : question.confidence >= 0.5
      ? "This score has moderate confidence. Additional evidence would increase reliability."
      : "This score has low confidence due to limited evidence. Results should be treated as preliminary.";

  return {
    questionId: question.questionId,
    summary: `Scored L${level.toFixed(1)} in ${layerName}: ${levelDescription(level)}`,
    details: `${question.narrative || "Assessment based on available evidence."} Evidence chain: ${question.evidenceEventIds.length} items.`,
    strengthAreas: strengths,
    weaknessAreas: weaknesses,
    improvementSuggestions: improvements,
    confidenceStatement,
  };
}

// ---------------------------------------------------------------------------
// Confidence intervals
// ---------------------------------------------------------------------------

export function computeConfidenceInterval(
  question: QuestionScore,
  confidenceLevel: number = 0.95,
): ConfidenceInterval {
  const n = question.evidenceEventIds.length;
  const score = question.finalLevel;

  const baseUncertainty = 1 - question.confidence;
  const sampleFactor = n >= 5 ? 0.5 : n >= 3 ? 0.75 : 1.0;
  const halfWidth = baseUncertainty * sampleFactor * 2;

  let evidenceQuality: ConfidenceInterval["evidenceQuality"];
  if (n >= 5 && question.confidence >= 0.8) evidenceQuality = "strong";
  else if (n >= 3 && question.confidence >= 0.5) evidenceQuality = "moderate";
  else if (n >= 1) evidenceQuality = "weak";
  else evidenceQuality = "insufficient";

  return {
    questionId: question.questionId,
    pointEstimate: score,
    lowerBound: Math.max(0, Number((score - halfWidth).toFixed(2))),
    upperBound: Math.min(5, Number((score + halfWidth).toFixed(2))),
    confidenceLevel,
    evidenceQuality,
    sampleSize: n,
  };
}

// ---------------------------------------------------------------------------
// Benchmark comparison (synthetic for now — real data comes later)
// ---------------------------------------------------------------------------

export function computeBenchmarkComparison(
  question: QuestionScore,
  benchmarkStats?: { mean: number; median: number; stdDev: number },
): BenchmarkComparison {
  const stats = benchmarkStats ?? { mean: 2.5, median: 2.4, stdDev: 0.8 };
  const score = question.finalLevel;
  const zScore = stats.stdDev > 0 ? (score - stats.mean) / stats.stdDev : 0;
  const percentile = Math.max(1, Math.min(99, Math.round(50 + zScore * 30)));

  let category: BenchmarkComparison["category"];
  if (percentile >= 90) category = "top-10%";
  else if (percentile >= 60) category = "above-average";
  else if (percentile >= 40) category = "average";
  else if (percentile >= 10) category = "below-average";
  else category = "bottom-10%";

  return {
    questionId: question.questionId,
    agentScore: score,
    benchmarkMean: stats.mean,
    benchmarkMedian: stats.median,
    percentile,
    category,
  };
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export function buildAuditTrail(report: DiagnosticReport): AuditTrailEntry[] {
  const trail: AuditTrailEntry[] = [];

  for (const q of report.questionScores) {
    // Record claimed assessment
    trail.push({
      ts: report.ts,
      action: "claimed_assessment",
      questionId: q.questionId,
      fromValue: 0,
      toValue: q.claimedLevel,
      reason: "Initial claimed level from assessment",
      evidenceId: q.evidenceEventIds[0] ?? "none",
    });

    // Record adjustment if final differs from claimed
    const delta = q.finalLevel - q.claimedLevel;
    if (Math.abs(delta) > 0.01) {
      trail.push({
        ts: report.ts,
        action: delta > 0 ? "score_boost" : "score_reduction",
        questionId: q.questionId,
        fromValue: q.claimedLevel,
        toValue: q.finalLevel,
        reason: delta > 0
          ? "Evidence correlation boosted score above claimed level"
          : "Evidence insufficient to support claimed level",
        evidenceId: q.evidenceEventIds[0] ?? "adjustment",
      });
    }

    // Record supported max cap if relevant
    if (q.supportedMaxLevel < q.claimedLevel) {
      trail.push({
        ts: report.ts,
        action: "max_level_cap",
        questionId: q.questionId,
        fromValue: q.claimedLevel,
        toValue: q.supportedMaxLevel,
        reason: `Evidence supports max level ${q.supportedMaxLevel}`,
        evidenceId: "cap",
      });
    }
  }

  return trail.sort((a, b) => a.ts - b.ts);
}

// ---------------------------------------------------------------------------
// Full explanation report
// ---------------------------------------------------------------------------

export function generateScoreExplanationReport(
  report: DiagnosticReport,
  benchmarkStats?: { mean: number; median: number; stdDev: number },
): ScoreExplanationReport {
  const overallScore =
    report.layerScores.reduce((sum, l) => sum + l.avgFinalLevel, 0) /
    Math.max(report.layerScores.length, 1);

  // Build a mapping of questions to layers
  const questionLayerMap = new Map<string, string>();
  for (const q of report.questionScores) {
    questionLayerMap.set(q.questionId, inferLayerForQuestion(q, report.layerScores));
  }

  // Layer explanations
  const layerExplanations = report.layerScores.map((layer) => {
    const layerQuestions = report.questionScores.filter(
      (q) => questionLayerMap.get(q.questionId) === layer.layerName,
    );
    const qCount = layerQuestions.length;
    const strongCount = layerQuestions.filter((q) => q.finalLevel >= 3.5).length;
    const weakCount = layerQuestions.filter((q) => q.finalLevel < 2).length;

    return {
      layerName: layer.layerName,
      score: layer.avgFinalLevel,
      explanation: `${layer.layerName}: L${layer.avgFinalLevel.toFixed(1)} across ${qCount} questions. ${strongCount} strong (≥3.5), ${weakCount} weak (<2.0). ${levelDescription(layer.avgFinalLevel)}.`,
      questionCount: qCount,
    };
  });

  // Per-question decompositions
  const decompositions = report.questionScores.map((q) => {
    const layerName = questionLayerMap.get(q.questionId) ?? "Unknown";
    return decomposeScore(q, layerName);
  });

  // Natural language explanations
  const nlExplanations = report.questionScores.map((q) =>
    generateExplanation(q, questionLayerMap.get(q.questionId) ?? "Unknown"),
  );

  // Confidence intervals
  const intervals = report.questionScores.map((q) => computeConfidenceInterval(q));

  // Benchmark comparisons
  const benchmarks = report.questionScores.map((q) =>
    computeBenchmarkComparison(q, benchmarkStats),
  );

  // Audit trail
  const auditTrail = buildAuditTrail(report);

  // Overall explanation
  const strongLayers = layerExplanations.filter((l) => l.score >= 3.5);
  const weakLayers = layerExplanations.filter((l) => l.score < 2.5);
  const overallExplanation = [
    `Overall maturity score: L${overallScore.toFixed(2)} (${levelDescription(overallScore)}).`,
    strongLayers.length > 0 ? `Strong areas: ${strongLayers.map((l) => l.layerName).join(", ")}.` : "",
    weakLayers.length > 0 ? `Areas needing improvement: ${weakLayers.map((l) => l.layerName).join(", ")}.` : "",
    `Based on ${report.questionScores.length} questions across ${report.layerScores.length} layers.`,
    `Evidence coverage: ${(report.evidenceCoverage * 100).toFixed(0)}%. Integrity index: ${report.integrityIndex.toFixed(3)}.`,
    `Trust label: ${report.trustLabel}.`,
  ].filter(Boolean).join(" ");

  const reportId = `sxr_${randomUUID().slice(0, 12)}`;
  const body = {
    reportId,
    ts: Date.now(),
    agentId: report.agentId,
    overallScore,
    overallExplanation,
    layerExplanations,
    questionDecompositions: decompositions,
    naturalLanguageExplanations: nlExplanations,
    confidenceIntervals: intervals,
    benchmarkComparisons: benchmarks,
    auditTrail,
  };

  return {
    ...body,
    reportSha256: sha256Hex(JSON.stringify({ reportId: body.reportId, overallScore: body.overallScore })),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderExplanationMarkdown(report: ScoreExplanationReport): string {
  const lines: string[] = [
    "# 🔍 Score Explanation Report",
    "",
    `- **Report ID:** ${report.reportId}`,
    `- **Agent:** ${report.agentId}`,
    `- **Overall Score:** L${report.overallScore.toFixed(2)}`,
    `- **Timestamp:** ${new Date(report.ts).toISOString()}`,
    "",
    "## Overall Explanation",
    report.overallExplanation,
    "",
    "## Layer Breakdown",
    "| Layer | Score | Questions | Explanation |",
    "|-------|------:|----------:|-------------|",
  ];

  for (const layer of report.layerExplanations) {
    lines.push(`| ${layer.layerName} | L${layer.score.toFixed(1)} | ${layer.questionCount} | ${layer.explanation.slice(0, 100)} |`);
  }
  lines.push("");

  // Confidence intervals summary
  const lowConfidence = report.confidenceIntervals.filter((ci) => ci.evidenceQuality === "weak" || ci.evidenceQuality === "insufficient");
  if (lowConfidence.length > 0) {
    lines.push("## ⚠️ Low Confidence Scores");
    lines.push("| Question | Score | Range | Evidence Quality |");
    lines.push("|----------|------:|------:|-----------------|");
    for (const ci of lowConfidence.slice(0, 10)) {
      lines.push(`| ${ci.questionId} | L${ci.pointEstimate.toFixed(1)} | L${ci.lowerBound}-${ci.upperBound} | ${ci.evidenceQuality} |`);
    }
    lines.push("");
  }

  // Top benchmark outliers
  const outliers = report.benchmarkComparisons
    .filter((b) => b.category === "top-10%" || b.category === "bottom-10%")
    .slice(0, 10);
  if (outliers.length > 0) {
    lines.push("## 📊 Benchmark Outliers");
    lines.push("| Question | Score | Benchmark Mean | Percentile | Category |");
    lines.push("|----------|------:|--------------:|----------:|----------|");
    for (const b of outliers) {
      lines.push(`| ${b.questionId} | L${b.agentScore.toFixed(1)} | L${b.benchmarkMean.toFixed(1)} | ${b.percentile}th | ${b.category} |`);
    }
    lines.push("");
  }

  // Audit trail summary
  if (report.auditTrail.length > 0) {
    const adjustments = report.auditTrail.filter((a) => a.action !== "claimed_assessment");
    if (adjustments.length > 0) {
      lines.push("## 📝 Score Adjustments Audit");
      lines.push(`Total adjustments: ${adjustments.length}`);
      lines.push("| Question | Action | From | To | Reason |");
      lines.push("|----------|--------|-----:|---:|--------|");
      for (const a of adjustments.slice(0, 20)) {
        lines.push(`| ${a.questionId} | ${a.action} | L${a.fromValue.toFixed(1)} | L${a.toValue.toFixed(1)} | ${a.reason.slice(0, 60)} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
