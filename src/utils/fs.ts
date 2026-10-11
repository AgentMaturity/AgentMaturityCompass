import { chmodSync, closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeFileAtomic(path: string, data: string | Buffer, mode?: number): void {
  const dir = dirname(path);
  ensureDir(dir);
  const tmp = join(dir, `.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(tmp, data, "utf8");
    if (mode !== undefined) {
      chmodSync(tmp, mode);
    }
    renameSync(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore cleanup */ }
    throw err;
  }
}

export function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeUtf8(path: string, data: string): void {
  writeFileSync(path, data, "utf8");
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Reads one regular file without following a final symlink or blocking on a FIFO or device. Anything else, or a file
 * over `maxBytes`, throws, so a security store planted as a special file fails closed instead of hanging or redirecting.
 */
export function readRegularFileNoFollow(path: string, maxBytes: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${basename(path)} is not a regular file`);
    if (stat.size > maxBytes) throw new Error(`${basename(path)} exceeds ${maxBytes} bytes`);
    const bytes = Buffer.alloc(stat.size);
    return bytes.subarray(0, readSync(fd, bytes, 0, bytes.length, 0));
  } finally {
    closeSync(fd);
  }
}
