/**
 * Confidence Drift Tracking
 *
 * Time-series tracking of confidence per question across diagnostic runs.
 * Detects degradation even when maturity level is unchanged ("slowly going blind").
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Claim } from "./claimTypes.js";
import { getClaimsByQuestion, getClaimsByAgent } from "./claimStore.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriftSeverity = "OK" | "WARN" | "CRITICAL";

export interface ConfidenceSnapshot {
  questionId: string;
  runId: string;
  ts: number;
  confidence: number;
  claimedLevel: number;
  claimId: string;
}

export interface ConfidenceDriftResult {
  questionId: string;
  severity: DriftSeverity;
  currentConfidence: number;
  windowStartConfidence: number;
  delta: number;
  trend: "STABLE" | "DECLINING" | "IMPROVING";
  snapshots: ConfidenceSnapshot[];
  alertMessage: string | null;
}

export interface ConfidenceDriftReport {
  reportId: string;
  agentId: string;
  windowMs: number;
  ts: number;
  results: ConfidenceDriftResult[];
  criticalCount: number;
  warnCount: number;
  okCount: number;
  advisories: string[];
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const WARN_THRESHOLD = 0.15;
export const CRITICAL_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * Build confidence history for a question from claim records.
 */
export function buildConfidenceHistory(
  db: Database.Database,
  agentId: string,
  questionId: string,
): ConfidenceSnapshot[] {
  const claims = getClaimsByQuestion(db, agentId, questionId);
  // Claims come sorted DESC by createdTs; reverse for chronological order
  return claims
    .filter((c) => c.lifecycleState !== "REVOKED")
    .sort((a, b) => a.createdTs - b.createdTs)
    .map((c) => ({
      questionId: c.questionId,
      runId: c.runId,
      ts: c.createdTs,
      confidence: c.confidence,
      claimedLevel: c.claimedLevel,
      claimId: c.claimId,
    }));
}

/**
 * Analyze confidence drift for a single question within a time window.
 */
export function analyzeQuestionDrift(
  snapshots: ConfidenceSnapshot[],
  windowMs: number,
  now?: number,
): ConfidenceDriftResult {
  const ts = now ?? Date.now();
  const cutoff = ts - windowMs;
  const inWindow = snapshots.filter((s) => s.ts >= cutoff);
  const questionId = snapshots[0]?.questionId ?? "unknown";

  if (inWindow.length < 2) {
    return {
      questionId,
      severity: "OK",
      currentConfidence: inWindow[inWindow.length - 1]?.confidence ?? 0,
      windowStartConfidence: inWindow[0]?.confidence ?? 0,
      delta: 0,
      trend: "STABLE",
      snapshots: inWindow,
      alertMessage: null,
    };
  }

  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const delta = last.confidence - first.confidence;

  let severity: DriftSeverity = "OK";
  let alertMessage: string | null = null;
  let trend: "STABLE" | "DECLINING" | "IMPROVING" = "STABLE";

  if (delta < -CRITICAL_THRESHOLD) {
    severity = "CRITICAL";
    trend = "DECLINING";
    alertMessage = `CRITICAL: ${questionId} confidence dropped ${Math.abs(delta).toFixed(3)} (from ${first.confidence.toFixed(3)} to ${last.confidence.toFixed(3)}) in window`;
  } else if (delta < -WARN_THRESHOLD) {
    severity = "WARN";
    trend = "DECLINING";
    alertMessage = `WARN: ${questionId} confidence dropped ${Math.abs(delta).toFixed(3)} (from ${first.confidence.toFixed(3)} to ${last.confidence.toFixed(3)}) in window`;
  } else if (delta > WARN_THRESHOLD) {
    trend = "IMPROVING";
  }

  return {
    questionId,
    severity,
    currentConfidence: last.confidence,
    windowStartConfidence: first.confidence,
    delta,
    trend,
    snapshots: inWindow,
    alertMessage,
  };
}

/**
 * Run confidence drift analysis for all questions for an agent.
 */
export function analyzeAgentConfidenceDrift(
  db: Database.Database,
  agentId: string,
  windowMs: number,
  now?: number,
): ConfidenceDriftReport {
  const ts = now ?? Date.now();
  const allClaims = getClaimsByAgent(db, agentId);

  // Get unique question IDs
  const questionIds = [...new Set(allClaims.map((c) => c.questionId))];

  const results: ConfidenceDriftResult[] = [];
  for (const qid of questionIds) {
    const history = buildConfidenceHistory(db, agentId, qid);
    if (history.length > 0) {
      results.push(analyzeQuestionDrift(history, windowMs, ts));
    }
  }

  const criticalCount = results.filter((r) => r.severity === "CRITICAL").length;
  const warnCount = results.filter((r) => r.severity === "WARN").length;
  const okCount = results.filter((r) => r.severity === "OK").length;

  const advisories: string[] = [];
  if (criticalCount > 0) {
    advisories.push(`${criticalCount} question(s) have CRITICAL confidence drift. Immediate investigation recommended.`);
  }
  if (warnCount > 0) {
    advisories.push(`${warnCount} question(s) show WARNING-level confidence degradation. Schedule re-verification.`);
  }
  const declining = results.filter((r) => r.trend === "DECLINING");
  if (declining.length > results.length * 0.5 && results.length > 3) {
    advisories.push("More than 50% of questions show declining confidence. Systemic issue suspected.");
  }

  return {
    reportId: `cdr_${randomUUID().slice(0, 12)}`,
    agentId,
    windowMs,
    ts,
    results: results.sort((a, b) => a.delta - b.delta), // worst first
    criticalCount,
    warnCount,
    okCount,
    advisories,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderConfidenceDriftMarkdown(report: ConfidenceDriftReport): string {
  const lines: string[] = [
    "# Confidence Drift Report",
    "",
    `- Report: ${report.reportId}`,
    `- Agent: ${report.agentId}`,
    `- Window: ${Math.round(report.windowMs / (24 * 60 * 60 * 1000))}d`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    "",
    `## Summary`,
    `- CRITICAL: ${report.criticalCount}`,
    `- WARN: ${report.warnCount}`,
    `- OK: ${report.okCount}`,
    "",
  ];

  if (report.advisories.length > 0) {
    lines.push("## Advisories");
    for (const a of report.advisories) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  const nonOk = report.results.filter((r) => r.severity !== "OK");
  if (nonOk.length > 0) {
    lines.push("## Drift Details");
    for (const r of nonOk) {
      lines.push(`### ${r.questionId} [${r.severity}]`);
      lines.push(`- Current confidence: ${r.currentConfidence.toFixed(3)}`);
      lines.push(`- Window start: ${r.windowStartConfidence.toFixed(3)}`);
      lines.push(`- Delta: ${r.delta.toFixed(3)}`);
      lines.push(`- Trend: ${r.trend}`);
      if (r.alertMessage) lines.push(`- Alert: ${r.alertMessage}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
