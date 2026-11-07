/**
 * The source-intake store (SH-INTEG-01/02): `.amc/integrations/source-intake.sqlite`, same pragmas as the delivery
 * queue. Two tables: `observations` (one row per observationId, the signed-schema record as JSON) and `proposals`
 * (one row per observation that admission decided: the approval request it filed, or why it was not admitted).
 *
 * The proposals row is the dedup and the crash fence for filing: it is reserved before `createApprovalForIntent`
 * (which mints a fresh request id on every call) and completed after, so two concurrent `admit` runs file one request.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import { ensureDir } from "../../utils/fs.js";
import { sourceObservationSchema, type SourceObservation } from "./sourceObservationSchema.js";

export const SOURCE_INTAKE_DB = join(".amc", "integrations", "source-intake.sqlite");
/** A reservation older than this with no request id was left by a crashed filer and may be taken over. */
export const PROPOSAL_RESERVATION_TTL_MS = 60_000;

export type ProposalState = "reserved" | "proposed" | "not_admitted";
export interface ProposalRow {
  observationId: string;
  state: ProposalState;
  approvalRequestId: string | null;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
}

export function openSourceIntakeDb(workspace: string): Database.Database {
  ensureDir(join(workspace, ".amc", "integrations"));
  const db = new Database(join(workspace, SOURCE_INTAKE_DB));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("secure_delete = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      observation_id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      native_event_id TEXT NOT NULL,
      primary_thread_key TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      record TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS observations_source_received ON observations(source_id, received_at);
    CREATE TABLE IF NOT EXISTS proposals (
      observation_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      approval_request_id TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

/** Idempotent: the same observationId recorded twice is one row (the unique index is the dedup, not the caller). */
export function recordSourceObservation(db: Database.Database, observation: SourceObservation): { inserted: boolean } {
  const result = db.prepare(
    "INSERT OR IGNORE INTO observations (observation_id, source_id, native_event_id, primary_thread_key, received_at, record) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(observation.observationId, observation.sourceId, observation.nativeEventId, observation.primaryThreadKey, observation.receivedAt, JSON.stringify(observation));
  return { inserted: result.changes === 1 };
}

/** The stored record, or null when it is missing or no longer parses (a corrupted row is not an observation). */
export function getSourceObservation(db: Database.Database, observationId: string): SourceObservation | null {
  const row = db.prepare("SELECT record FROM observations WHERE observation_id = ?").get(observationId) as { record: string } | undefined;
  if (!row) return null;
  try {
    const parsed = sourceObservationSchema.safeParse(JSON.parse(row.record) as unknown);
    return parsed.success && parsed.data.observationId === observationId ? parsed.data : null;
  } catch {
    return null;
  }
}

export function listSourceObservationIds(db: Database.Database, filter: { sourceId?: string; pendingOnly?: boolean; limit?: number } = {}): string[] {
  const where = [filter.sourceId === undefined ? null : "o.source_id = @sourceId", filter.pendingOnly ? "p.observation_id IS NULL" : null].filter((w) => w !== null);
  const sql = `SELECT o.observation_id AS id FROM observations o LEFT JOIN proposals p ON p.observation_id = o.observation_id`
    + (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") + " ORDER BY o.received_at ASC, o.observation_id ASC LIMIT @limit";
  return (db.prepare(sql).all({ sourceId: filter.sourceId ?? null, limit: filter.limit ?? 1000 }) as Array<{ id: string }>).map((row) => row.id);
}

function toProposal(row: Record<string, unknown>): ProposalRow {
  return {
    observationId: String(row.observation_id), state: String(row.state) as ProposalState,
    approvalRequestId: row.approval_request_id === null ? null : String(row.approval_request_id),
    reason: row.reason === null ? null : String(row.reason), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
  };
}

export function getProposal(db: Database.Database, observationId: string): ProposalRow | null {
  const row = db.prepare("SELECT * FROM proposals WHERE observation_id = ?").get(observationId) as Record<string, unknown> | undefined;
  return row ? toProposal(row) : null;
}

export function listProposals(db: Database.Database, limit = 1000): ProposalRow[] {
  return (db.prepare("SELECT * FROM proposals ORDER BY created_at ASC, observation_id ASC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map(toProposal);
}

/**
 * Claims the right to decide this observation. `reserved` means this caller decides; `held` means another live filer
 * owns the reservation; `existing` returns the filed proposal. A stale reservation (crashed filer) and a recorded
 * refusal are taken over.
 */
export function reserveProposal(db: Database.Database, observationId: string, now: number): { outcome: "reserved" } | { outcome: "held" } | { outcome: "existing"; row: ProposalRow } {
  return db.transaction(() => {
    const current = getProposal(db, observationId);
    if (current === null) {
      db.prepare("INSERT INTO proposals (observation_id, state, approval_request_id, reason, created_at, updated_at) VALUES (?, 'reserved', NULL, NULL, ?, ?)").run(observationId, now, now);
      return { outcome: "reserved" as const };
    }
    if (current.state === "proposed") return { outcome: "existing" as const, row: current };
    // A refusal is informational: a policy edit (a new sender, admission turned on) may admit the observation later.
    if (current.state === "reserved" && now - current.updatedAt < PROPOSAL_RESERVATION_TTL_MS) return { outcome: "held" as const };
    db.prepare("UPDATE proposals SET state = 'reserved', approval_request_id = NULL, reason = NULL, updated_at = ? WHERE observation_id = ? AND updated_at = ?").run(now, observationId, current.updatedAt);
    return { outcome: "reserved" as const };
  })();
}

export function settleProposal(db: Database.Database, observationId: string, settled: { state: "proposed"; approvalRequestId: string } | { state: "not_admitted"; reason: string }, now: number): void {
  const result = settled.state === "proposed"
    ? db.prepare("UPDATE proposals SET state = 'proposed', approval_request_id = ?, reason = NULL, updated_at = ? WHERE observation_id = ? AND state = 'reserved'").run(settled.approvalRequestId, now, observationId)
    : db.prepare("UPDATE proposals SET state = 'not_admitted', approval_request_id = NULL, reason = ?, updated_at = ? WHERE observation_id = ? AND state = 'reserved'").run(settled.reason, now, observationId);
  if (result.changes !== 1) throw new Error(`proposal for ${observationId} is not reserved by this filer`);
}

/** Releases a reservation that filed nothing (the filer refused before creating a request). */
export function releaseProposal(db: Database.Database, observationId: string): void {
  db.prepare("DELETE FROM proposals WHERE observation_id = ? AND state = 'reserved'").run(observationId);
}
