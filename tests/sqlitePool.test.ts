import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  SqliteConnectionPool, closeSqlitePool, getOrCreateSqlitePool, sqlitePoolStats,
} from "../src/storage/sqlitePool.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-sqlite-pool-"));
  dirs.push(dir);
  return join(dir, "pool.sqlite");
}

describe("SqliteConnectionPool", () => {
  test("a lease beyond maxSize is an overflow connection: closed on release, never pooled", () => {
    const pool = new SqliteConnectionPool({ key: "overflow", dbPath: dbPath(), maxSize: 1 });
    const pooled = pool.acquire();
    const overflow = pool.acquire();
    expect(pool.stats()).toMatchObject({ active: 2, pooledConnections: 1 });
    overflow.release();
    expect(overflow.db.open).toBe(false);
    pooled.release();
    pooled.release();
    expect(pooled.db.open).toBe(true);
    expect(pool.stats()).toMatchObject({ idle: 1, active: 0, pooledConnections: 1 });
    pool.closeAll();
    expect(pooled.db.open).toBe(false);
  });

  test("closeAll closes leased connections; a later release is a no-op and acquire refuses", () => {
    const pool = new SqliteConnectionPool({ key: "closed", dbPath: dbPath() });
    const lease = pool.acquire();
    pool.closeAll();
    pool.closeAll();
    expect(lease.db.open).toBe(false);
    expect(() => lease.release()).not.toThrow();
    expect(() => pool.acquire()).toThrow('SQLite pool "closed" is closed');
  });

  test("a failed initialize closes its connection, rethrows and runs again on the next lease", () => {
    let calls = 0;
    const pool = new SqliteConnectionPool({
      key: "init", dbPath: dbPath(),
      initialize: () => { calls += 1; if (calls === 1) throw new Error("schema failed"); },
    });
    expect(() => pool.acquire()).toThrow("schema failed");
    expect(pool.stats()).toMatchObject({ active: 0, pooledConnections: 0, initialized: false });
    pool.withLease(() => undefined);
    expect(pool.stats()).toMatchObject({ initialized: true, idle: 1 });
    expect(calls).toBe(2);
    pool.closeAll();
  });

  test("a non-finite maxSize falls back to 4 and a fractional one floors to at least 1", () => {
    expect(new SqliteConnectionPool({ key: "nan", dbPath: dbPath(), maxSize: Number.NaN }).maxSize).toBe(4);
    expect(new SqliteConnectionPool({ key: "half", dbPath: dbPath(), maxSize: 0.5 }).maxSize).toBe(1);
  });

  test("AMC_SQLITE_MAX_POOLS evicts the least recently used idle pool; an invalid value keeps the default", () => {
    const prior = process.env["AMC_SQLITE_MAX_POOLS"];
    const keys = ["prune-older", "prune-newer", "prune-third"];
    try {
      process.env["AMC_SQLITE_MAX_POOLS"] = "1";
      getOrCreateSqlitePool({ key: keys[0]!, dbPath: dbPath() }).withLease(() => undefined);
      getOrCreateSqlitePool({ key: keys[1]!, dbPath: dbPath() });
      expect(sqlitePoolStats(keys[0]!)).toBeNull();
      expect(sqlitePoolStats(keys[1]!)).not.toBeNull();
      process.env["AMC_SQLITE_MAX_POOLS"] = "0";
      getOrCreateSqlitePool({ key: keys[2]!, dbPath: dbPath() });
      expect(sqlitePoolStats(keys[1]!)).not.toBeNull();
      expect(sqlitePoolStats(keys[2]!)).not.toBeNull();
    } finally {
      if (prior === undefined) delete process.env["AMC_SQLITE_MAX_POOLS"];
      else process.env["AMC_SQLITE_MAX_POOLS"] = prior;
      for (const key of keys) closeSqlitePool(key);
    }
  });
});
