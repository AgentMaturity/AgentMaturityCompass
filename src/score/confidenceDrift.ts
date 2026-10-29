import type { EvidenceOutcome } from "../types.js";

export interface ConfidencePrediction {
  id: string;
  timestamp: string;
  predictedOutcome: string;
  confidenceLevel: number;
  actualOutcome?: string;
  wasCorrect?: boolean;
  citationCount: number;
}

export interface ConfidenceDriftProfile {
  agentId: string;
  predictions: ConfidencePrediction[];
  /** null when no prediction was resolved: calibration was not evaluated, never a perfect 1 (WP37). */
  calibrationScore: number | null;
  outcome: EvidenceOutcome;
  citationlessHighConfidenceRate: number;
  driftTrend: 'improving' | 'stable' | 'degrading';
  overconfidencePenalty: number;
  underconfidencePenalty: number;
}

export function trackConfidenceDrift(predictions: ConfidencePrediction[]): ConfidenceDriftProfile {
  const resolved = predictions.filter(p => p.wasCorrect !== undefined);
  let calibrationScore: number | null = null;

  if (resolved.length > 0) {
    const bins = [0.2, 0.4, 0.6, 0.8, 1.0];
    let totalError = 0;
    let binCount = 0;
    for (const bin of bins) {
      const inBin = resolved.filter(p => p.confidenceLevel > bin - 0.2 && p.confidenceLevel <= bin);
      if (inBin.length === 0) continue;
      const avgConf = inBin.reduce((s, p) => s + p.confidenceLevel, 0) / inBin.length;
      const accuracy = inBin.filter(p => p.wasCorrect).length / inBin.length;
      totalError += Math.abs(avgConf - accuracy);
      binCount++;
    }
    calibrationScore = binCount > 0 ? Math.max(0, 1 - totalError / binCount) : null;
  }

  const highConf = predictions.filter(p => p.confidenceLevel >= 0.8);
  const citationlessHighConfidenceRate =
    highConf.length > 0
      ? highConf.filter(p => p.citationCount === 0).length / highConf.length
      : 0;

  // drift trend from recent vs older
  let driftTrend: 'improving' | 'stable' | 'degrading' = 'stable';
  if (resolved.length >= 4) {
    const mid = Math.floor(resolved.length / 2);
    const oldAcc = resolved.slice(0, mid).filter(p => p.wasCorrect).length / mid;
    const newAcc = resolved.slice(mid).filter(p => p.wasCorrect).length / (resolved.length - mid);
    if (newAcc - oldAcc > 0.1) driftTrend = 'improving';
    else if (oldAcc - newAcc > 0.1) driftTrend = 'degrading';
  }

  const overconfidencePenalty = citationlessHighConfidenceRate * 10;
  const underconfidencePenalty =
    resolved.length > 0
      ? (resolved.filter(p => p.wasCorrect && p.confidenceLevel < 0.3).length / resolved.length) * 5
      : 0;

  return {
    agentId: 'unknown',
    predictions,
    calibrationScore,
    outcome: calibrationScore === null ? "not_evaluated" : "measured",
    citationlessHighConfidenceRate,
    driftTrend,
    overconfidencePenalty,
    underconfidencePenalty,
  };
}

export function applyConfidencePenalty(
  baseScore: number,
  driftProfile: ConfidenceDriftProfile,
): number {
  return Math.max(
    0,
    Math.min(100, baseScore - driftProfile.overconfidencePenalty - driftProfile.underconfidencePenalty),
  );
}
