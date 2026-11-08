import { chmodSync, existsSync, mkdirSync, readFileSync, readSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { noteCheckPassWrite } from "./checkPass.js";

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeFileAtomic(path: string, data: string | Uint8Array, mode?: number): void {
  noteCheckPassWrite();
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
  noteCheckPassWrite();
  writeFileSync(path, data, "utf8");
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

/** Up to `maxBytes` read from `fd` to its end, or null when it holds more (that buffer is zeroed). The caller owns the fd. */
export function readBoundedBytes(fd: number, maxBytes: number): Buffer | null {
  const buffer = Buffer.alloc(maxBytes + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(fd, buffer, offset, buffer.length - offset, null);
    if (!count) break;
    offset += count;
  }
  if (offset <= maxBytes) return buffer.subarray(0, offset);
  buffer.fill(0);
  return null;
}
