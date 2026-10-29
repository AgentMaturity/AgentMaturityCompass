import type Database from "better-sqlite3";
import { getCorrectionById } from "../corrections/correctionStore.js";
import { workspaceScope } from "../keys/highWater.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { defaultCorrectionMemoryConfig, initLessonTables, updateLessonInjection, verifyAgentLessons, type CorrectionLesson } from "./correctionMemory.js";
import { lessonTransferRequestSchema, lessonSourceVerifies, type LessonProvenance, type LessonTransferRequest } from "./lessonProvenance.js";

interface LessonTransferReference {
  lessonId: string;
  lessonHash: string;
  sourceAgentId: string;
  correctionId: string;
  provenance: LessonProvenance;
  summary: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  category: string;
}
export interface LessonTransferSelection {
  status: "SELECTED" | "NO_ENTRY";
  request: ReturnType<typeof lessonTransferRequestSchema.parse>;
  lessons: LessonTransferReference[];
  libraryDigestSha256: string;
}

function normalizedRequest(targetAgentId: string, request: LessonTransferRequest) {
  const parsed = lessonTransferRequestSchema.parse({ ...request, sourceAgentIds: request.sourceAgentIds ?? [targetAgentId] });
  return { ...parsed, sourceAgentIds: [...new Set(parsed.sourceAgentIds ?? [targetAgentId])].sort() };
}
function libraryDigest(request: LessonTransferSelection["request"], lessons: readonly LessonTransferReference[]): string {
  return sha256Hex(canonicalize({ request, lessons: lessons.map(({ lessonId, lessonHash, sourceAgentId }) => ({ lessonId, lessonHash, sourceAgentId })) }));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function hasSourceTables(db: Database.Database): boolean {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('correction_lessons', 'correction_lesson_status_log', 'corrections')").all() as Array<{ name: string }>;
  return names.length === 3;
}
function eligible(db: Database.Database, workspace: string, targetAgentId: string, request: ReturnType<typeof normalizedRequest>, now: number): LessonTransferReference[] {
  if (request.runStartTs > now || !hasSourceTables(db)) return [];
  const rows: LessonTransferReference[] = [];
  for (const sourceAgentId of request.sourceAgentIds) {
    const verified = verifyAgentLessons(db, sourceAgentId, workspace).verified;
    const byId = new Map(verified.map(lesson => [lesson.lessonId, lesson]));
    for (const lesson of verified) {
      const provenance = lesson.provenance;
      if (!provenance || lesson.status !== "ACTIVE" || lesson.driftDetected || lesson.expiryTs <= now
        || lesson.createdTs >= request.runStartTs || provenance.verifiedTs >= request.runStartTs
        || provenance.sourceTaskIndex >= request.taskIndex || provenance.partition === "heldout"
        || provenance.domain !== request.domain || provenance.libraryVersion !== request.libraryVersion
        || provenance.experimentalMode !== request.experimentalMode || provenance.outcome !== "VERIFIED_EFFECTIVE"
        || provenance.baselineRunId === request.runId || provenance.verificationRunId === request.runId
        || (provenance.scope === "workspace" && (sourceAgentId !== targetAgentId || provenance.workspaceScope !== workspaceScope(workspace)))) continue;
      if (provenance.priorLessonId || provenance.priorLessonHash) {
        const prior = provenance.priorLessonId ? byId.get(provenance.priorLessonId) : undefined;
        if (!prior || prior.lesson_hash !== provenance.priorLessonHash || prior.correctionId !== lesson.correctionId
          || prior.status !== "ACTIVE" || prior.driftDetected || prior.expiryTs <= now) continue;
      }
      // The signed lesson binds the successful outcome; a later source downgrade or changed lineage can only exclude it.
      let source;
      try { source = getCorrectionById(db, lesson.correctionId); } catch { continue; }
      if (!source || !lessonSourceVerifies(source, workspace) || source.agentId !== sourceAgentId || source.status !== "VERIFIED_EFFECTIVE"
        || source.effectivenessScore === null || source.effectivenessScore < defaultCorrectionMemoryConfig().minEffectivenessForLesson
        || source.verifiedTs !== provenance.verifiedTs || source.baselineRunId !== provenance.baselineRunId
        || source.verificationRunId !== provenance.verificationRunId) continue;
      rows.push(reference(lesson, provenance));
    }
  }
  const severity = { CRITICAL: 0, WARN: 1, INFO: 2 };
  return rows.sort((a, b) => severity[a.severity] - severity[b.severity]
    || a.provenance.sourceTaskIndex - b.provenance.sourceTaskIndex || a.lessonId.localeCompare(b.lessonId));
}
function reference(lesson: CorrectionLesson, provenance: LessonProvenance): LessonTransferReference {
  return { lessonId: lesson.lessonId, lessonHash: lesson.lesson_hash, sourceAgentId: lesson.agentId,
    correctionId: lesson.correctionId, provenance, summary: lesson.lessonText,
    severity: lesson.advisorySeverity, category: lesson.advisoryCategory };
}

/** Pure preview over the existing correction memory. No initialization, expiry transition or consumption is written. */
export function selectLessonTransfer(db: Database.Database | null, workspace: string, targetAgentId: string, input: LessonTransferRequest): LessonTransferSelection {
  const request = normalizedRequest(targetAgentId, input);
  const lessons = db === null ? [] : eligible(db, workspace, targetAgentId, request, Date.now()).slice(0, request.maxLessons);
  return freeze({ status: lessons.length ? "SELECTED" : "NO_ENTRY", request, lessons, libraryDigestSha256: libraryDigest(request, lessons) });
}

/** Revalidate a frozen selection without widening its earlier-task prefix or replacing its exact lesson versions. */
export function assertLessonTransferCurrent(db: Database.Database | null, workspace: string, targetAgentId: string, selection: LessonTransferSelection): void {
  const request = normalizedRequest(targetAgentId, selection.request);
  if (canonicalize(request) !== canonicalize(selection.request) || selection.libraryDigestSha256 !== libraryDigest(request, selection.lessons)
    || selection.lessons.length > request.maxLessons || new Set(selection.lessons.map(row => row.lessonId)).size !== selection.lessons.length
    || selection.status !== (selection.lessons.length ? "SELECTED" : "NO_ENTRY")) throw new Error("lesson transfer selection is inconsistent");
  if (selection.status === "NO_ENTRY") return;
  const current = db === null ? [] : eligible(db, workspace, targetAgentId, request, Date.now());
  const byId = new Map(current.map(row => [row.lessonId, row]));
  for (const selected of selection.lessons) {
    const row = byId.get(selected.lessonId);
    if (!row || canonicalize(row) !== canonicalize(selected)) throw new Error("selected lesson is no longer eligible or its immutable content changed");
  }
}

/** Call only after the exact signed prompt has been admitted and published. The receipt table stores references, never another lesson. */
export function commitLessonTransfer(db: Database.Database, workspace: string, targetAgentId: string, packId: string, selection: LessonTransferSelection): number {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(packId)) throw new Error("invalid lesson consumption pack id");
  return db.transaction(() => {
    assertLessonTransferCurrent(db, workspace, targetAgentId, selection);
    if (selection.status === "NO_ENTRY") return 0;
    initLessonTables(db);
    const requestDigest = sha256Hex(canonicalize({ targetAgentId, request: selection.request, libraryDigestSha256: selection.libraryDigestSha256 }));
    const prior = db.prepare("SELECT lesson_id, lesson_hash, target_agent_id, request_sha256 FROM correction_lesson_consumptions WHERE pack_id = ?").all(packId) as Array<{
      lesson_id: string; lesson_hash: string; target_agent_id: string; request_sha256: string;
    }>;
    if (prior.some(row => row.target_agent_id !== targetAgentId || row.request_sha256 !== requestDigest
      || !selection.lessons.some(lesson => lesson.lessonId === row.lesson_id && lesson.lessonHash === row.lesson_hash)))
      throw new Error("prompt pack already records a different lesson transfer");
    const insert = db.prepare("INSERT OR IGNORE INTO correction_lesson_consumptions (pack_id, lesson_id, lesson_hash, target_agent_id, request_sha256, consumed_ts) VALUES (?, ?, ?, ?, ?, ?)");
    const now = Date.now();
    let count = 0;
    for (const lesson of selection.lessons) {
      if (insert.run(packId, lesson.lessonId, lesson.lessonHash, targetAgentId, requestDigest, now).changes > 0) {
        updateLessonInjection(db, lesson.lessonId, now);
        count += 1;
      }
    }
    return count;
  })();
}
