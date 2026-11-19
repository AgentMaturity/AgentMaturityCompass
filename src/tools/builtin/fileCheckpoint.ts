/**
 * HP-06: pre-image checkpoints for the native file tools (fs.write, fs.edit, apply_patch). Before one of them changes a
 * file, the file's prior bytes are kept as an encrypted spill object behind a signed `tool/spill-commitment` row (subject
 * `file/checkpoint`), and a signed NATIVE_FILE_CHECKPOINT audit row names the call, the turn and the outcome. The path and
 * the content digests sit in that row's payload only, the side encrypted at rest; plain meta carries the call id, the
 * status and the spill locator (whose commitment already holds the signed content digest).
 *
 * Because the objects are spill objects, the existing spill lifecycle covers them: inventory, explicit erasure (with the
 * legal-hold gate), encrypted export and restore, bundle transport and the SQLite retention path. Nothing here keeps a
 * plaintext copy: without the workspace blob key the write still happens and the row says the file was not checkpointed.
 * In protected-data mode (redaction on for the session) no earlier content is kept at all: reason protected-data-mode.
 * The stored object is a random salt followed by the bytes, so no plain digest of the earlier file appears in plain meta.
 *
 * Not covered: bash, background jobs and terminals change files with no pre-image; SIMULATE writes nothing, so nothing
 * is kept. A surface whose session writer cannot retain checkpoints (no `retainFileCheckpoint`) records nothing, and a
 * rewind then lists its files as having no pre-image.
 */
import { randomBytes } from "node:crypto";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { extractSpillRef, type SpillRef } from "../../session/spill/spillTypes.js";
import type { EvidenceEvent } from "../../types.js";
import type { ToolExecution } from "../toolTypes.js";
import { refuseBeforeWrite } from "./fsWritePrimitives.js";

export const FILE_CHECKPOINT_AUDIT = "NATIVE_FILE_CHECKPOINT";
/** Largest single pre-image kept (also bounded by the signed ops policy's maxBlobBytes). */
const MAX_CHECKPOINT_FILE_BYTES = 8 * 1024 * 1024;
/** Pre-image bytes one session may keep; later files are recorded as not checkpointed. */
const MAX_CHECKPOINT_SESSION_BYTES = 64 * 1024 * 1024;
/**
 * Random bytes stored ahead of each pre-image. The spill commitment's plain meta carries the object's digest; without
 * the salt that would be the plain digest of the earlier file, which a short secret is brute-forced from.
 */
export const CHECKPOINT_SALT_BYTES = 32;
/** The closed reasons a pre-image was not kept, beside the status. */
type CheckpointReason = "no-encryption-key" | "object-not-published" | "protected-data-mode";

/** stored: bytes kept; absent: the file did not exist; the other three: no pre-image, so the file cannot be rewound. */
type CheckpointStatus = "stored" | "absent" | "too-large" | "session-limit" | "not-stored";

export interface FileCheckpointWriter {
  recordProjectedEvidence(row: { readonly eventType: "audit"; readonly payload: string; readonly meta: Record<string, unknown> }): unknown;
  retainFileCheckpoint(bytes: Buffer, callId: string, cap: number): SpillRef;
  /** The session's rows, so a resumed session (a new process each chat turn) counts what it already kept. */
  readEvents?(): readonly EvidenceEvent[];
}

/** Called by a file tool after its plan is fixed and before the change lands. `after` is null for a delete. */
export type FileCheckpoint = (execution: ToolExecution, rel: string, before: Buffer | null, after: Buffer | null) => void;

interface SessionTally { bytes: number; readonly stored: Map<string, string> }
interface Limits { readonly fileBytes: number; readonly sessionBytes: number }

/** What the session already kept, from its signed `file/checkpoint` commitments: the session cap spans every process. */
function seedTally(writer: FileCheckpointWriter): SessionTally {
  const tally: SessionTally = { bytes: 0, stored: new Map<string, string>() };
  for (const row of writer.readEvents?.() ?? []) {
    if (row.event_type !== "tool/spill-commitment" || !row.meta_json.includes("file/checkpoint")) continue;
    const ref = extractSpillRef(row.meta_json);
    if ((JSON.parse(row.meta_json) as { subject?: unknown }).subject !== "file/checkpoint" || ref?.locator == null) continue;
    tally.bytes += Math.max(0, ref.bytes - CHECKPOINT_SALT_BYTES);
  }
  return tally;
}

function retain(writer: FileCheckpointWriter, execution: ToolExecution, before: Buffer, tally: SessionTally, limits: Limits): { status: CheckpointStatus; locator: string | null; reason: CheckpointReason | null } {
  const digest = sha256Hex(before);
  const known = tally.stored.get(digest);
  if (known !== undefined) return { status: "stored", locator: known, reason: null };
  if (before.length > limits.fileBytes) return { status: "too-large", locator: null, reason: null };
  if (tally.bytes + before.length > limits.sessionBytes) return { status: "session-limit", locator: null, reason: null };
  let ref: SpillRef;
  const salted = Buffer.concat([randomBytes(CHECKPOINT_SALT_BYTES), before]);
  try {
    ref = writer.retainFileCheckpoint(salted, execution.callId, limits.fileBytes + CHECKPOINT_SALT_BYTES);
  } catch (error) {
    const stage = (error as { stage?: unknown }).stage;
    // A commitment append that failed is lost evidence, not a missing key: the write must not land after it.
    if (stage === "commit") throw error;
    return { status: "not-stored", locator: null, reason: stage === "protected-data" ? "protected-data-mode" : stage === "persist" ? "object-not-published" : "no-encryption-key" };
  } finally { salted.fill(0); }
  if (ref.locator === null) return { status: "not-stored", locator: null, reason: "object-not-published" };
  tally.bytes += before.length;
  tally.stored.set(digest, ref.locator);
  return { status: "stored", locator: ref.locator, reason: null };
}

/** The file's permission bits now, before the tool changes it; null when it cannot be read. */
function modeOf(workspace: string, rel: string): number | null {
  try { return lstatSync(join(workspace, rel)).mode & 0o7777; } catch { return null; }
}

/**
 * One checkpointer per toolset. `writer` is read per call (fork and resume rebind the session); null keeps nothing.
 * A row that cannot be written refuses the write before any byte changes.
 */
export function fileCheckpoints(writer: () => FileCheckpointWriter | null,
  limits: Limits = { fileBytes: MAX_CHECKPOINT_FILE_BYTES, sessionBytes: MAX_CHECKPOINT_SESSION_BYTES }): FileCheckpoint {
  const tallies = new Map<string, SessionTally>();
  return (execution, rel, before, after) => {
    if (execution.effectiveMode === "SIMULATE") return;
    const current = writer();
    if (current === null) return;
    const sessionKey = execution.ownerStep?.sessionId ?? "";
    const tally = tallies.get(sessionKey) ?? seedTally(current);
    tallies.set(sessionKey, tally);
    try {
      const kept = before === null ? { status: "absent" as const, locator: null, reason: null } : retain(current, execution, before, tally, limits);
      const mode = before === null ? null : modeOf(execution.workspace, rel);
      const payload = { path: rel, beforeSha256: before === null ? null : sha256Hex(before), afterSha256: after === null ? null : sha256Hex(after),
        bytes: before?.length ?? 0, status: kept.status, ...(mode === null ? {} : { mode }), ...(kept.reason === null ? {} : { reason: kept.reason }) };
      current.recordProjectedEvidence({ eventType: "audit", payload: JSON.stringify(payload), meta: {
        auditType: FILE_CHECKPOINT_AUDIT, v: 1, callId: execution.callId, status: kept.status, locator: kept.locator,
        ...(kept.reason === null ? {} : { reason: kept.reason }) } });
    } catch (error) {
      throw refuseBeforeWrite(`the prior bytes of "${rel}" could not be recorded (${error instanceof Error ? error.message : String(error)}); nothing was written`);
    }
  };
}
