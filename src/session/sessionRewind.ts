/**
 * HP-06: `amc session rewind <session> --to-turn N`, the plan. Every file the session's native file tools (fs.write,
 * fs.edit, apply_patch) changed after turn N goes back to its kept pre-image (src/tools/builtin/fileCheckpoint.ts), only
 * when the file still holds the bytes the session last recorded for it (or already holds its earlier content, after a
 * rewind that did not finish). Anything else is a conflict; with any conflict nothing is written unless the person asks
 * for the clean files only. Applying a plan is ./sessionRewindApply.ts; the record it leaves is ./sessionRewindEvidence.ts.
 *
 * Fences before any byte is read back or written: the session and turn N verify (signed history), every row the plan
 * depends on can be read, the conversation can be forked at turn N, and no session in this workspace has a live writer
 * (the signed writer meta every session row carries; no new lock). The check is not a lock: a writer that starts after it
 * is not fenced, but each file's location and bytes are checked again right before it is written or removed.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { READ_ONLY_TOOLS } from "../agent/turnVerification.js";
import { loadVerifiedToolsConfigSnapshot, pathAllowedByPatterns } from "../toolhub/toolhubValidators.js";
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
import { inspectSpillObject } from "./spill/spillStore.js";
import { extractSpillRef } from "./spill/spillTypes.js";

export const REWIND_INTENDED_AUDIT = "SESSION_REWIND_INTENDED";
export const REWIND_FINISHED_AUDIT = "SESSION_REWIND_FINISHED";
const FILE_TOOLS = new Set(["fs.write", "fs.edit", "apply_patch"]);
const INSTRUCTION_FILES = new Set(["AGENTS.md", "AMC.md", "AMC.local.md", "CLAUDE.md"]);

export type RewindConflictReason = "changed-since" | "no-pre-image" | "too-large" | "not-stored" | "protected-data" | "symlink-or-protected" | "other-session";

/** The words a person reads for each closed conflict reason. */
export const REWIND_CONFLICT_WORDS: Readonly<Record<RewindConflictReason, string>> = Object.freeze({
  "changed-since": "the file changed after the session last wrote it (by a shell command, a person or another program)",
  "no-pre-image": "no copy of its earlier content was kept, or the copy was erased or changed",
  "too-large": "it was too large to keep a copy of its earlier content",
  "not-stored": "its earlier content could not be kept (no encryption key, or the copy was not saved)",
  "protected-data": "protected-data mode was on, so no copy of its earlier content was kept",
  "symlink-or-protected": "its path now goes through a link or a protected folder, or the signed tools policy now denies it",
  "other-session": "another session changed the same file afterwards"
});

/** restore: put back over the current file; recreate: the session deleted it; remove: the session created it; already: it already holds its earlier content. */
type RewindAction = "restore" | "recreate" | "remove" | "already";

export interface RewindFile {
  readonly path: string;
  readonly action: RewindAction;
  /** What the file must hold now: the session's last recorded afterSha256 (null: the session deleted it). */
  readonly fromSha256: string | null;
  /** What it is put back to (null: the session created it, so it is removed). */
  readonly toSha256: string | null;
  /** Size of the earlier content, and its permission bits when the checkpoint recorded them. */
  readonly bytes: number;
  readonly mode: number | null;
  /** Why a person should look twice: an instruction file, a skill, a hook script, an executable. */
  readonly flags: readonly string[];
  readonly checkpointEventId: string;
  readonly commitmentEventId: string | null;
}
interface RewindConflict { readonly path: string; readonly reason: RewindConflictReason }

export interface RewindPlan {
  readonly workspace: string;
  readonly sessionId: string;
  readonly toTurn: number;
  readonly parentHeadEventHash: string;
  readonly files: readonly RewindFile[];
  readonly conflicts: readonly RewindConflict[];
  /** Calls after turn N whose effects no checkpoint covers (shell, jobs, terminals, children, workflows, MCP, code runs). */
  readonly uncoveredCalls: number;
  /** A rewind of this session that was started and has no finished record. */
  readonly unfinishedIntendedEventId: string | null;
}

export class SessionRewindRefused extends Error {
  constructor(readonly code: "NOT_FOUND" | "TURN" | "FORK" | "LIVE_WRITER" | "CONFLICTS" | "PRE_IMAGE" | "PERSON" | "UNREADABLE" | "CONFIRM" | "PLATFORM" | "INTERRUPTED", message: string) {
    super(message); this.name = "SessionRewindRefused";
  }
}

/** A row's meta, or {} when it has none that parses (older rows). */
export function metaOf(row: EvidenceEvent): Record<string, unknown> {
  try { const meta: unknown = JSON.parse(row.meta_json ?? "{}"); return typeof meta === "object" && meta !== null ? meta as Record<string, unknown> : {}; }
  catch { return {}; }
}
const turnOf = (row: EvidenceEvent): number => extractEnvelope(row.meta_json)?.turn ?? 0;
/** A row's payload; an unreadable one refuses the rewind, because unseen evidence is never read as "no change". */
function payloadOf(workspace: string, row: EvidenceEvent): Record<string, unknown> {
  const read = readEventPayload(workspace, row);
  if (read.status === "ok") {
    try { return JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>; } catch { /* reported below */ }
  }
  throw new SessionRewindRefused("UNREADABLE", `A recorded row of session ${row.session_id} could not be read (if the vault is locked, unlock it with amc vault unlock; if that session's records were pruned or erased, AMC cannot tell what it changed), so AMC cannot tell which files changed. Nothing was changed.`);
}
export function currentDigest(full: string): string | null {
  try { return sha256Hex(readRegularFile(full)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
/** The digest, or "unknown" when the path cannot be read at all (a directory, no permission). */
function digestOrUnknown(full: string): string | null {
  try { return currentDigest(full); } catch { return "unknown"; }
}
const toolRows = (rows: readonly EvidenceEvent[]) => rows.filter((row) => row.event_type === "audit" && /^TOOL_CALL_(ALLOWED|FAILED)$/.test(String(metaOf(row).auditType)));
/** The file changes a session's tool audit rows record, in order, with the call and tool that made them. */
function changesIn(workspace: string, rows: readonly EvidenceEvent[]) {
  return toolRows(rows).flatMap((row) => {
    const meta = metaOf(row);
    return fileChangesOf(payloadOf(workspace, row)).map((change) => ({ ...change, row, callId: String(meta.callId), tool: String(meta.toolName) }));
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

/** Paths named in .amc/hooks.json commands, workspace-relative; empty when there is none or it does not parse. */
function hookScripts(workspace: string): Set<string> {
  try {
    const text = readFileSync(join(workspace, ".amc", "hooks.json"), "utf8");
    return new Set([...text.matchAll(/"([^"\s]+\.(?:js|mjs|cjs|sh|py|ts))"/g)].map((match) => match[1]!.replace(/^\.\//, "")));
  } catch { return new Set(); }
}

function surfaceFlags(path: string, mode: number | null, hooks: ReadonlySet<string>): string[] {
  return [
    ...(INSTRUCTION_FILES.has(basename(path)) ? ["instructions the agent reads"] : []),
    ...(/(^|\/)\.(agents|claude)\/skills\//.test(path) ? ["a skill"] : []),
    ...(hooks.has(path) ? ["a hook script AMC runs"] : []),
    ...(mode !== null && (mode & 0o111) !== 0 ? ["executable"] : [])
  ];
}

/** Work out what a rewind to `toTurn` would do. Reads only; writes nothing. */
export function planSessionRewind(workspace: string, sessionId: string, toTurn: number, unfinishedIntendedEventId: string | null = null): RewindPlan {
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
  // Only another session's rows from after this session's first change matter; older ones are not read at all.
  const since = Math.min(...firstTs.values());
  const others = changesIn(workspace, events.filter((row) => row.session_id !== sessionId && row.ts >= since));
  const hooks = hookScripts(workspace);
  const files: RewindFile[] = [], conflicts: RewindConflict[] = [];
  for (const [path, first] of firstTs) {
    const mine = changes.filter((change) => change.path === path);
    const head = mine[0]!, last = mine.at(-1)!;
    if (head.beforeSha256 === null && last.afterSha256 === null) continue; // created and removed again: nothing to undo
    const conflict = (reason: RewindConflictReason) => { conflicts.push({ path, reason }); };
    const checkpoint = checkpoints.find((entry) => entry.meta.callId === head.callId && entry.payload.path === path
      && entry.payload.beforeSha256 === head.beforeSha256);
    // A removal needs the signed record that the file did not exist; a restore needs a kept copy.
    if (checkpoint === undefined || checkpoint.meta.status !== (head.beforeSha256 === null ? "absent" : "stored")) {
      const status = checkpoint?.meta.status;
      conflict(status === "too-large" ? "too-large" : checkpoint?.meta.reason === "protected-data-mode" ? "protected-data" : status === "not-stored" ? "not-stored" : "no-pre-image");
      continue;
    }
    const commitment = head.beforeSha256 === null ? null : rows.find((row) => row.event_type === "tool/spill-commitment"
      && metaOf(row).subject === "file/checkpoint" && extractSpillRef(row.meta_json)?.locator === checkpoint.meta.locator);
    const ref = commitment == null ? null : extractSpillRef(commitment.meta_json);
    if (commitment === undefined || (ref !== null && inspectSpillObject(workspace, ref).status !== "ok")) {
      conflict("no-pre-image"); continue; // erased, expired, missing or modified copies are conflicts too
    }
    let full: string;
    try { full = insideWorkspaceNoLinks(workspace, path).full; } catch { conflict("symlink-or-protected"); continue; }
    if (deniedByPolicy(workspace, last.tool, full)) { conflict("symlink-or-protected"); continue; }
    if (others.some((change) => change.path === path && change.row.ts >= first)) { conflict("other-session"); continue; }
    const now = digestOrUnknown(full);
    const already = now === head.beforeSha256;
    if (!already && now !== last.afterSha256) { conflict("changed-since"); continue; }
    const mode = typeof checkpoint.payload.mode === "number" ? checkpoint.payload.mode : null;
    files.push({ path, action: already ? "already" : head.beforeSha256 === null ? "remove" : last.afterSha256 === null ? "recreate" : "restore",
      fromSha256: last.afterSha256, toSha256: head.beforeSha256, bytes: Number(checkpoint.payload.bytes ?? 0), mode,
      flags: surfaceFlags(path, mode, hooks), checkpointEventId: checkpoint.row.id, commitmentEventId: commitment?.id ?? null });
  }
  const uncoveredCalls = after.filter((row) => row.event_type === "tool/call" && !FILE_TOOLS.has(String(metaOf(row).toolName))
    && !READ_ONLY_TOOLS.has(String(metaOf(row).toolName))).length;
  return { workspace, sessionId, toTurn, parentHeadEventHash: rows.at(-1)!.event_hash, files, conflicts, uncoveredCalls, unfinishedIntendedEventId };
}
