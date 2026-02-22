/**
 * portal.ts — SQLite-backed job portal with progress tracking,
 * result file management, and state transition enforcement.
 */

import { randomUUID } from 'node:crypto';
import { openProductDb } from './productDb.js';

/* ── Types ───────────────────────────────────────────────────────── */

export type JobStatus = 'submitted' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PortalJob {
  id: string;
  name: string;
  type: string;
  status: JobStatus;
  submittedBy: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProgressEvent {
  id: string;
  jobId: string;
  progress: number;
  message: string;
  timestamp: string;
}

export interface ResultFile {
  id: string;
  jobId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  path: string;
  createdAt: string;
}

function parseJsonUnknown(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  const parsed = parseJsonUnknown(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function parseOptionalJsonRecord(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = parseJsonUnknown(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}

/* ── Valid state transitions ─────────────────────────────────────── */

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  submitted: ['queued', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/* ── Schema ──────────────────────────────────────────────────────── */

function ensureSchema(): void {
  const db = openProductDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS portal_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_by TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      result TEXT,
      error TEXT,
      progress REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS portal_progress_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES portal_jobs(id),
      progress REAL NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS portal_result_files (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES portal_jobs(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_portal_progress ON portal_progress_events(job_id);
    CREATE INDEX IF NOT EXISTS idx_portal_files ON portal_result_files(job_id);
  `);
}

/* ── PortalManager ───────────────────────────────────────────────── */

export class PortalManager {
  constructor() {
    ensureSchema();
  }

  submitJob(name: string, type: string, submittedBy: string, payload?: Record<string, unknown>): PortalJob {
    const db = openProductDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO portal_jobs (id, name, type, status, submitted_by, payload, created_at) VALUES (?, ?, ?, 'submitted', ?, ?, ?)`)
      .run(id, name, type, submittedBy, JSON.stringify(payload ?? {}), now);
    return this.getJob(id)!;
  }

  getJob(jobId: string): PortalJob | undefined {
    const db = openProductDb();
    const row = db.prepare(`SELECT * FROM portal_jobs WHERE id = ?`).get(jobId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.toJob(row);
  }

  listJobs(filters?: { status?: JobStatus; type?: string; submittedBy?: string }): PortalJob[] {
    const db = openProductDb();
    let sql = 'SELECT * FROM portal_jobs WHERE 1=1';
    const params: unknown[] = [];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters?.type) { sql += ' AND type = ?'; params.push(filters.type); }
    if (filters?.submittedBy) { sql += ' AND submitted_by = ?'; params.push(filters.submittedBy); }
    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => this.toJob(r));
  }

  private transition(jobId: string, newStatus: JobStatus): PortalJob {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const allowed = VALID_TRANSITIONS[job.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot transition from ${job.status} to ${newStatus}`);
    }

    const db = openProductDb();
    const updates: string[] = [`status = '${newStatus}'`];
    if (newStatus === 'running') updates.push(`started_at = datetime('now')`);
    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
      updates.push(`completed_at = datetime('now')`);
    }

    db.prepare(`UPDATE portal_jobs SET ${updates.join(', ')} WHERE id = ?`).run(jobId);
    return this.getJob(jobId)!;
  }

  queueJob(jobId: string): PortalJob { return this.transition(jobId, 'queued'); }
  startJob(jobId: string): PortalJob { return this.transition(jobId, 'running'); }
  cancelJob(jobId: string): PortalJob { return this.transition(jobId, 'cancelled'); }

  updateProgress(jobId: string, progress: number, message?: string): PortalJob {
    const db = openProductDb();
    const pct = Math.max(0, Math.min(100, progress));
    db.prepare(`UPDATE portal_jobs SET progress = ? WHERE id = ?`).run(pct, jobId);
    if (message) {
      db.prepare(`INSERT INTO portal_progress_events (id, job_id, progress, message) VALUES (?, ?, ?, ?)`)
        .run(randomUUID(), jobId, pct, message);
    }
    return this.getJob(jobId)!;
  }

  completeJob(jobId: string, result?: Record<string, unknown>): PortalJob {
    const db = openProductDb();
    if (result) {
      db.prepare(`UPDATE portal_jobs SET result = ? WHERE id = ?`).run(JSON.stringify(result), jobId);
    }
    db.prepare(`UPDATE portal_jobs SET progress = 100 WHERE id = ?`).run(jobId);
    return this.transition(jobId, 'completed');
  }

  failJob(jobId: string, error: string): PortalJob {
    const db = openProductDb();
    db.prepare(`UPDATE portal_jobs SET error = ? WHERE id = ?`).run(error, jobId);
    return this.transition(jobId, 'failed');
  }

  getProgressHistory(jobId: string): ProgressEvent[] {
    const db = openProductDb();
    const rows = db.prepare(`SELECT * FROM portal_progress_events WHERE job_id = ? ORDER BY timestamp`)
      .all(jobId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as string,
      jobId: r.job_id as string,
      progress: r.progress as number,
      message: r.message as string,
      timestamp: r.timestamp as string,
    }));
  }

  addResultFile(jobId: string, filename: string, path: string, mimeType?: string, sizeBytes?: number): ResultFile {
    const db = openProductDb();
    const id = randomUUID();
    db.prepare(`INSERT INTO portal_result_files (id, job_id, filename, mime_type, size_bytes, path) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, jobId, filename, mimeType ?? 'application/octet-stream', sizeBytes ?? 0, path);
    return { id, jobId, filename, mimeType: mimeType ?? 'application/octet-stream', sizeBytes: sizeBytes ?? 0, path, createdAt: new Date().toISOString() };
  }

  getResultFiles(jobId: string): ResultFile[] {
    const db = openProductDb();
    const rows = db.prepare(`SELECT * FROM portal_result_files WHERE job_id = ?`).all(jobId) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as string,
      jobId: r.job_id as string,
      filename: r.filename as string,
      mimeType: r.mime_type as string,
      sizeBytes: r.size_bytes as number,
      path: r.path as string,
      createdAt: r.created_at as string,
    }));
  }

  private toJob(row: Record<string, unknown>): PortalJob {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      status: row.status as JobStatus,
      submittedBy: row.submitted_by as string,
      payload: parseJsonRecord(row.payload),
      result: parseOptionalJsonRecord(row.result),
      error: row.error as string | undefined,
      progress: row.progress as number,
      createdAt: row.created_at as string,
      startedAt: row.started_at as string | undefined,
      completedAt: row.completed_at as string | undefined,
    };
  }
}
