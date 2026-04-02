/**
 * Model Drift Detection — R4-03
 *
 * Continuous monitoring for score drift, behavior drift,
 * and capability degradation in evaluated agents.
 */

import { sha256Hex } from "../utils/hash.js";

export interface DriftSample {
  ts: number;
  agentId: string;
  score: number;
  dimensions: Record<string, number>;
  evidenceHash: string;
}

export interface DriftAlert {
  alertId: string;
  agentId: string;
  driftType: "score" | "behavioral" | "capability" | "distribution";
  magnitude: number;
  baselineScore: number;
  currentScore: number;
  description: string;
  ts: number;
  windowSamples: number;
}

export interface DriftConfig {
  /** Min score change to trigger alert */
  scoreThreshold: number;
  /** Min samples before drift detection activates */
  minSamples: number;
  /** Rolling window size */
  windowSize: number;
  /** Dimension-level drift threshold */
  dimensionThreshold: number;
  /** Behavioral shift detection (evidence pattern change) */
  evidenceChangeThreshold: number;
}

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  scoreThreshold: 0.5,
  minSamples: 5,
  windowSize: 20,
  dimensionThreshold: 0.3,
  evidenceChangeThreshold: 0.4,
};

export class DriftDetector {
  private samples: Map<string, DriftSample[]> = new Map();
  private config: DriftConfig;

  constructor(config: DriftConfig = DEFAULT_DRIFT_CONFIG) {
    this.config = config;
  }

  addSample(sample: DriftSample): DriftAlert[] {
    const key = sample.agentId;
    if (!this.samples.has(key)) this.samples.set(key, []);
    this.samples.get(key)!.push(sample);

    // Trim to window
    const all = this.samples.get(key)!;
    if (all.length > this.config.windowSize * 2) {
      this.samples.set(key, all.slice(-this.config.windowSize * 2));
    }

    return this.detect(key);
  }

  private detect(agentId: string): DriftAlert[] {
    const samples = this.samples.get(agentId) ?? [];
    if (samples.length < this.config.minSamples) return [];

    const alerts: DriftAlert[] = [];
    const recent = samples.slice(-Math.min(this.config.windowSize, samples.length));
    const baseline = samples.slice(0, Math.min(this.config.minSamples, Math.floor(samples.length / 2)));

    // Score drift
    const baselineAvg = baseline.reduce((s, v) => s + v.score, 0) / baseline.length;
    const recentAvg = recent.reduce((s, v) => s + v.score, 0) / recent.length;
    const scoreDrift = Math.abs(recentAvg - baselineAvg);

    if (scoreDrift >= this.config.scoreThreshold) {
      alerts.push({
        alertId: `drift-score-${Date.now()}`,
        agentId,
        driftType: "score",
        magnitude: scoreDrift,
        baselineScore: baselineAvg,
        currentScore: recentAvg,
        description: `Score drifted ${scoreDrift.toFixed(2)} from baseline ${baselineAvg.toFixed(2)} to ${recentAvg.toFixed(2)}`,
        ts: Date.now(),
        windowSamples: recent.length,
      });
    }

    // Dimension drift
    const allDims = new Set<string>();
    for (const s of [...baseline, ...recent]) for (const d of Object.keys(s.dimensions)) allDims.add(d);

    for (const dim of allDims) {
      const bVals = baseline.filter((s) => dim in s.dimensions).map((s) => s.dimensions[dim]!);
      const rVals = recent.filter((s) => dim in s.dimensions).map((s) => s.dimensions[dim]!);
      if (bVals.length === 0 || rVals.length === 0) continue;

      const bAvg = bVals.reduce((s, v) => s + v, 0) / bVals.length;
      const rAvg = rVals.reduce((s, v) => s + v, 0) / rVals.length;
      const dimDrift = Math.abs(rAvg - bAvg);

      if (dimDrift >= this.config.dimensionThreshold) {
        alerts.push({
          alertId: `drift-cap-${dim}-${Date.now()}`,
          agentId,
          driftType: "capability",
          magnitude: dimDrift,
          baselineScore: bAvg,
          currentScore: rAvg,
          description: `Dimension "${dim}" drifted ${dimDrift.toFixed(2)}: ${bAvg.toFixed(2)} → ${rAvg.toFixed(2)}`,
          ts: Date.now(),
          windowSamples: recent.length,
        });
      }
    }

    // Behavioral drift (evidence pattern change)
    const baselineHashes = new Set(baseline.map((s) => s.evidenceHash));
    const recentHashes = new Set(recent.map((s) => s.evidenceHash));
    const overlap = [...baselineHashes].filter((h) => recentHashes.has(h));
    const changeRate = 1 - overlap.length / Math.max(baselineHashes.size, 1);

    if (changeRate >= this.config.evidenceChangeThreshold && baseline.length >= this.config.minSamples) {
      alerts.push({
        alertId: `drift-behavioral-${Date.now()}`,
        agentId,
        driftType: "behavioral",
        magnitude: changeRate,
        baselineScore: baselineAvg,
        currentScore: recentAvg,
        description: `Evidence patterns changed ${(changeRate * 100).toFixed(0)}% from baseline — possible behavioral shift`,
        ts: Date.now(),
        windowSamples: recent.length,
      });
    }

    return alerts;
  }

  getHistory(agentId: string): DriftSample[] {
    return [...(this.samples.get(agentId) ?? [])];
  }

  getAgentIds(): string[] {
    return [...this.samples.keys()];
  }

  reset(agentId: string): void {
    this.samples.delete(agentId);
  }
}
