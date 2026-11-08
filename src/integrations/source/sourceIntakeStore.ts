/**
 * The source-intake store (SH-INTEG-01/02): `.amc/integrations/source-intake.sqlite`, same pragmas as the delivery
 * queue. Two tables: `observations` (one row per observationId, the signed-schema record as JSON) and `proposals`
 * (one row per observation that admission decided: the approval request it filed, or why it was not admitted).
 *
 * The proposals row is the dedup and the crash fence for filing: it is reserved before `createApprovalForIntent`
 * (which mints a fresh request id on every call) and completed after, so two concurrent `admit` runs file one request.
 * A reservation carries a random token; only its holder can settle or release it, so a slow filer whose reservation
 * was taken over after the TTL cannot overwrite the taker's row (it learns it lost and cancels its own request).
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureDir } from "../../utils/fs.js";
import { sourceObservationSchema, type SourceObservation } from "./sourceObservationSchema.js";

const SOURCE_INTAKE_DB = join(".amc", "integrations", "source-intake.sqlite");
/** A reservation older than this with no request id was left by a crashed filer and may be taken over. */
const PROPOSAL_RESERVATION_TTL_MS = 60_000;

type ProposalState = "reserved" | "proposed" | "not_admitted";
export interface ProposalRow {
  observationId: string;
  state: ProposalState;
  /** The current reservation's token, null once settled. */
  token: string | null;
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
      token TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const columns = (db.pragma("table_info(proposals)") as Array<{ name: string }>).map((column) => column.name);
  if (!columns.includes("token")) db.exec("ALTER TABLE proposals ADD COLUMN token TEXT");
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

type ObservationFilter = { sourceId?: string; pendingOnly?: boolean };
/** Pending means no proposals row: not yet decided (a refusal recorded from workspace state, not the policy, is never stored). */
function observationWhere(filter: ObservationFilter): string {
  const where = [filter.sourceId === undefined ? null : "o.source_id = @sourceId", filter.pendingOnly ? "p.observation_id IS NULL" : null].filter((w) => w !== null);
  return "FROM observations o LEFT JOIN proposals p ON p.observation_id = o.observation_id" + (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "");
}

export const SOURCE_LIST_LIMIT = 1000;

/** Oldest first, capped at SOURCE_LIST_LIMIT: a batch. `countSourceObservations` gives the exact count. */
export function listSourceObservationIds(db: Database.Database, filter: ObservationFilter & { limit?: number } = {}): string[] {
  const sql = `SELECT o.observation_id AS id ${observationWhere(filter)} ORDER BY o.received_at ASC, o.observation_id ASC LIMIT @limit`;
  return (db.prepare(sql).all({ sourceId: filter.sourceId ?? null, limit: filter.limit ?? SOURCE_LIST_LIMIT }) as Array<{ id: string }>).map((row) => row.id);
}

export function countSourceObservations(db: Database.Database, filter: ObservationFilter = {}): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n ${observationWhere(filter)}`).get({ sourceId: filter.sourceId ?? null }) as { n: number }).n);
}

function toProposal(row: Record<string, unknown>): ProposalRow {
  return {
    observationId: String(row.observation_id), state: String(row.state) as ProposalState, token: row.token === null ? null : String(row.token),
    approvalRequestId: row.approval_request_id === null ? null : String(row.approval_request_id),
    reason: row.reason === null ? null : String(row.reason), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
  };
}

function getProposal(db: Database.Database, observationId: string): ProposalRow | null {
  const row = db.prepare("SELECT * FROM proposals WHERE observation_id = ?").get(observationId) as Record<string, unknown> | undefined;
  return row ? toProposal(row) : null;
}

/** Newest decisions first, capped at SOURCE_LIST_LIMIT; `countProposals` gives the exact count. */
export function listProposals(db: Database.Database, limit = SOURCE_LIST_LIMIT): ProposalRow[] {
  return (db.prepare("SELECT * FROM proposals ORDER BY updated_at DESC, observation_id ASC LIMIT ?").all(limit) as Array<Record<string, unknown>>).map(toProposal);
}

export function countProposals(db: Database.Database): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM proposals").get() as { n: number }).n);
}

/**
 * Claims the right to decide this observation. `reserved` means this caller decides and holds `token`; `held` means
 * another live filer owns the reservation; `existing` returns the filed proposal. A stale reservation (crashed filer)
 * and a recorded refusal are taken over.
 */
export function reserveProposal(db: Database.Database, observationId: string, now: number): { outcome: "reserved"; token: string } | { outcome: "held" } | { outcome: "existing"; row: ProposalRow } {
  return db.transaction(() => {
    const current = getProposal(db, observationId);
    const token = randomUUID();
    if (current === null) {
      db.prepare("INSERT INTO proposals (observation_id, state, approval_request_id, reason, token, created_at, updated_at) VALUES (?, 'reserved', NULL, NULL, ?, ?, ?)").run(observationId, token, now, now);
      return { outcome: "reserved" as const, token };
    }
    if (current.state === "proposed") return { outcome: "existing" as const, row: current };
    // A refusal is informational: a policy edit (a new sender, admission turned on) may admit the observation later.
    if (current.state === "reserved" && now - current.updatedAt < PROPOSAL_RESERVATION_TTL_MS) return { outcome: "held" as const };
    db.prepare("UPDATE proposals SET state = 'reserved', approval_request_id = NULL, reason = NULL, token = ?, updated_at = ? WHERE observation_id = ? AND updated_at = ?").run(token, now, observationId, current.updatedAt);
    return { outcome: "reserved" as const, token };
  })();
}

/** Settles the reservation `token` holds; false when another filer took it over (the caller then owns nothing). */
export function settleProposal(db: Database.Database, observationId: string, token: string, settled: { state: "proposed"; approvalRequestId: string } | { state: "not_admitted"; reason: string }, now: number): boolean {
  const result = settled.state === "proposed"
    ? db.prepare("UPDATE proposals SET state = 'proposed', approval_request_id = ?, reason = NULL, token = NULL, updated_at = ? WHERE observation_id = ? AND state = 'reserved' AND token = ?").run(settled.approvalRequestId, now, observationId, token)
    : db.prepare("UPDATE proposals SET state = 'not_admitted', approval_request_id = NULL, reason = ?, token = NULL, updated_at = ? WHERE observation_id = ? AND state = 'reserved' AND token = ?").run(settled.reason, now, observationId, token);
  return result.changes === 1;
}

/** Releases the reservation `token` holds when it filed nothing (the filer refused before creating a request). */
export function releaseProposal(db: Database.Database, observationId: string, token: string): void {
  db.prepare("DELETE FROM proposals WHERE observation_id = ? AND state = 'reserved' AND token = ?").run(observationId, token);
}
