import { mean as arithmeticMean, standardDeviation } from "../experiments/stats.js";
import type { TrustTier } from "../types.js";
import { classifyTrustTierRank } from "./otelExporter.js";

export type ObservabilityAnomalySeverity = "INFO" | "WARN" | "HIGH" | "CRITICAL";
export type ObservabilityAnomalyType =
  | "EVIDENCE_RATE_DROP"
  | "TRUST_TIER_REGRESSION"
  | "SCORE_VOLATILITY_SPIKE";

export interface EvidenceSignalPoint {
  ts: number;
  eventId?: string;
  eventType?: string;
  trustTier?: TrustTier;
}

export interface ScoreSignalPoint {
  ts: number;
  score: number;
  runId?: string;
}

export interface EvidenceRateDropAnomaly {
  type: "EVIDENCE_RATE_DROP";
  severity: ObservabilityAnomalySeverity;
  ts: number;
  recentRatePerHour: number;
  baselineRatePerHour: number;
  dropRatio: number;
  message: string;
}

export interface TrustTierRegressionAnomaly {
  type: "TRUST_TIER_REGRESSION";
  severity: ObservabilityAnomalySeverity;
  ts: number;
  fromTier: TrustTier;
  toTier: TrustTier;
  rankDrop: number;
  message: string;
}

export interface ScoreVolatilitySpikeAnomaly {
  type: "SCORE_VOLATILITY_SPIKE";
  severity: ObservabilityAnomalySeverity;
  ts: number;
  recentVolatility: number;
  baselineVolatility: number;
  spikeRatio: number;
  message: string;
}

export type ObservabilityAnomaly =
  | EvidenceRateDropAnomaly
  | TrustTierRegressionAnomaly
  | ScoreVolatilitySpikeAnomaly;

export interface DetectEvidenceRateDropOptions {
  nowTs?: number;
  windowMs?: number;
  baselineWindows?: number;
  dropThreshold?: number;
}

export interface DetectTrustTierRegressionOptions {
  lookbackPoints?: number;
  minRankDrop?: number;
}

export interface DetectScoreVolatilityOptions {
  spikeThreshold?: number;
  minPoints?: number;
  minimumAbsoluteVolatility?: number;
}

export interface DetectObservabilityAnomaliesInput {
  evidencePoints: EvidenceSignalPoint[];
  scorePoints?: ScoreSignalPoint[];
  nowTs?: number;
  evidenceRate?: DetectEvidenceRateDropOptions;
  trustTierRegression?: DetectTrustTierRegressionOptions;
  scoreVolatility?: DetectScoreVolatilityOptions;
}

function sortByTs<T extends { ts: number }>(points: T[]): T[] {
  return [...points].sort((a, b) => a.ts - b.ts);
}

function mean(values: number[]): number {
  return arithmeticMean(values);
}

// Anomaly z-scores use population SD (divide by n), not experiments/stats.ts sample-SD default.
function stddev(values: number[]): number {
  return values.length < 2 ? 0 : standardDeviation(values, false);
}

function severityRank(severity: ObservabilityAnomalySeverity): number {
  if (severity === "CRITICAL") return 4;
  if (severity === "HIGH") return 3;
  if (severity === "WARN") return 2;
  return 1;
}

function compareBySeverityThenTs(a: ObservabilityAnomaly, b: ObservabilityAnomaly): number {
  const delta = severityRank(b.severity) - severityRank(a.severity);
  if (delta !== 0) return delta;
  return b.ts - a.ts;
}

export function detectEvidenceRateDrop(
  evidencePoints: EvidenceSignalPoint[],
  options: DetectEvidenceRateDropOptions = {}
): EvidenceRateDropAnomaly | null {
  const nowTs = options.nowTs ?? Date.now();
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const baselineWindows = options.baselineWindows ?? 4;
  const dropThreshold = options.dropThreshold ?? 0.5;
  if (windowMs <= 0 || baselineWindows <= 0) {
    return null;
  }

  const sorted = sortByTs(evidencePoints);
  const recentStart = nowTs - windowMs;
  const recentCount = sorted.filter((point) => point.ts >= recentStart && point.ts <= nowTs).length;

  const baselineCounts: number[] = [];
  for (let i = 1; i <= baselineWindows; i += 1) {
    const start = nowTs - windowMs * (i + 1);
    const end = nowTs - windowMs * i;
    const count = sorted.filter((point) => point.ts >= start && point.ts < end).length;
    baselineCounts.push(count);
  }

  const baselineAvg = mean(baselineCounts);
  if (baselineAvg <= 0) {
    return null;
  }

  const dropRatio = 1 - recentCount / baselineAvg;
  if (dropRatio <= dropThreshold) {
    return null;
  }

  const recentRatePerHour = (recentCount * 60 * 60 * 1000) / windowMs;
  const baselineRatePerHour = (baselineAvg * 60 * 60 * 1000) / windowMs;
  const severity: ObservabilityAnomalySeverity =
    dropRatio >= 0.8 ? "CRITICAL" : dropRatio >= 0.65 ? "HIGH" : "WARN";

  return {
    type: "EVIDENCE_RATE_DROP",
    severity,
    ts: nowTs,
    recentRatePerHour: Number(recentRatePerHour.toFixed(4)),
    baselineRatePerHour: Number(baselineRatePerHour.toFixed(4)),
    dropRatio: Number(dropRatio.toFixed(4)),
    message: `Evidence rate dropped ${(dropRatio * 100).toFixed(1)}% (recent ${recentRatePerHour.toFixed(2)}/hr vs baseline ${baselineRatePerHour.toFixed(2)}/hr).`
  };
}

export function detectTrustTierRegression(
  evidencePoints: EvidenceSignalPoint[],
  options: DetectTrustTierRegressionOptions = {}
): TrustTierRegressionAnomaly | null {
  const sorted = sortByTs(evidencePoints).filter(
    (point): point is EvidenceSignalPoint & { trustTier: TrustTier } => point.trustTier !== undefined
  );
  if (sorted.length < 2) {
    return null;
  }

  const lookbackPoints = options.lookbackPoints ?? 100;
  const minRankDrop = options.minRankDrop ?? 1;
  const window = sorted.slice(Math.max(0, sorted.length - lookbackPoints));
  if (window.length < 2) return null;

  const latest = window[window.length - 1]!;
  if (!latest.trustTier) return null;
  const latestRank = classifyTrustTierRank(latest.trustTier);

  let strongestPoint = window[0]!;
  let strongestRank = strongestPoint.trustTier ? classifyTrustTierRank(strongestPoint.trustTier) : 0;
  for (const point of window.slice(0, -1)) {
    if (!point.trustTier) continue;
    const rank = classifyTrustTierRank(point.trustTier);
    if (rank > strongestRank) {
      strongestPoint = point;
      strongestRank = rank;
    }
  }

  const rankDrop = strongestRank - latestRank;
  if (rankDrop < minRankDrop || !strongestPoint.trustTier) {
    return null;
  }

  const severity: ObservabilityAnomalySeverity = rankDrop >= 2 ? "HIGH" : "WARN";
  return {
    type: "TRUST_TIER_REGRESSION",
    severity,
    ts: latest.ts,
    fromTier: strongestPoint.trustTier,
    toTier: latest.trustTier,
    rankDrop,
    message: `Trust tier regressed from ${strongestPoint.trustTier} to ${latest.trustTier}.`
  };
}

export function detectScoreVolatilitySpike(
  scorePoints: ScoreSignalPoint[],
  options: DetectScoreVolatilityOptions = {}
): ScoreVolatilitySpikeAnomaly | null {
  const minPoints = options.minPoints ?? 8;
  const spikeThreshold = options.spikeThreshold ?? 2;
  const minimumAbsoluteVolatility = options.minimumAbsoluteVolatility ?? 1;
  const sorted = sortByTs(scorePoints);
  if (sorted.length < minPoints) {
    return null;
  }

  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    deltas.push(Math.abs(sorted[i]!.score - sorted[i - 1]!.score));
  }
  if (deltas.length < minPoints - 1) {
    return null;
  }

  const splitAt = Math.floor(deltas.length / 2);
  const baseline = deltas.slice(0, splitAt);
  const recent = deltas.slice(splitAt);
  if (baseline.length < 2 || recent.length < 2) {
    return null;
  }

  const baselineVolatility = Math.max(mean(baseline), 1e-6);
  const recentVolatility = mean(recent);
  const baselineSpread = stddev(baseline);
  const recentSpread = stddev(recent);
  const spikeRatio = recentVolatility / baselineVolatility;
  if (spikeRatio < spikeThreshold || recentVolatility < minimumAbsoluteVolatility) {
    return null;
  }

  const latestTs = sorted[sorted.length - 1]!.ts;
  const severity: ObservabilityAnomalySeverity =
    spikeRatio >= spikeThreshold * 2 ? "CRITICAL" : spikeRatio >= spikeThreshold * 1.5 ? "HIGH" : "WARN";
  return {
    type: "SCORE_VOLATILITY_SPIKE",
    severity,
    ts: latestTs,
    recentVolatility: Number((recentVolatility + recentSpread).toFixed(4)),
    baselineVolatility: Number((baselineVolatility + baselineSpread).toFixed(4)),
    spikeRatio: Number(spikeRatio.toFixed(4)),
    message: `Score volatility spiked ${spikeRatio.toFixed(2)}x (recent ${recentVolatility.toFixed(3)} vs baseline ${baselineVolatility.toFixed(3)}).`
  };
}

export function detectEvidenceStreamAnomalies(
  input: DetectObservabilityAnomaliesInput
): ObservabilityAnomaly[] {
  const nowTs = input.nowTs ?? Date.now();
  const anomalies: ObservabilityAnomaly[] = [];

  const rateDrop = detectEvidenceRateDrop(input.evidencePoints, {
    nowTs,
    ...(input.evidenceRate ?? {})
  });
  if (rateDrop) {
    anomalies.push(rateDrop);
  }

  const trustRegression = detectTrustTierRegression(input.evidencePoints, input.trustTierRegression);
  if (trustRegression) {
    anomalies.push(trustRegression);
  }

  if (input.scorePoints && input.scorePoints.length > 0) {
    const spike = detectScoreVolatilitySpike(input.scorePoints, input.scoreVolatility);
    if (spike) {
      anomalies.push(spike);
    }
  }

  return anomalies.sort(compareBySeverityThenTs);
}
