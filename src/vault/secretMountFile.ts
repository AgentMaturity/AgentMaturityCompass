/**
 * An operator secret file, read the way containers mount them (follow-up 1 to B1: the vault passphrase file).
 *
 * Accepted, either:
 * - private to its owner: a regular file, not a symlink, owned by this user, closed to group and others (0600, 0400),
 *   as readPrivateTokenFile reads approval tokens and leases; or
 * - a mounted secret this user cannot change: Docker or Compose secrets under /run/secrets (a read-only bind of the
 *   host file, owned by whoever owns it there) and Kubernetes secret volumes (root-owned files reached through the
 *   `..data` symlinks, on a read-only mount), when the file is not group- or world-writable and this user can change
 *   neither the file nor any directory the lookup reads an entry from (so it cannot replace the file or repoint a link).
 *
 * Refused: a group- or world-writable file, and a file this user could replace (one it owns that others can read, a
 * symlink in a directory it can write, a file in such a directory). The value is never logged.
 */
import { accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

const MAX_LINKS = 32;
const MAX_BYTES = 16_384;

/** Whether this user can change `path`: write it, or own it and so make it writable. A read-only mount stops both. */
export function userCanChange(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EROFS") return false;
  }
  try {
    return lstatSync(path).uid === process.getuid?.();
  } catch {
    return true; // unknown: fail closed
  }
}

/** The directories a lookup of `path` reads an entry from (every symlink followed), and the file it ends at. */
export function secretLookup(path: string): { file: string; dirs: string[] } {
  const pending = resolve(path).split(sep).filter(Boolean);
  const dirs = new Set<string>();
  let current: string = sep;
  let links = 0;
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (name === ".") continue;
    if (name === "..") { current = dirname(current); continue; }
    dirs.add(current);
    const next = join(current, name);
    if (!lstatSync(next).isSymbolicLink()) { current = next; continue; }
    if (++links > MAX_LINKS) throw new Error("too many symbolic links");
    const target = readlinkSync(next);
    if (isAbsolute(target)) current = sep;
    pending.unshift(...target.split(sep).filter(Boolean));
  }
  return { file: current, dirs: [...dirs] };
}

function readContent(fd: number, label: string): string {
  const buffer = Buffer.alloc(MAX_BYTES + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(fd, buffer, offset, buffer.length - offset, null);
    if (!count) break;
    offset += count;
  }
  if (offset === 0 || offset > MAX_BYTES) throw new Error(`${label} file is empty or exceeds its size limit`);
  const value = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, offset)).trim();
  buffer.fill(0);
  if (value.length === 0) throw new Error(`${label} file is empty or exceeds its size limit`);
  return value;
}

/** `canChange` is the probe for "this user can change this path"; tests stand in a read-only mount with it. */
export function readSecretMountFile(path: string, label: string, canChange: (path: string) => boolean = userCanChange): string {
  if (process.platform === "win32") { // no POSIX owner or mode bits to judge: a regular file, as readPrivateTokenFile reads it
    const fd = openSync(path, constants.O_RDONLY);
    try {
      if (!fstatSync(fd).isFile()) throw new Error(`${label} must be a regular file`);
      return readContent(fd, label);
    } finally { closeSync(fd); }
  }
  const lookup = secretLookup(path);
  const fd = openSync(lookup.file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
    const ownerPrivate = !lstatSync(resolve(path)).isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0;
    if (!ownerPrivate) {
      const rule = `${label} file must be private to its owner (0600 or 0400, not a symlink), or a mounted secret this user cannot change`;
      if ((stat.mode & 0o022) !== 0) throw new Error(`${rule}: it is group- or world-writable`);
      const changeable = [lookup.file, ...lookup.dirs].find((entry) => canChange(entry));
      if (changeable !== undefined) throw new Error(`${rule}: this user can change ${changeable}`);
    }
    // Last: the configured path still names the file opened and judged (no link was repointed during the checks).
    const named = statSync(path);
    if (named.dev !== stat.dev || named.ino !== stat.ino) throw new Error(`${label} file changed while it was read`);
    return readContent(fd, label);
  } finally {
    closeSync(fd);
  }
}
