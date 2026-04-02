/**
 * Longitudinal Time-Series Tracking — MF-19
 *
 * Full time-series storage, trend analysis, regression alerts,
 * baseline establishment, and fleet-level trends.
 */

import { z } from "zod";
import { join } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export interface ScoreDataPoint {
  ts: number;
  runId: string;
  overallScore: number;
  integrityIndex: number;
  layerScores: Record<string, number>;
  evidenceCoverage: number;
}

export interface TimeSeriesAnalysis {
  agentId: string;
  dataPoints: number;
  firstTs: number;
  lastTs: number;
  currentScore: number;
  trend: "improving" | "stable" | "declining";
  trendMagnitude: number; // score change per day
  baseline: number | null;
  regressionDetected: boolean;
  regressionAmount: number;
  driftVelocity: number; // score change per hour
}

export function analyzeTimeSeries(points: ScoreDataPoint[]): TimeSeriesAnalysis {
  if (points.length === 0) {
    return {
      agentId: "unknown", dataPoints: 0, firstTs: 0, lastTs: 0,
      currentScore: 0, trend: "stable", trendMagnitude: 0,
      baseline: null, regressionDetected: false, regressionAmount: 0, driftVelocity: 0,
    };
  }

  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const daySpan = (last.ts - first.ts) / 86_400_000;

  // Simple linear regression
  const n = sorted.length;
  const xMean = sorted.reduce((s, p) => s + p.ts, 0) / n;
  const yMean = sorted.reduce((s, p) => s + p.overallScore, 0) / n;
  let num = 0, den = 0;
  for (const p of sorted) {
    num += (p.ts - xMean) * (p.overallScore - yMean);
    den += (p.ts - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const slopePerDay = slope * 86_400_000;

  let trend: "improving" | "stable" | "declining" = "stable";
  if (slopePerDay > 0.05) trend = "improving";
  else if (slopePerDay < -0.05) trend = "declining";

  // Baseline: average of first 5 data points (or all if <5)
  const baselinePoints = sorted.slice(0, Math.min(5, n));
  const baseline = baselinePoints.reduce((s, p) => s + p.overallScore, 0) / baselinePoints.length;

  // Regression detection
  const regressionAmount = Math.max(0, baseline - last.overallScore);
  const regressionDetected = regressionAmount > 0.5;

  // Drift velocity
  const hourSpan = (last.ts - first.ts) / 3_600_000;
  const driftVelocity = hourSpan > 0 ? (last.overallScore - first.overallScore) / hourSpan : 0;

  return {
    agentId: "unknown",
    dataPoints: n,
    firstTs: first.ts,
    lastTs: last.ts,
    currentScore: last.overallScore,
    trend,
    trendMagnitude: Number(slopePerDay.toFixed(4)),
    baseline: Number(baseline.toFixed(4)),
    regressionDetected,
    regressionAmount: Number(regressionAmount.toFixed(4)),
    driftVelocity: Number(driftVelocity.toFixed(6)),
  };
}

export function detectRegressionAlert(
  analysis: TimeSeriesAnalysis,
  threshold: number = 0.5,
): { alert: boolean; message: string; severity: "info" | "warning" | "critical" } {
  if (!analysis.regressionDetected) {
    return { alert: false, message: "No regression detected", severity: "info" };
  }
  const severity = analysis.regressionAmount >= threshold * 2 ? "critical"
    : analysis.regressionAmount >= threshold ? "warning" : "info";

  return {
    alert: severity !== "info",
    message: `Score regression of ${analysis.regressionAmount.toFixed(2)} detected (baseline ${analysis.baseline?.toFixed(2)} → current ${analysis.currentScore.toFixed(2)})`,
    severity,
  };
}
