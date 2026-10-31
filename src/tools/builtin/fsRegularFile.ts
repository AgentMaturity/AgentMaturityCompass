import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type Stats } from "node:fs";
import { resolve } from "node:path";

const READ_CHUNK_BYTES = 64 * 1024;

function nonRegular(path: string): Error {
  return Object.assign(new Error(`"${path}" is not a regular file; refusing filesystem access`), { code: "ERR_AMC_NON_REGULAR_FILE" });
}

/** Inspect existence without reading contents; only ENOENT means absent. */
export function regularFileStat(path: string): Stats | null {
  let status: Stats;
  try {
    status = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!status.isFile()) throw nonRegular(path);
  return status;
}

/** Hash a regular file in bounded chunks, optionally consuming each borrowed chunk before it is reused. */
export function scanRegularFile(path: string, consume?: (chunk: Buffer) => void): { readonly digest: string; readonly bytes: number } {
  const expected = resolve(path);
  const before = regularFileStat(path);
  const changedPath = () => new Error(`"${path}" changed location while being opened — read it again, then retry`);
  // Tool callers pass the canonical workspace path. Recheck before opening so
  // replacing an ancestor with a symlink cannot redirect it outside that bound.
  if (realpathSync(path) !== expected) throw changedPath();
  // O_NONBLOCK prevents a FIFO swapped in after lstat from hanging open; fstat
  // then checks what was actually opened. O_NOFOLLOW refuses a swapped symlink.
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile()) throw nonRegular(path);
    if (before === null || status.dev !== before.dev || status.ino !== before.ino || realpathSync(path) !== expected) {
      throw changedPath();
    }
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let bytes = 0;
    // Bound the pass to the opened size, so another writer cannot extend it forever.
    while (bytes < status.size) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, status.size - bytes), bytes);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      digest.update(chunk);
      consume?.(chunk);
      bytes += count;
    }
    const after = fstatSync(descriptor);
    if (bytes !== status.size || after.size !== status.size || after.mtimeMs !== status.mtimeMs || after.ctimeMs !== status.ctimeMs) {
      throw new Error(`"${path}" changed while being read — read it again, then retry`);
    }
    return { digest: digest.digest("hex"), bytes };
  } finally {
    closeSync(descriptor);
  }
}

/** Read all bytes only for the edit/diff paths that need their complete input. */
export function readRegularFile(path: string): Buffer {
  const chunks: Buffer[] = [];
  const result = scanRegularFile(path, chunk => chunks.push(Buffer.from(chunk)));
  return Buffer.concat(chunks, result.bytes);
}
