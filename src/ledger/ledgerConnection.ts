import Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { ensureSigningKeys } from "../crypto/keys.js";
import { getOrCreateSqlitePool, type SqliteConnectionLease } from "../storage/sqlitePool.js";
import { ensureDir } from "../utils/fs.js";
import { ledgerFullFsync, ledgerSynchronousMode } from "./ledgerDurability.js";
import { reconcileLegacyMigrationState, runMigrations } from "./ledgerSchema.js";

function ledgerPoolSize(): number {
  const raw = process.env.AMC_LEDGER_SQLITE_POOL_SIZE ?? process.env.AMC_SQLITE_POOL_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

/** Owns connection setup so evidence readers cannot accidentally initialize writers. */
export function openLedgerConnection(
  workspace: string,
  options: { readonly?: boolean; unsignedSignatures: boolean }
): { db: Database.Database; lease: SqliteConnectionLease | null } {
  const dbPath = join(workspace, ".amc", "evidence.sqlite");
  if (options.readonly) {
    // Public-only exports must never initialize a vault, replace trust anchors,
    // migrate evidence, or create an empty ledger. SQLite may still create WAL
    // coordination sidecars. Immutable mode would risk omitting live WAL evidence.
    return {
      db: new Database(dbPath, { readonly: true, fileMustExist: true }),
      lease: null
    };
  }

  ensureDir(join(workspace, ".amc"));
  for (const directory of ["blobs", "targets", "runs"]) {
    ensureDir(join(workspace, ".amc", directory));
  }
  if (!options.unsignedSignatures) ensureSigningKeys(workspace);

  const pool = getOrCreateSqlitePool({
    key: `ledger:${resolve(workspace)}:${dbPath}`,
    dbPath,
    maxSize: ledgerPoolSize(),
    configureConnection: (db) => {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000");
      db.pragma(`synchronous = ${ledgerSynchronousMode()}`);
      // Power-loss durability is explicitly opted in; see ledgerFullFsync.
      db.pragma(`fullfsync = ${ledgerFullFsync(workspace) ? 1 : 0}`);
    },
    initialize: (db) => runMigrations(db)
  });
  const lease = pool.acquire();
  try {
    reconcileLegacyMigrationState(lease.db);
    return { db: lease.db, lease };
  } catch (error) {
    lease.release();
    throw error;
  }
}
