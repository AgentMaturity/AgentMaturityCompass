/**
 * The signed, chained status log for correction-memory lessons. Each status a lesson holds is an entry signed with
 * the ledger-row key and chained per agent; the log head (entry count and head hash) is anchored in this machine's
 * high-water file outside the workspace, so a deleted or rewritten entry, including the tail, is detected.
 */
import Database from "better-sqlite3";
import { getSigningKey, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { highWaterKey, readHighWater, recordHighWater, workspaceScope } from "../keys/highWater.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { CorrectionLesson, LessonStatus } from "./correctionMemory.js";

const LESSON_STATUS_GENESIS_HASH = "GENESIS_LESSON_STATUS";

function lessonStatusEntryHash(entry: { agentId: string; lessonId: string; lessonHash: string; status: string; ts: number; prev: string }): string {
  return sha256Hex(canonicalize({ ...entry, kind: "correction-lesson-status" }));
}

/** The status log head for one agent, anchored in this machine's high-water file outside the workspace. */
function lessonStatusAnchorKey(workspace: string, agentId: string): string {
  return highWaterKey("lesson-status", `${agentId}@${workspaceScope(workspace)}`);
}

/**
 * Whether a new entry may extend the agent's log without re-anchoring: the anchor exists and the log verifies and ends
 * exactly at it, or this is a true genesis (no anchor, no entries, and no lesson of the agent other than `lessonId`).
 */
export function lessonStatusLogExtendable(db: Database.Database, agentId: string, workspace: string, lessonId: string): boolean {
  let keys: string[] = [];
  try { keys = getPurposeKeyHistory(workspace, "ledger-row"); } catch { keys = []; }
  if (verifiedLessonStatuses(db, agentId, workspace, keys).trusted) return true;
  let anchor: unknown;
  try { anchor = readHighWater(lessonStatusAnchorKey(workspace, agentId)); } catch { return false; }
  const entries = db.prepare("SELECT COUNT(*) AS n FROM correction_lesson_status_log WHERE agent_id = ?").get(agentId) as { n: number };
  const others = db.prepare("SELECT COUNT(*) AS n FROM correction_lessons WHERE agent_id = ? AND lesson_id <> ?").get(agentId, lessonId) as { n: number };
  return anchor === null && entries.n === 0 && others.n === 0;
}

/**
 * Append a signed status entry for `lesson` and raise the agent's anchored log head; callers run it in their
 * transaction. It refuses unless the log is extendable, so a rolled-back log is never blessed; `reanchor` is the
 * owner's explicit recovery after review and starts the anchor from the log as it now stands. The high-water file
 * still refuses an anchor lower than, or forked from, one this machine recorded.
 */
export function appendLessonStatus(db: Database.Database, lesson: Pick<CorrectionLesson, "lessonId" | "agentId" | "lesson_hash">,
  status: LessonStatus, workspace: string, reanchor = false): void {
  if (!reanchor && !lessonStatusLogExtendable(db, lesson.agentId, workspace, lesson.lessonId)) {
    throw new Error(`the lesson status log for agent ${lesson.agentId} does not end at its anchored head; review it and re-sign with reanchor`);
  }
  const head = db
    .prepare("SELECT entry_hash, (SELECT COUNT(*) FROM correction_lesson_status_log WHERE agent_id = ?) AS count FROM correction_lesson_status_log WHERE agent_id = ? ORDER BY seq DESC LIMIT 1")
    .get(lesson.agentId, lesson.agentId) as { entry_hash: string; count: number } | undefined;
  const entry = { agentId: lesson.agentId, lessonId: lesson.lessonId, lessonHash: lesson.lesson_hash, status, ts: Date.now(),
    prev: head?.entry_hash ?? LESSON_STATUS_GENESIS_HASH };
  const entryHash = lessonStatusEntryHash(entry);
  const signature = signHexDigest(entryHash, getSigningKey(workspace, "ledger-row"));
  db.prepare(`INSERT INTO correction_lesson_status_log
    (agent_id, lesson_id, lesson_hash, status, ts, prev_entry_hash, entry_hash, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(entry.agentId, entry.lessonId, entry.lessonHash, status, entry.ts, entry.prev, entryHash, signature);
  if (!recordHighWater(lessonStatusAnchorKey(workspace, lesson.agentId), (head?.count ?? 0) + 1, entryHash)) {
    throw new Error("the lesson status log head could not be anchored in AMC home; the status change was not made");
  }
}


/**
 * The latest signed status per lesson, or `trusted: false` when the agent's status log cannot be trusted as a whole:
 * any entry fails its chain link or signature, or the log does not end exactly at the anchored head (count and hash),
 * which catches a deleted tail entry.
 */
export function verifiedLessonStatuses(db: Database.Database, agentId: string, workspace: string, keys: string[]): { trusted: boolean; status: Map<string, string> } {
  const rows = db
    .prepare("SELECT * FROM correction_lesson_status_log WHERE agent_id = ? ORDER BY seq ASC")
    .all(agentId) as Array<Record<string, unknown>>;
  const status = new Map<string, string>();
  let previous = LESSON_STATUS_GENESIS_HASH;
  for (const row of rows) {
    const entry = { agentId, lessonId: String(row.lesson_id), lessonHash: String(row.lesson_hash), status: String(row.status),
      ts: Number(row.ts), prev: String(row.prev_entry_hash) };
    const stored = String(row.entry_hash);
    if (entry.prev !== previous || lessonStatusEntryHash(entry) !== stored || !verifyHexDigestAny(stored, String(row.signature), keys)) {
      return { trusted: false, status };
    }
    status.set(entry.lessonId, `${entry.lessonHash}:${entry.status}`);
    previous = stored;
  }
  let anchor: { sequence: number; sha256: string } | null;
  try { anchor = readHighWater(lessonStatusAnchorKey(workspace, agentId)); } catch { return { trusted: false, status }; }
  // A missing anchor is never proof of an empty log: deleting the anchor and every row would otherwise erase history.
  const endsAtAnchor = anchor !== null && anchor.sequence === rows.length && anchor.sha256 === previous;
  return { trusted: endsAtAnchor, status };
}

