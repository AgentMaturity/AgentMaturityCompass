/**
 * HP-06: `amc session rewind <session> --to-turn N`. Restores every file the session's native file tools (fs.write,
 * fs.edit, apply_patch) changed after turn N to its kept pre-image (src/tools/builtin/fileCheckpoint.ts), and only
 * when the file still holds the bytes the session last recorded for it. Anything else is a conflict, and with any
 * conflict nothing is written unless the person asks for the clean files only.
 *
 * Fences, in this order, before any byte is read back or written: the session and turn N verify (signed history), the
 * conversation can be forked at turn N (the same preflight the fork runs), and no session in this workspace has a live
 * writer (the signed writer meta every session row carries; no new lock). The check is not a lock: a writer that starts
 * after it is not fenced, but each file is re-checked at its commit and a changed one is not overwritten.
 *
 * The rewind opens no session. It writes SESSION_REWIND_INTENDED before the first file and SESSION_REWIND_FINISHED after
 * the last through the signed operations audit (no paths there: only digests and the ids of the session's own rows).
 * The conversation then continues through the composed `--fork-from <session>` path, which forks at turn N and cites
 * the rewind (./sessionRewindEvidence.ts). The original rows are never changed.
 */
import { lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { hostname, userInfo } from "node:os";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { loadVerifiedToolsConfigSnapshot, pathAllowedByPatterns } from "../toolhub/toolhubValidators.js";
import { writeFileAtomicSync } from "../tools/builtin/atomicWrite.js";
import { FILE_CHECKPOINT_AUDIT } from "../tools/builtin/fileCheckpoint.js";
import { readRegularFile } from "../tools/builtin/fsRegularFile.js";
import { insideWorkspaceNoLinks } from "../tools/builtin/workspacePath.js";
import { fileChangesOf } from "../tools/toolEvidence.js";
import type { EvidenceEvent } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { readEventPayload } from "./eventPayload.js";
import { prepareForkConversation, selectForkPrefix } from "./forkConversation.js";
import { loadSessionEventHistory } from "./sessionEventHistory.js";
import { assertSessionOwnerAvailable, readSessionWriter } from "./sessionOwnership.js";
import { extractEnvelope } from "./sessionTypes.js";
import { retrieveSpilledContent } from "./spill/spillEvidence.js";
import { inspectSpillObject } from "./spill/spillStore.js";
import { extractSpillRef } from "./spill/spillTypes.js";

export const REWIND_INTENDED_AUDIT = "SESSION_REWIND_INTENDED";
export const REWIND_FINISHED_AUDIT = "SESSION_REWIND_FINISHED";
const FILE_TOOLS = new Set(["fs.write", "fs.edit", "apply_patch"]);
/** Tools whose file changes no checkpoint covers. */
const UNCOVERED_TOOLS = new Set(["bash", "job_start", "terminal_open", "terminal_send"]);

export type RewindConflictReason = "changed-since" | "no-pre-image" | "too-large" | "not-stored" | "symlink-or-protected" | "other-session";

/** The words a person reads for each closed conflict reason. */
export const REWIND_CONFLICT_WORDS: Readonly<Record<RewindConflictReason, string>> = Object.freeze({
  "changed-since": "the file changed after the session last wrote it (by a shell command, a person or another program)",
  "no-pre-image": "no copy of its earlier content was kept",
  "too-large": "it was too large to keep a copy of its earlier content",
  "not-stored": "its earlier content could not be kept (no encryption key, or the copy was not saved)",
  "symlink-or-protected": "its path now goes through a link or a protected folder, or the signed tools policy now denies it",
  "other-session": "another session changed the same file afterwards"
});

interface RewindFile {
  readonly path: string;
  /** What the file must hold now: the session's last recorded afterSha256 (null: the session deleted it). */
  readonly fromSha256: string | null;
  /** What it is restored to (null: the session created it, so it is removed). */
  readonly toSha256: string | null;
  readonly checkpointEventId: string | null;
  readonly commitmentEventId: string | null;
}
interface RewindConflict { readonly path: string; readonly reason: RewindConflictReason }

export interface RewindPlan {
  readonly sessionId: string;
  readonly toTurn: number;
  readonly parentHeadEventHash: string;
  readonly files: readonly RewindFile[];
  readonly conflicts: readonly RewindConflict[];
  /** Calls after turn N whose file changes no checkpoint covers (bash, background jobs, terminals). */
  readonly uncoveredCalls: number;
}

export class SessionRewindRefused extends Error {
  constructor(readonly code: "NOT_FOUND" | "TURN" | "FORK" | "LIVE_WRITER" | "CONFLICTS" | "PRE_IMAGE" | "PERSON" | "UNREADABLE", message: string) {
    super(message); this.name = "SessionRewindRefused";
  }
}

const metaOf = (row: EvidenceEvent): Record<string, unknown> => JSON.parse(row.meta_json) as Record<string, unknown>;
const turnOf = (row: EvidenceEvent): number => extractEnvelope(row.meta_json)?.turn ?? 0;
/** A row's payload; an unreadable one refuses the rewind, because unseen evidence is never read as "no change". */
function payloadOf(workspace: string, row: EvidenceEvent): Record<string, unknown> {
  const read = readEventPayload(workspace, row);
  if (read.status === "ok") {
    try { return JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>; } catch { /* reported below */ }
  }
  throw new SessionRewindRefused("UNREADABLE", "Part of the recorded history could not be read (if the vault is locked, unlock it with amc vault unlock), so AMC cannot tell which files changed. Nothing was changed.");
}
function currentDigest(full: string): string | null {
  try { return sha256Hex(readRegularFile(full)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
/** The digest, or "unknown" when the path cannot be read at all (a directory, no permission). */
function digestOrUnknown(full: string): string | null {
  try { return currentDigest(full); } catch { return "unknown"; }
}
/** The file changes a session's tool audit rows record, in order, with the call and tool that made them. */
function changesIn(workspace: string, rows: readonly EvidenceEvent[]) {
  return rows.filter((row) => row.event_type === "audit" && /^TOOL_CALL_(ALLOWED|FAILED)$/.test(String(metaOf(row).auditType)))
    .flatMap((row) => {
      const payload = payloadOf(workspace, row);
      const meta = metaOf(row);
      return fileChangesOf(payload).map((change) => ({ ...change, row, callId: String(meta.callId), tool: String(meta.toolName) }));
    });
}

/** Refuses when any native session in the workspace has a live writer. */
function assertNoLiveWriter(events: readonly EvidenceEvent[]): void {
  const last = new Map<string, EvidenceEvent>();
  for (const row of events) last.set(row.session_id, row);
  for (const [sessionId, row] of last) {
    if (readSessionWriter(row)?.state !== "active") continue;
    try { assertSessionOwnerAvailable(row); }
    catch { throw new SessionRewindRefused("LIVE_WRITER", `Session ${sessionId} is still being written by a running agent. Stop it (or let it finish), then run the rewind again.`); }
  }
}

/** Whether the signed tools policy (verified now) would refuse this tool writing this path. */
function deniedByPolicy(workspace: string, tool: string, full: string): boolean {
  try {
    const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
    if (!snapshot.signatureValid || !snapshot.config) return true;
    const entry = snapshot.config.tools.allowedTools.find((candidate) => candidate.name === tool);
    if (entry === undefined) return true;
    return !pathAllowedByPatterns(workspace, full, entry.allow?.paths ?? [], entry.deny?.paths ?? []).ok;
  } catch { return true; }
}

/** Work out what a rewind to `toTurn` would do. Reads only; writes nothing. */
export function planSessionRewind(workspace: string, sessionId: string, toTurn: number): RewindPlan {
  const events = loadSessionEventHistory({ workspace }).events;
  const rows = events.filter((row) => row.session_id === sessionId && extractEnvelope(row.meta_json) !== null);
  if (rows.length === 0) throw new SessionRewindRefused("NOT_FOUND", `No native session ${sessionId} in this workspace.`);
  let prefix: readonly EvidenceEvent[];
  try { prefix = selectForkPrefix(rows, toTurn).rows; }
  catch { throw new SessionRewindRefused("TURN", `Turn ${toTurn} is not a finished turn of this session. Pick a turn from amc session show ${sessionId}.`); }
  // Read first: an unreadable row (a locked vault) is reported as such, before the fork preflight reads the same payloads.
  const after = rows.filter((row) => turnOf(row) > toTurn);
  const changes = changesIn(workspace, after).filter((change) => FILE_TOOLS.has(change.tool));
  const checkpoints = after.filter((row) => row.event_type === "audit" && metaOf(row).auditType === FILE_CHECKPOINT_AUDIT)
    .map((row) => ({ row, meta: metaOf(row), payload: payloadOf(workspace, row) }));
  try { prepareForkConversation(workspace, prefix); }
  catch (error) { throw new SessionRewindRefused("FORK", `The conversation cannot continue from turn ${toTurn}, so nothing was rewound: ${error instanceof Error ? error.message : String(error)}`); }
  assertNoLiveWriter(events);
  const firstTs = new Map<string, number>();
  for (const change of changes) if (!firstTs.has(change.path)) firstTs.set(change.path, change.row.ts);
  const others = changesIn(workspace, events.filter((row) => row.session_id !== sessionId));
  const files: RewindFile[] = [], conflicts: RewindConflict[] = [];
  for (const [path, since] of firstTs) {
    const mine = changes.filter((change) => change.path === path);
    const first = mine[0]!, last = mine.at(-1)!;
    if (first.beforeSha256 === null && last.afterSha256 === null) continue; // created and removed again: nothing to undo
    const conflict = (reason: RewindConflictReason) => { conflicts.push({ path, reason }); };
    const checkpoint = checkpoints.find((entry) => entry.meta.callId === first.callId && entry.payload.path === path
      && entry.payload.beforeSha256 === first.beforeSha256);
    // A removal needs the signed record that the file did not exist; a restore needs a kept copy.
    if (checkpoint?.meta.status !== (first.beforeSha256 === null ? "absent" : "stored")) {
      conflict(checkpoint?.meta.status === "too-large" ? "too-large" : checkpoint?.meta.status === "not-stored" ? "not-stored" : "no-pre-image"); continue;
    }
    const commitment = first.beforeSha256 === null ? null : rows.find((row) => row.event_type === "tool/spill-commitment"
      && metaOf(row).subject === "file/checkpoint" && extractSpillRef(row.meta_json)?.locator === checkpoint.meta.locator);
    const ref = commitment == null ? null : extractSpillRef(commitment.meta_json);
    if (commitment === undefined || (commitment !== null && (ref?.contentSha256 !== first.beforeSha256 || inspectSpillObject(workspace, ref).status !== "ok"))) {
      conflict("no-pre-image"); continue; // erased, expired, missing or modified copies are conflicts too
    }
    let full: string;
    try { full = insideWorkspaceNoLinks(workspace, path).full; } catch { conflict("symlink-or-protected"); continue; }
    if (deniedByPolicy(workspace, last.tool, full)) { conflict("symlink-or-protected"); continue; }
    if (others.some((change) => change.path === path && change.row.ts >= since)) { conflict("other-session"); continue; }
    if (digestOrUnknown(full) !== last.afterSha256) { conflict("changed-since"); continue; }
    files.push({ path, fromSha256: last.afterSha256, toSha256: first.beforeSha256, checkpointEventId: checkpoint?.row.id ?? null, commitmentEventId: commitment?.id ?? null });
  }
  const uncoveredCalls = after.filter((row) => row.event_type === "tool/call" && UNCOVERED_TOOLS.has(String(metaOf(row).toolName))).length;
  return { sessionId, toTurn, parentHeadEventHash: rows.at(-1)!.event_hash, files, conflicts, uncoveredCalls };
}

export interface RewindOutcome {
  readonly intendedEventId: string;
  readonly finishedEventId: string;
  readonly results: readonly { readonly path: string; readonly status: "restored" | "removed" | "failed"; readonly restoredSha256: string | null }[];
}

/** Who ran the rewind, as this machine names them. A local fact, not a sign-in. */
function rewindActor(): { readonly user: string; readonly host: string; readonly how: "terminal-no-sign-in" } {
  return { user: userInfo().username, host: hostname(), how: "terminal-no-sign-in" };
}

/** Apply a plan. Every pre-image is decrypted and checked before the first file changes. */
export function executeSessionRewind(workspace: string, plan: RewindPlan, options: { readonly onlyClean: boolean }): RewindOutcome {
  if (plan.conflicts.length > 0 && !options.onlyClean) {
    throw new SessionRewindRefused("CONFLICTS", `${plan.conflicts.length} file(s) cannot be restored safely, so nothing was written. Add --only-clean to restore only the others.`);
  }
  const rows = loadSessionEventHistory({ workspace, sessionId: plan.sessionId }).events;
  const bytes = plan.files.map((file) => {
    if (file.commitmentEventId === null) return null;
    const commitment = rows.find((row) => row.id === file.commitmentEventId);
    let content: Buffer;
    try { content = retrieveSpilledContent(workspace, commitment!); }
    catch (error) { throw new SessionRewindRefused("PRE_IMAGE", `The earlier content of ${file.path} could not be read back (${error instanceof Error ? error.message : String(error)}); nothing was written. If the vault is locked, unlock it and try again.`); }
    if (sha256Hex(content) !== file.toSha256) throw new SessionRewindRefused("PRE_IMAGE", `The kept copy of ${file.path} does not match its signed digest; nothing was written.`);
    return content;
  });
  const intended = appendOpsAuditEvent({ workspace, auditType: REWIND_INTENDED_AUDIT, subjectId: plan.sessionId, payload: {
    v: 1, sessionId: plan.sessionId, toTurn: plan.toTurn, parentHeadEventHash: plan.parentHeadEventHash, by: rewindActor(), onlyClean: options.onlyClean,
    conflicts: plan.conflicts.length, uncoveredCalls: plan.uncoveredCalls,
    files: plan.files.map((file) => ({ checkpointEventId: file.checkpointEventId, commitmentEventId: file.commitmentEventId, fromSha256: file.fromSha256, toSha256: file.toSha256 })) } });
  // Each file's outcome is total: whatever happens to one file, the FINISHED row is still written for all of them.
  const results = plan.files.map((file, index) => {
    let full: string | null = null;
    try {
      full = insideWorkspaceNoLinks(workspace, file.path).full;
      const target = full;
      const unchanged = () => { if (currentDigest(target) !== file.fromSha256) throw new Error("the file changed while the rewind ran"); };
      const content = bytes[index];
      if (content === null || content === undefined) {
        unchanged();
        if (lstatSync(full).isFile()) unlinkSync(full);
        return { path: file.path, status: "removed" as const, restoredSha256: digestOrUnknown(full) };
      }
      mkdirSync(dirname(full), { recursive: true });
      // writeFileAtomicSync keeps a replaced file's permission bits; a re-created file gets the default ones.
      writeFileAtomicSync(full, content, { beforeCommit: unchanged });
      return { path: file.path, status: "restored" as const, restoredSha256: digestOrUnknown(full) };
    } catch {
      return { path: file.path, status: "failed" as const, restoredSha256: full === null ? "unknown" : digestOrUnknown(full) };
    }
  });
  const finished = appendOpsAuditEvent({ workspace, auditType: REWIND_FINISHED_AUDIT, subjectId: plan.sessionId, payload: {
    v: 1, intendedEventId: intended.eventId, intendedEventHash: intended.eventHash, sessionId: plan.sessionId, toTurn: plan.toTurn,
    parentHeadEventHash: plan.parentHeadEventHash, ok: results.every((result) => result.status !== "failed"),
    outcomes: results.map((result) => ({ status: result.status, restoredSha256: result.restoredSha256 })) } });
  for (const content of bytes) content?.fill(0);
  return { intendedEventId: intended.eventId, finishedEventId: finished.eventId, results };
}
