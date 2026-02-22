/**
 * Lesson Learned Database
 *
 * Aggregates corrections into transferable lessons.
 * When a correction pattern recurs, promotes to reusable remediation template.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, getPrivateKeyPem } from "../crypto/keys.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { getCorrectionById } from "./correctionStore.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Lesson {
  lessonId: string;
  patternDescription: string;
  affectedQuestions: string[];
  remediationSteps: string[];
  effectivenessScore: number;    // average effectiveness of source corrections
  occurrenceCount: number;
  agentsAffected: string[];
  sourceCorrectionIds: string[];
  createdTs: number;
  updatedTs: number;
  prev_lesson_hash: string;
  lesson_hash: string;
  signature: string;
}

export interface LessonPromotionResult {
  lesson: Lesson;
  isNew: boolean;
  merged: boolean;
}

const lessonSchema = z.object({
  lessonId: z.string(),
  patternDescription: z.string(),
  affectedQuestions: z.array(z.string()),
  remediationSteps: z.array(z.string()),
  effectivenessScore: z.number(),
  occurrenceCount: z.number().int().nonnegative(),
  agentsAffected: z.array(z.string()),
  sourceCorrectionIds: z.array(z.string()),
  createdTs: z.number(),
  updatedTs: z.number(),
  prev_lesson_hash: z.string(),
  lesson_hash: z.string(),
  signature: z.string()
}).strict();

function parseLessonJson(raw: string, source: string): Lesson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid lesson JSON in ${source}`);
  }
  const result = lessonSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? "schema mismatch";
    throw new Error(`Invalid lesson format in ${source}: ${detail}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// File-based Lesson Store (.amc/corrections/lessons/)
// ---------------------------------------------------------------------------

function lessonsDir(workspace: string): string {
  return join(workspace, ".amc", "corrections", "lessons");
}

function lessonFilePath(workspace: string, lessonId: string): string {
  return join(lessonsDir(workspace), `${lessonId}.json`);
}

export function loadAllLessons(workspace: string): Lesson[] {
  const dir = lessonsDir(workspace);
  if (!pathExists(dir)) return [];
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
  return files.map((f: string) => {
    const content = readUtf8(join(dir, f));
    return parseLessonJson(content, join(dir, f));
  });
}

export function loadLesson(workspace: string, lessonId: string): Lesson | null {
  const file = lessonFilePath(workspace, lessonId);
  if (!pathExists(file)) return null;
  return parseLessonJson(readUtf8(file), file);
}

function getLastLessonHash(workspace: string): string {
  const lessons = loadAllLessons(workspace);
  if (lessons.length === 0) return "GENESIS_LESSONS";
  const sorted = lessons.sort((a, b) => a.createdTs - b.createdTs);
  return sorted[sorted.length - 1]!.lesson_hash;
}

function computeLessonHash(lesson: Omit<Lesson, "lesson_hash" | "signature">): string {
  return sha256Hex(canonicalize({
    lessonId: lesson.lessonId,
    patternDescription: lesson.patternDescription,
    affectedQuestions: lesson.affectedQuestions,
    remediationSteps: lesson.remediationSteps,
    effectivenessScore: lesson.effectivenessScore,
    occurrenceCount: lesson.occurrenceCount,
    agentsAffected: lesson.agentsAffected,
    sourceCorrectionIds: lesson.sourceCorrectionIds,
    createdTs: lesson.createdTs,
    updatedTs: lesson.updatedTs,
    prev_lesson_hash: lesson.prev_lesson_hash,
  }));
}

function saveLesson(workspace: string, lesson: Lesson): void {
  const dir = lessonsDir(workspace);
  ensureDir(dir);
  writeFileAtomic(lessonFilePath(workspace, lesson.lessonId), JSON.stringify(lesson, null, 2), 0o644);
}

// ---------------------------------------------------------------------------
// Promotion: Correction → Lesson
// ---------------------------------------------------------------------------

/**
 * Promote a correction into a lesson (or merge with existing lesson if pattern matches).
 */
export function promoteCorrection(
  db: Database.Database,
  correctionId: string,
  workspace: string,
): LessonPromotionResult {
  const correction = getCorrectionById(db, correctionId);
  if (!correction) {
    throw new Error(`Correction not found: ${correctionId}`);
  }

  // Check if an existing lesson covers similar questions
  const existingLessons = loadAllLessons(workspace);
  const matchingLesson = existingLessons.find((l) => {
    const overlap = l.affectedQuestions.filter((q) => correction.questionIds.includes(q));
    return overlap.length > 0 && l.patternDescription.includes(correction.triggerType);
  });

  if (matchingLesson) {
    // Merge into existing lesson
    const now = Date.now();
    const newQuestions = [...new Set([...matchingLesson.affectedQuestions, ...correction.questionIds])];
    const newAgents = [...new Set([...matchingLesson.agentsAffected, correction.agentId])];
    const newCorrectionIds = [...new Set([...matchingLesson.sourceCorrectionIds, correctionId])];
    const newEffectiveness = correction.effectivenessScore !== null
      ? (matchingLesson.effectivenessScore * matchingLesson.occurrenceCount + correction.effectivenessScore) / (matchingLesson.occurrenceCount + 1)
      : matchingLesson.effectivenessScore;

    const updated: Omit<Lesson, "lesson_hash" | "signature"> = {
      ...matchingLesson,
      affectedQuestions: newQuestions,
      agentsAffected: newAgents,
      sourceCorrectionIds: newCorrectionIds,
      occurrenceCount: matchingLesson.occurrenceCount + 1,
      effectivenessScore: Number(newEffectiveness.toFixed(4)),
      updatedTs: now,
    };

    const lessonHash = computeLessonHash(updated);
    let signature = "unsigned";
    try {
      signature = signHexDigest(lessonHash, getPrivateKeyPem(workspace, "monitor"));
    } catch { /* no key */ }

    const lesson: Lesson = { ...updated, lesson_hash: lessonHash, signature };
    saveLesson(workspace, lesson);
    return { lesson, isNew: false, merged: true };
  }

  // Create new lesson
  const now = Date.now();
  const lessonId = `les_${randomUUID().slice(0, 12)}`;
  const prevHash = getLastLessonHash(workspace);

  const base: Omit<Lesson, "lesson_hash" | "signature"> = {
    lessonId,
    patternDescription: `[${correction.triggerType}] ${correction.correctionDescription}`,
    affectedQuestions: correction.questionIds,
    remediationSteps: [correction.appliedAction],
    effectivenessScore: correction.effectivenessScore ?? 0,
    occurrenceCount: 1,
    agentsAffected: [correction.agentId],
    sourceCorrectionIds: [correctionId],
    createdTs: now,
    updatedTs: now,
    prev_lesson_hash: prevHash,
  };

  const lessonHash = computeLessonHash(base);
  let signature = "unsigned";
  try {
    signature = signHexDigest(lessonHash, getPrivateKeyPem(workspace, "monitor"));
  } catch { /* no key */ }

  const lesson: Lesson = { ...base, lesson_hash: lessonHash, signature };
  saveLesson(workspace, lesson);
  return { lesson, isNew: true, merged: false };
}

// ---------------------------------------------------------------------------
// Fleet-wide Lesson Queries
// ---------------------------------------------------------------------------

export function listLessons(
  workspace: string,
  scope: "fleet" | "agent",
  agentId?: string,
): Lesson[] {
  const all = loadAllLessons(workspace);
  if (scope === "fleet") return all.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  if (agentId) {
    return all.filter((l) => l.agentsAffected.includes(agentId)).sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderLessonsMarkdown(lessons: Lesson[], scope: string): string {
  const lines: string[] = [
    "# Lessons Learned",
    "",
    `Scope: ${scope}`,
    `Total lessons: ${lessons.length}`,
    "",
  ];

  if (lessons.length === 0) {
    lines.push("No lessons found.");
    return lines.join("\n");
  }

  for (const l of lessons) {
    lines.push(`## ${l.lessonId}`);
    lines.push(`- Pattern: ${l.patternDescription}`);
    lines.push(`- Questions: ${l.affectedQuestions.join(", ")}`);
    lines.push(`- Agents: ${l.agentsAffected.join(", ")}`);
    lines.push(`- Occurrences: ${l.occurrenceCount}`);
    lines.push(`- Effectiveness: ${(l.effectivenessScore * 100).toFixed(1)}%`);
    lines.push(`- Remediation: ${l.remediationSteps.join("; ")}`);
    lines.push("");
  }

  return lines.join("\n");
}
