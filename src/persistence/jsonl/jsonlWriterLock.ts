import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { ensureDir, writeFileAtomic } from "../../utils/fs.js";
import { SESSION_STORE_LOCKED } from "../sessionEventStore.js";

interface LockOwner {
  readonly v?: number;
  readonly token?: string;
  readonly pid: number;
  readonly hostId: string;
  readonly acquiredTs: number;
}

function regular(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`${SESSION_STORE_LOCKED}: unsafe writer coordination path`);
  }
  return stat;
}

function existingOwner(path: string): LockOwner | null {
  try { regular(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let owner: LockOwner;
  try { owner = JSON.parse(readFileSync(path, "utf8")) as LockOwner; }
  catch { throw new Error(`${SESSION_STORE_LOCKED}: unreadable writer ownership; restore the original coordination record`); }
  if (!owner || typeof owner !== "object" || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
    || typeof owner.hostId !== "string" || !owner.hostId || !Number.isSafeInteger(owner.acquiredTs)
    || owner.acquiredTs < 0 || (owner.v !== undefined && owner.v !== 2)
    || (owner.v === 2 && (typeof owner.token !== "string" || !owner.token))) {
    throw new Error(`${SESSION_STORE_LOCKED}: unsupported writer ownership; no automatic takeover`);
  }
  return owner;
}

/** Advisory inspection only. Actual acquisition always repeats this under the mutex. */
export function assertJsonlWriterAvailable(path: string): void {
  const owner = existingOwner(path);
  if (!owner) return;
  if (owner.hostId !== hostname()) throw new Error(`${SESSION_STORE_LOCKED}: another host owns this workspace`);
  try { process.kill(owner.pid, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw new Error(`${SESSION_STORE_LOCKED}: writer liveness cannot be established`);
  }
  throw new Error(`${SESSION_STORE_LOCKED}: a live process owns this workspace`);
}

/**
 * A process-lifetime, non-pooled exclusive mutex. The existing SQLite binding
 * supplies the kernel lock and releases it on actual process death; no timeout,
 * PID-file overwrite race, stale-lock election, or heartbeat grants ownership.
 *
 * This separate database stores NO session evidence or authority. JSONL history
 * and the signed per-session owner must still authenticate before append. Never
 * use the operations ledger, or this empty coordinator, as recovered history.
 * All supported JSONL writers use this mutex. Concurrent pre-protocol binaries
 * and network/distributed filesystems are outside this local-writer contract.
 */
export class JsonlWriterLock {
  private db: Database.Database | null = null;
  private readonly token = randomUUID();
  private readonly coordinationPath: string;
  private identity: { dev: number; ino: number } | null = null;
  private held = false;

  constructor(private readonly path: string) {
    ensureDir(join(path, ".."));
    this.coordinationPath = `${path}.coordination.sqlite`;
    try {
      try { closeSync(openSync(this.coordinationPath, "wx", 0o600)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      const before = regular(this.coordinationPath);
      this.db = new Database(this.coordinationPath, { timeout: 0 });
      this.db.exec("BEGIN EXCLUSIVE");
      const after = regular(this.coordinationPath);
      if (before.dev !== after.dev || before.ino !== after.ino) throw new Error("writer coordinator changed during acquisition");
      this.identity = { dev: after.dev, ino: after.ino };
      // The mutex serializes takeover; the record still refuses a live,
      // foreign-host, unreadable or unsupported owner, including old writers.
      assertJsonlWriterAvailable(this.path);
      writeFileAtomic(this.path, JSON.stringify({ v: 2, token: this.token,
        pid: process.pid, hostId: hostname(), acquiredTs: Date.now() }), 0o600);
      this.held = true;
      this.assertHeld();
    } catch (error) {
      this.db?.close(); this.db = null;
      throw new Error(`${SESSION_STORE_LOCKED}: ${error instanceof Error ? error.message : "writer acquisition failed"}`);
    }
  }

  assertHeld(): void {
    if (!this.held || !this.db?.inTransaction || !this.identity) throw new Error(`${SESSION_STORE_LOCKED}: writer lease is not held`);
    const current = regular(this.coordinationPath);
    const owner = existingOwner(this.path);
    if (current.dev !== this.identity.dev || current.ino !== this.identity.ino
      || owner?.v !== 2 || owner.token !== this.token || owner.pid !== process.pid || owner.hostId !== hostname()) {
      throw new Error(`${SESSION_STORE_LOCKED}: writer coordination changed; refresh after restoring the original ownership`);
    }
  }

  release(): void {
    if (!this.db) return;
    try {
      if (this.held) {
        this.assertHeld();
        unlinkSync(this.path); // Only this token, while the exclusive mutex is held.
      }
    } finally {
      this.held = false;
      this.db.close(); this.db = null;
    }
  }
}
