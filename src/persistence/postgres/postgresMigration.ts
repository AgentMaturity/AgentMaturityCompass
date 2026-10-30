/**
 * `amc evidence-stores migrate --to postgres` (P2-09d, named freeze exception).
 *
 * Copies a SQLite workspace's mirrored tables (POSTGRES_MIRROR_TABLES) into the
 * workspace's chain in Postgres, all or nothing (P2-09d-M1):
 *  1. the SQLite session history authenticates before it is copied;
 *  2. `compareBackendDeterminism` writes the same pinned input through both
 *     backends (into scratch workspaces, so scratch chains land in Postgres
 *     under fresh ids) and requires identical event hashes;
 *  3. one Postgres transaction copies every table, the chain head and one
 *     mirror-log entry per A4 project and action execution (P2-36), then reads
 *     it all back: every table equal to SQLite's row for row, column for
 *     column; both head rows where the copy puts them; every scope in parity
 *     with the mirror log, held to the floor about to be signed. Any refusal
 *     rolls the transaction back.
 * Nothing local is written before COMMIT: the signed heads, the signed parity
 * receipt, the chain id and the re-pin to Postgres follow it, and a failure
 * among them leaves a state the next run finishes. A Postgres chain that holds
 * rows other than exactly this copy is refused, never merged.
 *
 * After the switch the session spine writes to Postgres; producers that write
 * through the SQLite `Ledger` directly keep writing evidence.sqlite, as they do
 * on a JSONL workspace. The receipt records the head both chains share.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openLedger } from "../../ledger/ledger.js";
import { writeSignedMigrationReceipt } from "../../ledger/signedMigrationReceipt.js";
import { workspaceSelfTrust } from "../../trust/trustContext.js";
import type { EvidenceEvent, SessionRecord } from "../../types.js";
import { initWorkspace } from "../../workspace.js";
import { compareBackendDeterminism, type ConformanceBackend } from "../conformance/sessionStoreConformance.js";
import { openSessionEventStore, readSessionStoreMarker, repinSqliteToPostgres } from "../openSessionEventStore.js";
import { GLOBAL_GENESIS } from "../sessionEventRows.js";
import { verifyStoredSessionEventMetadata } from "../sessionStoreVerification.js";
import { recordSignedPostgresHead, signPostgresHead } from "./postgresHead.js";
import {
  appendMirrorEntries, ensureMirrorHead, mirrorEntryHash, mirrorHeadId, mirrorScopeProblems, sqliteScopeDigest, sqliteScopes, type MirrorScope
} from "./postgresLedgerMirror.js";
import { ensurePostgresSchema, POSTGRES_MIRROR_TABLES } from "./postgresSchema.js";
import { ensurePostgresChainId, PostgresSessionEventStore, readPostgresChainId } from "./postgresSessionEventStore.js";
import { readPostgresUrl, SyncPgClient, type SyncPgOptions } from "./syncPgClient.js";

export interface PostgresMigrationReceipt {
  readonly v: 1;
  readonly kind: "postgres-session-store-migration";
  readonly ts: number;
  readonly chainId: string;
  /** Rows copied per mirrored table, side tables included. */
  readonly rowsCopied: Readonly<Record<string, number>>;
  readonly sqliteChainHead: string;
  readonly postgresChainHead: string;
  readonly determinism: { readonly ok: boolean; readonly eventHashes: Readonly<Record<string, readonly string[]>> };
}

export interface PostgresMigrationOptions {
  /** Driver and timeout; code-only, as for the store. */
  readonly pg?: SyncPgOptions;
}

function scratchBackend(id: "sqlite" | "postgres", options: PostgresMigrationOptions): ConformanceBackend {
  const createWorkspace = () => {
    const workspace = mkdtempSync(join(tmpdir(), `amc-pg-parity-${id}-`));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
    return { workspace, dispose: () => rmSync(workspace, { recursive: true, force: true }) };
  };
  return id === "sqlite"
    ? { backendId: id, createWorkspace, open: (ws) => openSessionEventStore(ws, "sqlite"), openReadOnly: (ws) => openSessionEventStore(ws, "sqlite", { readOnly: true }) }
    : { backendId: id, createWorkspace, open: (ws) => new PostgresSessionEventStore(ws, { pg: options.pg }),
      openReadOnly: (ws) => new PostgresSessionEventStore(ws, { readOnly: true, pg: options.pg }) };
}

const NEVER_MERGES = "the Postgres chain for this workspace already holds rows; migration never merges chains";

interface ExpectedHeads {
  readonly events: { readonly hash: string; readonly seq: number };
  readonly mirror: { readonly hash: string; readonly seq: number };
  readonly scopes: ReadonlyArray<{ readonly scope: MirrorScope; readonly digest: string }>;
}

/** Where a complete copy of this SQLite ledger puts both heads: each is a function of the SQLite rows and the chain id alone. */
function expectedHeads(db: Database.Database, chainId: string): ExpectedHeads {
  const last = db.prepare("SELECT rowid AS seq, event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as { seq: number; event_hash: string } | undefined;
  const scopes = sqliteScopes(db).map((scope) => ({ scope, digest: sqliteScopeDigest(db, scope) }));
  const mirror = scopes.reduce((head, entry) => ({ seq: head.seq + 1,
    hash: mirrorEntryHash(chainId, head.seq + 1, `${entry.scope.kind}:${entry.scope.id}`, entry.digest, head.hash) }), { hash: GLOBAL_GENESIS, seq: 0 });
  return { events: { hash: last?.event_hash ?? GLOBAL_GENESIS, seq: last?.seq ?? 0 }, mirror, scopes };
}

/** Any row under this chain id, or a head past genesis. */
function chainHoldsRows(client: SyncPgClient, chainId: string): boolean {
  return client.query("SELECT 1 AS hit FROM amc_chain_heads WHERE chain_id IN ($1, $2) AND head_seq <> 0", [chainId, mirrorHeadId(chainId)]).rows.length > 0
    || [...POSTGRES_MIRROR_TABLES.map((table) => table.name), "amc_ledger_mirror_log"]
      .some((table) => client.query(`SELECT 1 AS hit FROM ${table} WHERE chain_id = $1 LIMIT 1`, [chainId]).rows.length > 0);
}

/** Inside the caller's transaction: every mirrored table, the session chain head, one mirror-log entry per scope. */
function copyTables(client: SyncPgClient, db: Database.Database, chainId: string, expected: ExpectedHeads): void {
  for (const table of POSTGRES_MIRROR_TABLES) {
    const placeholders = ["$1", ...table.columns.map((_, i) => `$${i + 2}`)].join(", ");
    const insert = `INSERT INTO ${table.name} (chain_id, ${table.columns.join(", ")}) VALUES (${placeholders})`;
    for (const row of db.prepare(table.sqliteSelect).all() as Record<string, unknown>[]) {
      client.query(insert, [chainId, ...table.columns.map((column) => row[column] ?? null)]);
    }
  }
  client.query(
    "INSERT INTO amc_chain_heads (chain_id, head_hash, head_seq) VALUES ($1, $2, $3) ON CONFLICT (chain_id) DO UPDATE SET head_hash = $2, head_seq = $3",
    [chainId, expected.events.hash, expected.events.seq]
  );
  ensureMirrorHead(client, chainId);
  appendMirrorEntries(client, chainId, expected.scopes.map((entry) => ({ scope: `${entry.scope.kind}:${entry.scope.id}`, digest: entry.digest })));
}

/**
 * The chain as a writer will see it, read inside the copy's transaction: every mirrored table equal to SQLite's row for
 * row (as a multiset of column values), both head rows where the copy puts them, and every scope in parity with the
 * mirror log, the log whole under the floor the workspace is about to sign.
 */
function copyProblems(client: SyncPgClient, workspace: string, db: Database.Database, chainId: string, expected: ExpectedHeads): string[] {
  const text = (columns: readonly string[]) => (row: Record<string, unknown>) =>
    JSON.stringify(columns.map((column) => (row[column] ?? null) === null ? null : String(row[column])));
  const problems = POSTGRES_MIRROR_TABLES.filter((table) => {
    const local = (db.prepare(table.sqliteSelect).all() as Record<string, unknown>[]).map(text(table.columns)).sort();
    const copied = client.query(`SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE chain_id = $1`, [chainId]).rows.map(text(table.columns)).sort();
    return local.length !== copied.length || local.some((row, i) => row !== copied[i]);
  }).map((table) => `Postgres ${table.name} rows differ from the SQLite rows they were copied from`);
  for (const [id, head, what] of [[chainId, expected.events, "chain head"], [mirrorHeadId(chainId), expected.mirror, "ledger mirror head"]] as const) {
    const row = client.query("SELECT head_hash, head_seq FROM amc_chain_heads WHERE chain_id = $1", [id]).rows[0];
    if (row === undefined || String(row.head_hash) !== head.hash || Number(row.head_seq) !== head.seq) problems.push(`the Postgres ${what} differs from the SQLite ledger's`);
  }
  const floor = { head: signPostgresHead(workspace, chainId, expected.mirror.hash, expected.mirror.seq, "ledger-mirror"), error: null };
  problems.push(...expected.scopes.flatMap((entry, index) => mirrorScopeProblems(client, workspace, chainId, db, entry.scope, floor, index === 0)));
  return problems;
}

/**
 * Copy and prove in one Postgres transaction: any refusal rolls the copy back, so the database is as it was. A chain
 * that already holds exactly this copy (an earlier run committed it, then a local write failed) is proved and kept.
 */
function copyAndProve(db: Database.Database, workspace: string, chainId: string, options: PostgresMigrationOptions): ExpectedHeads {
  const expected = expectedHeads(db, chainId);
  const client = new SyncPgClient(readPostgresUrl(), options.pg);
  try {
    ensurePostgresSchema(client);
    client.query("BEGIN");
    try {
      const resumed = chainHoldsRows(client, chainId);
      if (!resumed) copyTables(client, db, chainId, expected);
      const problems = copyProblems(client, workspace, db, chainId, expected);
      if (problems.length > 0) {
        throw new Error(resumed ? `${NEVER_MERGES}: ${problems.slice(0, 3).join("; ")}`
          : `the Postgres copy does not verify; nothing was committed and the workspace stays on SQLite: ${problems.slice(0, 3).join("; ")}`);
      }
      client.query("COMMIT");
    } catch (error) {
      try { client.query("ROLLBACK"); } catch { /* the server aborts with the connection */ }
      throw error;
    }
    return expected;
  } finally {
    client.close();
  }
}

function sqliteSessionHistory(workspace: string): { events: EvidenceEvent[]; sessions: SessionRecord[] } {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return {
      events: ledger.getAllEvents() as EvidenceEvent[],
      sessions: ledger.db.prepare("SELECT * FROM sessions").all() as SessionRecord[]
    };
  } finally {
    ledger.close();
  }
}

export function migrateSqliteToPostgres(workspace: string, options: PostgresMigrationOptions = {}): { receipt: PostgresMigrationReceipt; receiptPath: string } {
  const marker = readSessionStoreMarker(workspace);
  if (marker !== null && marker !== "sqlite") throw new Error(`workspace session store is ${marker}; only a SQLite workspace can migrate to Postgres`);
  const history = sqliteSessionHistory(workspace);
  const authenticated = verifyStoredSessionEventMetadata(workspace, history.events, { sessionRecords: history.sessions, trust: workspaceSelfTrust(workspace) });
  if (!authenticated.ok) throw new Error(`SQLite history failed authentication; nothing was copied: ${authenticated.errors.slice(0, 3).join("; ")}`);

  // Every refusal is decided before the workspace or its chain changes: the chain id is only read here, the determinism
  // probe writes scratch chains under fresh ids, and the copy is proved inside the transaction that holds it.
  const chainId = readPostgresChainId(workspace) ?? randomUUID();
  const determinism = compareBackendDeterminism([scratchBackend("sqlite", options), scratchBackend("postgres", options)],
    [randomUUID(), randomUUID(), randomUUID()]);
  if (!determinism.ok) throw new Error(`backend determinism failed; the workspace stays on SQLite: ${determinism.errors.join("; ")}`);
  const ledger = openLedger(workspace, { readonly: true });
  let expected: ExpectedHeads;
  const rowsCopied: Record<string, number> = {};
  try {
    expected = copyAndProve(ledger.db, workspace, chainId, options);
    for (const table of POSTGRES_MIRROR_TABLES) rowsCopied[table.name] = (ledger.db.prepare(`SELECT count(*) AS n FROM ${table.name}`).get() as { n: number }).n;
  } finally {
    ledger.close();
  }

  const receipt: PostgresMigrationReceipt = {
    v: 1, kind: "postgres-session-store-migration", ts: Date.now(), chainId, rowsCopied,
    sqliteChainHead: expected.events.hash, postgresChainHead: expected.events.hash,
    determinism: { ok: determinism.ok, eventHashes: determinism.eventHashes }
  };
  // Committed. Each local write below repeats safely. Until the chain id is recorded a retry copies under a fresh id
  // (the committed rows stay behind under an id nothing names); once it is, a retry proves the committed copy and
  // finishes. ponytail: a retry after the chain id is recorded but before the re-pin, with SQLite rows written in
  // between, refuses as a merge; the window is one small file write.
  // The workspace's signed floors: verification refuses a chain later truncated below the migrated heads.
  recordSignedPostgresHead(workspace, chainId, expected.events.hash, expected.events.seq);
  recordSignedPostgresHead(workspace, chainId, expected.mirror.hash, expected.mirror.seq, "ledger-mirror");
  const receiptPath = writeSignedMigrationReceipt(workspace, "postgres-store", `migration-${receipt.ts}.json`, receipt);
  if (ensurePostgresChainId(workspace, chainId) !== chainId) throw new Error("the workspace's Postgres chain id changed during migration; run it again");
  repinSqliteToPostgres(workspace);
  return { receipt, receiptPath };
}
