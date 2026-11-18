/**
 * What follows an automatic compaction (HP-05): files read again into context, the signed decision after a
 * context-window overflow, and the plain-words account of both for `amc session show`.
 *
 * FILE RESTORE. A compaction can remove a file's content from what the model sees. Afterwards the files this
 * session's own `fs.read`, `fs.write` and `fs.edit` calls named are read again, newest first, through the same tool
 * seam a model call uses: policy, guards, hooks and the read-before-edit ledger apply exactly as for a normal read,
 * and there is no other way to read a file here. Where protected-data redaction is on, nothing is restored (the
 * context path is redacted differently from a tool result). The text enters at the next step as tool context
 * (the inbox path a tool's `additionalContext` takes), never in the user's name and never as a `tool/call` the model
 * did not make. A file whose last read is still in context is skipped; a read the seam denies or that fails (the file
 * is gone, outside the workspace, refused by policy) is skipped; a seam that would ask a person first is not used.
 * The total is capped below half the bytes the compaction freed, so restoring cannot undo the compaction.
 */
import { posix } from "node:path";
import { protectedDataOptedIn } from "../../dataflow/processorRegistry.js";
import { readEventPayload } from "../../session/eventPayload.js";
import type { SessionService } from "../../session/sessionService.js";
import { SPILL_META_KEY } from "../../session/spill/spillTypes.js";
import { describeLiveEntries } from "../../session/surfaceCompaction.js";
import { compactionReceipt } from "../../session/surfaceCompactionValidation.js";
import type { EvidenceEvent } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import type { StepRunnerInit } from "../stepRunner.js";

export const RESTORE_MAX_FILES = 5;
export const RESTORE_MAX_BYTES = 32_000;
/** Room for the read tool's own truncation note, which it writes after `maxBytes`. */
const NOTE_ROOM = 256;
const FILE_TOOLS: ReadonlySet<string> = new Set(["fs.read", "fs.write", "fs.edit"]);
const TRUNCATED = "\n[amc: truncated at ";
export const FILES_RESTORED_AUDIT = "COMPACTION_FILES_RESTORED";
export const OVERFLOW_DECISION_AUDIT = "CONTEXT_OVERFLOW_RECOVERY";

export interface RestoredFile {
  readonly path: string;
  /** sha256 of the text placed in context (the read tool's output), not of the file. */
  readonly sha256: string;
  readonly bytes: number;
  /** Compared with the agent's last full read of the same path; null when the two are not comparable. */
  readonly changedSinceLastRead: boolean | null;
}

interface Touch {
  readonly path: string;
  lastRead: { readonly sha256: string; readonly comparable: boolean } | null;
  /** Its newest content is still in context: the last read's result is live, or a later restore put it there. */
  inContext: boolean;
}

type Meta = Record<string, unknown>;
const metaOf = (row: EvidenceEvent): Meta => JSON.parse(row.meta_json) as Meta;
const callKey = (meta: Meta): string => `${String(meta.turn)}:${String(meta.step)}:${String(meta.toolCallId)}`;

function argumentsOf(workspace: string, row: EvidenceEvent): Meta | null {
  const read = readEventPayload(workspace, row);
  if (read.status !== "ok") return null;
  try {
    const value: unknown = JSON.parse(read.bytes.toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Meta : null;
  } catch { return null; }
}

function wholeText(workspace: string, row: EvidenceEvent): boolean {
  const read = readEventPayload(workspace, row);
  return read.status === "ok" && !read.bytes.toString("utf8").includes(TRUNCATED);
}

/**
 * Files this session's own successful file calls named, newest first, one per path. A restore after the newest call
 * of a path counts as being in context: restored text enters as a message no compaction removes, so it is not added twice.
 */
export function recentFiles(workspace: string, events: readonly EvidenceEvent[]): readonly Touch[] {
  const results = new Map(events.filter(row => row.event_type === "tool/result").map(row => [callKey(metaOf(row)), row]));
  const live = new Map(describeLiveEntries(events).map(entry => [entry.originEventId, entry]));
  const touches = new Map<string, Touch>();
  for (const row of [...events].reverse()) {
    if (row.event_type === "audit" && metaOf(row).auditType === FILES_RESTORED_AUDIT) {
      for (const file of restoredFiles(workspace, row) ?? []) if (!touches.has(file.path)) touches.set(file.path, { path: file.path, lastRead: null, inContext: true });
      continue;
    }
    const meta = row.event_type === "tool/call" ? metaOf(row) : null;
    if (meta === null || !FILE_TOOLS.has(String(meta.toolName))) continue;
    const result = results.get(callKey(meta));
    if (result === undefined || metaOf(result).outcome !== "OK" || metaOf(result).denied === true) continue;
    const args = argumentsOf(workspace, row), raw = args?.path;
    if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0")) continue;
    const path = posix.normalize(raw);
    const touch = touches.get(path) ?? { path, lastRead: null, inContext: false };
    touches.set(path, touch);
    if (meta.toolName !== "fs.read" || touch.lastRead !== null) continue;
    const entry = live.get(result.id);
    if (!touch.inContext) touch.inContext = entry !== undefined && entry.sourceEventId === result.id;
    // Only a whole, unspilled read is the same text a new whole read would produce.
    touch.lastRead = { sha256: result.payload_sha256,
      comparable: Object.keys(args!).length === 1 && metaOf(result)[SPILL_META_KEY] == null && wholeText(workspace, result) };
  }
  return [...touches.values()];
}

/**
 * Read recent files again after the compactions `freedIds` removed context. Returns the id of the signed
 * `COMPACTION_FILES_RESTORED` row (paths and digests in its encrypted payload, never content), or null.
 */
export async function restoreFilesAfterCompaction(init: StepRunnerInit, turn: number, step: number, freedIds: readonly string[],
  signal: AbortSignal): Promise<string | null> {
  const { session, tools } = init;
  // Skipped where protected-data redaction is on: restored text enters as tool context, whose redaction differs from a
  // tool result's (no declared-field rules), so it would not be redacted exactly as a normal read is.
  if (freedIds.length === 0 || tools.asksBeforeRunning?.("fs.read") === true || !tools.schemas()?.some(schema => schema.name === "fs.read")
    || protectedDataOptedIn(session.workspace)) return null;
  const events = session.readEvents(), freed = new Set(freedIds);
  const saved = events.filter(row => freed.has(row.id)).reduce((sum, row) => sum + compactionReceipt(row).savedBytes, 0);
  const budget = Math.min(RESTORE_MAX_BYTES, Math.floor(saved / 2));
  let left = budget;
  const restored: RestoredFile[] = [];
  const candidates = recentFiles(session.workspace, events).filter(touch => !touch.inContext).slice(0, RESTORE_MAX_FILES);
  for (const [index, touch] of candidates.entries()) {
    if (left <= NOTE_ROOM) break;
    signal.throwIfAborted();
    const outcome = await tools.execute({ callId: `amc-restore-${turn}-${step}-${index + 1}`, toolName: "fs.read",
      rawArguments: JSON.stringify({ path: touch.path, maxBytes: left - NOTE_ROOM }), sessionId: session.sessionId,
      turn, step, parentToken: null, dispatch: "native", signal });
    if (outcome.denied || outcome.outcome !== "OK") continue;
    const text = typeof outcome.content === "string" ? outcome.content : outcome.content.toString("utf8");
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > left) continue; // a seam that ignored maxBytes
    const sha256 = sha256Hex(text);
    const changed = touch.lastRead?.comparable === true && !text.includes(TRUNCATED) ? sha256 !== touch.lastRead.sha256 : null;
    init.acceptContext(`[amc: file read again after compaction: ${touch.path}; sha256 of this text ${sha256}; `
      + `${changed === null ? "not compared with your last read" : changed ? "CHANGED since your last read" : "unchanged since your last read"}]\n${text}`);
    left -= bytes;
    restored.push({ path: touch.path, sha256, bytes, changedSinceLastRead: changed });
  }
  if (restored.length === 0) return null;
  // Paths go in the payload (encrypted at rest), as tool file changes do; the plain meta carries counts only.
  return session.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify({ files: restored }), meta: {
    auditType: FILES_RESTORED_AUDIT, version: 1, turn, step, compactionEventIds: [...freedIds], files: restored.length,
    bytes: budget - left, maxFiles: RESTORE_MAX_FILES, maxBytes: budget,
    note: "the text placed in context came from the tool seam's fs.read; paths and digests are in the payload, not the content" } }).eventId;
}

/** The signed decision after a provider refused a request as too large for the context window. */
export function recordOverflowDecision(session: SessionService, decision: { readonly turn: number; readonly step: number;
  readonly failureEventId: string | null; readonly decision: "retry" | "end"; readonly reason: string;
  readonly compactionEventIds: readonly string[]; readonly restoredFilesEventId?: string | null }): void {
  session.recordProjectedEvidence({ eventType: "audit", payload: "", meta: { auditType: OVERFLOW_DECISION_AUDIT, version: 1,
    turn: decision.turn, step: decision.step, failureEventId: decision.failureEventId, decision: decision.decision, reason: decision.reason,
    compactionEventIds: [...decision.compactionEventIds], restoredFilesEventId: decision.restoredFilesEventId ?? null } });
}

/** Plain-words lines for `amc session show`: why each turn compacted, what it did after an overflow, which files came back. */
export function describeCompactionFollowUps(workspace: string, events: readonly EvidenceEvent[]): string[] {
  const lines: string[] = [];
  const kinds = new Map<number, { threshold: number; overflow: number; merged: number }>();
  for (const row of events) {
    const meta = metaOf(row), turn = typeof meta.turn === "number" ? meta.turn : null;
    if (turn === null) continue;
    if (row.event_type === "loop/compact") {
      let receipt;
      try { receipt = compactionReceipt(row); } catch { continue; }
      if (receipt.v !== 2) continue;
      const count = kinds.get(turn) ?? { threshold: 0, overflow: 0, merged: 0 };
      if (receipt.trigger.kind === "overflow") count.overflow += 1; else count.threshold += 1;
      if (receipt.summarizer?.mergedPreviousSummaryEventId !== undefined) count.merged += 1;
      kinds.set(turn, count);
    } else if (row.event_type === "audit" && meta.auditType === OVERFLOW_DECISION_AUDIT) {
      lines.push(meta.decision === "retry"
        ? `Turn ${turn}: a request was too large for the model's context window. AMC compacted the context and asked once more.`
        : `Turn ${turn}: a request was too large for the model's context window, and ${String(meta.reason).replace(/^the request was too large for the model's context window; /, "")}.`);
    } else if (row.event_type === "audit" && meta.auditType === FILES_RESTORED_AUDIT) {
      lines.push(`Turn ${turn}: after compaction, AMC read ${String(meta.files)} file(s) into context again: ${restoredNames(workspace, row)}.`);
    }
  }
  const reasons = [...kinds].sort((a, b) => a[0] - b[0]).map(([turn, count]) => {
    const why = [count.threshold > 0 ? `${count.threshold} because the context reached the compaction limit` : "",
      count.overflow > 0 ? `${count.overflow} because a request was too large for the window` : ""].filter(Boolean).join(", ");
    return `Turn ${turn}: ${count.threshold + count.overflow} automatic compaction change(s), ${why}`
      + `${count.merged > 0 ? "; the new summary merged the previous one" : ""}. The original messages stay in the log.`;
  });
  return [...reasons, ...lines];
}

function restoredFiles(workspace: string, row: EvidenceEvent): readonly RestoredFile[] | null {
  const read = readEventPayload(workspace, row);
  if (read.status !== "ok") return null;
  try {
    const files: unknown = (JSON.parse(read.bytes.toString("utf8")) as { files?: unknown }).files;
    return Array.isArray(files) ? files.filter((file): file is RestoredFile => typeof (file as RestoredFile)?.path === "string") : null;
  } catch { return null; }
}

function restoredNames(workspace: string, row: EvidenceEvent): string {
  const files = restoredFiles(workspace, row);
  if (files === null) return "the file names could not be read (they are stored encrypted; unlock the vault with amc vault unlock)";
  return files.map(file => `${file.path}${file.changedSinceLastRead === true ? " (changed since the agent last read it)" : ""}`).join(", ");
}
