import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore, readSessionStoreMarker } from "../src/persistence/openSessionEventStore.js";
import { migrateSqliteToPostgres } from "../src/persistence/postgres/postgresMigration.js";
import { verifySignedMigrationReceipt } from "../src/ledger/signedMigrationReceipt.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { ensurePostgresChainId, PostgresSessionEventStore } from "../src/persistence/postgres/postgresSessionEventStore.js";
import { POSTGRES_MIRROR_TABLES } from "../src/persistence/postgres/postgresSchema.js";
import { POSTGRES_URL_FILE_ENV } from "../src/persistence/postgres/syncPgClient.js";
import { verifyStoredSessionEvents } from "../src/persistence/sessionStoreVerification.js";
import { embedEnvelope, SESSION_GENESIS } from "../src/session/sessionTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  compareBackendDeterminism,
  runSessionStoreConformance,
  type ConformanceBackend,
  type ConformanceWorkspace
} from "../src/persistence/conformance/sessionStoreConformance.js";

/**
 * The Postgres backend held to the shared session-store conformance suite.
 *
 * No Postgres server runs here, and `pg` is not a dependency, so the store
 * drives a `pg`-shaped fake backed by SQLite (tests/fixtures/fake-pg) through
 * the real worker-thread bridge. What this proves: the store's SQL, its
 * locking and fork guards, its fail-closed paths and its synchronous bridge.
 * What it cannot prove: behaviour against a real Postgres and a real
 * failover. That run is docs/runbooks/POSTGRES_FAILOVER.md, pending for Sid.
 */
const FAKE_PG = fileURLToPath(new URL("./fixtures/fake-pg/index.cjs", import.meta.url));
const TIMEOUT_MS = 120_000;
const priorUrlFile = process.env[POSTGRES_URL_FILE_ENV];
const scratch: string[] = [];

afterEach(() => {
  if (priorUrlFile === undefined) delete process.env[POSTGRES_URL_FILE_ENV];
  else process.env[POSTGRES_URL_FILE_ENV] = priorUrlFile;
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function pgDir(workspace: string): string {
  return join(workspace, ".test-pg");
}

function dbFile(workspace: string): string {
  return join(pgDir(workspace), "db.sqlite");
}

function writeUrl(workspace: string, query = "sslmode=verify-full"): string {
  const file = join(pgDir(workspace), "url");
  writeFileSync(file, `postgres://amc@db.example/amc?${query}&fakeSqlite=${encodeURIComponent(dbFile(workspace))}\n`, { mode: 0o600 });
  return file;
}

function makeWorkspace(): ConformanceWorkspace {
  const workspace = mkdtempSync(join(tmpdir(), "amc-pg-store-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  mkdirSync(pgDir(workspace));
  return { workspace, dispose: () => rmSync(workspace, { recursive: true, force: true }) };
}

function workspace(): string {
  const created = makeWorkspace();
  scratch.push(created.workspace);
  writeUrl(created.workspace);
  return created.workspace;
}

function openPg(ws: string, options: { readOnly?: boolean; timeoutMs?: number } = {}): PostgresSessionEventStore {
  process.env[POSTGRES_URL_FILE_ENV] = join(pgDir(ws), "url");
  return new PostgresSessionEventStore(ws, {
    readOnly: options.readOnly ?? false,
    pg: { driverModule: FAKE_PG, ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) }
  });
}

const postgresBackend: ConformanceBackend = {
  backendId: "postgres",
  createWorkspace: () => {
    const created = makeWorkspace();
    writeUrl(created.workspace);
    return created;
  },
  open: (ws) => openPg(ws),
  openReadOnly: (ws) => openPg(ws, { readOnly: true })
};

const sqliteBackend: ConformanceBackend = {
  backendId: "sqlite",
  createWorkspace: makeWorkspace,
  open: (ws) => openSessionEventStore(ws, "sqlite"),
  openReadOnly: (ws) => openSessionEventStore(ws, "sqlite", { readOnly: true })
};

/** One spine-shaped append: the envelope chains on the session's previous event. */
function append(store: PostgresSessionEventStore, sessionId: string, seq: number, prev: string, id?: string) {
  return store.appendSessionEvent({
    sessionId,
    runtime: "amc",
    eventType: seq === 0 ? "session/open" : "user/message",
    meta: embedEnvelope({ note: "pg" }, {
      v: 1, sessionId, seq, prevSessionEventHash: prev, turn: null, step: null, surface: { op: "none" }, synthetic: false
    }),
    ...(id !== undefined ? { id } : {}),
    ...(seq === 0 ? {} : { payload: `message ${seq}` })
  });
}

function startedStore(ws: string, sessionId: string): PostgresSessionEventStore {
  const store = openPg(ws);
  store.startSession({ sessionId, runtime: "amc", binaryPath: "pg-test", binarySha256: sha256Hex("pg-test") });
  return store;
}

describe("Postgres session store: shared conformance", () => {
  it("passes every conformance case", () => {
    const report = runSessionStoreConformance(postgresBackend);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
  }, TIMEOUT_MS);

  it("produces the same event hashes as SQLite for identical input", () => {
    const parity = compareBackendDeterminism([sqliteBackend, postgresBackend]);
    expect(parity.errors).toEqual([]);
    expect(parity.eventHashes.postgres).toEqual(parity.eventHashes.sqlite);
  }, TIMEOUT_MS);
});

describe("Postgres session store: one writer per chain", () => {
  it("refuses a forked row at the database (UNIQUE chain_id, prev_event_hash)", () => {
    const ws = workspace();
    const store = startedStore(ws, "s-fork");
    const first = append(store, "s-fork", 0, SESSION_GENESIS);
    append(store, "s-fork", 1, first.eventHash);
    store.close();
    const db = new Database(dbFile(ws));
    try {
      const row = db.prepare("SELECT * FROM evidence_events ORDER BY chain_seq DESC LIMIT 1").get() as Record<string, unknown>;
      // A second writer that read the same head would write a sibling of the last row.
      const sibling = { ...row, id: "forked-row", chain_seq: 99, event_hash: "f".repeat(64) };
      const columns = Object.keys(sibling);
      expect(() => db.prepare(`INSERT INTO evidence_events (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
        .run(...columns.map((c) => sibling[c as keyof typeof sibling]))).toThrow(/UNIQUE/);
    } finally {
      db.close();
    }
  }, TIMEOUT_MS);

  it("two writers on one chain interleave without forking", () => {
    const ws = workspace();
    const a = startedStore(ws, "s-a");
    const b = openPg(ws);
    b.startSession({ sessionId: "s-b", runtime: "amc", binaryPath: "pg-test", binarySha256: sha256Hex("b") });
    const a0 = append(a, "s-a", 0, SESSION_GENESIS);
    const b0 = append(b, "s-b", 0, SESSION_GENESIS);
    append(a, "s-a", 1, a0.eventHash);
    append(b, "s-b", 1, b0.eventHash);
    const rows = a.readAllEvents();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.prev_event_hash)).size).toBe(4);
    expect(verifyStoredSessionEvents(ws, rows).errors).toEqual([]);
    a.close();
    b.close();
  }, TIMEOUT_MS);

  it("keeps two workspaces' chains apart in one database", () => {
    const one = workspace();
    const two = workspace();
    // Point the second workspace at the first one's database file.
    writeFileSync(join(pgDir(two), "url"), `postgres://amc@db.example/amc?sslmode=verify-full&fakeSqlite=${encodeURIComponent(dbFile(one))}\n`, { mode: 0o600 });
    const s1 = startedStore(one, "s-1");
    append(s1, "s-1", 0, SESSION_GENESIS);
    const s2 = startedStore(two, "s-2");
    append(s2, "s-2", 0, SESSION_GENESIS);
    expect(s1.readAllEvents().map((row) => row.session_id)).toEqual(["s-1"]);
    expect(s2.readAllEvents().map((row) => row.session_id)).toEqual(["s-2"]);
    s1.close();
    s2.close();
  }, TIMEOUT_MS);
});

describe("Postgres session store: failover and retries fail closed", () => {
  it("a lost primary fails the append with a typed error, writes nothing, and appends resume after promotion", () => {
    const ws = workspace();
    const store = startedStore(ws, "s-failover");
    const first = append(store, "s-failover", 0, SESSION_GENESIS);
    writeFileSync(`${dbFile(ws)}.down`, "");
    expect(() => append(store, "s-failover", 1, first.eventHash)).toThrow(/Postgres session store unavailable/);
    try {
      append(store, "s-failover", 1, first.eventHash);
    } catch (error) {
      expect((error as { code?: string }).code).toBe("POSTGRES_UNAVAILABLE");
    }
    unlinkSync(`${dbFile(ws)}.down`);
    const resumed = append(store, "s-failover", 1, first.eventHash);
    const rows = store.readAllEvents();
    expect(rows.map((row) => row.id)).toEqual([first.id, resumed.id]);
    expect(rows[1]?.prev_event_hash).toBe(first.eventHash);
    expect(verifyStoredSessionEvents(ws, rows).errors).toEqual([]);
    store.close();
  }, TIMEOUT_MS);

  it("a retry after a lost commit reply returns the committed row instead of a duplicate", () => {
    const ws = workspace();
    const store = startedStore(ws, "s-retry");
    const first = append(store, "s-retry", 0, SESSION_GENESIS);
    writeFileSync(`${dbFile(ws)}.drop-after-commit`, "");
    expect(() => append(store, "s-retry", 1, first.eventHash, "pinned-id")).toThrow(/unavailable/);
    const retried = append(store, "s-retry", 1, first.eventHash, "pinned-id");
    const rows = store.readAllEvents();
    expect(rows.map((row) => row.id)).toEqual([first.id, "pinned-id"]);
    expect(retried.eventHash).toBe(rows[1]?.event_hash);
    // A different event under the same id is still a duplicate.
    expect(() => append(store, "s-retry", 2, retried.eventHash, "pinned-id")).toThrow(/duplicate event id/);
    store.close();
  }, TIMEOUT_MS);

  it("a hung server times out, and the store reconnects on the next call", () => {
    const ws = workspace();
    const store = openPg(ws, { timeoutMs: 400 });
    store.startSession({ sessionId: "s-hang", runtime: "amc", binaryPath: "pg-test", binarySha256: sha256Hex("hang") });
    writeFileSync(`${dbFile(ws)}.hang`, "");
    expect(() => append(store, "s-hang", 0, SESSION_GENESIS)).toThrow(/no reply within 400 ms/);
    unlinkSync(`${dbFile(ws)}.hang`);
    append(store, "s-hang", 0, SESSION_GENESIS);
    expect(store.readAllEvents()).toHaveLength(1);
    store.close();
  }, TIMEOUT_MS);

  it("a read-only open takes no lock and creates nothing", () => {
    const ws = workspace();
    const reader = openPg(ws, { readOnly: true });
    expect(reader.readAllEvents()).toEqual([]);
    reader.close();
    const writer = startedStore(ws, "s-ro");
    append(writer, "s-ro", 0, SESSION_GENESIS);
    const live = openPg(ws, { readOnly: true });
    expect(live.readAllEvents()).toHaveLength(1);
    live.close();
    writer.close();
  }, TIMEOUT_MS);

  it("refuses a writer whose stored history was edited", () => {
    const ws = workspace();
    const store = startedStore(ws, "s-tamper");
    append(store, "s-tamper", 0, SESSION_GENESIS);
    store.close();
    const db = new Database(dbFile(ws));
    db.prepare("UPDATE evidence_events SET meta_json = replace(meta_json, 'pg', 'PG')").run();
    db.close();
    expect(() => openPg(ws)).toThrow(/existing history failed authentication/);
  }, TIMEOUT_MS);
});

describe("Postgres session store: connection policy", () => {
  it("refuses a connection string without sslmode=verify-full before connecting", () => {
    const ws = workspace();
    writeUrl(ws, "sslmode=require");
    expect(() => openPg(ws)).toThrow(/sslmode=verify-full/);
  });

  it("refuses a connection string file readable by others", () => {
    if (process.platform === "win32") return;
    const ws = workspace();
    chmodSync(writeUrl(ws), 0o644);
    expect(() => openPg(ws)).toThrow(/chmod 600/);
  });

  it("refuses when no connection string file is named", () => {
    const ws = workspace();
    delete process.env[POSTGRES_URL_FILE_ENV];
    expect(() => new PostgresSessionEventStore(ws, { pg: { driverModule: FAKE_PG } })).toThrow(/AMC_POSTGRES_URL_FILE/);
  });

  it.each(["md5", "cleartext", "trust"])("refuses a server that authenticates with %s instead of SCRAM", (auth) => {
    const ws = workspace();
    writeUrl(ws, `sslmode=verify-full&fakeAuth=${auth}`);
    expect(() => openPg(ws)).toThrow(/SCRAM/);
  }, TIMEOUT_MS);

  it("refuses a connection that is not TLS", () => {
    const ws = workspace();
    writeUrl(ws, "sslmode=verify-full&fakeTls=off");
    expect(() => openPg(ws)).toThrow(/SCRAM over TLS/);
  }, TIMEOUT_MS);

  it("refuses clearly when the pg driver is not installed", () => {
    const ws = workspace();
    process.env[POSTGRES_URL_FILE_ENV] = join(pgDir(ws), "url");
    expect(() => new PostgresSessionEventStore(ws, { pg: { driverModule: "amc-no-such-pg-driver" } }))
      .toThrow(/optional "amc-no-such-pg-driver" driver, which is not installed/);
  });
});

describe("Postgres mirror table declarations", () => {
  it("declares the ledger tables the spec names, each with columns and a SQLite reader", () => {
    expect(POSTGRES_MIRROR_TABLES.map((table) => table.name)).toEqual(["evidence_events", "sessions", "runs"]);
    for (const table of POSTGRES_MIRROR_TABLES) {
      expect(table.ddl.length).toBeGreaterThan(0);
      expect(table.columns.length).toBeGreaterThan(0);
      expect(table.sqliteSelect).toMatch(new RegExp(`FROM ${table.name}\\b`));
    }
  });
});

describe("amc evidence-stores migrate --to postgres", () => {
  /** A SQLite workspace with one sealed session written through the store, as the spine writes it. */
  function sqliteWorkspace(): string {
    const ws = workspace();
    const sqlite = openSessionEventStore(ws, "sqlite");
    sqlite.startSession({ sessionId: "s-old", runtime: "amc", binaryPath: "pg-test", binarySha256: sha256Hex("old") });
    let prev = SESSION_GENESIS;
    for (const seq of [0, 1]) {
      prev = sqlite.appendSessionEvent({
        sessionId: "s-old", runtime: "amc", eventType: seq === 0 ? "session/open" : "session/close",
        meta: embedEnvelope({}, { v: 1, sessionId: "s-old", seq, prevSessionEventHash: prev, turn: null, step: null, surface: { op: "none" }, synthetic: false })
      }).eventHash;
    }
    sqlite.sealSession("s-old");
    sqlite.close();
    process.env[POSTGRES_URL_FILE_ENV] = join(pgDir(ws), "url");
    return ws;
  }

  it("copies the history, proves parity, signs a receipt, pins postgres, and the chain continues from the SQLite head", () => {
    const ws = sqliteWorkspace();
    const result = migrateSqliteToPostgres(ws, { pg: { driverModule: FAKE_PG } });
    expect(result.receipt.postgresChainHead).toBe(result.receipt.sqliteChainHead);
    expect(result.receipt.rowsCopied).toMatchObject({ evidence_events: expect.any(Number), sessions: 1, runs: 0 });
    expect(result.receipt.determinism.ok).toBe(true);
    expect(verifySignedMigrationReceipt(ws, result.receiptPath)).toBe(true);
    expect(readSessionStoreMarker(ws)).toBe("postgres");

    const store = startedStore(ws, "s-new");
    const next = append(store, "s-new", 0, SESSION_GENESIS);
    const rows = store.readAllEvents();
    expect(rows.find((row) => row.id === next.id)?.prev_event_hash).toBe(result.receipt.sqliteChainHead);
    expect(verifyStoredSessionEvents(ws, rows).errors).toEqual([]);
    store.close();

    expect(() => migrateSqliteToPostgres(ws, { pg: { driverModule: FAKE_PG } })).toThrow(/only a SQLite workspace can migrate/);
  }, TIMEOUT_MS);

  it("refuses to merge into a Postgres chain that already holds rows, and leaves the workspace on SQLite", () => {
    const ws = sqliteWorkspace();
    ensurePostgresChainId(ws);
    const store = openPg(ws);
    store.startSession({ sessionId: "s-pg", runtime: "amc", binaryPath: "pg-test", binarySha256: sha256Hex("pg") });
    append(store, "s-pg", 0, SESSION_GENESIS);
    store.close();
    expect(() => migrateSqliteToPostgres(ws, { pg: { driverModule: FAKE_PG } })).toThrow(/never merges chains/);
    expect(readSessionStoreMarker(ws)).toBe("sqlite");
  }, TIMEOUT_MS);

  it("refuses to copy a SQLite history that fails authentication", () => {
    const ws = sqliteWorkspace();
    const db = new Database(join(ws, ".amc", "evidence.sqlite"));
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'evidence_events'").all() as { name: string }[]) {
      db.exec(`DROP TRIGGER ${name}`);
    }
    db.prepare("UPDATE evidence_events SET ts = ts + 1 WHERE event_type = 'session/open'").run();
    db.close();
    expect(() => migrateSqliteToPostgres(ws, { pg: { driverModule: FAKE_PG } })).toThrow(/SQLite history failed authentication; nothing was copied/);
    expect(readSessionStoreMarker(ws)).toBe("sqlite");
  }, TIMEOUT_MS);

  it("verify reports a Postgres store it cannot read as an error, never as a pass", () => {
    const ws = sqliteWorkspace();
    migrateSqliteToPostgres(ws, { pg: { driverModule: FAKE_PG } });
    // verify opens the store with the default driver (pg), which is not installed here.
    expect(verifyLedgerIntegrity(ws).errors).toContain("postgres session store could not be read: unreachable, misconfigured or unauthenticated evidence");
  }, TIMEOUT_MS);
});
