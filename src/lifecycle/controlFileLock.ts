import { randomUUID } from "node:crypto";
import {
  closeSync,
  linkSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists } from "../utils/fs.js";

export class ControlFileLockError extends Error {
  readonly code = "LOCK_TIMEOUT" as const;

  constructor(message: string) {
    super(message);
    this.name = "ControlFileLockError";
  }
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockOwner(path: string): { pid: number; token: string } | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown; token?: unknown };
    if (
      typeof parsed.pid !== "number"
      || typeof parsed.token !== "string"
      || !/^[0-9a-f-]{36}$/i.test(parsed.token)
    ) return null;
    return { pid: parsed.pid, token: parsed.token };
  } catch {
    return null;
  }
}

function sameFile(left: string, right: string): boolean {
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function contenderPath(contendersDir: string, token: string): string {
  return join(contendersDir, `${token}.json`);
}

function tryReapDeadLock(lockPath: string, contendersDir: string): boolean {
  const owner = lockOwner(lockPath);
  if (!owner || processIsAlive(owner.pid)) return false;

  let candidatePath = contenderPath(contendersDir, owner.token);
  if (!sameFile(lockPath, candidatePath)) {
    try {
      const claimPrefix = `${owner.token}.reap-`;
      const existingClaim = readdirSync(contendersDir)
        .find((entry) => entry.startsWith(claimPrefix) && entry.endsWith(".json") && sameFile(lockPath, join(contendersDir, entry)));
      if (!existingClaim) return false;
      candidatePath = join(contendersDir, existingClaim);
    } catch {
      return false;
    }
  }

  const claimPath = join(contendersDir, `${owner.token}.reap-${process.pid}-${randomUUID()}.json`);
  try {
    renameSync(candidatePath, claimPath);
  } catch {
    return false;
  }

  try {
    if (sameFile(lockPath, claimPath) && lockOwner(lockPath)?.token === owner.token) {
      unlinkSync(lockPath);
      return true;
    }
  } catch {
    return !pathExists(lockPath);
  } finally {
    if (lockOwner(lockPath)?.token !== owner.token) {
      try { unlinkSync(claimPath); } catch { /* The common lock is gone; this is only an orphan. */ }
    }
  }
  return false;
}

export function withControlFileLock<T>(input: {
  root: string;
  name: string;
  operation: () => T;
  timeoutMs?: number;
}): T {
  ensureDir(input.root);
  const lockPath = join(input.root, `.${input.name}.lock`);
  const contendersDir = join(input.root, `.${input.name}-locks`);
  ensureDir(contendersDir);
  const deadline = Date.now() + (input.timeoutMs ?? 5_000);
  const token = randomUUID();
  const ownContenderPath = contenderPath(contendersDir, token);
  let descriptor: number | null = null;

  try {
    descriptor = openSync(ownContenderPath, "wx", 0o600);
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), "utf8");
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    try { unlinkSync(ownContenderPath); } catch { /* Nothing to clean up. */ }
    throw error;
  }
  closeSync(descriptor);

  let acquired = false;
  while (!acquired) {
    try {
      linkSync(ownContenderPath, lockPath);
      acquired = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        try { unlinkSync(ownContenderPath); } catch { /* Nothing to clean up. */ }
        throw error;
      }
      if (tryReapDeadLock(lockPath, contendersDir)) continue;
      if (Date.now() >= deadline) {
        try { unlinkSync(ownContenderPath); } catch { /* Nothing to clean up. */ }
        throw new ControlFileLockError(`${input.name} is busy; retry the operation.`);
      }
      sleep(15);
    }
  }

  try {
    return input.operation();
  } finally {
    try {
      if (lockOwner(lockPath)?.token === token) unlinkSync(lockPath);
    } catch {
      // The operation is complete even if process shutdown races with cleanup.
    }
    try { unlinkSync(ownContenderPath); } catch { /* A stale-lock reaper may have claimed it. */ }
  }
}
