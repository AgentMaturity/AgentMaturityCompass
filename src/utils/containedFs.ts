/**
 * Contained file access for key, history, revocation and anti-rollback files (P1-08). A path is a trusted root plus a
 * relative path of plain name segments. Every component below the root must be a real directory (lstat, never
 * followed); a missing directory is created one level at a time and checked again after mkdir. The final component must
 * be a regular file with a single link: it is opened with O_NOFOLLOW (new files O_CREAT|O_EXCL), checked with fstat,
 * and its dev/ino compared with an lstat of the path, and the directory chain is checked again after the open. Writes go
 * to a temporary file opened O_EXCL|O_NOFOLLOW in the same verified directory, fsynced, then renamed over the name; an
 * existing path is never written through. Node has no openat: a directory swapped and swapped back between that second
 * check and the read is beyond what this can observe, but a lasting swap is refused.
 */
import { randomBytes } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, statSync, unlinkSync, writeSync,
  type Stats
} from "node:fs";
import { join } from "node:path";

const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,255}$/;

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code;
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch (error) {
    if (codeOf(error) === "ENOENT") return null;
    throw error;
  }
}

function segmentsOf(rel: string): string[] {
  const parts = rel.split("/");
  if (rel.length === 0 || parts.some(part => !SEGMENT.test(part))) throw new Error(`unsafe path ${JSON.stringify(rel)}: only plain name segments joined by "/"`);
  return parts;
}

/** Walks the directories of `rel` below `root`; returns the directory path, or null when one is missing and not created. */
function directoryChain(root: string, parts: readonly string[], create: boolean): string | null {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    let stat = lstatOrNull(current);
    if (stat === null) {
      if (!create) return null;
      try { mkdirSync(current, { mode: 0o700 }); } catch (error) { if (codeOf(error) !== "EEXIST") throw error; }
      stat = lstatSync(current);
    }
    if (stat.isSymbolicLink()) throw new Error(`${current} is a symlink; refusing to follow it`);
    if (!stat.isDirectory()) throw new Error(`${current} is not a directory`);
  }
  return current;
}

function checkedFile(path: string, stat: Stats): void {
  if (stat.isSymbolicLink()) throw new Error(`${path} is a symlink; refusing to follow it`);
  if (!stat.isFile()) throw new Error(`${path} is not a regular file`);
  if (stat.nlink !== 1) throw new Error(`${path} has a link count of ${stat.nlink}; refusing a hard link`);
}

/** The absolute path of `rel` under `root` and its lstat (null when absent), after every check above. */
function resolveContained(root: string, rel: string, create: boolean): { path: string; dir: string | null; parts: string[]; stat: Stats | null } {
  const parts = segmentsOf(rel);
  const dir = directoryChain(root, parts.slice(0, -1), create);
  const path = join(root, ...parts);
  const stat = dir === null ? null : lstatOrNull(path);
  if (stat !== null) checkedFile(path, stat);
  return { path, dir, parts, stat };
}

/** Whether a contained regular file exists; a symlink, special file or hard link in its place throws. */
export function containedExists(root: string, rel: string): boolean {
  return resolveContained(root, rel, false).stat !== null;
}

/** The contained file's bytes, or null when it does not exist. */
export function readContainedOrNull(root: string, rel: string, maxBytes: number): Buffer | null {
  const { path, parts, stat } = resolveContained(root, rel, false);
  if (stat === null) return null;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    checkedFile(path, opened);
    if (opened.size > maxBytes) throw new Error(`${path} exceeds ${maxBytes} bytes`);
    const now = lstatSync(path);
    if (now.dev !== opened.dev || now.ino !== opened.ino) throw new Error(`${path} changed while it was opened`);
    directoryChain(root, parts.slice(0, -1), false);
    const bytes = Buffer.alloc(opened.size);
    return bytes.subarray(0, readSync(fd, bytes, 0, bytes.length, 0));
  } finally {
    closeSync(fd);
  }
}

export function readContained(root: string, rel: string, maxBytes: number): Buffer {
  const bytes = readContainedOrNull(root, rel, maxBytes);
  if (bytes === null) throw Object.assign(new Error(`${join(root, rel)} does not exist`), { code: "ENOENT" });
  return bytes;
}

/** Atomically replaces (or creates) the contained file through a fresh O_EXCL temporary in the same directory. */
export function writeContained(root: string, rel: string, data: string | Buffer, mode: number): void {
  const { path, dir, parts } = resolveContained(root, rel, true);
  const temporary = join(dir!, `.${randomBytes(8).toString("hex")}.tmp`);
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    try {
      fchmodSync(fd, mode);
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
      for (let written = 0; written < bytes.length;) written += writeSync(fd, bytes, written, bytes.length - written);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    directoryChain(root, parts.slice(0, -1), false);
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* already renamed or never created */ }
    throw error;
  }
}

/** Renames one contained regular file to another contained name (an existing regular file there is replaced). */
export function renameContained(root: string, fromRel: string, toRel: string): void {
  const from = resolveContained(root, fromRel, false);
  if (from.stat === null) throw Object.assign(new Error(`${from.path} does not exist`), { code: "ENOENT" });
  const to = resolveContained(root, toRel, true);
  renameSync(from.path, to.path);
}

/** Removes a contained regular file when it exists. */
export function removeContained(root: string, rel: string): void {
  const { path, stat } = resolveContained(root, rel, false);
  if (stat !== null) unlinkSync(path);
}

/** Makes sure a contained directory exists as a real directory; returns its path. */
export function ensureContainedDir(root: string, rel: string): string {
  return directoryChain(root, segmentsOf(rel), true)!;
}

/** The names in a contained directory, or [] when it does not exist. */
export function listContainedDir(root: string, rel: string): string[] {
  const dir = directoryChain(root, segmentsOf(rel), false);
  return dir === null ? [] : readdirSync(dir);
}

/**
 * A stamp of the files' identities (device, inode, size, ctime; "-" when absent) for memoizing a verified read. An atomic
 * write replaces the inode, and any in-place write changes ctime, which (unlike mtime) cannot be set back by utimes.
 */
export function statStamp(paths: readonly string[]): string {
  return paths.map(path => { try { const s = statSync(path); return `${s.dev}:${s.ino}:${s.size}:${s.ctimeMs}`; } catch { return "-"; } }).join("|");
}
