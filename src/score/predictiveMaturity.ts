import { standardDeviation } from "../experiments/stats.js";
/**
 * Predictive Maturity Modeling — M(a,d,t) trajectories
 *
 * Whitepaper Section 9.4: "Using M(a,d,t) trajectories across agent populations
 * to predict which low-maturity agents are highest-risk and prioritize
 * improvement resources."
 */

export interface MaturityDataPoint {
  agentId: string;
  timestamp: Date;
  overallScore: number;
  dimensionScores: Record<string, number>;
  evidenceCount: number;
}

export interface MaturityTrajectory {
  agentId: string;
  dataPoints: MaturityDataPoint[];
  trend: 'improving' | 'stable' | 'declining' | 'insufficient-data';
  velocity: number;           // score change per day (positive = improving)
  volatility: number;         // std dev of recent scores
  predictedScore30d: number;  // projected score in 30 days
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  interventionPriority: number; // 0–100, higher = more urgent
  recommendation: string;
}

export interface PopulationRiskReport {
  totalAgents: number;
  criticalRisk: string[];
  highRisk: string[];
  stable: string[];
  improving: string[];
  topPriorityInterventions: { agentId: string; priority: number; recommendation: string }[];
}

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y.at(0) ?? 0 };
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * (y[i] ?? 0), 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  return standardDeviation(values, false);
}

export function computeTrajectory(history: MaturityDataPoint[]): MaturityTrajectory {
  const agentId = history[0]?.agentId ?? 'unknown';

  if (history.length < 2) {
    const firstScore = history[0]?.overallScore ?? 0;
    return {
      agentId, dataPoints: history,
      trend: 'insufficient-data', velocity: 0, volatility: 0,
      predictedScore30d: firstScore,
      riskLevel: 'high', interventionPriority: 50,
      recommendation: 'Insufficient history. Run agent for at least 2 scoring windows.',
    };
  }

  const sorted = [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const t0 = sorted.at(0)!.timestamp.getTime();
  const xs = sorted.map(p => (p.timestamp.getTime() - t0) / 86400000); // days
  const ys = sorted.map(p => p.overallScore);

  const { slope, intercept } = linearRegression(xs, ys);
  const velocity = slope; // score/day
  const recentScores = ys.slice(-Math.min(5, ys.length));
  const volatility = stdDev(recentScores);
  const latestDay = xs[xs.length - 1] ?? 0;
  const predictedScore30d = Math.max(0, Math.min(100, Math.round(intercept + slope * (latestDay + 30))));

  const trend: MaturityTrajectory['trend'] =
    Math.abs(velocity) < 0.1 ? 'stable' :
    velocity > 0 ? 'improving' : 'declining';

  const currentScore = ys.at(-1) ?? 0;

  const riskLevel: MaturityTrajectory['riskLevel'] =
    (trend === 'declining' && currentScore < 40) ? 'critical' :
    (trend === 'declining' || (currentScore < 30)) ? 'high' :
    (volatility > 15 || currentScore < 50) ? 'medium' : 'low';

  const interventionPriority = Math.round(
    (riskLevel === 'critical' ? 80 : riskLevel === 'high' ? 60 : riskLevel === 'medium' ? 40 : 20) +
    Math.min(20, Math.abs(velocity) * 5)
  );

  const recommendation =
    trend === 'declining' ? `Declining at ${Math.abs(velocity).toFixed(2)} pts/day. Immediate review needed. Focus on lowest dimension score.` :
    trend === 'stable' && currentScore < 50 ? 'Stalled at low score. Use Mechanic workbench to unlock next level.' :
    trend === 'improving' ? `Good progress (+${velocity.toFixed(2)} pts/day). Predicted L${Math.floor(predictedScore30d / 20) + 1} in 30 days.` :
    'Insufficient consistent trend. Increase scoring frequency.';

  return { agentId, dataPoints: sorted, trend, velocity, volatility, predictedScore30d, riskLevel, interventionPriority, recommendation };
}

export function analyzePopulationRisk(trajectories: MaturityTrajectory[]): PopulationRiskReport {
  const criticalRisk = trajectories.filter(t => t.riskLevel === 'critical').map(t => t.agentId);
  const highRisk = trajectories.filter(t => t.riskLevel === 'high').map(t => t.agentId);
  const stable = trajectories.filter(t => t.trend === 'stable' && t.riskLevel === 'low').map(t => t.agentId);
  const improving = trajectories.filter(t => t.trend === 'improving').map(t => t.agentId);

  const topPriority = trajectories
    .sort((a, b) => b.interventionPriority - a.interventionPriority)
    .slice(0, 5)
    .map(t => ({ agentId: t.agentId, priority: t.interventionPriority, recommendation: t.recommendation }));

  return {
    totalAgents: trajectories.length,
    criticalRisk, highRisk, stable, improving,
    topPriorityInterventions: topPriority,
  };
}
