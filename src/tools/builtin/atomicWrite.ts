import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, fchmodSync, fsyncSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Replace a file so a reader sees the old bytes or the new bytes, never a mix.
 *
 * The temp file sits in the target's own directory because `rename` is only
 * atomic within one filesystem (`EXDEV` otherwise). It is fsync'd before the
 * rename so a crash cannot leave the new name pointing at unwritten blocks, and
 * it takes the replaced file's mode, because the rename swaps in the temp
 * file's inode and `open`'s mode argument is masked by the umask.
 *
 * `rename` checks only the directory's permissions, so an existing target is
 * checked for write access first: a file the caller may not write (mode 0444,
 * or 0000) fails with EACCES, as an in-place write would, instead of being
 * silently replaced. The temp name leaves out the target's basename so a name
 * near the 255-byte limit stays writable.
 *
 * Callers pass a resolved path: renaming over a symlink replaces the link, not
 * the file it points to.
 */
export function writeFileAtomicSync(path: string, data: string | Buffer, opts?: { encoding?: BufferEncoding }): void {
  const directory = dirname(path);
  const temporary = join(directory, `.amc-tmp-${process.pid}-${randomUUID()}`);
  const mode = existingMode(path);
  if (mode !== undefined) accessSync(path, constants.W_OK);
  let renamed = false;
  try {
    const fd = openSync(temporary, "wx");
    try {
      if (mode !== undefined) fchmodSync(fd, mode);
      writeFileSync(fd, data, { encoding: opts?.encoding ?? "utf8" });
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameWithRetry(temporary, path);
    renamed = true;
  } finally {
    if (!renamed) {
      try { unlinkSync(temporary); } catch { /* never created, or already gone */ }
    }
  }
  syncDirectory(directory);
}

function existingMode(path: string): number | undefined {
  try {
    return statSync(path).mode & 0o7777;
  } catch {
    return undefined; // a new file takes the default mode, as writeFileSync would give it
  }
}

/** Windows refuses a rename over a file another process holds open with EPERM; that clears quickly. */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || code !== "EPERM" || attempt >= 3) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

/**
 * Best effort: fsync the directory so the rename itself survives a crash.
 * The new contents are already in place, so a platform that cannot open or
 * sync a directory (Windows answers EISDIR or EPERM) must not turn a completed
 * write into a reported failure.
 */
function syncDirectory(directory: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(directory, "r");
    fsyncSync(fd);
  } catch {
    /* not supported here; the file write itself succeeded */
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
