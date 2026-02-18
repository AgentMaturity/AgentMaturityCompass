/**
 * Meta-Confidence / Confidence in Maturity Score
 *
 * Reports how confident we are in the maturity score itself,
 * based on evidence volume, freshness, diversity, trust tier, and consistency.
 */
import type { DiagnosticReport, QuestionScore } from "../types.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface QuestionMetaConfidence {
  questionId: string;
  confidence: number; // 0-1
  factors: {
    evidenceVolume: number;    // 0-1
    evidenceFreshness: number; // 0-1
    evidenceDiversity: number; // 0-1
    trustTierQuality: number;  // 0-1
    consistency: number;       // 0-1
  };
}

export interface DiagnosticMetaConfidence {
  agentId: string;
  runId: string;
  generatedTs: number;
  overallConfidence: number; // 0-1
  questionConfidences: QuestionMetaConfidence[];
  heatmapData: ConfidenceHeatmapCell[];
}

export interface ConfidenceHeatmapCell {
  questionId: string;
  runId: string;
  confidence: number;
}

export interface MetaConfidenceOptions {
  maxEvidenceForFullScore?: number;   // default 10
  freshnessWindowMs?: number;        // default 7 days
  priorRuns?: DiagnosticReport[];     // for consistency calc
}

// ── Core Logic ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_EVIDENCE = 10;
const DEFAULT_FRESHNESS_WINDOW = 7 * 24 * 60 * 60 * 1000;

function computeEvidenceVolume(q: QuestionScore, maxEvidence: number): number {
  return Math.min(1, q.evidenceEventIds.length / maxEvidence);
}

function computeEvidenceFreshness(reportTs: number, freshnessWindow: number): number {
  const age = Date.now() - reportTs;
  if (age <= 0) return 1;
  return Math.max(0, 1 - age / freshnessWindow);
}

function computeEvidenceDiversity(q: QuestionScore): number {
  // Use evidence count as proxy for diversity (distinct events)
  const uniqueEvents = new Set(q.evidenceEventIds).size;
  if (uniqueEvents === 0) return 0;
  // More unique events = more diverse, cap at 5 for full score
  return Math.min(1, uniqueEvents / 5);
}

function computeTrustTierQuality(report: DiagnosticReport): number {
  const coverage = report.evidenceTrustCoverage;
  if (!coverage) return 0.5;
  const total = coverage.observed + coverage.attested + coverage.selfReported;
  if (total === 0) return 0;
  // Weighted: observed=1.0, attested=0.7, selfReported=0.3
  return (coverage.observed * 1.0 + coverage.attested * 0.7 + coverage.selfReported * 0.3) / total;
}

function computeConsistency(
  q: QuestionScore,
  priorRuns: DiagnosticReport[]
): number {
  if (priorRuns.length === 0) return 0.5; // neutral when no history

  const priorScores: number[] = [];
  for (const run of priorRuns) {
    const match = run.questionScores.find((qs) => qs.questionId === q.questionId);
    if (match) priorScores.push(match.finalLevel);
  }

  if (priorScores.length === 0) return 0.5;

  // Low variance = high consistency
  const mean = priorScores.reduce((a, b) => a + b, 0) / priorScores.length;
  const variance = priorScores.reduce((a, b) => a + (b - mean) ** 2, 0) / priorScores.length;
  const maxVariance = 6.25; // max possible variance for 0-5 range
  return Math.max(0, 1 - variance / maxVariance);
}

export function computeQuestionMetaConfidence(
  q: QuestionScore,
  report: DiagnosticReport,
  opts: MetaConfidenceOptions = {}
): QuestionMetaConfidence {
  const maxEvidence = opts.maxEvidenceForFullScore ?? DEFAULT_MAX_EVIDENCE;
  const freshnessWindow = opts.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW;
  const priorRuns = opts.priorRuns ?? [];

  const factors = {
    evidenceVolume: computeEvidenceVolume(q, maxEvidence),
    evidenceFreshness: computeEvidenceFreshness(report.ts, freshnessWindow),
    evidenceDiversity: computeEvidenceDiversity(q),
    trustTierQuality: computeTrustTierQuality(report),
    consistency: computeConsistency(q, priorRuns),
  };

  // Weighted average
  const weights = { evidenceVolume: 0.3, evidenceFreshness: 0.2, evidenceDiversity: 0.15, trustTierQuality: 0.2, consistency: 0.15 };
  const confidence =
    factors.evidenceVolume * weights.evidenceVolume +
    factors.evidenceFreshness * weights.evidenceFreshness +
    factors.evidenceDiversity * weights.evidenceDiversity +
    factors.trustTierQuality * weights.trustTierQuality +
    factors.consistency * weights.consistency;

  return { questionId: q.questionId, confidence, factors };
}

export function computeDiagnosticMetaConfidence(
  report: DiagnosticReport,
  opts: MetaConfidenceOptions = {}
): DiagnosticMetaConfidence {
  const questionConfidences = report.questionScores.map((q) =>
    computeQuestionMetaConfidence(q, report, opts)
  );

  const overallConfidence =
    questionConfidences.length > 0
      ? questionConfidences.reduce((a, b) => a + b.confidence, 0) / questionConfidences.length
      : 0;

  const heatmapData: ConfidenceHeatmapCell[] = questionConfidences.map((qc) => ({
    questionId: qc.questionId,
    runId: report.runId,
    confidence: qc.confidence,
  }));

  // Add prior run heatmap cells
  for (const prior of opts.priorRuns ?? []) {
    for (const q of prior.questionScores) {
      const mc = computeQuestionMetaConfidence(q, prior, { ...opts, priorRuns: [] });
      heatmapData.push({
        questionId: q.questionId,
        runId: prior.runId,
        confidence: mc.confidence,
      });
    }
  }

  return {
    agentId: report.agentId,
    runId: report.runId,
    generatedTs: Date.now(),
    overallConfidence,
    questionConfidences,
    heatmapData,
  };
}

export function renderMetaConfidenceMarkdown(mc: DiagnosticMetaConfidence): string {
  const lines: string[] = [
    `# Meta-Confidence Report — ${mc.agentId}`,
    "",
    `**Run:** ${mc.runId}`,
    `**Overall Confidence:** ${(mc.overallConfidence * 100).toFixed(1)}%`,
    "",
    "## Per-Question Confidence",
    "",
    "| Question | Confidence | Volume | Freshness | Diversity | Trust | Consistency |",
    "|----------|-----------|--------|-----------|-----------|-------|-------------|",
  ];

  for (const qc of mc.questionConfidences) {
    const f = qc.factors;
    lines.push(
      `| ${qc.questionId} | ${(qc.confidence * 100).toFixed(0)}% | ${(f.evidenceVolume * 100).toFixed(0)}% | ${(f.evidenceFreshness * 100).toFixed(0)}% | ${(f.evidenceDiversity * 100).toFixed(0)}% | ${(f.trustTierQuality * 100).toFixed(0)}% | ${(f.consistency * 100).toFixed(0)}% |`
    );
  }

  lines.push("");
  return lines.join("\n");
}
