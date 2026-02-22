/**
 * Session-isolated working memory scratchpad. SQLite-backed.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface ScratchpadEntry {
  entryId: string;
  sessionId: string;
  key: string;
  value: unknown;
  lifecycle: 'keep' | 'discard' | 'promote';
  ttlSeconds?: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

let _db: import('better-sqlite3').Database | null = null;

function getDb(): import('better-sqlite3').Database {
  if (_db) return _db;
  const dir = join(process.cwd(), '.amc');
  mkdirSync(dir, { recursive: true });
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  _db = new Database(join(dir, 'scratchpad.sqlite'));
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS scratchpad_entries (
      entry_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      lifecycle TEXT NOT NULL DEFAULT 'keep' CHECK (lifecycle IN ('keep', 'discard', 'promote')),
      ttl_seconds INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (ttl_seconds IS NULL OR ttl_seconds > 0),
      UNIQUE(session_id, key)
    )
  `);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_scratch_session ON scratchpad_entries(session_id)`);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_scratch_expires ON scratchpad_entries(expires_at)`);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_scratch_session_expires ON scratchpad_entries(session_id, expires_at)`);
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS enforce_scratch_lifecycle_insert
    BEFORE INSERT ON scratchpad_entries
    WHEN NEW.lifecycle NOT IN ('keep', 'discard', 'promote')
    BEGIN
      SELECT RAISE(ABORT, 'invalid scratchpad lifecycle');
    END;
  `);
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS enforce_scratch_lifecycle_update
    BEFORE UPDATE ON scratchpad_entries
    WHEN NEW.lifecycle NOT IN ('keep', 'discard', 'promote')
    BEGIN
      SELECT RAISE(ABORT, 'invalid scratchpad lifecycle');
    END;
  `);
  return _db;
}

export class ScratchpadManager {
  set(sessionId: string, key: string, value: unknown, opts?: { ttlSeconds?: number; lifecycle?: 'keep' | 'discard' | 'promote' }): string {
    const db = getDb();
    const entryId = randomUUID();
    const now = new Date().toISOString();
    const lifecycle = opts?.lifecycle ?? 'keep';
    const ttlSeconds = opts?.ttlSeconds ?? null;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    const valueJson = JSON.stringify(value);
    db.prepare(`
      INSERT INTO scratchpad_entries (entry_id, session_id, key, value_json, lifecycle, ttl_seconds, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, key) DO UPDATE SET
        entry_id = excluded.entry_id,
        value_json = excluded.value_json,
        lifecycle = excluded.lifecycle,
        ttl_seconds = excluded.ttl_seconds,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).run(entryId, sessionId, key, valueJson, lifecycle, ttlSeconds, expiresAt, now, now);
    return entryId;
  }

  get(sessionId: string, key: string): unknown | null {
    const db = getDb();
    const row = db.prepare('SELECT value_json, expires_at FROM scratchpad_entries WHERE session_id = ? AND key = ?').get(sessionId, key) as any;
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      db.prepare('DELETE FROM scratchpad_entries WHERE session_id = ? AND key = ?').run(sessionId, key);
      return null;
    }
    return JSON.parse(row.value_json);
  }

  list(sessionId: string): ScratchpadEntry[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM scratchpad_entries WHERE session_id = ?').all(sessionId) as any[];
    return rows.map(r => ({
      entryId: r.entry_id,
      sessionId: r.session_id,
      key: r.key,
      value: JSON.parse(r.value_json),
      lifecycle: r.lifecycle,
      ttlSeconds: r.ttl_seconds ?? undefined,
      expiresAt: r.expires_at ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  delete(sessionId: string, key: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM scratchpad_entries WHERE session_id = ? AND key = ?').run(sessionId, key);
    return result.changes > 0;
  }

  expire(sessionId: string): number {
    const db = getDb();
    const now = new Date().toISOString();
    const result = db.prepare('DELETE FROM scratchpad_entries WHERE session_id = ? AND expires_at IS NOT NULL AND expires_at < ?').run(sessionId, now);
    return result.changes;
  }
}

export function closeScratchpadDb(): void {
  try { if (_db) { _db.close(); _db = null; } } catch (_e) { /* silent */ }
}
