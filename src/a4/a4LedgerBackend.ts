/**
 * Whether the workspace's ledger backend carries A4 state (P2-36; reconcile/G2.md conflict 11). A4 writes its `a4_*`
 * and `action_*` rows into the SQLite ledger; on a Postgres session store (P2-09d) every table POSTGRES_MIRROR_TABLES
 * declares is written through to Postgres in the same transaction (postgresLedgerMirror.ts) and carried in WORM
 * exports (wormSideTables.ts). Every A4 and action table is declared there today, so the gap is empty. A later
 * `a4_*` or `action_*` table the ledger gains without a declaration is state an HA deployment would silently lose:
 * the gap then names it, readiness lists `store.ledger_backend` BLOCKED with LEDGER_BACKEND_INCOMPLETE, and every A4
 * write is refused with that code. SQLite and JSONL session stores leave A4's tables in the SQLite ledger alone.
 */
import type Database from "better-sqlite3";
import { A4_RECORD_TABLES } from "../contracts/v1/a4Record.js";
import { resolveSessionStoreBackend } from "../persistence/openSessionEventStore.js";
import { POSTGRES_MIRROR_TABLES } from "../persistence/postgres/postgresSchema.js";
import { type LedgerMirror, LedgerMirrorError } from "../persistence/postgres/postgresLedgerMirror.js";

export const LEDGER_BACKEND_INCOMPLETE_MESSAGE = "This workspace's ledger backend (Postgres) does not mirror every A4 table, so A4 state would be lost on failover; "
  + "A4 records nothing until the backend declares them.";

/** The A4 and action tables the backend does not carry, sorted; empty when it carries them all (any non-Postgres backend). */
export function ledgerBackendGap(workspace: string, db: Database.Database): string[] {
  if (resolveSessionStoreBackend(workspace) !== "postgres") return [];
  const local = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB 'a4_*' OR name GLOB 'action_*')").all() as Array<{ name: string }>)
    .map((row) => row.name);
  const mirrored = new Set(POSTGRES_MIRROR_TABLES.map((table) => table.name));
  // The record tables count even if this ledger lacks them, so an empty or unmigrated ledger never reads complete.
  return [...new Set([...A4_RECORD_TABLES, ...local])].filter((name) => !mirrored.has(name)).sort();
}

/**
 * P2-36: writes one project's rows through to Postgres before SQLite commits (call it last in the transaction), so a
 * mirror that cannot commit rolls the transition back. `refuse` builds the store's error: 503 unavailable, 409 diverged.
 */
export function writeA4Mirror(mirror: LedgerMirror | null, db: Database.Database, projectId: string,
  refuse: (status: number, code: string, message: string, problems: unknown) => Error): void {
  try {
    mirror?.write(db, { kind: "a4", id: projectId });
  } catch (error) {
    if (!(error instanceof LedgerMirrorError)) throw error;
    throw error.code === "LEDGER_MIRROR_UNAVAILABLE" ? refuse(503, error.code, "The Postgres ledger mirror could not commit; nothing was recorded.", error.problems)
      : refuse(409, error.code, `project ${projectId}'s Postgres mirror diverges from the ledger; nothing was recorded`, error.problems);
  }
}

/** A project's mirror divergence, which refuses a read; an unreachable mirror does not, since the rows verified on their own. */
export const a4MirrorDivergence = (mirror: LedgerMirror | null, db: Database.Database, projectId: string): string[] =>
  (mirror?.problems(db, { kind: "a4", id: projectId }) ?? []).filter((problem) => problem.startsWith("LEDGER_MIRROR_DIVERGED"));
