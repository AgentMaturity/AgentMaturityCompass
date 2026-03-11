/**
 * scoreHistory.ts — Score History & Regression Detection for AMC
 *
 * Stores historical score snapshots per agent, detects score degradation over time,
 * alerts on regressions, and generates trend reports. Enterprise table stakes.
 *
 * Architecture:
 * - SQLite table: score_history (agent_id, snapshot_ts, dimension_scores, metadata)
 * - Regression detection: compare current vs historical scores, flag degradation
 * - Trend analysis: time-series analysis of score evolution
 * - Alert system: integrates with AMC incident/advisory system
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getOrCreateSqlitePool } from "../storage/sqlitePool.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem, getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import type { ModelVersion } from "./modelDrift.js";

/* ── Types ────────────────────────────────────────────────────────── */

export interface ScoreSnapshot {
  snapshotId: string;
  agentId: string;
  snapshotTs: number;
  dimensionScores: Record<string, number>;  // dimension → score (0-1)
  overallScore: number;
  level: number;  // L1-L5
  metadata: {
    model?: ModelVersion;
    runId?: string;
    evidenceCount?: number;
    [key: string]: unknown;
  };
  snapshotHash: string;
  signature: string;
}

export interface RegressionAlert {
  alertId: string;
  agentId: string;
  detectedTs: number;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  percentChange: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  snapshotIdBefore: string;
  snapshotIdAfter: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  resolvedTs?: number;
  resolvedBy?: string;
  notes?: string;
}

export interface TrendReport {
  agentId: string;
  generatedTs: number;
  windowStartTs: number;
  windowEndTs: number;
  snapshotCount: number;
  dimensions: Array<{
    dimension: string;
    trend: 'improving' | 'stable' | 'degrading' | 'volatile';
    startScore: number;
    endScore: number;
    delta: number;
    volatility: number;  // standard deviation
    dataPoints: Array<{ ts: number; score: number }>;
  }>;
  overallTrend: 'improving' | 'stable' | 'degrading' | 'mixed';
  summary: string;
}

/* ── Database Schema ──────────────────────────────────────────────── */

const SCORE_HISTORY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS score_history (
    snapshot_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    snapshot_ts INTEGER NOT NULL,
    dimension_scores_json TEXT NOT NULL,
    overall_score REAL NOT NULL,
    level INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    signature TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_score_history_agent_ts ON score_history(agent_id, snapshot_ts DESC);
  CREATE INDEX IF NOT EXISTS idx_score_history_ts ON score_history(snapshot_ts DESC);

  CREATE TABLE IF NOT EXISTS regression_alerts (
    alert_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    detected_ts INTEGER NOT NULL,
    dimension TEXT NOT NULL,
    score_before REAL NOT NULL,
    score_after REAL NOT NULL,
    delta REAL NOT NULL,
    percent_change REAL NOT NULL,
    severity TEXT NOT NULL,
    snapshot_id_before TEXT NOT NULL,
    snapshot_id_after TEXT NOT NULL,
    status TEXT NOT NULL,
    resolved_ts INTEGER,
    resolved_by TEXT,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_regression_alerts_agent_ts ON regression_alerts(agent_id, detected_ts DESC);
  CREATE INDEX IF NOT EXISTS idx_regression_alerts_status ON regression_alerts(status, detected_ts DESC);

  CREATE TRIGGER IF NOT EXISTS protect_score_history_immutable
  BEFORE UPDATE ON score_history
  BEGIN
    SELECT RAISE(ABORT, 'score_history is append-only');
  END;

  CREATE TRIGGER IF NOT EXISTS no_delete_score_history
  BEFORE DELETE ON score_history
  BEGIN
    SELECT RAISE(ABORT, 'score_history cannot be deleted');
  END;
`;

/* ── Score History Store ──────────────────────────────────────────── */

export class ScoreHistoryStore {
  private readonly workspace: string;
  private readonly db: Database.Database;

  constructor(workspace: string) {
    this.workspace = workspace;
    const pool = getOrCreateSqlitePool({
      key: `score-history:${workspace}`,
      dbPath: join(workspace, ".amc", "score_history.sqlite"),
      maxSize: 4,
      configureConnection: (db) => {
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        db.pragma("busy_timeout = 5000");
        db.pragma("synchronous = FULL");
      },
      initialize: (db) => {
        db.exec(SCORE_HISTORY_SCHEMA);
      }
    });
    this.db = pool.acquire().db;
  }

  private monitorPrivateKey(): string {
    return getPrivateKeyPem(this.workspace, "monitor");
  }

  /**
   * Record a score snapshot for an agent
   */
  recordSnapshot(params: {
    agentId: string;
    dimensionScores: Record<string, number>;
    overallScore: number;
    level: number;
    metadata?: Record<string, unknown>;
    snapshotTs?: number;
  }): ScoreSnapshot {
    const snapshotId = randomUUID();
    const snapshotTs = params.snapshotTs ?? Date.now();
    const metadata = params.metadata ?? {};

    const canonical = canonicalize({
      snapshot_id: snapshotId,
      agent_id: params.agentId,
      snapshot_ts: snapshotTs,
      dimension_scores: params.dimensionScores,
      overall_score: params.overallScore,
      level: params.level,
      metadata
    });

    const snapshotHash = sha256Hex(canonical);
    const signature = signHexDigest(snapshotHash, this.monitorPrivateKey());

    this.db.prepare(`
      INSERT INTO score_history
      (snapshot_id, agent_id, snapshot_ts, dimension_scores_json, overall_score, level, metadata_json, snapshot_hash, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshotId,
      params.agentId,
      snapshotTs,
      JSON.stringify(params.dimensionScores),
      params.overallScore,
      params.level,
      JSON.stringify(metadata),
      snapshotHash,
      signature
    );

    return {
      snapshotId,
      agentId: params.agentId,
      snapshotTs,
      dimensionScores: params.dimensionScores,
      overallScore: params.overallScore,
      level: params.level,
      metadata,
      snapshotHash,
      signature
    };
  }

  /**
   * Get score history for an agent
   */
  getHistory(agentId: string, options?: {
    limit?: number;
    startTs?: number;
    endTs?: number;
  }): ScoreSnapshot[] {
    let sql = `
      SELECT * FROM score_history
      WHERE agent_id = ?
    `;
    const params: unknown[] = [agentId];

    if (options?.startTs !== undefined) {
      sql += ` AND snapshot_ts >= ?`;
      params.push(options.startTs);
    }

    if (options?.endTs !== undefined) {
      sql += ` AND snapshot_ts <= ?`;
      params.push(options.endTs);
    }

    sql += ` ORDER BY snapshot_ts DESC`;

    if (options?.limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      snapshot_id: string;
      agent_id: string;
      snapshot_ts: number;
      dimension_scores_json: string;
      overall_score: number;
      level: number;
      metadata_json: string;
      snapshot_hash: string;
      signature: string;
    }>;

    return rows.map(row => ({
      snapshotId: row.snapshot_id,
      agentId: row.agent_id,
      snapshotTs: row.snapshot_ts,
      dimensionScores: JSON.parse(row.dimension_scores_json) as Record<string, number>,
      overallScore: row.overall_score,
      level: row.level,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      snapshotHash: row.snapshot_hash,
      signature: row.signature
    }));
  }

  /**
   * Detect regressions by comparing current snapshot with previous
   */
  detectRegressions(params: {
    agentId: string;
    currentSnapshot: ScoreSnapshot;
    thresholds?: {
      minDelta?: number;
      minPercentChange?: number;
    };
  }): RegressionAlert[] {
    const thresholds = {
      minDelta: params.thresholds?.minDelta ?? 0.05,
      minPercentChange: params.thresholds?.minPercentChange ?? 10
    };

    // Get previous snapshot
    const history = this.getHistory(params.agentId, { limit: 2 });
    if (history.length < 2) {
      return []; // Need at least 2 snapshots to detect regression
    }

    const previous = history[1]; // Second most recent (first is current)
    if (!previous) return [];
    const current = params.currentSnapshot;
    const alerts: RegressionAlert[] = [];

    // Compare each dimension
    for (const [dimension, currentScore] of Object.entries(current.dimensionScores)) {
      const previousScore = previous.dimensionScores[dimension];
      if (previousScore === undefined) continue;

      const delta = currentScore - previousScore;
      const percentChange = previousScore > 0 ? (delta / previousScore) * 100 : 0;

      // Only alert on degradation (negative delta)
      if (delta >= 0) continue;
      if (Math.abs(delta) < thresholds.minDelta) continue;
      if (Math.abs(percentChange) < thresholds.minPercentChange) continue;

      const severity = this.calculateSeverity(Math.abs(delta), Math.abs(percentChange));

      const alertId = randomUUID();
      this.db.prepare(`
        INSERT INTO regression_alerts
        (alert_id, agent_id, detected_ts, dimension, score_before, score_after, delta, percent_change, severity, snapshot_id_before, snapshot_id_after, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        alertId,
        params.agentId,
        Date.now(),
        dimension,
        previousScore,
        currentScore,
        delta,
        percentChange,
        severity,
        previous.snapshotId,
        current.snapshotId,
        'open'
      );

      alerts.push({
        alertId,
        agentId: params.agentId,
        detectedTs: Date.now(),
        dimension,
        scoreBefore: previousScore,
        scoreAfter: currentScore,
        delta,
        percentChange,
        severity,
        snapshotIdBefore: previous.snapshotId,
        snapshotIdAfter: current.snapshotId,
        status: 'open'
      });
    }

    return alerts;
  }

  private calculateSeverity(absDelta: number, absPercentChange: number): RegressionAlert['severity'] {
    if (absDelta >= 0.3 || absPercentChange >= 50) return 'critical';
    if (absDelta >= 0.15 || absPercentChange >= 25) return 'high';
    if (absDelta >= 0.08 || absPercentChange >= 15) return 'medium';
    return 'low';
  }

  /**
   * Get open regression alerts for an agent
   */
  getOpenAlerts(agentId: string): RegressionAlert[] {
    const rows = this.db.prepare(`
      SELECT * FROM regression_alerts
      WHERE agent_id = ? AND status = 'open'
      ORDER BY detected_ts DESC
    `).all(agentId) as Array<{
      alert_id: string;
      agent_id: string;
      detected_ts: number;
      dimension: string;
      score_before: number;
      score_after: number;
      delta: number;
      percent_change: number;
      severity: string;
      snapshot_id_before: string;
      snapshot_id_after: string;
      status: string;
      resolved_ts: number | null;
      resolved_by: string | null;
      notes: string | null;
    }>;

    return rows.map(row => ({
      alertId: row.alert_id,
      agentId: row.agent_id,
      detectedTs: row.detected_ts,
      dimension: row.dimension,
      scoreBefore: row.score_before,
      scoreAfter: row.score_after,
      delta: row.delta,
      percentChange: row.percent_change,
      severity: row.severity as RegressionAlert['severity'],
      snapshotIdBefore: row.snapshot_id_before,
      snapshotIdAfter: row.snapshot_id_after,
      status: row.status as RegressionAlert['status'],
      resolvedTs: row.resolved_ts ?? undefined,
      resolvedBy: row.resolved_by ?? undefined,
      notes: row.notes ?? undefined
    }));
  }

  /**
   * Update alert status
   */
  updateAlertStatus(alertId: string, status: RegressionAlert['status'], resolvedBy?: string, notes?: string): void {
    const resolvedTs = status === 'resolved' || status === 'false_positive' ? Date.now() : null;
    this.db.prepare(`
      UPDATE regression_alerts
      SET status = ?, resolved_ts = ?, resolved_by = ?, notes = ?
      WHERE alert_id = ?
    `).run(status, resolvedTs, resolvedBy ?? null, notes ?? null, alertId);
  }

  /**
   * Generate trend report for an agent
   */
  generateTrendReport(agentId: string, options?: {
    windowStartTs?: number;
    windowEndTs?: number;
  }): TrendReport {
    const windowEndTs = options?.windowEndTs ?? Date.now();
    const windowStartTs = options?.windowStartTs ?? (windowEndTs - 30 * 24 * 60 * 60 * 1000); // 30 days default

    const history = this.getHistory(agentId, {
      startTs: windowStartTs,
      endTs: windowEndTs
    }).reverse(); // Oldest first for trend analysis

    if (history.length === 0) {
      return {
        agentId,
        generatedTs: Date.now(),
        windowStartTs,
        windowEndTs,
        snapshotCount: 0,
        dimensions: [],
        overallTrend: 'stable',
        summary: 'No score history available for this time window'
      };
    }

    // Collect all dimensions
    const allDimensions = new Set<string>();
    for (const snapshot of history) {
      for (const dim of Object.keys(snapshot.dimensionScores)) {
        allDimensions.add(dim);
      }
    }

    const dimensionTrends = Array.from(allDimensions).map(dimension => {
      const dataPoints = history
        .map(s => ({
          ts: s.snapshotTs,
          score: s.dimensionScores[dimension] ?? 0
        }))
        .filter(p => p.score > 0);

      if (dataPoints.length === 0) {
        return {
          dimension,
          trend: 'stable' as const,
          startScore: 0,
          endScore: 0,
          delta: 0,
          volatility: 0,
          dataPoints: []
        };
      }

      const startScore = dataPoints[0]!.score;
      const endScore = dataPoints[dataPoints.length - 1]!.score;
      const delta = endScore - startScore;

      // Calculate volatility (standard deviation)
      const mean = dataPoints.reduce((sum, p) => sum + p.score, 0) / dataPoints.length;
      const variance = dataPoints.reduce((sum, p) => sum + Math.pow(p.score - mean, 2), 0) / dataPoints.length;
      const volatility = Math.sqrt(variance);

      // Determine trend
      let trend: 'improving' | 'stable' | 'degrading' | 'volatile';
      if (volatility > 0.15) {
        trend = 'volatile';
      } else if (delta > 0.05) {
        trend = 'improving';
      } else if (delta < -0.05) {
        trend = 'degrading';
      } else {
        trend = 'stable';
      }

      return {
        dimension,
        trend,
        startScore,
        endScore,
        delta,
        volatility,
        dataPoints
      };
    });

    // Overall trend
    const improvingCount = dimensionTrends.filter(d => d.trend === 'improving').length;
    const degradingCount = dimensionTrends.filter(d => d.trend === 'degrading').length;
    const overallTrend: TrendReport['overallTrend'] =
      improvingCount > degradingCount ? 'improving'
      : degradingCount > improvingCount ? 'degrading'
      : improvingCount > 0 || degradingCount > 0 ? 'mixed'
      : 'stable';

    const summary = `${history.length} snapshots analyzed. ${improvingCount} dimensions improving, ${degradingCount} degrading. Overall trend: ${overallTrend}.`;

    return {
      agentId,
      generatedTs: Date.now(),
      windowStartTs,
      windowEndTs,
      snapshotCount: history.length,
      dimensions: dimensionTrends,
      overallTrend,
      summary
    };
  }

  /**
   * Verify integrity of score history
   */
  verifyIntegrity(agentId?: string): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const monitorKeys = getPublicKeyHistory(this.workspace, "monitor");

    let sql = "SELECT * FROM score_history";
    const params: unknown[] = [];

    if (agentId) {
      sql += " WHERE agent_id = ?";
      params.push(agentId);
    }

    sql += " ORDER BY snapshot_ts ASC";

    const rows = this.db.prepare(sql).all(...params) as Array<{
      snapshot_id: string;
      agent_id: string;
      snapshot_ts: number;
      dimension_scores_json: string;
      overall_score: number;
      level: number;
      metadata_json: string;
      snapshot_hash: string;
      signature: string;
    }>;

    for (const row of rows) {
      const canonical = canonicalize({
        snapshot_id: row.snapshot_id,
        agent_id: row.agent_id,
        snapshot_ts: row.snapshot_ts,
        dimension_scores: JSON.parse(row.dimension_scores_json),
        overall_score: row.overall_score,
        level: row.level,
        metadata: JSON.parse(row.metadata_json)
      });

      const recalculated = sha256Hex(canonical);
      if (recalculated !== row.snapshot_hash) {
        errors.push(`Snapshot ${row.snapshot_id} hash mismatch`);
      }

      if (!verifyHexDigestAny(row.snapshot_hash, row.signature, monitorKeys)) {
        errors.push(`Snapshot ${row.snapshot_id} signature invalid`);
      }
    }

    return {
      ok: errors.length === 0,
      errors
    };
  }
}

/* ── Factory ──────────────────────────────────────────────────────── */

export function createScoreHistoryStore(workspace: string): ScoreHistoryStore {
  return new ScoreHistoryStore(workspace);
}
