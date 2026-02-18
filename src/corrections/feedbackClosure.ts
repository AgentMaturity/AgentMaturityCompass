/**
 * Feedback Loop Closure Verification
 *
 * Ensures corrections are not marked "resolved" until a subsequent
 * diagnostic run shows measurable improvement. Alerts on stale corrections.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { CorrectionEvent, CorrectionStatus } from "./correctionTypes.js";
import type { DiagnosticReport } from "../types.js";
import {
  getCorrectionsByAgent,
  getPendingCorrections,
  getCorrectionById,
} from "./correctionStore.js";
import { verifyCorrection } from "./correctionTracker.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedbackLoopStatus {
  correctionId: string;
  agentId: string;
  status: CorrectionStatus;
  createdTs: number;
  daysSinceApplied: number;
  verified: boolean;
  stale: boolean; // >14 days without verification
  questionIds: string[];
  description: string;
}

export interface FeedbackClosureReport {
  reportId: string;
  ts: number;
  agentId: string;
  totalCorrections: number;
  openLoops: FeedbackLoopStatus[];
  closedLoops: number;
  staleLoops: number;
  alerts: string[];
}

export interface ClosureVerificationResult {
  correctionId: string;
  canClose: boolean;
  reason: string;
  improvementDetected: boolean;
  details: Record<string, { before: number; after: number; delta: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_DAYS = 14;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Check if a correction's feedback loop can be closed based on a diagnostic report.
 * A correction is NOT closeable unless subsequent diagnostics show improvement.
 */
export function checkClosureEligibility(
  db: Database.Database,
  correctionId: string,
  latestReport: DiagnosticReport,
): ClosureVerificationResult {
  const correction = getCorrectionById(db, correctionId);

  if (!correction) {
    return {
      correctionId,
      canClose: false,
      reason: "Correction not found",
      improvementDetected: false,
      details: {},
    };
  }

  if (correction.status === "VERIFIED_EFFECTIVE" || correction.status === "SUPERSEDED") {
    return {
      correctionId,
      canClose: true,
      reason: `Already ${correction.status}`,
      improvementDetected: correction.status === "VERIFIED_EFFECTIVE",
      details: {},
    };
  }

  // Report must be after correction was applied
  if (latestReport.ts <= correction.createdTs) {
    return {
      correctionId,
      canClose: false,
      reason: "No diagnostic run after correction was applied",
      improvementDetected: false,
      details: {},
    };
  }

  const verification = verifyCorrection(correction, latestReport);

  return {
    correctionId,
    canClose: verification.effective,
    reason: verification.effective
      ? `Improvement detected (score: ${verification.score.toFixed(2)})`
      : "No measurable improvement on affected questions",
    improvementDetected: verification.effective,
    details: verification.details,
  };
}

/**
 * Get all open feedback loops for an agent.
 */
export function getOpenFeedbackLoops(db: Database.Database, agentId: string): FeedbackLoopStatus[] {
  const corrections = getCorrectionsByAgent(db, agentId);
  const now = Date.now();
  const loops: FeedbackLoopStatus[] = [];

  for (const c of corrections) {
    if (c.status === "VERIFIED_EFFECTIVE" || c.status === "SUPERSEDED") {
      continue;
    }

    const daysSince = (now - c.createdTs) / (1000 * 60 * 60 * 24);
    const isStale = daysSince > STALE_THRESHOLD_DAYS && (c.status === "APPLIED" || c.status === "PENDING_VERIFICATION");

    loops.push({
      correctionId: c.correctionId,
      agentId: c.agentId,
      status: c.status,
      createdTs: c.createdTs,
      daysSinceApplied: Math.round(daysSince),
      verified: c.verificationRunId !== null,
      stale: isStale,
      questionIds: c.questionIds,
      description: c.correctionDescription,
    });
  }

  return loops.sort((a, b) => a.createdTs - b.createdTs);
}

/**
 * Generate a full feedback closure report for an agent.
 */
export function generateFeedbackClosureReport(db: Database.Database, agentId: string): FeedbackClosureReport {
  const all = getCorrectionsByAgent(db, agentId);
  const openLoops = getOpenFeedbackLoops(db, agentId);
  const closedLoops = all.filter((c) => c.status === "VERIFIED_EFFECTIVE" || c.status === "SUPERSEDED").length;
  const staleLoops = openLoops.filter((l) => l.stale).length;

  const alerts: string[] = [];

  if (staleLoops > 0) {
    alerts.push(`${staleLoops} correction(s) applied >14 days ago without verification. Run diagnostics to verify.`);
  }

  const ineffective = all.filter((c) => c.status === "VERIFIED_INEFFECTIVE").length;
  if (ineffective > 0) {
    alerts.push(`${ineffective} correction(s) verified as ineffective. Review correction strategy.`);
  }

  const pending = openLoops.filter((l) => l.status === "APPLIED" || l.status === "PENDING_VERIFICATION");
  if (pending.length > 3) {
    alerts.push(`${pending.length} corrections awaiting verification. Schedule diagnostic run.`);
  }

  return {
    reportId: `fcr_${randomUUID().slice(0, 12)}`,
    ts: Date.now(),
    agentId,
    totalCorrections: all.length,
    openLoops,
    closedLoops,
    staleLoops,
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderFeedbackClosureReport(report: FeedbackClosureReport): string {
  const lines = [
    "# Feedback Loop Closure Report",
    "",
    `- Agent: ${report.agentId}`,
    `- Total corrections: ${report.totalCorrections}`,
    `- Closed loops: ${report.closedLoops}`,
    `- Open loops: ${report.openLoops.length}`,
    `- Stale (>14d): ${report.staleLoops}`,
    "",
  ];

  if (report.alerts.length > 0) {
    lines.push("## Alerts");
    for (const a of report.alerts) {
      lines.push(`- ⚠️ ${a}`);
    }
    lines.push("");
  }

  if (report.openLoops.length > 0) {
    lines.push("## Open Feedback Loops");
    lines.push("");
    lines.push("| Correction | Status | Age (days) | Stale | Questions |");
    lines.push("|------------|--------|----------:|-------|-----------|");
    for (const l of report.openLoops) {
      lines.push(`| ${l.correctionId.slice(0, 12)}… | ${l.status} | ${l.daysSinceApplied} | ${l.stale ? "⚠️" : "—"} | ${l.questionIds.join(", ")} |`);
    }
    lines.push("");

    const stale = report.openLoops.filter((l) => l.stale);
    if (stale.length > 0) {
      lines.push("## Stale Corrections (Need Verification)");
      for (const l of stale) {
        lines.push(`- **${l.correctionId.slice(0, 12)}…** (${l.daysSinceApplied}d): ${l.description}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
