import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
