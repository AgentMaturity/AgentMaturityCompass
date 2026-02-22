/**
 * Evidence emitter — fail-safe guard_check event writer.
 * Writes to .amc/guard_events.sqlite using better-sqlite3.
 * NEVER throws — all errors are silently logged.
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

let _db: import('better-sqlite3').Database | null = null;
let _insertStmt: import('better-sqlite3').Statement | null = null;

export interface GuardEventInput {
  agentId: string;
  moduleCode: string;
  decision: 'allow' | 'deny' | 'stepup' | 'warn';
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  meta?: Record<string, unknown>;
}

function getDb(): import('better-sqlite3').Database | null {
  if (_db) return _db;
  try {
    const dir = join(process.cwd(), '.amc');
    mkdirSync(dir, { recursive: true });
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    _db = new Database(join(dir, 'guard_events.sqlite'));
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS amc_guard_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        module_code TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'stepup', 'warn')),
        reason TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        meta_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_agent ON amc_guard_events(agent_id, created_at)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_module ON amc_guard_events(module_code)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_severity_created ON amc_guard_events(severity, created_at)`);
    _db.exec(`
      CREATE TRIGGER IF NOT EXISTS enforce_guard_decision_domain
      BEFORE INSERT ON amc_guard_events
      WHEN NEW.decision NOT IN ('allow', 'deny', 'stepup', 'warn')
      BEGIN
        SELECT RAISE(ABORT, 'invalid guard decision');
      END;
    `);
    _db.exec(`
      CREATE TRIGGER IF NOT EXISTS enforce_guard_severity_domain
      BEFORE INSERT ON amc_guard_events
      WHEN NEW.severity NOT IN ('low', 'medium', 'high', 'critical')
      BEGIN
        SELECT RAISE(ABORT, 'invalid guard severity');
      END;
    `);
    _insertStmt = _db.prepare(
      `INSERT INTO amc_guard_events (id, agent_id, module_code, decision, reason, severity, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    return _db;
  } catch (_e) {
    return null;
  }
}

export function emitGuardEvent(input: GuardEventInput): void {
  try {
    const db = getDb();
    if (!db || !_insertStmt) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    const metaJson = input.meta ? JSON.stringify(input.meta) : null;
    _insertStmt.run(id, input.agentId, input.moduleCode, input.decision, input.reason, input.severity, metaJson, now);
  } catch (_e) {
    // Never throw
  }
}

/** Read events for a given agent within a time window. Used by scoring engine and SIEM exporter. */
export function readGuardEvents(agentId?: string, windowHours?: number): Array<{
  id: string; agent_id: string; module_code: string; decision: string;
  reason: string; severity: string; meta_json: string | null; created_at: string;
}> {
  try {
    const db = getDb();
    if (!db) return [];
    let sql = 'SELECT * FROM amc_guard_events';
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (agentId) { clauses.push('agent_id = ?'); params.push(agentId); }
    if (windowHours) {
      const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
      clauses.push('created_at >= ?'); params.push(since);
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...params) as any[];
  } catch (_e) {
    return [];
  }
}

/** Close the database connection (for testing cleanup). */
export function closeGuardDb(): void {
  try {
    if (_db) { _db.close(); _db = null; _insertStmt = null; }
  } catch (_e) { /* silent */ }
}
