/**
 * monitor.ts — Production monitoring with configurable evaluation rules.
 *
 * Production monitoring module. Monitors
 * periodically score agent outputs against metric templates and track
 * quality trends in real-time.
 *
 * Key features:
 *   - Configurable monitors per agent type
 *   - Periodic evaluation against metric templates
 *   - Alert thresholds with severity levels
 *   - Quality windows (sliding time windows for trend detection)
 *   - Integration with RunHistoryStore for persistence
 */

import { randomUUID } from 'node:crypto';
import { MetricRegistry, type MetricInput, type MetricGroupResult } from './metricTemplates.js';

/* ── Types ──────────────────────────────────────────────────────── */

export interface MonitorConfig {
  id: string;
  name: string;
  description?: string;
  /** Which agent type this monitors */
  agentType: string;
  /** Metric group to evaluate against */
  metricGroupId: string;
  /** Alert if overall score drops below this threshold */
  alertThreshold: number;
  /** How many samples to keep in the rolling window */
  windowSize: number;
  /** Whether this monitor is active */
  enabled: boolean;
}

export interface MonitorSample {
  sampleId: string;
  monitorId: string;
  timestamp: number;
  input: MetricInput;
  result: MetricGroupResult;
  overallScore: number;
  passRate: number;
  alertTriggered: boolean;
}

export interface MonitorAlert {
  alertId: string;
  monitorId: string;
  monitorName: string;
  timestamp: number;
  currentScore: number;
  threshold: number;
  windowAvg: number;
  failedMetrics: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface MonitorStatus {
  monitorId: string;
  monitorName: string;
  agentType: string;
  enabled: boolean;
  sampleCount: number;
  currentScore: number;
  windowAvg: number;
  trend: 'improving' | 'stable' | 'declining';
  recentAlerts: number;
  lastSampleAt?: number;
  health: 'healthy' | 'warning' | 'critical';
}

export interface MonitorDashboard {
  monitors: MonitorStatus[];
  totalSamples: number;
  totalAlerts: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
}

/* ── ProductionMonitor ───────────────────────────────────────────── */

export class ProductionMonitor {
  private monitors = new Map<string, MonitorConfig>();
  private samples = new Map<string, MonitorSample[]>();  // monitorId → samples
  private alerts: MonitorAlert[] = [];
  private metricRegistry: MetricRegistry;

  constructor() {
    this.metricRegistry = new MetricRegistry();
  }

  /* ── Monitor configuration ───────────────────────────────────── */

  /** Create a new monitor */
  createMonitor(config: Omit<MonitorConfig, 'id'>): MonitorConfig {
    const monitor: MonitorConfig = {
      id: randomUUID(),
      ...config,
    };
    this.monitors.set(monitor.id, monitor);
    this.samples.set(monitor.id, []);
    return monitor;
  }

  /** Update a monitor */
  updateMonitor(id: string, updates: Partial<Omit<MonitorConfig, 'id'>>): MonitorConfig | undefined {
    const monitor = this.monitors.get(id);
    if (!monitor) return undefined;

    Object.assign(monitor, updates);
    return monitor;
  }

  /** Delete a monitor */
  deleteMonitor(id: string): boolean {
    this.samples.delete(id);
    return this.monitors.delete(id);
  }

  /** Get all monitors */
  getMonitors(): MonitorConfig[] {
    return [...this.monitors.values()];
  }

  /** Get monitors for a specific agent type */
  getMonitorsForAgent(agentType: string): MonitorConfig[] {
    return [...this.monitors.values()].filter(m => m.agentType === agentType);
  }

  /* ── Scoring ─────────────────────────────────────────────────── */

  /** Score an agent output against a monitor */
  scoreSample(monitorId: string, input: MetricInput): MonitorSample | undefined {
    const monitor = this.monitors.get(monitorId);
    if (!monitor || !monitor.enabled) return undefined;

    const result = this.metricRegistry.evaluateGroup(monitor.metricGroupId, input);
    if (!result) return undefined;

    const sample: MonitorSample = {
      sampleId: randomUUID(),
      monitorId,
      timestamp: Date.now(),
      input,
      result,
      overallScore: result.overallScore,
      passRate: result.passRate,
      alertTriggered: false,
    };

    // Add to samples window
    const samples = this.samples.get(monitorId) ?? [];
    samples.push(sample);

    // Trim to window size
    while (samples.length > monitor.windowSize) {
      samples.shift();
    }
    this.samples.set(monitorId, samples);

    // Check alert threshold
    if (result.overallScore < monitor.alertThreshold) {
      sample.alertTriggered = true;
      this.triggerAlert(monitor, sample, samples);
    }

    return sample;
  }

  /** Score multiple samples at once */
  scoreBatch(monitorId: string, inputs: MetricInput[]): MonitorSample[] {
    const results: MonitorSample[] = [];
    for (const input of inputs) {
      const sample = this.scoreSample(monitorId, input);
      if (sample) results.push(sample);
    }
    return results;
  }

  /* ── Alert management ────────────────────────────────────────── */

  private triggerAlert(monitor: MonitorConfig, sample: MonitorSample, windowSamples: MonitorSample[]): void {
    const windowScores = windowSamples.map(s => s.overallScore);
    const windowAvg = windowScores.length > 0
      ? windowScores.reduce((a, b) => a + b, 0) / windowScores.length
      : 0;

    const gap = monitor.alertThreshold - sample.overallScore;
    const severity: MonitorAlert['severity'] =
      gap >= 0.4 ? 'critical' :
      gap >= 0.25 ? 'high' :
      gap >= 0.1 ? 'medium' : 'low';

    const alert: MonitorAlert = {
      alertId: randomUUID(),
      monitorId: monitor.id,
      monitorName: monitor.name,
      timestamp: Date.now(),
      currentScore: Math.round(sample.overallScore * 1000) / 1000,
      threshold: monitor.alertThreshold,
      windowAvg: Math.round(windowAvg * 1000) / 1000,
      failedMetrics: sample.result.failedMetrics,
      severity,
      message: `Monitor "${monitor.name}" alert: score ${(sample.overallScore * 100).toFixed(1)}% below threshold ${(monitor.alertThreshold * 100).toFixed(1)}%. Failed: ${sample.result.failedMetrics.join(', ')}`,
    };

    this.alerts.push(alert);
  }

  /** Get all alerts */
  getAlerts(monitorId?: string): MonitorAlert[] {
    if (monitorId) return this.alerts.filter(a => a.monitorId === monitorId);
    return [...this.alerts];
  }

  /** Get recent alerts (last N) */
  getRecentAlerts(count = 10): MonitorAlert[] {
    return this.alerts.slice(-count);
  }

  /** Clear alerts */
  clearAlerts(monitorId?: string): void {
    if (monitorId) {
      this.alerts = this.alerts.filter(a => a.monitorId !== monitorId);
    } else {
      this.alerts = [];
    }
  }

  /* ── Status & Dashboard ──────────────────────────────────────── */

  /** Get status for a single monitor */
  getMonitorStatus(monitorId: string): MonitorStatus | undefined {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) return undefined;

    const samples = this.samples.get(monitorId) ?? [];
    const scores = samples.map(s => s.overallScore);
    const currentScore = scores.length > 0 ? scores[scores.length - 1]! : 0;
    const windowAvg = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    // Compute trend from recent samples
    const recentScores = scores.slice(-Math.min(10, scores.length));
    const trend = computeTrend(recentScores);

    const recentAlerts = this.alerts.filter(
      a => a.monitorId === monitorId && Date.now() - a.timestamp < 3600000 // Last hour
    ).length;

    const health: MonitorStatus['health'] =
      recentAlerts >= 3 || currentScore < monitor.alertThreshold * 0.5 ? 'critical' :
      recentAlerts >= 1 || currentScore < monitor.alertThreshold ? 'warning' : 'healthy';

    return {
      monitorId,
      monitorName: monitor.name,
      agentType: monitor.agentType,
      enabled: monitor.enabled,
      sampleCount: samples.length,
      currentScore: Math.round(currentScore * 1000) / 1000,
      windowAvg: Math.round(windowAvg * 1000) / 1000,
      trend,
      recentAlerts,
      lastSampleAt: samples.length > 0 ? samples[samples.length - 1]!.timestamp : undefined,
      health,
    };
  }

  /** Get dashboard with all monitors */
  getDashboard(): MonitorDashboard {
    const statuses: MonitorStatus[] = [];
    for (const id of this.monitors.keys()) {
      const status = this.getMonitorStatus(id);
      if (status) statuses.push(status);
    }

    const totalSamples = [...this.samples.values()].reduce((s, arr) => s + arr.length, 0);
    const criticalCount = statuses.filter(s => s.health === 'critical').length;
    const warningCount = statuses.filter(s => s.health === 'warning').length;

    const overallHealth: MonitorDashboard['overallHealth'] =
      criticalCount > 0 ? 'critical' :
      warningCount > 0 ? 'warning' : 'healthy';

    return {
      monitors: statuses,
      totalSamples,
      totalAlerts: this.alerts.length,
      overallHealth,
    };
  }

  /* ── Samples access ──────────────────────────────────────────── */

  /** Get samples for a monitor */
  getSamples(monitorId: string): MonitorSample[] {
    return [...(this.samples.get(monitorId) ?? [])];
  }

  /** Get all samples across all monitors */
  getAllSamples(): MonitorSample[] {
    const all: MonitorSample[] = [];
    for (const samples of this.samples.values()) {
      all.push(...samples);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  get monitorCount(): number { return this.monitors.size; }
  get alertCount(): number { return this.alerts.length; }
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function computeTrend(scores: number[]): 'improving' | 'stable' | 'declining' {
  if (scores.length < 2) return 'stable';

  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 0.05) return 'improving';
  if (diff < -0.05) return 'declining';
  return 'stable';
}
