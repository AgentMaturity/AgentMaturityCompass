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

interface HeldLockAttempt {
  readonly lockPath: string;
  readonly ownContenderPath: string;
  readonly token: string;
  readonly deadline: number;
  readonly name: string;
  readonly contendersDir: string;
}

function enterLockQueue(input: { root: string; name: string; timeoutMs?: number }): HeldLockAttempt {
  ensureDir(input.root);
  const lockPath = join(input.root, `.${input.name}.lock`);
  const contendersDir = join(input.root, `.${input.name}-locks`);
  ensureDir(contendersDir);
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
  return { lockPath, ownContenderPath, token, name: input.name, contendersDir, deadline: Date.now() + (input.timeoutMs ?? 5_000) };
}

/** One acquisition attempt: true when held, false to wait and retry; throws on timeout or an unexpected error. */
function tryAcquire(attempt: HeldLockAttempt): boolean {
  try {
    linkSync(attempt.ownContenderPath, attempt.lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      try { unlinkSync(attempt.ownContenderPath); } catch { /* Nothing to clean up. */ }
      throw error;
    }
    if (tryReapDeadLock(attempt.lockPath, attempt.contendersDir)) return tryAcquire(attempt);
    if (Date.now() >= attempt.deadline) {
      try { unlinkSync(attempt.ownContenderPath); } catch { /* Nothing to clean up. */ }
      throw new ControlFileLockError(`${attempt.name} is busy; retry the operation.`);
    }
    return false;
  }
}

function releaseLock(attempt: HeldLockAttempt): void {
  try {
    if (lockOwner(attempt.lockPath)?.token === attempt.token) unlinkSync(attempt.lockPath);
  } catch {
    // The operation is complete even if process shutdown races with cleanup.
  }
  try { unlinkSync(attempt.ownContenderPath); } catch { /* A stale-lock reaper may have claimed it. */ }
}

export function withControlFileLock<T>(input: {
  root: string;
  name: string;
  operation: () => T;
  timeoutMs?: number;
}): T {
  const attempt = enterLockQueue(input);
  while (!tryAcquire(attempt)) sleep(15);
  try {
    return input.operation();
  } finally {
    releaseLock(attempt);
  }
}

/**
 * The same cross-process lock for an asynchronous critical section. Waiting
 * yields the event loop instead of blocking it, so an in-process holder that is
 * awaiting I/O can finish. Callers must still serialize in-process contenders
 * themselves: a synchronous waiter in this process would block the holder.
 */
export async function withControlFileLockAsync<T>(input: {
  root: string;
  name: string;
  operation: () => Promise<T>;
  timeoutMs?: number;
}): Promise<T> {
  const attempt = enterLockQueue(input);
  while (!tryAcquire(attempt)) await new Promise((resolve) => setTimeout(resolve, 15));
  try {
    return await input.operation();
  } finally {
    releaseLock(attempt);
  }
}
