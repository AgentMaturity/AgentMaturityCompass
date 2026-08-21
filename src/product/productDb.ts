/**
 * productDb.ts — Shared SQLite database foundation for AMC product queues.
 *
 * Provides a singleton connection to a WAL-mode SQLite database stored
 * under `.amc/amc_product_queues.db` (configurable via env or argument).
 */

import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';

/** Cached singleton database handle. */
let _db: import('better-sqlite3').Database | null = null;

/**
 * Open (or return the existing) product-queue SQLite database.
 *
 * Resolution order for the database path:
 *   1. Explicit `dbPath` argument
 *   2. `AMC_PRODUCT_DB_PATH` environment variable
 *   3. `<cwd>/.amc/amc_product_queues.db`
 */
export function openProductDb(
  dbPath?: string,
): import('better-sqlite3').Database {
  if (_db) return _db;

  const resolvedPath =
    dbPath ??
    process.env['AMC_PRODUCT_DB_PATH'] ??
    join(process.cwd(), '.amc', 'amc_product_queues.db');

  // dirname() rather than lastIndexOf('/'): a path with no forward slash gave
  // substring(0, -1) === '', and mkdirSync('') throws ENOENT. Both inputs are
  // reachable — a bare filename in AMC_PRODUCT_DB_PATH, and on Windows the
  // default join() path, which is entirely backslash-separated. dirname()
  // handles both separators and returns '.' for a bare filename.
  mkdirSync(dirname(resolvedPath), { recursive: true });

  _db = new Database(resolvedPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  return _db;
}

/** Close the singleton database connection. Safe to call even if never opened. */
export function closeProductDb(): void {
  try { if (_db) { _db.close(); _db = null; } } catch (_e) { /* silent */ }
}
