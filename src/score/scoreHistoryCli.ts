/**
 * scoreHistoryCli.ts — CLI commands for score history & regression testing
 */

import { createScoreHistoryStore } from "./scoreHistory.js";
import { formatDistanceToNow } from "date-fns";

export interface ScoreHistoryCliOptions {
  workspace: string;
}

/**
 * Record a score snapshot
 */
export function recordScoreSnapshot(options: ScoreHistoryCliOptions & {
  agentId: string;
  dimensionScores: Record<string, number>;
  overallScore: number;
  level: number;
  metadata?: Record<string, unknown>;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  const snapshot = store.recordSnapshot({
    agentId: options.agentId,
    dimensionScores: options.dimensionScores,
    overallScore: options.overallScore,
    level: options.level,
    metadata: options.metadata
  });

  console.log(`✅ Recorded score snapshot ${snapshot.snapshotId}`);
  console.log(`   Agent: ${snapshot.agentId}`);
  console.log(`   Overall Score: ${snapshot.overallScore.toFixed(2)}`);
  console.log(`   Level: L${snapshot.level}`);
  console.log(`   Dimensions: ${Object.keys(snapshot.dimensionScores).length}`);
}

/**
 * Show score history for an agent
 */
export function showScoreHistory(options: ScoreHistoryCliOptions & {
  agentId: string;
  limit?: number;
  days?: number;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  
  const historyOptions: Parameters<typeof store.getHistory>[1] = {
    limit: options.limit
  };

  if (options.days) {
    const now = Date.now();
    historyOptions.startTs = now - (options.days * 24 * 60 * 60 * 1000);
  }

  const history = store.getHistory(options.agentId, historyOptions);

  if (history.length === 0) {
    console.log(`No score history found for agent ${options.agentId}`);
    return;
  }

  console.log(`\n📊 Score History for ${options.agentId}`);
  console.log(`   ${history.length} snapshots\n`);

  for (const snapshot of history) {
    const timeAgo = formatDistanceToNow(snapshot.snapshotTs, { addSuffix: true });
    console.log(`Snapshot ${snapshot.snapshotId.slice(0, 8)}`);
    console.log(`  Time: ${timeAgo}`);
    console.log(`  Overall: ${snapshot.overallScore.toFixed(2)} (L${snapshot.level})`);
    console.log(`  Dimensions:`);
    
    for (const [dim, score] of Object.entries(snapshot.dimensionScores)) {
      console.log(`    ${dim}: ${score.toFixed(2)}`);
    }
    console.log();
  }
}

/**
 * Check for regressions
 */
export function checkRegressions(options: ScoreHistoryCliOptions & {
  agentId: string;
  minDelta?: number;
  minPercentChange?: number;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  const history = store.getHistory(options.agentId, { limit: 1 });

  if (history.length === 0) {
    console.log(`No score history found for agent ${options.agentId}`);
    return;
  }

  const currentSnapshot = history[0]!;
  const alerts = store.detectRegressions({
    agentId: options.agentId,
    currentSnapshot,
    thresholds: {
      minDelta: options.minDelta,
      minPercentChange: options.minPercentChange
    }
  });

  if (alerts.length === 0) {
    console.log(`✅ No regressions detected for ${options.agentId}`);
    return;
  }

  console.log(`\n⚠️  ${alerts.length} regression(s) detected for ${options.agentId}\n`);

  for (const alert of alerts) {
    const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : alert.severity === 'medium' ? '🟡' : '🟢';
    console.log(`${icon} ${alert.dimension.toUpperCase()} [${alert.severity}]`);
    console.log(`   Before: ${alert.scoreBefore.toFixed(2)}`);
    console.log(`   After:  ${alert.scoreAfter.toFixed(2)}`);
    console.log(`   Delta:  ${alert.delta.toFixed(2)} (${alert.percentChange.toFixed(1)}%)`);
    console.log(`   Alert:  ${alert.alertId.slice(0, 8)}`);
    console.log();
  }
}

/**
 * Show open regression alerts
 */
export function showOpenAlerts(options: ScoreHistoryCliOptions & {
  agentId: string;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  const alerts = store.getOpenAlerts(options.agentId);

  if (alerts.length === 0) {
    console.log(`✅ No open alerts for ${options.agentId}`);
    return;
  }

  console.log(`\n⚠️  ${alerts.length} open alert(s) for ${options.agentId}\n`);

  for (const alert of alerts) {
    const timeAgo = formatDistanceToNow(alert.detectedTs, { addSuffix: true });
    const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : alert.severity === 'medium' ? '🟡' : '🟢';
    
    console.log(`${icon} Alert ${alert.alertId.slice(0, 8)}`);
    console.log(`   Dimension: ${alert.dimension}`);
    console.log(`   Severity: ${alert.severity}`);
    console.log(`   Detected: ${timeAgo}`);
    console.log(`   Change: ${alert.scoreBefore.toFixed(2)} → ${alert.scoreAfter.toFixed(2)} (${alert.percentChange.toFixed(1)}%)`);
    console.log();
  }
}

/**
 * Resolve a regression alert
 */
export function resolveAlert(options: ScoreHistoryCliOptions & {
  alertId: string;
  status: 'resolved' | 'false_positive' | 'acknowledged';
  resolvedBy?: string;
  notes?: string;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  store.updateAlertStatus(options.alertId, options.status, options.resolvedBy, options.notes);
  console.log(`✅ Alert ${options.alertId.slice(0, 8)} marked as ${options.status}`);
}

/**
 * Generate and display trend report
 */
export function showTrendReport(options: ScoreHistoryCliOptions & {
  agentId: string;
  days?: number;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  
  const now = Date.now();
  const windowStartTs = options.days 
    ? now - (options.days * 24 * 60 * 60 * 1000)
    : now - (30 * 24 * 60 * 60 * 1000); // 30 days default

  const report = store.generateTrendReport(options.agentId, {
    windowStartTs,
    windowEndTs: now
  });

  console.log(`\n📈 Trend Report for ${report.agentId}`);
  console.log(`   Window: ${options.days ?? 30} days`);
  console.log(`   Snapshots: ${report.snapshotCount}`);
  console.log(`   Overall Trend: ${report.overallTrend.toUpperCase()}\n`);

  if (report.dimensions.length === 0) {
    console.log(report.summary);
    return;
  }

  console.log(`Dimension Trends:\n`);

  for (const dim of report.dimensions) {
    const icon = dim.trend === 'improving' ? '📈' : dim.trend === 'degrading' ? '📉' : dim.trend === 'volatile' ? '📊' : '➡️';
    const deltaStr = dim.delta >= 0 ? `+${dim.delta.toFixed(2)}` : dim.delta.toFixed(2);
    
    console.log(`${icon} ${dim.dimension}`);
    console.log(`   Trend: ${dim.trend}`);
    console.log(`   Start: ${dim.startScore.toFixed(2)}`);
    console.log(`   End:   ${dim.endScore.toFixed(2)}`);
    console.log(`   Delta: ${deltaStr}`);
    console.log(`   Volatility: ${dim.volatility.toFixed(3)}`);
    console.log();
  }

  console.log(`Summary: ${report.summary}\n`);
}

/**
 * Verify score history integrity
 */
export function verifyScoreHistoryIntegrity(options: ScoreHistoryCliOptions & {
  agentId?: string;
}): void {
  const store = createScoreHistoryStore(options.workspace);
  const result = store.verifyIntegrity(options.agentId);

  if (result.ok) {
    console.log(`✅ Score history integrity verified`);
    if (options.agentId) {
      console.log(`   Agent: ${options.agentId}`);
    }
  } else {
    console.log(`❌ Score history integrity check failed`);
    console.log(`   ${result.errors.length} error(s) found:\n`);
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
    process.exit(1);
  }
}
