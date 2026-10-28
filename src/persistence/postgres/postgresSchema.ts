/**
 * The tables the Postgres session store mirrors from the SQLite ledger.
 *
 * This list is the seam later items extend: P2-36 adds its `a4_*` and
 * `action_*` tables as entries here (DDL, the columns to copy and the SQLite
 * SELECT that reads them), and `amc evidence-stores migrate --to postgres`
 * creates and copies every entry with no other change. A table the ledger
 * keeps that is missing here is a table a Postgres workspace does not have;
 * P2-36 reports that as LEDGER_BACKEND_INCOMPLETE by checking its own table
 * names against the names in this list.
 *
 * Every mirrored row carries `chain_id`, so one database can hold several
 * workspaces' chains without their rows meeting. The DDL keeps to the subset
 * Postgres and SQLite share, so the contract tests run it unchanged.
 */
import type { SyncPgClient } from "./syncPgClient.js";

export interface MirroredTable {
  readonly name: string;
  /** Statements that create the table and its indexes. Idempotent (IF NOT EXISTS). */
  readonly ddl: readonly string[];
  /** Columns copied by a migration, in order, excluding `chain_id`. */
  readonly columns: readonly string[];
  /** The SQLite query a migration reads those columns with, in chain order. */
  readonly sqliteSelect: string;
}

const EVENT_COLUMNS = [
  "chain_seq", "id", "ts", "session_id", "runtime", "event_type", "payload_path", "payload_inline", "payload_sha256",
  "meta_json", "prev_event_hash", "event_hash", "writer_sig", "canonical_payload_path", "canonical_payload_inline",
  "blob_ref", "archived", "archive_segment_id", "archive_manifest_sha256", "payload_pruned", "payload_pruned_ts"
] as const;

const SESSION_COLUMNS = [
  "session_id", "started_ts", "ended_ts", "runtime", "binary_path", "binary_sha256", "session_final_event_hash", "session_seal_sig"
] as const;

const RUN_COLUMNS = [
  "run_id", "ts", "window_start_ts", "window_end_ts", "target_profile_id", "report_json_sha256", "run_seal_sig", "status"
] as const;

/** Columns of `evidence_events` returned to callers (everything but the chain bookkeeping). */
export const EVENT_READ_COLUMNS = EVENT_COLUMNS.filter((column) => column !== "chain_seq");

export const SESSION_READ_COLUMNS = SESSION_COLUMNS;

export const POSTGRES_MIRROR_TABLES: readonly MirroredTable[] = [
  {
    name: "evidence_events",
    ddl: [
      `CREATE TABLE IF NOT EXISTS evidence_events (
        chain_id TEXT NOT NULL,
        chain_seq BIGINT NOT NULL,
        id TEXT PRIMARY KEY,
        ts BIGINT NOT NULL,
        session_id TEXT NOT NULL,
        runtime TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_path TEXT,
        payload_inline TEXT,
        payload_sha256 TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        prev_event_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        writer_sig TEXT NOT NULL,
        canonical_payload_path TEXT,
        canonical_payload_inline TEXT,
        blob_ref TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        archive_segment_id TEXT,
        archive_manifest_sha256 TEXT,
        payload_pruned INTEGER NOT NULL DEFAULT 0,
        payload_pruned_ts BIGINT,
        UNIQUE (chain_id, prev_event_hash),
        UNIQUE (chain_id, chain_seq)
      )`,
      "CREATE INDEX IF NOT EXISTS amc_events_session ON evidence_events (chain_id, session_id, chain_seq)"
    ],
    columns: EVENT_COLUMNS,
    sqliteSelect: `SELECT rowid AS chain_seq, ${EVENT_COLUMNS.filter((c) => c !== "chain_seq").join(", ")} FROM evidence_events ORDER BY rowid ASC`
  },
  {
    name: "sessions",
    ddl: [
      `CREATE TABLE IF NOT EXISTS sessions (
        chain_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        started_ts BIGINT NOT NULL,
        ended_ts BIGINT,
        runtime TEXT NOT NULL,
        binary_path TEXT NOT NULL,
        binary_sha256 TEXT NOT NULL,
        session_final_event_hash TEXT,
        session_seal_sig TEXT,
        PRIMARY KEY (chain_id, session_id)
      )`
    ],
    columns: SESSION_COLUMNS,
    sqliteSelect: `SELECT ${SESSION_COLUMNS.join(", ")} FROM sessions ORDER BY rowid ASC`
  },
  {
    name: "runs",
    ddl: [
      `CREATE TABLE IF NOT EXISTS runs (
        chain_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        ts BIGINT NOT NULL,
        window_start_ts BIGINT NOT NULL,
        window_end_ts BIGINT NOT NULL,
        target_profile_id TEXT,
        report_json_sha256 TEXT NOT NULL,
        run_seal_sig TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (chain_id, run_id)
      )`
    ],
    columns: RUN_COLUMNS,
    sqliteSelect: `SELECT ${RUN_COLUMNS.join(", ")} FROM runs ORDER BY rowid ASC`
  }
];

/** The chain head every append locks (`FOR UPDATE`) before it reads, so writers queue rather than fork. */
const CHAIN_HEADS_DDL =
  "CREATE TABLE IF NOT EXISTS amc_chain_heads (chain_id TEXT PRIMARY KEY, head_hash TEXT NOT NULL, head_seq BIGINT NOT NULL)";

/** Create every mirrored table and the chain-head table. Safe to repeat. */
export function ensurePostgresSchema(client: SyncPgClient): void {
  client.query(CHAIN_HEADS_DDL);
  for (const table of POSTGRES_MIRROR_TABLES) {
    for (const statement of table.ddl) client.query(statement);
  }
}

/** Column values from a Postgres row; BIGINT comes back from `pg` as a string. */
export function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
