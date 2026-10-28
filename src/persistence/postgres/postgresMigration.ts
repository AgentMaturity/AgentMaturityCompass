/**
 * `amc evidence-stores migrate --to postgres` (P2-09d, named freeze exception).
 *
 * Copies a SQLite workspace's mirrored tables (POSTGRES_MIRROR_TABLES) into the
 * workspace's chain in Postgres in one transaction, then proves the copy before
 * anything switches:
 *  1. the SQLite session history authenticates before it is copied;
 *  2. every copied event matches its SQLite row column for column, and the
 *     Postgres chain head equals the SQLite chain head;
 *  3. `compareBackendDeterminism` writes the same pinned input through both
 *     backends (into scratch workspaces, so a scratch chain lands in Postgres)
 *     and requires identical event hashes.
 * Only then is a signed parity receipt written and the workspace re-pinned to
 * Postgres. A Postgres chain that already holds rows is refused, never merged.
 *
 * The ledger side tables (A4's `a4_*`, the journal's `action_*`; P2-36) are
 * copied in the same transaction with one mirror-log entry per A4 project and
 * action execution, then read back and compared with SQLite row by row, column
 * by column, and every scope's digest with its logged one. The mirror log's
 * head is signed beside the session chain's.
 *
 * After the switch the session spine writes to Postgres; producers that write
 * through the SQLite `Ledger` directly keep writing evidence.sqlite, as they do
 * on a JSONL workspace. The receipt records the head both chains share.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLedger } from "../../ledger/ledger.js";
import { writeSignedMigrationReceipt } from "../../ledger/signedMigrationReceipt.js";
import { workspaceSelfTrust } from "../../trust/trustContext.js";
import type { EvidenceEvent, SessionRecord } from "../../types.js";
import { initWorkspace } from "../../workspace.js";
import { compareBackendDeterminism, type ConformanceBackend } from "../conformance/sessionStoreConformance.js";
import { openSessionEventStore, readSessionStoreMarker, repinSqliteToPostgres } from "../openSessionEventStore.js";
import { GLOBAL_GENESIS } from "../sessionEventRows.js";
import { verifyStoredSessionEventMetadata } from "../sessionStoreVerification.js";
import { recordSignedPostgresHead } from "./postgresHead.js";
import { appendMirrorEntries, ensureMirrorHead, LedgerMirror, sqliteScopeDigest, sqliteScopes } from "./postgresLedgerMirror.js";
import { LEDGER_SIDE_TABLES } from "./postgresLedgerSideTables.js";
import { ensurePostgresSchema, EVENT_READ_COLUMNS, POSTGRES_MIRROR_TABLES } from "./postgresSchema.js";
import { ensurePostgresChainId, PostgresSessionEventStore } from "./postgresSessionEventStore.js";
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

function sameEvent(a: EvidenceEvent, b: EvidenceEvent): boolean {
  return EVENT_READ_COLUMNS.every((column) => {
    const left = a[column as keyof EvidenceEvent] ?? null;
    const right = b[column as keyof EvidenceEvent] ?? null;
    return left === right || (typeof left === "number" || typeof right === "number" ? Number(left) === Number(right) : false);
  });
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

function copyTables(client: SyncPgClient, workspace: string, chainId: string): {
  rowsCopied: Record<string, number>; head: EvidenceEvent | undefined; events: EvidenceEvent[]; mirrorHead: { hash: string; seq: number };
} {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const rowsCopied: Record<string, number> = {};
    let events: EvidenceEvent[] = [];
    client.query("BEGIN");
    try {
      for (const table of POSTGRES_MIRROR_TABLES) {
        const rows = ledger.db.prepare(table.sqliteSelect).all() as Record<string, unknown>[];
        const placeholders = ["$1", ...table.columns.map((_, i) => `$${i + 2}`)].join(", ");
        const insert = `INSERT INTO ${table.name} (chain_id, ${table.columns.join(", ")}) VALUES (${placeholders})`;
        for (const row of rows) client.query(insert, [chainId, ...table.columns.map((column) => row[column] ?? null)]);
        rowsCopied[table.name] = rows.length;
        if (table.name === "evidence_events") events = rows as unknown as EvidenceEvent[];
      }
      const head = events.at(-1) as (EvidenceEvent & { chain_seq?: number }) | undefined;
      client.query(
        "INSERT INTO amc_chain_heads (chain_id, head_hash, head_seq) VALUES ($1, $2, $3) ON CONFLICT (chain_id) DO UPDATE SET head_hash = $2, head_seq = $3",
        [chainId, head?.event_hash ?? GLOBAL_GENESIS, head?.chain_seq ?? 0]
      );
      const mirrorHead = appendMirrorEntries(client, chainId, sqliteScopes(ledger.db)
        .map((scope) => ({ scope: `${scope.kind}:${scope.id}`, digest: sqliteScopeDigest(ledger.db, scope) })));
      client.query("COMMIT");
      return { rowsCopied, head, events, mirrorHead };
    } catch (error) {
      try { client.query("ROLLBACK"); } catch { /* the server aborts with the connection */ }
      throw error;
    }
  } finally {
    ledger.close();
  }
}

/** Every copied side row read back and compared with its SQLite row, column by column, keyed by its SQLite key. */
function compareSideTables(client: SyncPgClient, workspace: string, chainId: string): void {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    for (const table of LEDGER_SIDE_TABLES) {
      const columns = Object.keys(table.columns);
      const key = (row: Record<string, unknown>) => JSON.stringify(table.key.map((column) => String(row[column] ?? null)));
      const local = ledger.db.prepare(`SELECT ${columns.join(", ")} FROM ${table.name}`).all() as Record<string, unknown>[];
      const copied = new Map(client.query(`SELECT ${columns.join(", ")} FROM ${table.name} WHERE chain_id = $1`, [chainId]).rows.map((row) => [key(row), row]));
      const same = (a: unknown, b: unknown, type: string) => (a ?? null) === null || (b ?? null) === null ? (a ?? null) === (b ?? null)
        : type === "int" ? Number(a) === Number(b) : String(a) === String(b);
      const differs = local.length !== copied.size || local.some((row) => {
        const held = copied.get(key(row));
        return held === undefined || columns.some((column) => !same(row[column], held[column], table.columns[column]!));
      });
      if (differs) throw new Error(`Postgres ${table.name} rows differ from the SQLite rows they were copied from; the workspace stays on SQLite`);
    }
  } finally {
    ledger.close();
  }
}

/** The copy as a writer will see it: every scope in parity with its logged digest, the log whole under the signed head. */
function assertMirrorParity(workspace: string, options: PostgresMigrationOptions): void {
  const ledger = openLedger(workspace, { readonly: true });
  const mirror = new LedgerMirror(workspace, { pg: options.pg });
  try {
    const scopes = sqliteScopes(ledger.db);
    const problems = scopes.flatMap((scope, index) => mirror.problems(ledger.db, scope, { walk: index === 0 }));
    if (problems.length > 0) throw new Error(`the ledger side-table mirror does not verify; the workspace stays on SQLite: ${problems.slice(0, 3).join("; ")}`);
  } finally {
    mirror.close();
    ledger.close();
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

  const chainId = ensurePostgresChainId(workspace);
  const client = new SyncPgClient(readPostgresUrl(), options.pg);
  let copied: ReturnType<typeof copyTables>;
  try {
    ensurePostgresSchema(client);
    const existing = client.query("SELECT head_seq FROM amc_chain_heads WHERE chain_id = $1", [chainId]).rows[0];
    const held = client.query("SELECT count(*) AS n FROM evidence_events WHERE chain_id = $1", [chainId]).rows[0];
    const logged = client.query("SELECT count(*) AS n FROM amc_ledger_mirror_log WHERE chain_id = $1", [chainId]).rows[0];
    const sideHeld = LEDGER_SIDE_TABLES.some((table) => client.query(`SELECT 1 AS hit FROM ${table.name} WHERE chain_id = $1 LIMIT 1`, [chainId]).rows.length > 0);
    if ((existing !== undefined && Number(existing.head_seq) !== 0) || Number(held?.n ?? 0) !== 0 || Number(logged?.n ?? 0) !== 0 || sideHeld) {
      throw new Error("the Postgres chain for this workspace already holds rows; migration never merges chains");
    }
    ensureMirrorHead(client, chainId);
    copied = copyTables(client, workspace, chainId);
    compareSideTables(client, workspace, chainId);
  } finally {
    client.close();
  }

  const reader = new PostgresSessionEventStore(workspace, { readOnly: true, pg: options.pg });
  let postgresHead: string;
  try {
    const mirrored = reader.readAllEvents();
    if (mirrored.length !== copied.events.length || mirrored.some((row, i) => !sameEvent(row, copied.events[i]!))) {
      throw new Error("Postgres rows differ from the SQLite rows they were copied from; the workspace stays on SQLite");
    }
    postgresHead = mirrored.at(-1)?.event_hash ?? GLOBAL_GENESIS;
  } finally {
    reader.close();
  }
  const sqliteHead = copied.head?.event_hash ?? GLOBAL_GENESIS;
  if (postgresHead !== sqliteHead) throw new Error("Postgres chain head differs from the SQLite chain head; the workspace stays on SQLite");

  const determinism = compareBackendDeterminism([scratchBackend("sqlite", options), scratchBackend("postgres", options)]);
  if (!determinism.ok) throw new Error(`backend determinism failed; the workspace stays on SQLite: ${determinism.errors.join("; ")}`);

  const receipt: PostgresMigrationReceipt = {
    v: 1, kind: "postgres-session-store-migration", ts: Date.now(), chainId, rowsCopied: copied.rowsCopied,
    sqliteChainHead: sqliteHead, postgresChainHead: postgresHead,
    determinism: { ok: determinism.ok, eventHashes: determinism.eventHashes }
  };
  // The workspace's signed floor: verification refuses a chain later truncated below the migrated head.
  recordSignedPostgresHead(workspace, chainId, postgresHead, (copied.head as { chain_seq?: number } | undefined)?.chain_seq ?? 0);
  recordSignedPostgresHead(workspace, chainId, copied.mirrorHead.hash, copied.mirrorHead.seq, "ledger-mirror");
  assertMirrorParity(workspace, options);
  const receiptPath = writeSignedMigrationReceipt(workspace, "postgres-store", `migration-${receipt.ts}.json`, receipt);
  repinSqliteToPostgres(workspace);
  return { receipt, receiptPath };
}
