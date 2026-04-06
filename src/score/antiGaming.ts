/**
 * Anti-Gaming & Goodhart's Law Resistance — MF-16
 *
 * Prevents score gaming through:
 * 1. Randomized question selection
 * 2. Evidence cross-validation
 * 3. Behavioral fingerprinting for suspicious patterns
 * 4. Score volatility analysis
 * 5. Peer comparison outlier detection
 * 6. Gaming detection report
 */

import { sha256Hex } from "../utils/hash.js";
import type { DiagnosticReport, QuestionScore } from "../types.js";

export interface GamingDetectionResult {
  gamingScore: number; // 0-100, higher = more suspicious
  indicators: GamingIndicator[];
  verdict: "clean" | "suspicious" | "likely-gaming";
  recommendation: string;
}

export interface GamingIndicator {
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  evidence: string;
}

export function detectGaming(report: DiagnosticReport): GamingDetectionResult {
  const indicators: GamingIndicator[] = [];

  // 1. Suspiciously perfect scores
  const perfectScores = report.questionScores.filter(q => q.finalLevel >= 4.9);
  const perfectRatio = report.questionScores.length === 0 ? 0 : perfectScores.length / report.questionScores.length;
  if (perfectRatio > 0.8) {
    indicators.push({
      type: "perfect_score_pattern",
      severity: "high",
      description: `${perfectScores.length}/${report.questionScores.length} questions scored near-perfect (≥4.9)`,
      evidence: `${(perfectRatio * 100).toFixed(0)}% perfect rate`,
    });
  }

  // 2. Low evidence with high scores
  const highScoreLowEvidence = report.questionScores.filter(
    q => q.finalLevel >= 4 && q.evidenceEventIds.length < 2
  );
  if (highScoreLowEvidence.length > 3) {
    indicators.push({
      type: "high_score_low_evidence",
      severity: "high",
      description: `${highScoreLowEvidence.length} questions scored ≥L4 with <2 evidence items`,
      evidence: highScoreLowEvidence.map(q => q.questionId).join(", "),
    });
  }

  // 3. No variance (everything exactly the same level)
  const levels = report.questionScores.map(q => q.finalLevel);
  const uniqueLevels = new Set(levels);
  if (uniqueLevels.size <= 2 && report.questionScores.length > 10) {
    indicators.push({
      type: "no_variance",
      severity: "medium",
      description: `Only ${uniqueLevels.size} unique score levels across ${report.questionScores.length} questions`,
      evidence: `Levels: ${[...uniqueLevels].join(", ")}`,
    });
  }

  // 4. Score-confidence mismatch
  const mismatch = report.questionScores.filter(
    q => q.finalLevel >= 4 && q.confidence < 0.3
  );
  if (mismatch.length > 2) {
    indicators.push({
      type: "score_confidence_mismatch",
      severity: "medium",
      description: `${mismatch.length} questions have high scores but low confidence`,
      evidence: mismatch.map(q => `${q.questionId}: L${q.finalLevel} @ ${(q.confidence * 100).toFixed(0)}%`).join("; "),
    });
  }

  // 6. Large gap between claimed and supported level (unusual pattern)
  const overClaimed = report.questionScores.filter(q => q.claimedLevel > q.supportedMaxLevel + 1);
  if (overClaimed.length === report.questionScores.length && report.questionScores.length > 5) {
    indicators.push({
      type: "no_adjustments",
      severity: "low",
      description: "All scores claim well above supported max — unusual pattern",
      evidence: "Every claimed level exceeds evidence-supported max",
    });
  }

  // Calculate gaming score
  let score = 0;
  for (const ind of indicators) {
    switch (ind.severity) {
      case "high": score += 30; break;
      case "medium": score += 15; break;
      case "low": score += 5; break;
    }
  }
  score = Math.min(100, score);

  let verdict: GamingDetectionResult["verdict"] = "clean";
  if (score >= 60) verdict = "likely-gaming";
  else if (score >= 25) verdict = "suspicious";

  return {
    gamingScore: score,
    indicators,
    verdict,
    recommendation: verdict === "clean"
      ? "No gaming indicators detected."
      : verdict === "suspicious"
        ? "Some anomalies detected. Review evidence quality and re-assess flagged questions."
        : "Strong gaming indicators. Recommend manual review, randomized re-assessment, and independent verification.",
  };
}

/** Generate a randomized question subset for anti-gaming */
export function randomizeQuestions(
  questionIds: string[],
  count: number,
  seed: string,
): string[] {
  // Deterministic shuffle based on seed
  const seedHash = sha256Hex(seed);
  const shuffled = [...questionIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = parseInt(seedHash.slice((i * 2) % 56, (i * 2) % 56 + 2), 16) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ---------------------------------------------------------------------------
// R3-02: Enhanced anti-gaming — stateful cross-session detection
// ---------------------------------------------------------------------------

export interface SessionFingerprint {
  sessionId: string;
  ts: number;
  agentId: string;
  scoreDistribution: number[];
  evidencePatterns: string[];
  responseLatencyMs: number[];
  questionOrder: string[];
}

export interface CrossSessionAnalysis {
  sessionsAnalyzed: number;
  suspiciousPatterns: SuspiciousPattern[];
  adaptationScore: number; // 0-100, higher = more suspicious
  collusionIndicators: CollusionIndicator[];
  overallVerdict: "clean" | "suspicious" | "likely-gaming";
}

export interface SuspiciousPattern {
  type: "score-convergence" | "response-memorization" | "timing-anomaly" | "evidence-recycling" | "cross-agent-collusion";
  severity: "low" | "medium" | "high";
  description: string;
  sessions: string[];
}

export interface CollusionIndicator {
  agents: string[];
  sharedPatterns: string[];
  confidence: number;
}

export function analyzeSessionFingerprints(
  fingerprints: SessionFingerprint[],
): CrossSessionAnalysis {
  const patterns: SuspiciousPattern[] = [];
  const collusionIndicators: CollusionIndicator[] = [];

  if (fingerprints.length < 2) {
    return {
      sessionsAnalyzed: fingerprints.length,
      suspiciousPatterns: [],
      adaptationScore: 0,
      collusionIndicators: [],
      overallVerdict: "clean",
    };
  }

  // 1. Score convergence — scores improving suspiciously toward perfect across sessions
  const scoresBySession = fingerprints.map((f) => {
    const avg = f.scoreDistribution.reduce((s, v) => s + v, 0) / (f.scoreDistribution.length || 1);
    return { sessionId: f.sessionId, avg, ts: f.ts };
  }).sort((a, b) => a.ts - b.ts);

  if (scoresBySession.length >= 3) {
    const firstAvg = scoresBySession[0]!.avg;
    const lastAvg = scoresBySession[scoresBySession.length - 1]!.avg;
    if (lastAvg - firstAvg > 1.5 && lastAvg >= 4.5) {
      patterns.push({
        type: "score-convergence",
        severity: "high",
        description: `Scores improved ${(lastAvg - firstAvg).toFixed(1)} points across ${scoresBySession.length} sessions toward near-perfect`,
        sessions: scoresBySession.map((s) => s.sessionId),
      });
    }
  }

  // 2. Response timing anomaly — suspiciously consistent timing across questions
  for (const fp of fingerprints) {
    if (fp.responseLatencyMs.length < 5) continue;
    const mean = fp.responseLatencyMs.reduce((s, v) => s + v, 0) / fp.responseLatencyMs.length;
    const variance = fp.responseLatencyMs.reduce((s, v) => s + (v - mean) ** 2, 0) / fp.responseLatencyMs.length;
    const cv = Math.sqrt(variance) / (mean || 1);
    // Very low coefficient of variation = unnaturally consistent timing
    if (cv < 0.1 && mean < 500) {
      patterns.push({
        type: "timing-anomaly",
        severity: "medium",
        description: `Session ${fp.sessionId}: Response timing unnaturally consistent (CV=${cv.toFixed(3)}, mean=${mean.toFixed(0)}ms)`,
        sessions: [fp.sessionId],
      });
    }
  }

  // 3. Evidence recycling — same evidence IDs appearing across sessions
  const evidenceFreq = new Map<string, string[]>();
  for (const fp of fingerprints) {
    for (const ev of fp.evidencePatterns) {
      if (!evidenceFreq.has(ev)) evidenceFreq.set(ev, []);
      evidenceFreq.get(ev)!.push(fp.sessionId);
    }
  }
  const recycledEvidence = [...evidenceFreq.entries()].filter(([_, sessions]) => sessions.length > fingerprints.length * 0.8);
  if (recycledEvidence.length > 3) {
    patterns.push({
      type: "evidence-recycling",
      severity: "medium",
      description: `${recycledEvidence.length} evidence patterns appear in >80% of sessions`,
      sessions: [...new Set(recycledEvidence.flatMap(([_, s]) => s))],
    });
  }

  // 4. Cross-agent collusion — different agents with suspiciously similar fingerprints
  const agentGroups = new Map<string, SessionFingerprint[]>();
  for (const fp of fingerprints) {
    if (!agentGroups.has(fp.agentId)) agentGroups.set(fp.agentId, []);
    agentGroups.get(fp.agentId)!.push(fp);
  }
  const agents = [...agentGroups.keys()];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const aFps = agentGroups.get(agents[i]!)!;
      const bFps = agentGroups.get(agents[j]!)!;
      const aEvidence = new Set(aFps.flatMap((f) => f.evidencePatterns));
      const bEvidence = new Set(bFps.flatMap((f) => f.evidencePatterns));
      const overlap = [...aEvidence].filter((e) => bEvidence.has(e));
      const similarity = overlap.length / Math.max(aEvidence.size, bEvidence.size, 1);
      if (similarity > 0.8) {
        collusionIndicators.push({
          agents: [agents[i]!, agents[j]!],
          sharedPatterns: overlap.slice(0, 5),
          confidence: similarity,
        });
      }
    }
  }

  if (collusionIndicators.length > 0) {
    patterns.push({
      type: "cross-agent-collusion",
      severity: "high",
      description: `${collusionIndicators.length} agent pair(s) share >80% evidence patterns`,
      sessions: collusionIndicators.flatMap((c) => c.agents),
    });
  }

  // Calculate overall adaptation score
  let adaptationScore = 0;
  for (const p of patterns) {
    switch (p.severity) {
      case "high": adaptationScore += 35; break;
      case "medium": adaptationScore += 15; break;
      case "low": adaptationScore += 5; break;
    }
  }
  adaptationScore = Math.min(100, adaptationScore);

  let verdict: CrossSessionAnalysis["overallVerdict"] = "clean";
  if (adaptationScore >= 60) verdict = "likely-gaming";
  else if (adaptationScore >= 25) verdict = "suspicious";

  return {
    sessionsAnalyzed: fingerprints.length,
    suspiciousPatterns: patterns,
    adaptationScore,
    collusionIndicators,
    overallVerdict: verdict,
  };
}

// ---------------------------------------------------------------------------
// R3-03: Quickscore variance stabilization
// ---------------------------------------------------------------------------

export interface StabilizedScore {
  rawScores: number[];
  stabilizedScore: number;
  confidenceInterval: { lower: number; upper: number };
  variance: number;
  stability: "stable" | "moderate" | "unstable";
  runsRequired: number;
}

/**
 * Stabilize quickscore across multiple runs using confidence-weighted aggregation.
 * Uses trimmed mean to remove outliers and provides confidence intervals.
 */
export function stabilizeScores(
  scores: number[],
  confidences: number[] = [],
): StabilizedScore {
  if (scores.length === 0) {
    return { rawScores: [], stabilizedScore: 0, confidenceInterval: { lower: 0, upper: 0 }, variance: 0, stability: "unstable", runsRequired: 3 };
  }

  if (scores.length === 1) {
    const s = scores[0]!;
    return { rawScores: scores, stabilizedScore: s, confidenceInterval: { lower: Math.max(0, s - 0.5), upper: Math.min(5, s + 0.5) }, variance: 0, stability: "moderate", runsRequired: 2 };
  }

  // Trimmed mean: remove top and bottom if enough data points
  const indexed = scores.map((s, i) => ({ s, c: confidences[i] ?? 0.5 }));
  indexed.sort((a, b) => a.s - b.s);
  const trimmedPairs = scores.length >= 5
    ? indexed.slice(1, -1) // remove highest and lowest
    : indexed;
  const trimmed = trimmedPairs.map(p => p.s);

  // Confidence-weighted aggregation
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const weight = trimmedPairs[i]!.c;
    weightedSum += trimmed[i]! * weight;
    totalWeight += weight;
  }
  const stabilizedScore = totalWeight > 0 ? weightedSum / totalWeight : trimmed.reduce((s, v) => s + v, 0) / trimmed.length;

  // Variance
  const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  const variance = trimmed.reduce((s, v) => s + (v - mean) ** 2, 0) / trimmed.length;
  const stdDev = Math.sqrt(variance);

  // 95% confidence interval
  const marginOfError = 1.96 * stdDev / Math.sqrt(trimmed.length);
  const lower = Math.max(0, stabilizedScore - marginOfError);
  const upper = Math.min(5, stabilizedScore + marginOfError);

  // Stability classification
  let stability: StabilizedScore["stability"] = "stable";
  if (stdDev > 0.5) stability = "unstable";
  else if (stdDev > 0.2) stability = "moderate";

  // How many more runs needed for ±0.5 stability
  const targetMargin = 0.25;
  const runsRequired = stdDev > 0 ? Math.ceil((1.96 * stdDev / targetMargin) ** 2) : 0;

  return {
    rawScores: scores,
    stabilizedScore: Number(stabilizedScore.toFixed(4)),
    confidenceInterval: { lower: Number(lower.toFixed(4)), upper: Number(upper.toFixed(4)) },
    variance: Number(variance.toFixed(6)),
    stability,
    runsRequired: Math.max(0, runsRequired - scores.length),
  };
}
