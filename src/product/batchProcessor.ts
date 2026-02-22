/**
 * batchProcessor.ts — SQLite-backed batch processing with progress
 * tracking, ETA estimation, pause/resume/cancel, and result aggregation.
 */

import { randomUUID } from 'node:crypto';
import { openProductDb } from './productDb.js';

/* ── Types ───────────────────────────────────────────────────────── */

export type BatchStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type ItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BatchRecord {
  id: string;
  name: string;
  status: BatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

export interface BatchItemRecord {
  id: string;
  batchId: string;
  payload: string;
  status: ItemStatus;
  result?: string;
  error?: string;
  claimedBy?: string;
  createdAt: string;
  processedAt?: string;
}

export interface BatchProgress {
  batchId: string;
  status: BatchStatus;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  percentComplete: number;
  estimatedRemainingMs: number | null;
}

export interface BatchResult {
  batchId: string;
  status: BatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  results: Array<{ itemId: string; result?: unknown; error?: string }>;
  durationMs: number;
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

/* ── Schema ──────────────────────────────────────────────────────── */

function ensureSchema(): void {
  const db = openProductDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      metadata TEXT DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS batch_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES batches(id),
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      error TEXT,
      claimed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_batch_items_batch ON batch_items(batch_id, status);
  `);
}

/* ── BatchProcessor ──────────────────────────────────────────────── */

export class BatchProcessor {
  constructor() {
    ensureSchema();
  }

  createBatch(name: string, items: unknown[], metadata?: Record<string, unknown>): BatchRecord {
    const db = openProductDb();
    const batchId = randomUUID();
    const now = new Date().toISOString();
    const meta = JSON.stringify(metadata ?? {});

    db.prepare(`INSERT INTO batches (id, name, status, total_items, created_at, metadata) VALUES (?, ?, 'pending', ?, ?, ?)`)
      .run(batchId, name, items.length, now, meta);

    const insertItem = db.prepare(`INSERT INTO batch_items (id, batch_id, payload, status, created_at) VALUES (?, ?, ?, 'pending', ?)`);
    const tx = db.transaction(() => {
      for (const item of items) {
        insertItem.run(randomUUID(), batchId, JSON.stringify(item), now);
      }
    });
    tx();

    return this.getBatch(batchId)!;
  }

  getBatch(batchId: string): BatchRecord | undefined {
    const db = openProductDb();
    const row = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(batchId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: row.id as string,
      name: row.name as string,
      status: row.status as BatchStatus,
      totalItems: row.total_items as number,
      completedItems: row.completed_items as number,
      failedItems: row.failed_items as number,
      createdAt: row.created_at as string,
      startedAt: row.started_at as string | undefined,
      completedAt: row.completed_at as string | undefined,
      metadata: parseJsonRecord(row.metadata),
    };
  }

  startBatch(batchId: string): BatchRecord {
    const db = openProductDb();
    db.prepare(`UPDATE batches SET status = 'running', started_at = datetime('now') WHERE id = ? AND status = 'pending'`)
      .run(batchId);
    const batch = this.getBatch(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    return batch;
  }

  claimItems(batchId: string, claimedBy: string, count = 10): BatchItemRecord[] {
    const db = openProductDb();
    const rows = db.prepare(
      `SELECT * FROM batch_items WHERE batch_id = ? AND status = 'pending' LIMIT ?`
    ).all(batchId, count) as Record<string, unknown>[];

    if (rows.length === 0) return [];

    const ids = rows.map(r => r.id as string);
    const update = db.prepare(`UPDATE batch_items SET status = 'processing', claimed_by = ? WHERE id = ?`);
    const tx = db.transaction(() => {
      for (const id of ids) update.run(claimedBy, id);
    });
    tx();

    // Re-query to return updated records
    const placeholders = ids.map(() => '?').join(',');
    const updated = db.prepare(
      `SELECT * FROM batch_items WHERE id IN (${placeholders})`
    ).all(...ids) as Record<string, unknown>[];

    return updated.map(r => this.toItemRecord(r));
  }

  completeItem(itemId: string, result: unknown): void {
    const db = openProductDb();
    db.prepare(`UPDATE batch_items SET status = 'completed', result = ?, processed_at = datetime('now') WHERE id = ?`)
      .run(JSON.stringify(result), itemId);

    // Update batch counters
    const item = db.prepare(`SELECT batch_id FROM batch_items WHERE id = ?`).get(itemId) as Record<string, unknown> | undefined;
    if (item) {
      db.prepare(`UPDATE batches SET completed_items = completed_items + 1 WHERE id = ?`).run(item.batch_id);
      this.checkBatchCompletion(item.batch_id as string);
    }
  }

  failItem(itemId: string, error: string): void {
    const db = openProductDb();
    db.prepare(`UPDATE batch_items SET status = 'failed', error = ?, processed_at = datetime('now') WHERE id = ?`)
      .run(error, itemId);

    const item = db.prepare(`SELECT batch_id FROM batch_items WHERE id = ?`).get(itemId) as Record<string, unknown> | undefined;
    if (item) {
      db.prepare(`UPDATE batches SET failed_items = failed_items + 1 WHERE id = ?`).run(item.batch_id);
      this.checkBatchCompletion(item.batch_id as string);
    }
  }

  pauseBatch(batchId: string): void {
    openProductDb().prepare(`UPDATE batches SET status = 'paused' WHERE id = ? AND status = 'running'`).run(batchId);
  }

  resumeBatch(batchId: string): void {
    openProductDb().prepare(`UPDATE batches SET status = 'running' WHERE id = ? AND status = 'paused'`).run(batchId);
  }

  cancelBatch(batchId: string): void {
    const db = openProductDb();
    db.prepare(`UPDATE batches SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?`).run(batchId);
    db.prepare(`UPDATE batch_items SET status = 'failed', error = 'Batch cancelled' WHERE batch_id = ? AND status IN ('pending', 'processing')`)
      .run(batchId);
  }

  getProgress(batchId: string): BatchProgress {
    const db = openProductDb();
    const row = db.prepare(`
      SELECT b.status, b.total_items, b.completed_items, b.failed_items, b.started_at,
        (SELECT COUNT(*) FROM batch_items WHERE batch_id = b.id AND status = 'pending') as pending,
        (SELECT COUNT(*) FROM batch_items WHERE batch_id = b.id AND status = 'processing') as processing
      FROM batches b WHERE b.id = ?
    `).get(batchId) as Record<string, unknown> | undefined;

    if (!row) throw new Error(`Batch ${batchId} not found`);

    const total = row.total_items as number;
    const completed = row.completed_items as number;
    const failed = row.failed_items as number;
    const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

    let eta: number | null = null;
    if (row.started_at && completed > 0) {
      const elapsed = Date.now() - new Date(row.started_at as string).getTime();
      const msPerItem = elapsed / completed;
      const remaining = total - completed - failed;
      eta = Math.round(msPerItem * remaining);
    }

    return {
      batchId,
      status: row.status as BatchStatus,
      total,
      completed,
      failed,
      pending: row.pending as number,
      processing: row.processing as number,
      percentComplete: pct,
      estimatedRemainingMs: eta,
    };
  }

  getResult(batchId: string): BatchResult {
    const db = openProductDb();
    const batch = this.getBatch(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    const items = db.prepare(`SELECT id, result, error FROM batch_items WHERE batch_id = ? AND status IN ('completed', 'failed')`)
      .all(batchId) as Array<Record<string, unknown>>;

    const startMs = batch.startedAt ? new Date(batch.startedAt).getTime() : Date.now();
    const endMs = batch.completedAt ? new Date(batch.completedAt).getTime() : Date.now();

    return {
      batchId,
      status: batch.status,
      totalItems: batch.totalItems,
      completedItems: batch.completedItems,
      failedItems: batch.failedItems,
      results: items.map(i => ({
        itemId: i.id as string,
        result: parseJsonUnknown(i.result),
        error: i.error as string | undefined,
      })),
      durationMs: endMs - startMs,
    };
  }

  private checkBatchCompletion(batchId: string): void {
    const db = openProductDb();
    const row = db.prepare(`
      SELECT total_items, completed_items, failed_items FROM batches WHERE id = ?
    `).get(batchId) as Record<string, unknown> | undefined;
    if (!row) return;

    const total = row.total_items as number;
    const done = (row.completed_items as number) + (row.failed_items as number);
    if (done >= total) {
      const status = (row.failed_items as number) === total ? 'failed' : 'completed';
      db.prepare(`UPDATE batches SET status = ?, completed_at = datetime('now') WHERE id = ?`).run(status, batchId);
    }
  }

  private toItemRecord(row: Record<string, unknown>): BatchItemRecord {
    return {
      id: row.id as string,
      batchId: row.batch_id as string,
      payload: row.payload as string,
      status: row.status as ItemStatus,
      result: row.result as string | undefined,
      error: row.error as string | undefined,
      claimedBy: row.claimed_by as string | undefined,
      createdAt: row.created_at as string,
      processedAt: row.processed_at as string | undefined,
    };
  }
}
