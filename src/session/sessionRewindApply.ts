/**
 * HP-06: applying a rewind plan (./sessionRewind.ts). Every kept copy is read back and checked before the first file
 * changes. SESSION_REWIND_INTENDED is written to the signed operations audit before the first file, and
 * SESSION_REWIND_FINISHED, citing it, after the last; each file's outcome is total, so FINISHED is always written once
 * INTENDED was (also when the working folder cannot be restored: the files not reached are recorded as failed, and the
 * rewind then stops and says so). Neither row names a path or a plain content digest: entries cite the session's own checkpoint rows
 * (whose encrypted payload names the path), and a restored file is measured as sha256(salt || bytes), the form of the
 * checkpoint's signed commitment.
 *
 * Location, checked like the file tools check theirs (fsWritePrimitives.ts stillAsPlanned, here with the stricter
 * link-free resolution): right before every write and every removal, the path must still resolve, with no link on the
 * way, to the location planned, and the file must hold the bytes planned. A removal unlinks only a regular file there.
 * The act itself runs in a pinned folder (../tools/builtin/pinnedDirectory.ts): the folder that receives the write or
 * the removal is entered and checked first, and the temp file, the create, the rename and the unlink then name the file
 * relative to it, so a folder on the path swapped for a link after the check cannot send the act outside the workspace.
 * A pinned folder that is itself moved away (and replaced by a real folder at the planned place) is caught by the
 * commit-time check, which requires the pinned folder to be the one at the planned place (same device and inode). That
 * narrows the window for a move to the time between that check and the system call; it does not close it.
 * A replace is a temp file in the same folder, then a rename; a re-created file is create-only; the recorded mode is
 * set on the new inode before it is published. Kept copies are read and checked before anything is pinned.
 */
import { lstatSync, realpathSync, statSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { CHECKPOINT_SALT_BYTES } from "../tools/builtin/fileCheckpoint.js";
import { readRegularFile } from "../tools/builtin/fsRegularFile.js";
import { pinnedDirectoryRefusal, withPinnedDirectory } from "../tools/builtin/pinnedDirectory.js";
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

/** Put one file back. Throws when its location or bytes are not what was planned. `root` is the workspace's real path. */
function applyOne(root: string, file: RewindFile, kept: Kept | null): { status: Exclude<Status, "failed">; modeDefaulted: boolean } {
  if (file.action === "already") return { status: "already", modeDefaulted: false };
  const planned = insideWorkspaceNoLinks(root, file.path).full;
  const folders = relative(root, planned).split(sep);
  const name = folders.pop()!;
  // The commit-time check: the same link-free location, holding the planned bytes (read at `at`). Inside the pin it
  // first requires the pinned folder to be the folder at the planned place (a move of the pinned folder itself is
  // caught here; this narrows the window to check-to-system-call, it does not close it).
  // The place is checked last, after reading the bytes, so nothing between the check and the write or unlink reads the disk.
  const stillAsPlanned = (at: string, pinned: boolean) => () => {
    if (pinned) {
      const here = statSync("."), there = lstatSync(dirname(planned));
      if (!there.isDirectory() || here.dev !== there.dev || here.ino !== there.ino) throw new Error("the folder moved while the rewind ran");
    }
    if (currentDigest(at) !== file.fromSha256) throw new Error("the file changed while the rewind ran");
    if (insideWorkspaceNoLinks(root, file.path).full !== planned) throw new Error("the path changed location while the rewind ran");
  };
  stillAsPlanned(planned, false)(); // a changed file or place refuses before any folder is made
  return withPinnedDirectory(root, folders, file.action !== "remove", (dir) => {
    const here = stillAsPlanned(`./${name}`, true);
    if (file.action === "remove") { dir.remove(name, here); return { status: "removed" as const, modeDefaulted: false }; }
    const recreate = file.action === "recreate";
    const mode = file.mode ?? (recreate ? RECREATED_DEFAULT_MODE : undefined);
    dir.write(name, kept!.content, { createOnly: recreate, ...(mode === undefined ? {} : { mode }), beforeCommit: here });
    return { status: recreate ? "recreated" as const : "restored" as const, modeDefaulted: recreate && file.mode === null };
  });
}

/** Apply a plan the person confirmed. `platform` is for tests. */
export function executeSessionRewind(plan: RewindPlan, options: { readonly onlyClean: boolean; readonly platform?: NodeJS.Platform }): RewindOutcome {
  const { workspace } = plan;
  if (plan.conflicts.length > 0 && !options.onlyClean) {
    throw new SessionRewindRefused("CONFLICTS", `${plan.conflicts.length} file(s) cannot be put back safely, so nothing was written. Add --only-clean to put back only the others.`);
  }
  assertRewindCanRun(options.platform);
  const root = realpathSync.native(resolve(workspace));
  const kept = readKept(workspace, plan);
  try {
    const intended = appendOpsAuditEvent({ workspace, auditType: REWIND_INTENDED_AUDIT, subjectId: plan.sessionId, payload: {
      v: 2, sessionId: plan.sessionId, toTurn: plan.toTurn, parentHeadEventHash: plan.parentHeadEventHash, by: rewindActor(), onlyClean: options.onlyClean,
      conflicts: plan.conflicts.length, uncoveredCalls: plan.uncoveredCalls,
      ...(plan.unfinishedIntendedEventId === null ? {} : { resumes: plan.unfinishedIntendedEventId }),
      files: plan.files.map((file) => ({ checkpointEventId: file.checkpointEventId, commitmentEventId: file.commitmentEventId, action: file.action })) } });
    let lost: Error | null = null;
    const results = plan.files.map((file, index) => {
      const failed = { path: file.path, status: "failed" as const, modeDefaulted: false };
      if (lost !== null) return failed; // not reached: the process is no longer in the folder it started in
      try { return { path: file.path, ...applyOne(root, file, kept[index] ?? null) }; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_AMC_PIN_RESTORE") lost = error as Error;
        return failed;
      }
    });
    const outcomes = results.map((result, index) => {
      const file = plan.files[index]!;
      // Measured at the planned location, link-free; a location that no longer resolves is recorded as unknown.
      let at: string | null = null;
      try { at = insideWorkspaceNoLinks(root, file.path).full; } catch { at = null; }
      return { status: result.status, location: at === null ? "unresolved" : "verified",
        restoredDigest: at === null ? "unknown" : measured(at, kept[index]?.salt ?? null) };
    });
    const finished = appendOpsAuditEvent({ workspace, auditType: REWIND_FINISHED_AUDIT, subjectId: plan.sessionId, payload: {
      v: 2, intendedEventId: intended.eventId, intendedEventHash: intended.eventHash, sessionId: plan.sessionId, toTurn: plan.toTurn,
      parentHeadEventHash: plan.parentHeadEventHash, ok: results.every((result) => result.status !== "failed"), conflicts: plan.conflicts.length, outcomes } });
    if (lost !== null) {
      throw new SessionRewindRefused("INTERRUPTED", `The rewind stopped part way: AMC could not return to the folder it was started in (${(lost as Error).message}). Some files may already have been changed; it was recorded as rewind ${finished.eventId}. Run the same rewind again from the workspace folder to put back the rest; files already back count as done.`);
    }
    return { intendedEventId: intended.eventId, finishedEventId: finished.eventId, results };
  } finally {
    for (const entry of kept) { entry?.content.fill(0); entry?.salt.fill(0); }
  }
}

/** Refuses where the folder that receives a change cannot be pinned (a worker thread, Windows). `platform` is for tests. */
export function assertRewindCanRun(platform?: NodeJS.Platform): void {
  const refusal = pinnedDirectoryRefusal(platform);
  if (refusal !== null) throw new SessionRewindRefused("PLATFORM", `This version of AMC cannot rewind files here (${refusal}): it cannot check safely that each file is changed only in its own folder. Nothing was changed. --dry-run still shows the plan.`);
}
