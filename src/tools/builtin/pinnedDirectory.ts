/**
 * Act on the files of one folder so that swapping any folder on its path afterwards (a folder replaced by a link, by
 * another process) cannot redirect the act. Node has no openat, so the process working directory is the folder
 * handle: each folder is entered from the one before by a relative name, and the first process.cwd() after each chdir
 * (Node caches it until the next chdir) must be the expected path. getcwd reports the real location of the folder the
 * process is in, never a link, so a link swapped in on the way is refused. From then on every system call names the
 * file relative to ".", with no slash, so it resolves in the folder already entered, whatever its path leads to now.
 * The pin holds the folder that was at the expected place when it was checked: if that folder itself is moved later,
 * the act follows it, as it would with openat.
 *
 * Hazard: the working directory belongs to the whole process. While a folder is pinned, every relative path anywhere
 * in the process resolves against it: worker threads share it (they cannot chdir, but they read it), and asynchronous
 * fs calls already queued on the libuv thread pool resolve their relative paths when they run. So this is only for
 * short synchronous sections in a process with no concurrent relative-path work; do anything slow before pinning.
 * Pinning refuses in a worker thread (process.chdir is not available there) and on Windows, where neither what
 * process.cwd() reports after entering through a link nor O_NOFOLLOW has been checked. The
 * previous working directory is restored after the act, also when it throws.
 */
import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMainThread } from "node:worker_threads";

const CREATE_NEW = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

export interface PinnedDirectory {
  /**
   * Write a file in the pinned folder: create-only (O_EXCL, never through a link) or a replace by a temp file and a
   * rename. `mode` is set on the new inode; a replace without one keeps the replaced file's mode. beforeCommit runs
   * right before the create or the rename.
   */
  write(name: string, data: Buffer, opts: { readonly createOnly: boolean; readonly mode?: number; readonly beforeCommit: () => void }): void;
  /** Remove a regular file in the pinned folder; beforeCommit runs right before the unlink. */
  remove(name: string, beforeCommit: () => void): void;
}

/** Why a folder cannot be pinned in this process, or null when it can. */
export function pinnedDirectoryRefusal(): string | null {
  if (!isMainThread) return "a folder cannot be pinned from a worker thread";
  if (process.platform === "win32") return "a folder cannot be pinned on Windows";
  return null;
}

/** A plain name in the pinned folder, as a path relative to it. */
function own(name: string): string {
  if (name === "" || name === "." || name === ".." || /[/\\]/.test(name)) throw new Error(`not a plain file or folder name: ${name}`);
  return `./${name}`;
}

function enter(to: string, expected: string): void {
  process.chdir(to);
  if (process.cwd() !== expected) throw new Error(`the folder ${expected} changed location; nothing was changed there`);
}

/**
 * Pin `root` (a real path with no link), then each of `folders` below it in turn (made when missing and `create` is
 * set), and run `act` there. The working directory is the caller's again when this returns or throws; a restore that
 * fails throws an error with code ERR_AMC_PIN_RESTORE, which a caller must not treat as one failed file.
 */
export function withPinnedDirectory<T>(root: string, folders: readonly string[], create: boolean, act: (dir: PinnedDirectory) => T): T {
  const refusal = pinnedDirectoryRefusal();
  if (refusal !== null) throw new Error(`${refusal}; nothing was changed`);
  const previous = process.cwd();
  // Restored after both outcomes; a restore failure wins over the act's own error (the process is in the wrong folder).
  let outcome: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };
  try {
    enter(root, root);
    let expected = root;
    for (const folder of folders) {
      const name = own(folder);
      expected = join(expected, folder);
      if (create && lstatSync(name, { throwIfNoEntry: false }) === undefined) mkdirSync(name);
      enter(name, expected);
    }
    outcome = { ok: true, value: act({ write, remove }) };
  } catch (error) { outcome = { ok: false, error }; }
  try { process.chdir(previous); }
  catch (error) { throw Object.assign(new Error(`the working folder ${previous} could not be restored (${error instanceof Error ? error.message : String(error)})`), { code: "ERR_AMC_PIN_RESTORE" }); }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

/** Set the mode, write all bytes and flush them, on a descriptor this module opened. */
function fill(fd: number, data: Buffer, mode: number | undefined): void {
  if (mode !== undefined) fchmodSync(fd, mode);
  writeFileSync(fd, data);
  fsyncSync(fd);
}

function write(name: string, data: Buffer, opts: { readonly createOnly: boolean; readonly mode?: number; readonly beforeCommit: () => void }): void {
  const target = own(name);
  if (opts.createOnly) {
    opts.beforeCommit();
    const fd = openSync(target, CREATE_NEW, 0o666);
    try { fill(fd, data, opts.mode); }
    catch (error) {
      // Remove only the inode this call created, never a replacement another writer published meanwhile.
      try {
        const created = fstatSync(fd), now = lstatSync(target, { throwIfNoEntry: false });
        if (now?.dev === created.dev && now.ino === created.ino) unlinkSync(target);
      } catch { /* keep the write error when cleanup cannot be proved safe */ }
      throw error;
    } finally { closeSync(fd); }
  } else {
    const existing = lstatSync(target);
    if (!existing.isFile()) throw new Error(`not a regular file: ${name}`);
    // rename checks only the folder's permissions, so a file the caller may not write is refused as a write would be.
    accessSync(target, constants.W_OK);
    const temporary = `./.amc-tmp-${process.pid}-${randomUUID()}`;
    let renamed = false;
    try {
      const fd = openSync(temporary, CREATE_NEW, 0o600);
      try { fill(fd, data, opts.mode ?? existing.mode & 0o7777); } finally { closeSync(fd); }
      opts.beforeCommit();
      renameSync(temporary, target);
      renamed = true;
    } finally {
      if (!renamed) { try { unlinkSync(temporary); } catch { /* never created */ } }
    }
  }
  syncFolder();
}

function remove(name: string, beforeCommit: () => void): void {
  const target = own(name);
  if (!lstatSync(target).isFile()) throw new Error(`not a regular file: ${name}`);
  beforeCommit();
  unlinkSync(target);
}

/** Best effort: flush the pinned folder so the new name survives a crash; the file itself is already written. */
function syncFolder(): void {
  let fd: number | undefined;
  try { fd = openSync(".", "r"); fsyncSync(fd); }
  catch { /* not supported here */ }
  finally { if (fd !== undefined) closeSync(fd); }
}
