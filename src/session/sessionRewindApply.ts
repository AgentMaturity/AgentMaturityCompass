/**
 * HP-06: applying a rewind plan (./sessionRewind.ts). Every kept copy is read back and checked before the first file
 * changes. SESSION_REWIND_INTENDED is written to the signed operations audit before the first file, and
 * SESSION_REWIND_FINISHED, citing it, after the last; each file's outcome is total, so FINISHED is always written once
 * INTENDED was. Neither row names a path or a plain content digest: entries cite the session's own checkpoint rows
 * (whose encrypted payload names the path), and a restored file is measured as sha256(salt || bytes), the form of the
 * checkpoint's signed commitment.
 *
 * Location, checked like the file tools check theirs (fsWritePrimitives.ts stillAsPlanned, here with the stricter
 * link-free resolution): right before every write and every removal, the path must still resolve, with no link on the
 * way, to the location planned, and the file must hold the bytes planned. A removal unlinks only a regular file there.
 * The write is the file tools' own primitive (writeFileAtomicSync: a temp file in the same folder, then a rename;
 * create-only for a file that does not exist). The residual is the one the file tools state for themselves: portable
 * Node has no compare-and-swap against another process, which can still race the final check and the rename or unlink.
 */
import { chmodSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { dirname } from "node:path";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { writeFileAtomicSync } from "../tools/builtin/atomicWrite.js";
import { CHECKPOINT_SALT_BYTES } from "../tools/builtin/fileCheckpoint.js";
import { readRegularFile } from "../tools/builtin/fsRegularFile.js";
import { insideWorkspaceNoLinks } from "../tools/builtin/workspacePath.js";
import { sha256Hex } from "../utils/hash.js";
import { loadSessionEventHistory } from "./sessionEventHistory.js";
import { currentDigest, REWIND_FINISHED_AUDIT, REWIND_INTENDED_AUDIT, SessionRewindRefused, type RewindFile, type RewindPlan } from "./sessionRewind.js";
import { retrieveSpilledContent } from "./spill/spillEvidence.js";

/** A re-created file whose checkpoint recorded no permission bits is readable by its owner only. */
export const RECREATED_DEFAULT_MODE = 0o600;

type Status = "restored" | "recreated" | "removed" | "already" | "failed";
export interface RewindOutcome {
  readonly intendedEventId: string;
  readonly finishedEventId: string;
  readonly results: readonly { readonly path: string; readonly status: Status; readonly modeDefaulted: boolean }[];
}

/** Who ran the rewind, as this machine names them. A local fact, not a sign-in. */
function rewindActor(): { readonly user: string; readonly host: string; readonly how: "terminal-no-sign-in" } {
  return { user: userInfo().username, host: hostname(), how: "terminal-no-sign-in" };
}

interface Kept { readonly salt: Buffer; readonly content: Buffer }

function readKept(workspace: string, plan: RewindPlan): (Kept | null)[] {
  const rows = loadSessionEventHistory({ workspace, sessionId: plan.sessionId }).events;
  return plan.files.map((file) => {
    if (file.commitmentEventId === null) return null;
    let object: Buffer;
    try { object = retrieveSpilledContent(workspace, rows.find((row) => row.id === file.commitmentEventId)!); }
    catch (error) { throw new SessionRewindRefused("PRE_IMAGE", `The earlier content of ${file.path} could not be read back (${error instanceof Error ? error.message : String(error)}); nothing was written. If the vault is locked, unlock it and try again.`); }
    const kept = { salt: Buffer.from(object.subarray(0, CHECKPOINT_SALT_BYTES)), content: Buffer.from(object.subarray(CHECKPOINT_SALT_BYTES)) };
    object.fill(0);
    if (sha256Hex(kept.content) !== file.toSha256) throw new SessionRewindRefused("PRE_IMAGE", `The kept copy of ${file.path} does not match its signed record; nothing was written.`);
    return kept;
  });
}

/**
 * sha256(salt || the file's bytes now); for a file with no kept copy (a removal) only "present", never a plain digest;
 * null when there is no regular file. Never throws.
 */
function measured(full: string, salt: Buffer | null): string | null {
  try { const bytes = readRegularFile(full); return salt === null ? "present" : sha256Hex(Buffer.concat([salt, bytes])); }
  catch { return null; }
}

/** Put one file back. Throws when its location or bytes are not what was planned. */
function applyOne(workspace: string, file: RewindFile, kept: Kept | null): { status: Exclude<Status, "failed">; modeDefaulted: boolean } {
  const planned = insideWorkspaceNoLinks(workspace, file.path).full;
  // The commit-time check: the same link-free location, holding the planned bytes.
  // The place is checked last, after reading the bytes, so nothing between the check and the write or unlink reads the disk.
  const stillAsPlanned = () => {
    if (currentDigest(planned) !== file.fromSha256) throw new Error("the file changed while the rewind ran");
    if (insideWorkspaceNoLinks(workspace, file.path).full !== planned) throw new Error("the path changed location while the rewind ran");
  };
  if (file.action === "already") return { status: "already", modeDefaulted: false };
  if (file.action === "remove") {
    if (!lstatSync(planned).isFile()) throw new Error("not a regular file");
    stillAsPlanned();
    unlinkSync(planned);
    return { status: "removed", modeDefaulted: false };
  }
  const recreate = file.action === "recreate";
  stillAsPlanned();
  mkdirSync(dirname(planned), { recursive: true });
  const mode = file.mode ?? (recreate ? RECREATED_DEFAULT_MODE : undefined);
  writeFileAtomicSync(planned, kept!.content, { createOnly: recreate, ...(recreate && mode !== undefined ? { mode } : {}), beforeCommit: stillAsPlanned });
  if (!recreate && file.mode !== null && (lstatSync(planned).mode & 0o7777) !== file.mode) {
    if (insideWorkspaceNoLinks(workspace, file.path).full === planned) chmodSync(planned, file.mode);
  }
  return { status: recreate ? "recreated" : "restored", modeDefaulted: recreate && file.mode === null };
}

/** Apply a plan the person confirmed. */
export function executeSessionRewind(plan: RewindPlan, options: { readonly onlyClean: boolean }): RewindOutcome {
  const { workspace } = plan;
  if (plan.conflicts.length > 0 && !options.onlyClean) {
    throw new SessionRewindRefused("CONFLICTS", `${plan.conflicts.length} file(s) cannot be put back safely, so nothing was written. Add --only-clean to put back only the others.`);
  }
  const kept = readKept(workspace, plan);
  const intended = appendOpsAuditEvent({ workspace, auditType: REWIND_INTENDED_AUDIT, subjectId: plan.sessionId, payload: {
    v: 2, sessionId: plan.sessionId, toTurn: plan.toTurn, parentHeadEventHash: plan.parentHeadEventHash, by: rewindActor(), onlyClean: options.onlyClean,
    conflicts: plan.conflicts.length, uncoveredCalls: plan.uncoveredCalls,
    ...(plan.unfinishedIntendedEventId === null ? {} : { resumes: plan.unfinishedIntendedEventId }),
    files: plan.files.map((file) => ({ checkpointEventId: file.checkpointEventId, commitmentEventId: file.commitmentEventId, action: file.action })) } });
  const results = plan.files.map((file, index) => {
    try { return { path: file.path, ...applyOne(workspace, file, kept[index] ?? null) }; }
    catch { return { path: file.path, status: "failed" as const, modeDefaulted: false }; }
  });
  const outcomes = results.map((result, index) => {
    const file = plan.files[index]!;
    // Measured at the planned location, link-free; a location that no longer resolves is recorded as unknown.
    let at: string | null = null;
    try { at = insideWorkspaceNoLinks(workspace, file.path).full; } catch { at = null; }
    return { status: result.status, location: at === null ? "unresolved" : "verified",
      restoredDigest: at === null ? "unknown" : measured(at, kept[index]?.salt ?? null) };
  });
  const finished = appendOpsAuditEvent({ workspace, auditType: REWIND_FINISHED_AUDIT, subjectId: plan.sessionId, payload: {
    v: 2, intendedEventId: intended.eventId, intendedEventHash: intended.eventHash, sessionId: plan.sessionId, toTurn: plan.toTurn,
    parentHeadEventHash: plan.parentHeadEventHash, ok: results.every((result) => result.status !== "failed"), conflicts: plan.conflicts.length, outcomes } });
  for (const entry of kept) { entry?.content.fill(0); entry?.salt.fill(0); }
  return { intendedEventId: intended.eventId, finishedEventId: finished.eventId, results };
}
