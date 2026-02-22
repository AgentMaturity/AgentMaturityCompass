/**
 * Closed-Loop Trace Learning — Correction Memory
 *
 * Bridges the gap between AMC's correction tracking and prompt injection:
 * - Extracts verified effective corrections into structured "lessons"
 * - Formats lessons for injection into prompt packs (checkpoints.currentAdvisories)
 * - Tracks whether injected lessons measurably improve future runs
 * - Detects correction drift (injected lessons becoming stale or counterproductive)
 *
 * This is the "self-modifying inference" concept from ETP: corrections from one
 * session measurably improve the next.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import type { DiagnosticReport } from "../types.js";
import type { CorrectionEvent, CorrectionEffectivenessReport } from "../corrections/correctionTypes.js";
import {
  getCorrectionsByAgent,
  getVerifiedCorrections,
  getCorrectionsByWindow
} from "../corrections/correctionStore.js";
import { computeEffectivenessReport } from "../corrections/correctionTracker.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LessonStatus = "ACTIVE" | "STALE" | "REVOKED" | "SUPERSEDED";

export interface CorrectionLesson {
  lessonId: string;
  agentId: string;
  correctionId: string; // source correction that proved effective
  questionIds: string[];
  lessonText: string; // human-readable lesson
  advisorySeverity: "INFO" | "WARN" | "CRITICAL";
  advisoryCategory: string;
  createdTs: number;
  expiryTs: number; // TTL for auto-staleness
  status: LessonStatus;
  injectionCount: number; // how many times injected into prompt packs
  lastInjectedTs: number | null;
  // Effectiveness tracking
  postInjectionRunIds: string[];
  avgImprovementPostInjection: number | null;
  driftDetected: boolean;
  // Integrity
  prev_lesson_hash: string;
  lesson_hash: string;
  signature: string;
}

export interface LessonInjectionPayload {
  advisoryId: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  category: string;
  summary: string;
}

export interface CorrectionMemoryConfig {
  maxActiveLessons: number;
  lessonTtlDays: number;
  minEffectivenessForLesson: number; // min effectiveness score to promote to lesson
  maxInjectionsPerPack: number;
  driftThresholdRuns: number; // after how many injections to check for drift
  driftRegressionThreshold: number; // regression amount to flag drift
}

export interface CorrectionMemoryReport {
  reportId: string;
  agentId: string;
  ts: number;
  activeLessons: number;
  staleLessons: number;
  revokedLessons: number;
  totalInjections: number;
  avgImprovementAcrossLessons: number;
  driftingLessons: string[]; // lessonIds with drift
  lessonSummaries: Array<{
    lessonId: string;
    lessonText: string;
    status: LessonStatus;
    injectionCount: number;
    avgImprovement: number | null;
    driftDetected: boolean;
  }>;
  effectivenessReport: CorrectionEffectivenessReport | null;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export function defaultCorrectionMemoryConfig(): CorrectionMemoryConfig {
  return {
    maxActiveLessons: 20,
    lessonTtlDays: 90,
    minEffectivenessForLesson: 0.3,
    maxInjectionsPerPack: 10,
    driftThresholdRuns: 5,
    driftRegressionThreshold: -0.5,
  };
}

// ---------------------------------------------------------------------------
// SQLite store for lessons
// ---------------------------------------------------------------------------

export function initLessonTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS correction_lessons (
      lesson_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      correction_id TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      lesson_text TEXT NOT NULL,
      advisory_severity TEXT NOT NULL CHECK (advisory_severity IN ('INFO', 'WARN', 'CRITICAL')),
      advisory_category TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      expiry_ts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STALE', 'REVOKED', 'SUPERSEDED')),
      injection_count INTEGER NOT NULL DEFAULT 0 CHECK (injection_count >= 0),
      last_injected_ts INTEGER,
      post_injection_run_ids_json TEXT NOT NULL DEFAULT '[]',
      avg_improvement_post_injection REAL,
      drift_detected INTEGER NOT NULL DEFAULT 0 CHECK (drift_detected IN (0, 1)),
      prev_lesson_hash TEXT NOT NULL,
      lesson_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      CHECK (expiry_ts >= created_ts)
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_agent ON correction_lessons(agent_id);
    CREATE INDEX IF NOT EXISTS idx_lessons_status ON correction_lessons(status);
    CREATE INDEX IF NOT EXISTS idx_lessons_expiry ON correction_lessons(expiry_ts);
    CREATE INDEX IF NOT EXISTS idx_lessons_agent_status_expiry ON correction_lessons(agent_id, status, expiry_ts);
    CREATE INDEX IF NOT EXISTS idx_lessons_correction ON correction_lessons(correction_id);
  `);
}

function rowToLesson(row: Record<string, unknown>): CorrectionLesson {
  return {
    lessonId: row.lesson_id as string,
    agentId: row.agent_id as string,
    correctionId: row.correction_id as string,
    questionIds: JSON.parse(row.question_ids_json as string),
    lessonText: row.lesson_text as string,
    advisorySeverity: row.advisory_severity as "INFO" | "WARN" | "CRITICAL",
    advisoryCategory: row.advisory_category as string,
    createdTs: row.created_ts as number,
    expiryTs: row.expiry_ts as number,
    status: row.status as LessonStatus,
    injectionCount: row.injection_count as number,
    lastInjectedTs: row.last_injected_ts as number | null,
    postInjectionRunIds: JSON.parse(row.post_injection_run_ids_json as string),
    avgImprovementPostInjection: row.avg_improvement_post_injection as number | null,
    driftDetected: (row.drift_detected as number) === 1,
    prev_lesson_hash: row.prev_lesson_hash as string,
    lesson_hash: row.lesson_hash as string,
    signature: row.signature as string,
  };
}

export function insertLesson(db: Database.Database, lesson: CorrectionLesson): void {
  const stmt = db.prepare(`
    INSERT INTO correction_lessons (
      lesson_id, agent_id, correction_id, question_ids_json,
      lesson_text, advisory_severity, advisory_category,
      created_ts, expiry_ts, status, injection_count,
      last_injected_ts, post_injection_run_ids_json,
      avg_improvement_post_injection, drift_detected,
      prev_lesson_hash, lesson_hash, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    lesson.lessonId,
    lesson.agentId,
    lesson.correctionId,
    JSON.stringify(lesson.questionIds),
    lesson.lessonText,
    lesson.advisorySeverity,
    lesson.advisoryCategory,
    lesson.createdTs,
    lesson.expiryTs,
    lesson.status,
    lesson.injectionCount,
    lesson.lastInjectedTs,
    JSON.stringify(lesson.postInjectionRunIds),
    lesson.avgImprovementPostInjection,
    lesson.driftDetected ? 1 : 0,
    lesson.prev_lesson_hash,
    lesson.lesson_hash,
    lesson.signature,
  );
}

export function getActiveLessons(db: Database.Database, agentId: string): CorrectionLesson[] {
  const rows = db
    .prepare("SELECT * FROM correction_lessons WHERE agent_id = ? AND status = 'ACTIVE' ORDER BY created_ts DESC")
    .all(agentId) as Array<Record<string, unknown>>;
  return rows.map(rowToLesson);
}

export function getLessonById(db: Database.Database, lessonId: string): CorrectionLesson | null {
  const row = db
    .prepare("SELECT * FROM correction_lessons WHERE lesson_id = ?")
    .get(lessonId) as Record<string, unknown> | undefined;
  return row ? rowToLesson(row) : null;
}

export function getAllLessons(db: Database.Database, agentId: string): CorrectionLesson[] {
  const rows = db
    .prepare("SELECT * FROM correction_lessons WHERE agent_id = ? ORDER BY created_ts DESC")
    .all(agentId) as Array<Record<string, unknown>>;
  return rows.map(rowToLesson);
}

export function getLastLessonHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare("SELECT lesson_hash FROM correction_lessons WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as { lesson_hash: string } | undefined;
  return row?.lesson_hash ?? "GENESIS_LESSON";
}

export function updateLessonStatus(
  db: Database.Database,
  lessonId: string,
  status: LessonStatus,
): void {
  db.prepare("UPDATE correction_lessons SET status = ? WHERE lesson_id = ?").run(status, lessonId);
}

export function updateLessonInjection(
  db: Database.Database,
  lessonId: string,
  injectedTs: number,
): void {
  db.prepare(`
    UPDATE correction_lessons
    SET injection_count = injection_count + 1, last_injected_ts = ?
    WHERE lesson_id = ?
  `).run(injectedTs, lessonId);
}

export function updateLessonPostInjectionRun(
  db: Database.Database,
  lessonId: string,
  runId: string,
  avgImprovement: number | null,
  driftDetected: boolean,
): void {
  const existing = getLessonById(db, lessonId);
  if (!existing) return;

  const runIds = [...existing.postInjectionRunIds, runId].slice(-20); // keep last 20

  db.prepare(`
    UPDATE correction_lessons
    SET post_injection_run_ids_json = ?,
        avg_improvement_post_injection = ?,
        drift_detected = ?
    WHERE lesson_id = ?
  `).run(
    JSON.stringify(runIds),
    avgImprovement,
    driftDetected ? 1 : 0,
    lessonId,
  );
}

// ---------------------------------------------------------------------------
// Lesson extraction from corrections
// ---------------------------------------------------------------------------

function correctionToLessonText(correction: CorrectionEvent): string {
  const questionList = correction.questionIds.join(", ");
  const effectScore = correction.effectivenessScore
    ? ` (effectiveness: ${(correction.effectivenessScore * 100).toFixed(0)}%)`
    : "";
  return `[${correction.triggerType}] ${correction.correctionDescription} — Applied: ${correction.appliedAction}. Affected: ${questionList}${effectScore}`;
}

function triggerTypeToCategory(triggerType: string): string {
  switch (triggerType) {
    case "ASSURANCE_FAILURE": return "safety";
    case "DRIFT_EVENT": return "regression";
    case "EXPERIMENT_RESULT": return "optimization";
    case "INCIDENT_RESPONSE": return "incident";
    case "POLICY_CHANGE": return "governance";
    case "OWNER_MANUAL": return "correction";
    default: return "general";
  }
}

function triggerTypeToSeverity(triggerType: string): "INFO" | "WARN" | "CRITICAL" {
  switch (triggerType) {
    case "ASSURANCE_FAILURE": return "CRITICAL";
    case "INCIDENT_RESPONSE": return "CRITICAL";
    case "DRIFT_EVENT": return "WARN";
    case "POLICY_CHANGE": return "WARN";
    case "EXPERIMENT_RESULT": return "INFO";
    case "OWNER_MANUAL": return "INFO";
    default: return "INFO";
  }
}

/**
 * Extract new lessons from verified effective corrections that don't already have lessons.
 */
export function extractLessonsFromCorrections(
  db: Database.Database,
  agentId: string,
  workspace: string,
  config?: Partial<CorrectionMemoryConfig>,
): CorrectionLesson[] {
  const cfg = { ...defaultCorrectionMemoryConfig(), ...config };
  const verified = getVerifiedCorrections(db, agentId);
  const effectiveCorrections = verified.filter(
    (c) =>
      c.status === "VERIFIED_EFFECTIVE" &&
      c.effectivenessScore !== null &&
      c.effectivenessScore >= cfg.minEffectivenessForLesson,
  );

  // Check which corrections already have lessons
  const existingLessonCorrectionIds = new Set(
    getAllLessons(db, agentId).map((l) => l.correctionId),
  );

  const newCorrections = effectiveCorrections.filter(
    (c) => !existingLessonCorrectionIds.has(c.correctionId),
  );

  const now = Date.now();
  const ttlMs = cfg.lessonTtlDays * 24 * 60 * 60 * 1000;
  const created: CorrectionLesson[] = [];

  for (const correction of newCorrections) {
    // Enforce max active lessons
    const activeLessons = getActiveLessons(db, agentId);
    if (activeLessons.length >= cfg.maxActiveLessons) {
      break;
    }

    const prevHash = getLastLessonHash(db, agentId);
    const lessonId = `lsn_${randomUUID().slice(0, 12)}`;
    const lessonText = correctionToLessonText(correction);

    const lessonBody = {
      lessonId,
      agentId,
      correctionId: correction.correctionId,
      questionIds: correction.questionIds,
      lessonText,
      advisorySeverity: triggerTypeToSeverity(correction.triggerType),
      advisoryCategory: triggerTypeToCategory(correction.triggerType),
      createdTs: now,
      expiryTs: now + ttlMs,
      status: "ACTIVE" as LessonStatus,
      injectionCount: 0,
      lastInjectedTs: null,
      postInjectionRunIds: [],
      avgImprovementPostInjection: null,
      driftDetected: false,
    };

    const hashPayload = canonicalize({ ...lessonBody, prev_lesson_hash: prevHash });
    const lessonHash = sha256Hex(hashPayload);
    let signature = "unsigned";
    try {
      signature = signHexDigest(lessonHash, getPrivateKeyPem(workspace, "monitor"));
    } catch {
      // No key available
    }

    const lesson: CorrectionLesson = {
      ...lessonBody,
      prev_lesson_hash: prevHash,
      lesson_hash: lessonHash,
      signature,
    };

    insertLesson(db, lesson);
    created.push(lesson);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Lesson injection into prompt pack advisories
// ---------------------------------------------------------------------------

/**
 * Build advisory payloads from active lessons for injection into prompt packs.
 */
export function buildLessonAdvisories(
  db: Database.Database,
  agentId: string,
  config?: Partial<CorrectionMemoryConfig>,
): LessonInjectionPayload[] {
  const cfg = { ...defaultCorrectionMemoryConfig(), ...config };
  const now = Date.now();

  const activeLessons = getActiveLessons(db, agentId);

  // Sort by severity (CRITICAL first), then by creation time (newest first)
  const prioritySorted = activeLessons
    .filter((l) => l.expiryTs > now) // exclude stale
    .sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARN: 1, INFO: 2 };
      const aOrder = severityOrder[a.advisorySeverity] ?? 3;
      const bOrder = severityOrder[b.advisorySeverity] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.createdTs - a.createdTs;
    })
    .slice(0, cfg.maxInjectionsPerPack);

  const advisories: LessonInjectionPayload[] = [];

  for (const lesson of prioritySorted) {
    advisories.push({
      advisoryId: lesson.lessonId,
      severity: lesson.advisorySeverity,
      category: lesson.advisoryCategory,
      summary: lesson.lessonText,
    });

    // Track injection
    updateLessonInjection(db, lesson.lessonId, now);
  }

  return advisories;
}

// ---------------------------------------------------------------------------
// Staleness and drift detection
// ---------------------------------------------------------------------------

/**
 * Auto-expire lessons past their TTL.
 */
export function expireStaleLessons(db: Database.Database, agentId: string): string[] {
  const now = Date.now();
  const active = getActiveLessons(db, agentId);
  const expired: string[] = [];

  for (const lesson of active) {
    if (lesson.expiryTs <= now) {
      updateLessonStatus(db, lesson.lessonId, "STALE");
      expired.push(lesson.lessonId);
    }
  }

  return expired;
}

/**
 * Detect drift: a lesson that was effective but is now causing regression.
 * Compares the average improvement before and after injection over recent runs.
 */
export function detectLessonDrift(
  db: Database.Database,
  agentId: string,
  latestReport: DiagnosticReport,
  config?: Partial<CorrectionMemoryConfig>,
): string[] {
  const cfg = { ...defaultCorrectionMemoryConfig(), ...config };
  const activeLessons = getActiveLessons(db, agentId);
  const driftingLessons: string[] = [];

  for (const lesson of activeLessons) {
    if (lesson.injectionCount < cfg.driftThresholdRuns) {
      continue; // Not enough data
    }

    // Check if the questions this lesson covers have regressed
    let totalDelta = 0;
    let count = 0;

    for (const questionId of lesson.questionIds) {
      const score = latestReport.questionScores.find((q) => q.questionId === questionId);
      if (!score) continue;

      // Compare current level against what the correction originally achieved
      // If we're now BELOW the original baseline, the lesson might be causing drift
      const currentLevel = score.finalLevel;
      const avgPostInjection = lesson.avgImprovementPostInjection ?? 0;

      // Simple heuristic: if improvement is negative and significant
      totalDelta += avgPostInjection;
      count++;
    }

    if (count > 0) {
      const avgDelta = totalDelta / count;
      if (avgDelta < cfg.driftRegressionThreshold) {
        updateLessonPostInjectionRun(db, lesson.lessonId, latestReport.runId, avgDelta, true);
        driftingLessons.push(lesson.lessonId);
      } else {
        updateLessonPostInjectionRun(db, lesson.lessonId, latestReport.runId, avgDelta, false);
      }
    }
  }

  return driftingLessons;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

export function generateCorrectionMemoryReport(
  db: Database.Database,
  agentId: string,
  windowStartTs: number,
  windowEndTs: number,
): CorrectionMemoryReport {
  const allLessons = getAllLessons(db, agentId);
  const activeLessons = allLessons.filter((l) => l.status === "ACTIVE");
  const staleLessons = allLessons.filter((l) => l.status === "STALE");
  const revokedLessons = allLessons.filter((l) => l.status === "REVOKED");

  const totalInjections = allLessons.reduce((sum, l) => sum + l.injectionCount, 0);
  const improvementValues = allLessons
    .filter((l) => l.avgImprovementPostInjection !== null)
    .map((l) => l.avgImprovementPostInjection!);
  const avgImprovement =
    improvementValues.length > 0
      ? improvementValues.reduce((a, b) => a + b, 0) / improvementValues.length
      : 0;

  const driftingLessons = allLessons
    .filter((l) => l.driftDetected && l.status === "ACTIVE")
    .map((l) => l.lessonId);

  let effectivenessReport: CorrectionEffectivenessReport | null = null;
  try {
    effectivenessReport = computeEffectivenessReport(db, agentId, windowStartTs, windowEndTs);
  } catch {
    /* corrections table might not exist */
  }

  const recommendations: string[] = [];
  if (driftingLessons.length > 0) {
    recommendations.push(
      `${driftingLessons.length} lesson(s) show drift — consider revoking or refreshing them.`,
    );
  }
  if (activeLessons.length === 0) {
    recommendations.push("No active lessons. Run extractLessonsFromCorrections to promote verified corrections.");
  }
  if (staleLessons.length > activeLessons.length) {
    recommendations.push("More stale lessons than active. Consider running new corrections or extending TTL.");
  }

  return {
    reportId: `cmr_${randomUUID().slice(0, 12)}`,
    agentId,
    ts: Date.now(),
    activeLessons: activeLessons.length,
    staleLessons: staleLessons.length,
    revokedLessons: revokedLessons.length,
    totalInjections,
    avgImprovementAcrossLessons: avgImprovement,
    driftingLessons,
    lessonSummaries: allLessons.map((l) => ({
      lessonId: l.lessonId,
      lessonText: l.lessonText,
      status: l.status,
      injectionCount: l.injectionCount,
      avgImprovement: l.avgImprovementPostInjection,
      driftDetected: l.driftDetected,
    })),
    effectivenessReport,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function renderCorrectionMemoryMarkdown(report: CorrectionMemoryReport): string {
  const lines: string[] = [
    "# Correction Memory Report",
    "",
    `- Report ID: ${report.reportId}`,
    `- Agent: ${report.agentId}`,
    `- Timestamp: ${new Date(report.ts).toISOString()}`,
    "",
    "## Summary",
    `- Active lessons: ${report.activeLessons}`,
    `- Stale lessons: ${report.staleLessons}`,
    `- Revoked lessons: ${report.revokedLessons}`,
    `- Total injections: ${report.totalInjections}`,
    `- Avg improvement: ${report.avgImprovementAcrossLessons.toFixed(3)}`,
    `- Drifting lessons: ${report.driftingLessons.length}`,
    "",
  ];

  if (report.lessonSummaries.length > 0) {
    lines.push("## Lessons");
    lines.push("| ID | Status | Injections | Avg Improvement | Drift | Text |");
    lines.push("|---|---|---:|---:|---|---|");
    for (const l of report.lessonSummaries) {
      const improvement = l.avgImprovement !== null ? l.avgImprovement.toFixed(3) : "-";
      const drift = l.driftDetected ? "YES" : "-";
      const text = l.lessonText.length > 80 ? `${l.lessonText.slice(0, 77)}...` : l.lessonText;
      lines.push(`| ${l.lessonId} | ${l.status} | ${l.injectionCount} | ${improvement} | ${drift} | ${text} |`);
    }
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("## Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  if (report.effectivenessReport) {
    const er = report.effectivenessReport;
    lines.push("## Correction Effectiveness");
    lines.push(`- Total corrections: ${er.totalCorrections}`);
    lines.push(`- Verified: ${er.verifiedCorrections}`);
    lines.push(`- Effective: ${er.effectiveCorrections}`);
    lines.push(`- Ineffective: ${er.ineffectiveCorrections}`);
    lines.push(`- Pending: ${er.pendingCorrections}`);
    lines.push(`- Effectiveness ratio: ${(er.overallEffectivenessRatio * 100).toFixed(1)}%`);
    lines.push("");
  }

  return lines.join("\n");
}
