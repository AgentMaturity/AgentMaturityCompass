/**
 * Real-time Monitoring Dashboard — R4-01
 *
 * Provides live monitoring of agent fleet health, score trends,
 * drift alerts, and compliance status.
 */

import { z } from "zod";

export interface DashboardMetric {
  metricId: string;
  agentId: string;
  name: string;
  value: number;
  unit: string;
  ts: number;
  trend: "up" | "down" | "stable";
  severity: "normal" | "warning" | "critical";
}

export interface DashboardWidget {
  widgetId: string;
  type: "scoreGauge" | "trendLine" | "heatmap" | "alertFeed" | "complianceMatrix" | "fleetOverview" | "driftDetector";
  title: string;
  metrics: string[];
  refreshIntervalMs: number;
  config: Record<string, unknown>;
}

export interface DashboardConfig {
  dashboardId: string;
  name: string;
  widgets: DashboardWidget[];
  refreshIntervalMs: number;
  retentionDays: number;
  alertThresholds: AlertThreshold[];
}

export interface AlertThreshold {
  metricName: string;
  warningThreshold: number;
  criticalThreshold: number;
  direction: "above" | "below";
  cooldownMs: number;
}

export interface MonitoringAlert {
  alertId: string;
  ts: number;
  agentId: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  severity: "warning" | "critical";
  message: string;
  acknowledged: boolean;
}

export class RealtimeMonitor {
  private metrics: Map<string, DashboardMetric[]> = new Map();
  private alerts: MonitoringAlert[] = [];
  private thresholds: AlertThreshold[] = [];
  private maxRetentionMs: number;

  constructor(retentionDays: number = 30, thresholds: AlertThreshold[] = []) {
    this.maxRetentionMs = retentionDays * 86400 * 1000;
    this.thresholds = thresholds;
  }

  ingest(metric: DashboardMetric): MonitoringAlert | null {
    const key = `${metric.agentId}:${metric.name}`;
    if (!this.metrics.has(key)) this.metrics.set(key, []);
    this.metrics.get(key)!.push(metric);

    // Check thresholds
    for (const t of this.thresholds) {
      if (t.metricName !== metric.name) continue;
      const breached = t.direction === "above"
        ? metric.value > t.criticalThreshold
        : metric.value < t.criticalThreshold;
      const warned = t.direction === "above"
        ? metric.value > t.warningThreshold
        : metric.value < t.warningThreshold;

      if (breached || warned) {
        const alert: MonitoringAlert = {
          alertId: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          agentId: metric.agentId,
          metricName: metric.name,
          currentValue: metric.value,
          threshold: breached ? t.criticalThreshold : t.warningThreshold,
          severity: breached ? "critical" : "warning",
          message: `${metric.name} ${t.direction === "above" ? "exceeded" : "dropped below"} ${breached ? "critical" : "warning"} threshold: ${metric.value} ${metric.unit}`,
          acknowledged: false,
        };
        this.alerts.push(alert);
        return alert;
      }
    }
    return null;
  }

  getMetrics(agentId: string, metricName: string, since?: number): DashboardMetric[] {
    const key = `${agentId}:${metricName}`;
    const all = this.metrics.get(key) ?? [];
    return since ? all.filter((m) => m.ts >= since) : all;
  }

  getAlerts(filter?: { agentId?: string; severity?: string; unacknowledgedOnly?: boolean }): MonitoringAlert[] {
    let result = [...this.alerts];
    if (filter?.agentId) result = result.filter((a) => a.agentId === filter.agentId);
    if (filter?.severity) result = result.filter((a) => a.severity === filter.severity);
    if (filter?.unacknowledgedOnly) result = result.filter((a) => !a.acknowledged);
    return result;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find((a) => a.alertId === alertId);
    if (!alert) return false;
    alert.acknowledged = true;
    return true;
  }

  getFleetOverview(): {
    totalAgents: number;
    healthyAgents: number;
    warningAgents: number;
    criticalAgents: number;
    latestScores: Map<string, number>;
  } {
    const agentIds = new Set<string>();
    const latestScores = new Map<string, number>();
    const agentSeverity = new Map<string, string>();

    for (const [key, metrics] of this.metrics) {
      const agentId = key.split(":")[0]!;
      agentIds.add(agentId);
      const latest = metrics[metrics.length - 1];
      if (latest) {
        if (latest.name === "overallScore") latestScores.set(agentId, latest.value);
        const currentSev = agentSeverity.get(agentId) ?? "normal";
        if (latest.severity === "critical" || currentSev === "critical") agentSeverity.set(agentId, "critical");
        else if (latest.severity === "warning" || currentSev === "warning") agentSeverity.set(agentId, "warning");
        else agentSeverity.set(agentId, "normal");
      }
    }

    let healthy = 0, warning = 0, critical = 0;
    for (const sev of agentSeverity.values()) {
      if (sev === "critical") critical++;
      else if (sev === "warning") warning++;
      else healthy++;
    }

    return { totalAgents: agentIds.size, healthyAgents: healthy, warningAgents: warning, criticalAgents: critical, latestScores };
  }

  prune(): number {
    const cutoff = Date.now() - this.maxRetentionMs;
    let pruned = 0;
    for (const [key, metrics] of this.metrics) {
      const before = metrics.length;
      const kept = metrics.filter((m) => m.ts >= cutoff);
      this.metrics.set(key, kept);
      pruned += before - kept.length;
    }
    return pruned;
  }
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  dashboardId: "default",
  name: "AMC Fleet Dashboard",
  widgets: [
    { widgetId: "fleet-overview", type: "fleetOverview", title: "Fleet Health", metrics: ["overallScore", "complianceScore"], refreshIntervalMs: 30000, config: {} },
    { widgetId: "score-trends", type: "trendLine", title: "Score Trends (7d)", metrics: ["overallScore"], refreshIntervalMs: 60000, config: { timeRangeDays: 7 } },
    { widgetId: "drift-detector", type: "driftDetector", title: "Score Drift Alerts", metrics: ["scoreDrift"], refreshIntervalMs: 60000, config: { driftThreshold: 0.5 } },
    { widgetId: "compliance-matrix", type: "complianceMatrix", title: "Compliance Status", metrics: ["complianceScore"], refreshIntervalMs: 300000, config: {} },
    { widgetId: "alert-feed", type: "alertFeed", title: "Active Alerts", metrics: [], refreshIntervalMs: 15000, config: { maxAlerts: 50 } },
    { widgetId: "heatmap", type: "heatmap", title: "Agent Score Heatmap", metrics: ["overallScore"], refreshIntervalMs: 120000, config: {} },
  ],
  refreshIntervalMs: 30000,
  retentionDays: 90,
  alertThresholds: [
    { metricName: "overallScore", warningThreshold: 2.5, criticalThreshold: 1.5, direction: "below", cooldownMs: 300000 },
    { metricName: "scoreDrift", warningThreshold: 0.5, criticalThreshold: 1.0, direction: "above", cooldownMs: 600000 },
    { metricName: "complianceScore", warningThreshold: 3.0, criticalThreshold: 2.0, direction: "below", cooldownMs: 300000 },
  ],
};
