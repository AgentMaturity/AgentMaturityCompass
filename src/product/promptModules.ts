/**
 * Reusable prompt component system with versioning. SQLite-backed.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

let _db: import('better-sqlite3').Database | null = null;

function getDb(): import('better-sqlite3').Database {
  if (_db) return _db;
  const dir = join(process.cwd(), '.amc');
  mkdirSync(dir, { recursive: true });
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  _db = new Database(join(dir, 'prompt_modules.sqlite'));
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS pm_modules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      module_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pm_versions (
      id TEXT PRIMARY KEY,
      composed_text TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return _db;
}

export class PromptModuleRegistry {
  addModule(name: string, type: 'role' | 'constraints' | 'format' | 'domain', content: string): string {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO pm_modules (id, name, module_type, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, type, content, now);
    return id;
  }

  compose(templateName: string, moduleIds: string[]): string {
    const db = getDb();
    const parts: string[] = [];
    for (const mid of moduleIds) {
      const row = db.prepare('SELECT content FROM pm_modules WHERE id = ? OR name = ?').get(mid, mid) as { content: string } | undefined;
      if (row) parts.push(row.content);
    }
    return parts.join('\n\n');
  }

  saveVersion(composed: string, label?: string): string {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO pm_versions (id, composed_text, label, created_at) VALUES (?, ?, ?, ?)').run(id, composed, label ?? null, now);
    return id;
  }

  getVersion(versionId: string): string | null {
    const db = getDb();
    const row = db.prepare('SELECT composed_text FROM pm_versions WHERE id = ?').get(versionId) as { composed_text: string } | undefined;
    return row?.composed_text ?? null;
  }
}

export function closePromptModulesDb(): void {
  try { if (_db) { _db.close(); _db = null; } } catch (_e) { /* silent */ }
}
