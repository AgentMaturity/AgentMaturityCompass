/**
 * The Postgres mirror of the ledger side tables (P2-36): A4's `a4_*` and the action journal's `action_*` rows on a
 * workspace pinned to the Postgres session store.
 *
 * Write-through, fail closed. SQLite stays the store A4 and the journal verify and read; each of their write
 * transactions calls `write()` as its last step, inside the SQLite transaction, for the one scope it touched (an A4
 * project or an action execution). `write()` copies the scope's rows into Postgres and appends a mirror-log entry in
 * one Postgres transaction and commits it, so the SQLite transaction commits only after Postgres has. A Postgres write
 * that cannot commit throws, and the SQLite transaction rolls back: no A4 or journal transition exists that the mirror
 * lacks. A commit whose reply is lost is resolved by reading back the entry it wrote.
 *
 * Verifiable parity. Every write appends `(scope, scopeDigest)` to `amc_ledger_mirror_log`, a hash chain whose head the
 * workspace signs with the monitor key after each commit (postgresHead.ts, stream `ledger-mirror`), exactly as the
 * session chain does. Before writing, and on every check (`problems()`), the scope's Postgres rows must hash to the
 * scope's last logged digest (rows changed outside AMC), that digest must equal the SQLite rows' digest (divergence),
 * and the log must still hold the signed head (truncation or rewind). A Postgres row of a parity table that SQLite does
 * not hold, or an append-only row that differs, is divergence. The mirror never deletes and never repairs: it refuses
 * with LEDGER_MIRROR_DIVERGED and leaves the choice to an operator. A scope Postgres has never held (rows written
 * before the workspace was pinned and not migrated) is LEDGER_MIRROR_BEHIND: verification fails, reads do not, and
 * the scope's next write copies it whole.
 *
 * Liveness columns and `a4_requests` are copied but not compared (postgresLedgerSideTables.ts). The audit rows the side
 * rows name stay in the SQLite ledger, like every row a direct `Ledger` producer writes; WORM segments carry them.
 * ponytail: the Postgres round trips run while the SQLite write lock is held (a few statements per transition), and
 * each scope check reads the whole scope; add per-row digests if scopes grow to thousands of rows.
 */
import type Database from "better-sqlite3";
import { resolveSessionStoreBackend } from "../openSessionEventStore.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { GLOBAL_GENESIS } from "../sessionEventRows.js";
import { readSignedPostgresHeadForCheck, recordSignedPostgresHead, signedFloorProblems } from "./postgresHead.js";
import { LEDGER_SIDE_TABLES, type LedgerSideTable } from "./postgresLedgerSideTables.js";
import { ensurePostgresSchema } from "./postgresSchema.js";
import { ensurePostgresChainId, readPostgresChainId } from "./postgresSessionEventStore.js";
import { readPostgresUrl, SyncPgClient, type SyncPgOptions } from "./syncPgClient.js";

export interface MirrorScope {
  readonly kind: "a4" | "action";
  readonly id: string;
}

type Cell = string | number | null;
type Row = Record<string, Cell>;

export class LedgerMirrorError extends Error {
  constructor(readonly code: "LEDGER_MIRROR_UNAVAILABLE" | "LEDGER_MIRROR_DIVERGED", readonly problems: readonly string[]) {
    super(`${code}: ${problems.join("; ")}`);
    this.name = "LedgerMirrorError";
  }
}

const scopeText = (scope: MirrorScope): string => `${scope.kind}:${scope.id}`;
const tablesOf = (scope: MirrorScope): readonly LedgerSideTable[] => LEDGER_SIDE_TABLES.filter((table) => table.scope === scope.kind);
const mirrorHeadId = (chainId: string): string => `${chainId}/ledger-mirror`;

/** A row as both databases agree on it: ints as numbers (`pg` returns BIGINT as text), text as strings. */
function normalize(table: LedgerSideTable, raw: Record<string, unknown>, withLiveness: boolean): Row {
  const out: Row = {};
  for (const [column, type] of Object.entries(table.columns)) {
    if (!withLiveness && table.liveness?.includes(column)) continue;
    const value = raw[column];
    out[column] = value === null || value === undefined ? null : type === "int" ? Number(value) : String(value);
  }
  return out;
}

const keyText = (table: LedgerSideTable, row: Row): string => JSON.stringify(table.key.map((column) => row[column] ?? null));
const columnList = (table: LedgerSideTable): string => Object.keys(table.columns).join(", ");

type ScopeRows = Map<string, Map<string, Row>>; // table -> key -> row (with liveness)

function sqliteScopeRows(db: Database.Database, scope: MirrorScope): ScopeRows {
  return new Map(tablesOf(scope).map((table) => [table.name, new Map((db.prepare(`SELECT ${columnList(table)} FROM ${table.name} WHERE ${table.scopeColumn} = ?`)
    .all(scope.id) as Record<string, unknown>[]).map((raw) => { const row = normalize(table, raw, true); return [keyText(table, row), row] as const; }))]));
}

function pgScopeRows(client: SyncPgClient, chainId: string, scope: MirrorScope): ScopeRows {
  return new Map(tablesOf(scope).map((table) => [table.name, new Map(client.query(`SELECT ${columnList(table)} FROM ${table.name} WHERE chain_id = $1 AND ${table.scopeColumn} = $2`,
    [chainId, scope.id]).rows.map((raw) => { const row = normalize(table, raw, true); return [keyText(table, row), row] as const; }))]));
}

/** sha256 over the scope's parity rows (liveness columns out), key-sorted per table. */
export function scopeDigest(scope: MirrorScope, rows: ScopeRows): string {
  const tables = Object.fromEntries(tablesOf(scope).filter((table) => table.parity).map((table) => [table.name,
    [...(rows.get(table.name) ?? new Map<string, Row>()).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, row]) => normalize(table, row, false))]));
  return sha256Hex(canonicalize({ v: 1, kind: "amc.ledger-mirror-scope", scope: scopeText(scope), tables }));
}

/** Postgres parity rows SQLite does not hold, and append-only rows that differ from SQLite's. */
function divergence(scope: MirrorScope, pg: ScopeRows, sqlite: ScopeRows): string[] {
  const problems: string[] = [];
  for (const table of tablesOf(scope).filter((candidate) => candidate.parity)) {
    for (const [key, row] of pg.get(table.name) ?? []) {
      const local = sqlite.get(table.name)?.get(key);
      if (local === undefined) problems.push(`LEDGER_MIRROR_DIVERGED: Postgres holds ${table.name} ${key} that the SQLite ledger does not`);
      else if (!table.mutable && canonicalize(normalize(table, local, false)) !== canonicalize(normalize(table, row, false))) {
        problems.push(`LEDGER_MIRROR_DIVERGED: Postgres ${table.name} ${key} differs from the SQLite ledger`);
      }
    }
  }
  return problems;
}

export function mirrorEntryHash(chainId: string, seq: number, scope: string, digest: string, prev: string): string {
  return sha256Hex(canonicalize({ v: 1, kind: "amc.ledger-mirror-entry", chainId, seq, scope, scopeDigest: digest, prev }));
}

/**
 * Appends one log entry per scope inside the caller's Postgres transaction, under the mirror head's row lock, and
 * returns the new head. The head update is conditional on the head it read, as the session chain's is.
 */
export function appendMirrorEntries(client: SyncPgClient, chainId: string, entries: ReadonlyArray<{ scope: string; digest: string }>): { hash: string; seq: number } {
  const head = client.query("SELECT head_hash, head_seq FROM amc_chain_heads WHERE chain_id = $1 FOR UPDATE", [mirrorHeadId(chainId)]).rows[0];
  if (head === undefined) throw new LedgerMirrorError("LEDGER_MIRROR_UNAVAILABLE", ["the ledger mirror head row is missing"]);
  let prev = String(head.head_hash);
  let seq = Number(head.head_seq);
  const start = prev;
  for (const entry of entries) {
    seq += 1;
    const hash = mirrorEntryHash(chainId, seq, entry.scope, entry.digest, prev);
    client.query("INSERT INTO amc_ledger_mirror_log (chain_id, mirror_seq, scope, scope_digest, prev_hash, entry_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [chainId, seq, entry.scope, entry.digest, prev, hash]);
    prev = hash;
  }
  const moved = client.query("UPDATE amc_chain_heads SET head_hash = $2, head_seq = $3 WHERE chain_id = $1 AND head_hash = $4", [mirrorHeadId(chainId), prev, seq, start]);
  if (moved.rowCount !== 1) throw new LedgerMirrorError("LEDGER_MIRROR_UNAVAILABLE", ["the ledger mirror head moved during the write; nothing was committed"]);
  return { hash: prev, seq };
}

/** Creates the mirror head row (genesis) if absent. Outside any transaction; safe to repeat. */
export function ensureMirrorHead(client: SyncPgClient, chainId: string): void {
  client.query("INSERT INTO amc_chain_heads (chain_id, head_hash, head_seq) VALUES ($1, $2, 0) ON CONFLICT (chain_id) DO NOTHING", [mirrorHeadId(chainId), GLOBAL_GENESIS]);
}

/** Upserts every row of the scope that Postgres lacks or holds differently (liveness included). */
function upsertScope(client: SyncPgClient, chainId: string, scope: MirrorScope, sqlite: ScopeRows, pg: ScopeRows): void {
  for (const table of tablesOf(scope)) {
    const columns = Object.keys(table.columns);
    const updates = columns.filter((column) => !table.key.includes(column)).map((column) => `${column} = excluded.${column}`).join(", ");
    const sql = `INSERT INTO ${table.name} (chain_id, ${columns.join(", ")}) VALUES (${["$1", ...columns.map((_, index) => `$${index + 2}`)].join(", ")})
      ON CONFLICT (chain_id, ${table.key.join(", ")}) DO UPDATE SET ${updates}`;
    for (const [key, row] of sqlite.get(table.name) ?? []) {
      const held = pg.get(table.name)?.get(key);
      if (held !== undefined && canonicalize(held) === canonicalize(row)) continue;
      client.query(sql, [chainId, ...columns.map((column) => row[column] ?? null)]);
    }
  }
}

/** All scopes the SQLite ledger holds side rows for (migration copies one log entry per scope). */
export function sqliteScopes(db: Database.Database): MirrorScope[] {
  const ids = (sql: string) => (db.prepare(sql).all() as Array<{ id: string }>).map((row) => row.id);
  return [
    ...ids("SELECT project_id AS id FROM a4_projects UNION SELECT project_id FROM a4_transitions ORDER BY 1").map((id) => ({ kind: "a4" as const, id })),
    ...ids("SELECT execution_id AS id FROM action_executions UNION SELECT execution_id FROM action_transitions ORDER BY 1").map((id) => ({ kind: "action" as const, id }))
  ];
}

export const sqliteScopeDigest = (db: Database.Database, scope: MirrorScope): string => scopeDigest(scope, sqliteScopeRows(db, scope));

const asMirrorError = (error: unknown): LedgerMirrorError => error instanceof LedgerMirrorError ? error
  : new LedgerMirrorError("LEDGER_MIRROR_UNAVAILABLE", [error instanceof Error ? error.message : String(error)]);

export class LedgerMirror {
  private pg: SyncPgClient | null = null;
  private schemaReady = false;

  /** `always`: mirror whatever the pin says (migration, before it re-pins); otherwise only while the workspace is on Postgres. */
  constructor(readonly workspace: string, private readonly options: { readonly pg?: SyncPgOptions } = {}, private readonly always = true) {}

  /** Read on every call, so a store opened before `migrate --to postgres` re-pinned the workspace starts mirroring at once. */
  private active(): boolean {
    return this.always || resolveSessionStoreBackend(this.workspace) === "postgres";
  }

  private client(): SyncPgClient {
    this.pg ??= new SyncPgClient(readPostgresUrl(), this.options.pg);
    return this.pg;
  }

  /**
   * Mirrors one scope inside the caller's SQLite write transaction, after its rows are written. Throws
   * LedgerMirrorError (UNAVAILABLE or DIVERGED) and commits nothing in Postgres unless it returns.
   */
  write(db: Database.Database, scope: MirrorScope): void {
    if (!this.active()) return;
    try {
      const client = this.client();
      const chainId = ensurePostgresChainId(this.workspace);
      if (!this.schemaReady) { ensurePostgresSchema(client); this.schemaReady = true; }
      ensureMirrorHead(client, chainId);
      const signed = readSignedPostgresHeadForCheck(this.workspace, "ledger-mirror");
      const sqlite = sqliteScopeRows(db, scope);
      const digest = scopeDigest(scope, sqlite);
      let entry: { hash: string; seq: number };
      client.query("BEGIN");
      try {
        const pg = pgScopeRows(client, chainId, scope);
        const problems = [...this.logProblems(client, chainId, scope, pg, signed), ...divergence(scope, pg, sqlite)];
        if (problems.length > 0) throw new LedgerMirrorError("LEDGER_MIRROR_DIVERGED", problems);
        upsertScope(client, chainId, scope, sqlite, pg);
        if (scopeDigest(scope, pgScopeRows(client, chainId, scope)) !== digest) {
          throw new LedgerMirrorError("LEDGER_MIRROR_DIVERGED", [`LEDGER_MIRROR_DIVERGED: Postgres rows of ${scopeText(scope)} do not read back as written`]);
        }
        entry = appendMirrorEntries(client, chainId, [{ scope: scopeText(scope), digest }]);
        this.commit(client, chainId, entry);
      } catch (error) {
        try { client.query("ROLLBACK"); } catch { /* the server aborts the transaction with the connection */ }
        throw error;
      }
      recordSignedPostgresHead(this.workspace, chainId, entry.hash, entry.seq, "ledger-mirror");
    } catch (error) {
      throw asMirrorError(error);
    }
  }

  /** COMMIT; a lost reply counts as committed only if the entry it wrote is there when read back. */
  private commit(client: SyncPgClient, chainId: string, entry: { hash: string; seq: number }): void {
    try {
      client.query("COMMIT");
    } catch (error) {
      let landed = false;
      try {
        landed = client.query("SELECT 1 AS hit FROM amc_ledger_mirror_log WHERE chain_id = $1 AND mirror_seq = $2 AND entry_hash = $3",
          [chainId, entry.seq, entry.hash]).rows.length === 1;
      } catch { /* still unreachable: the outcome is unknown, so the SQLite side must not commit */ }
      if (!landed) throw error;
    }
  }

  /** The scope's Postgres rows against its last log entry, and the log against the workspace's signed head. */
  private logProblems(client: SyncPgClient, chainId: string, scope: MirrorScope, pg: ScopeRows,
    signed: ReturnType<typeof readSignedPostgresHeadForCheck>): string[] {
    const problems = signed.error === null ? [] : [`LEDGER_MIRROR_DIVERGED: ${signed.error}`];
    const head = client.query("SELECT head_seq FROM amc_chain_heads WHERE chain_id = $1", [mirrorHeadId(chainId)]).rows[0];
    const hashAt = (seq: number): string | null => {
      const row = client.query("SELECT entry_hash FROM amc_ledger_mirror_log WHERE chain_id = $1 AND mirror_seq = $2", [chainId, seq]).rows[0];
      return row === undefined ? null : String(row.entry_hash);
    };
    problems.push(...signedFloorProblems(this.workspace, "ledger-mirror", chainId, signed.head, Number(head?.head_seq ?? 0) > 0, hashAt)
      .map((problem) => `LEDGER_MIRROR_DIVERGED: ${problem}`));
    const last = client.query("SELECT scope_digest FROM amc_ledger_mirror_log WHERE chain_id = $1 AND scope = $2 ORDER BY mirror_seq DESC LIMIT 1",
      [chainId, scopeText(scope)]).rows[0];
    const logged = last === undefined ? scopeDigest(scope, new Map()) : String(last.scope_digest);
    if (scopeDigest(scope, pg) !== logged) problems.push(`LEDGER_MIRROR_DIVERGED: Postgres rows of ${scopeText(scope)} differ from the mirror log: changed outside AMC`);
    return problems;
  }

  /**
   * Parity of one scope, read in one Postgres snapshot: the checks `write()` makes, plus the SQLite rows' digest equal
   * to the last logged one. With `walk`, the whole mirror log is re-hashed and linked to its head as well. Never throws.
   */
  problems(db: Database.Database, scope: MirrorScope, options: { walk?: boolean } = {}): string[] {
    if (!this.active()) return [];
    const sqlite = sqliteScopeRows(db, scope);
    const empty = scopeDigest(scope, new Map());
    let chainId: string | null;
    try {
      chainId = readPostgresChainId(this.workspace);
    } catch (error) {
      return [`LEDGER_MIRROR_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`];
    }
    if (chainId === null) return scopeDigest(scope, sqlite) === empty ? [] : [`LEDGER_MIRROR_BEHIND: ${scopeText(scope)} is not mirrored to Postgres`];
    const signed = readSignedPostgresHeadForCheck(this.workspace, "ledger-mirror");
    const client = (() => { try { return this.client(); } catch (error) { return asMirrorError(error); } })();
    if (client instanceof LedgerMirrorError) return [...client.problems.map((problem) => `LEDGER_MIRROR_UNAVAILABLE: ${problem}`)];
    try {
      client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      try {
        const pg = pgScopeRows(client, chainId, scope);
        const problems = [...this.logProblems(client, chainId, scope, pg, signed), ...divergence(scope, pg, sqlite)];
        const last = client.query("SELECT scope_digest FROM amc_ledger_mirror_log WHERE chain_id = $1 AND scope = $2 ORDER BY mirror_seq DESC LIMIT 1",
          [chainId, scopeText(scope)]).rows[0];
        const sqliteDigest = scopeDigest(scope, sqlite);
        if (last === undefined ? sqliteDigest !== empty : String(last.scope_digest) !== sqliteDigest) {
          problems.push(last === undefined ? `LEDGER_MIRROR_BEHIND: ${scopeText(scope)} is not mirrored to Postgres`
            : `LEDGER_MIRROR_DIVERGED: the mirror log's digest of ${scopeText(scope)} differs from the SQLite ledger`);
        }
        if (options.walk) problems.push(...walkProblems(client, chainId));
        return [...new Set(problems)];
      } finally {
        try { client.query("COMMIT"); } catch { /* a read-only snapshot; nothing to keep */ }
      }
    } catch (error) {
      return asMirrorError(error).problems.map((problem) => `LEDGER_MIRROR_UNAVAILABLE: ${problem}`);
    }
  }

  close(): void {
    this.pg?.close();
    this.pg = null;
  }
}

/** The whole log: contiguous from 1, each entry hashing to itself and naming the previous, ending at the head row. */
function walkProblems(client: SyncPgClient, chainId: string): string[] {
  const rows = client.query("SELECT mirror_seq, scope, scope_digest, prev_hash, entry_hash FROM amc_ledger_mirror_log WHERE chain_id = $1 ORDER BY mirror_seq ASC", [chainId]).rows;
  const head = client.query("SELECT head_hash, head_seq FROM amc_chain_heads WHERE chain_id = $1", [mirrorHeadId(chainId)]).rows[0];
  const problems: string[] = [];
  let prev = GLOBAL_GENESIS;
  rows.forEach((row, index) => {
    const seq = Number(row.mirror_seq);
    if (seq !== index + 1 || String(row.prev_hash) !== prev) problems.push(`LEDGER_MIRROR_DIVERGED: mirror log entry ${seq} does not link to ${index}`);
    if (mirrorEntryHash(chainId, seq, String(row.scope), String(row.scope_digest), String(row.prev_hash)) !== String(row.entry_hash)) {
      problems.push(`LEDGER_MIRROR_DIVERGED: mirror log entry ${seq} does not hash to itself`);
    }
    prev = String(row.entry_hash);
  });
  if (rows.length > 0 && (head === undefined || Number(head.head_seq) !== rows.length || String(head.head_hash) !== prev)) {
    problems.push("LEDGER_MIRROR_DIVERGED: the mirror log does not end at its head row: entries were deleted or written outside AMC");
  }
  return problems;
}

/** The workspace's mirror: a no-op on each call while the workspace is not pinned to Postgres. Opens no connection until used. */
export function openLedgerMirror(workspace: string, options: { readonly pg?: SyncPgOptions } = {}): LedgerMirror {
  return new LedgerMirror(workspace, options, false);
}
