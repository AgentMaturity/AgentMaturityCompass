import { unlinkSync } from "node:fs";
import { redactSecrets } from "../../shield/redaction/redactSecrets.js";
import { sha256Hex } from "../../utils/hash.js";
import type { ToolExecution } from "../toolTypes.js";
import { DefiniteFailureError } from "../toolTypes.js";
import { writeFileAtomicSync } from "./atomicWrite.js";
import { readRegularFile } from "./fsRegularFile.js";
import { unifiedDiff } from "./lineDiff.js";
import type { ReadBeforeEditLedger } from "./readBeforeEdit.js";
import { insideWorkspace } from "./workspacePath.js";

/**
 * The write primitives every filesystem tool shares (fs.write, fs.edit, apply_patch): read what is there, show a
 * redacted diff, and publish or delete only while the file still holds the bytes the plan described.
 */

const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The file's bytes, or null when it does not exist. Any other failure (a directory, no permission) is thrown. */
function readIfExists(full: string): Buffer | null {
  try {
    return readRegularFile(full);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The workspace target of a write, resolved before anything is written: a path outside the workspace or inside a
 * protected directory is a definite failure, not an ambiguous one.
 */
export function writeTarget(workspace: string, path: string): { readonly full: string; readonly rel: string } {
  try {
    return insideWorkspace(workspace, path);
  } catch (error) {
    throw refuseBeforeWrite(error instanceof Error ? error.message : String(error));
  }
}

/**
 * The phase-1 read of a write: the bytes there, or null when absent. Any other failure (a directory or FIFO there, no
 * permission, a path that moved while opening) is a refusal before any byte is written, so a journaled call records a
 * definite failure; the message names the path the agent gave, never the host path.
 */
export function readBeforeWrite(full: string, shown: string): Buffer | null {
  try {
    return readIfExists(full);
  } catch (error) {
    throw refuseBeforeWrite((error instanceof Error ? error.message : String(error)).split(full).join(shown));
  }
}

/** The exact text of `raw`, or null when it is not valid UTF-8: decoding would replace bytes, and writing back would change them. */
export function utf8(raw: Buffer): string | null {
  try {
    return UTF8.decode(raw);
  } catch {
    return null;
  }
}

/** Text fit to show as lines: valid UTF-8 with no NUL byte, which marks binary content. */
const displayText = (raw: Buffer): string | null => (raw.includes(0) ? null : utf8(raw));

/**
 * The diff a tool result shows, redacted with the shared secret patterns before it reaches the model or the ledger.
 * Redaction is display only: the file gets the bytes the agent asked for.
 */
export function shownDiff(rel: string, before: Buffer, after: Buffer): { readonly text: string; readonly truncated: boolean } {
  const oldText = displayText(before);
  const newText = displayText(after);
  const diff = oldText === null || newText === null
    ? { text: before.equals(after) ? "" : `Binary files a/${rel} and b/${rel} differ`, truncated: false }
    : unifiedDiff(rel, oldText, newText);
  return { text: redactSecrets(diff.text, (type) => `[AMC_REDACTED:${type}]`).redacted, truncated: diff.truncated };
}

/** A refusal before any byte was written: provably no effect, so a journaled call records a definite failure. */
export function refuseBeforeWrite(message: string): DefiniteFailureError {
  return new DefiniteFailureError(message);
}

/** The commit-time check both publication and deletion make: same location, same bytes the plan described. */
function stillAsPlanned(execution: ToolExecution, ledger: ReadBeforeEditLedger, full: string, path: string, before: Buffer | null): void {
  if (insideWorkspace(execution.workspace, path).full !== full) {
    throw new Error(`"${path}" changed location while this call ran — read it again, then retry`);
  }
  const verdict = before === null
    ? ledger.mayWrite(execution.agentId, full)
    : ledger.mayEdit(execution.agentId, full, sha256Hex(before));
  if (!verdict.ok) throw new Error(`"${path}" changed while this call ran — ${verdict.reason}`);
}

/**
 * Validate the planning snapshot and observation at publication, after staging has finished. `mode` is the permission
 * bits a created file takes (a move keeps its source's); a replaced file keeps its own.
 *
 * These synchronous bodies cannot interleave within one JavaScript thread. Portable Node has no digest-CAS against
 * external writers: an uncooperative process can still race the final check and rename.
 */
export function writeIfUnchanged(execution: ToolExecution, ledger: ReadBeforeEditLedger, full: string, path: string,
  before: Buffer | null, after: Buffer, mode?: number): void {
  writeFileAtomicSync(full, after, {
    createOnly: before === null,
    ...(mode === undefined ? {} : { mode }),
    beforeCommit: () => stillAsPlanned(execution, ledger, full, path, before)
  });
}

/** Unlink a file the agent has read, only while it still holds the bytes the plan described. Same race note as above. */
export function deleteIfUnchanged(execution: ToolExecution, ledger: ReadBeforeEditLedger, full: string, path: string, before: Buffer): void {
  stillAsPlanned(execution, ledger, full, path, before);
  unlinkSync(full);
}
