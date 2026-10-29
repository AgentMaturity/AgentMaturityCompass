/**
 * P2-36: A4's `a4_*` and the action journal's `action_*` rows written through to Postgres. No Postgres server runs: the
 * mirror drives the SQLite-backed `pg` fake (tests/fixtures/fake-pg) through the real worker bridge, as the P2-09d
 * contract tests do. Real-Postgres behaviour is the drill in docs/runbooks/POSTGRES_FAILOVER.md.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("../src/a4/a4Identity.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/a4/a4Identity.js")>()),
  liveRolesFor: () => ["OWNER"]
}));

import { openA4Store, type A4Store } from "../src/a4/a4Store.js";
import { verifyA4Chain } from "../src/a4/a4Verify.js";
import { openActionJournal } from "../src/actions/actionJournal.js";
import type { A4Principal } from "../src/contracts/v1/a4Project.js";
import { openLedger } from "../src/ledger/ledger.js";
import { mirrorEntryHash, scopeDigest } from "../src/persistence/postgres/postgresLedgerMirror.js";
import { LEDGER_SIDE_TABLES } from "../src/persistence/postgres/postgresLedgerSideTables.js";
import { migrateSqliteToPostgres } from "../src/persistence/postgres/postgresMigration.js";
import { ensurePostgresSchema } from "../src/persistence/postgres/postgresSchema.js";
import { POSTGRES_URL_FILE_ENV, readPostgresUrl, setDefaultPostgresDriver, SyncPgClient } from "../src/persistence/postgres/syncPgClient.js";
import { sha256Hex } from "../src/utils/hash.js";
import { AGENT, cleanupGovernanceFixtures, governanceFixture } from "./governor/governanceFixture.js";

vi.setConfig({ testTimeout: 120_000 });
const FAKE_PG = fileURLToPath(new URL("./fixtures/fake-pg/index.cjs", import.meta.url));
beforeAll(() => setDefaultPostgresDriver(FAKE_PG));
afterAll(() => setDefaultPostgresDriver("pg"));
const stores: A4Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  vi.unstubAllEnvs();
  cleanupGovernanceFixtures();
});

const owner = {
  key: "LOCAL_USER:owner", authSource: "LOCAL_USER", userId: "owner", username: "owner", roles: ["OWNER"], admission: "native_login_token",
  identityCheck: "users_yaml", provenance: { usersYamlSignerFingerprint: null, createdTs: null, createdBy: null }
} as unknown as A4Principal;
const nulls = (...slots: string[]) => Object.fromEntries(slots.map((slot) => [slot, null]));
const DIGESTS = {
  schema: "amc.a4-resource-digests/v1", brief: nulls("contextGraphSha256", "agentConfigSha256"),
  enforce: nulls("manifestId", "resourcesSha256", "snapshotBundleSha256"), composition: nulls("compositionDigest", "policyDigest", "presetSha256"),
  graph: nulls("typedGraphDigest"), signedConfigs: nulls("tools", "approvalPolicy", "budgets", "firewall", "actionPolicy", "opsPolicy"),
  plan: nulls("planDigest", "lockDigest", "journalEntrySha256"), operatingProfile: nulls("sha256", "activationSha256"),
  context: nulls("contextPluginSha256", "promptPackSha256", "memoryPolicySha256"),
  release: nulls("packageDigest", "imageDigest", "chartOrComposeDigest", "valuesDigest"), gatePolicyDigest: null
} as never;

const pgFile = (workspace: string) => join(workspace, ".test-pg", "db.sqlite");

/** Points the workspace at the fake server; `pin` selects the Postgres backend for this process. */
function usePostgres(workspace: string, pin = true): void {
  mkdirSync(join(workspace, ".test-pg"), { recursive: true });
  const url = join(workspace, ".test-pg", "url");
  writeFileSync(url, `postgres://amc@db.example/amc?sslmode=verify-full&fakeSqlite=${encodeURIComponent(pgFile(workspace))}\n`, { mode: 0o600 });
  vi.stubEnv(POSTGRES_URL_FILE_ENV, url);
  if (pin) vi.stubEnv("AMC_SESSION_STORE", "postgres");
}

function pgSql<T>(workspace: string, run: (db: Database.Database) => T): T {
  const db = new Database(pgFile(workspace));
  try { return run(db); } finally { db.close(); }
}

function project(workspace: string): { store: A4Store; projectId: string } {
  const store = openA4Store(workspace);
  stores.push(store);
  const created = store.createProject({ actor: owner, agentId: AGENT, name: "P2-36 mirror", hostedRouter: false });
  if (created.replay) throw new Error("unexpected replay");
  store.appendRevision(created.projectId, { actor: owner, stage: "aspire", spec: { brief: "mirror me" }, resourceDigests: DIGESTS,
    expectedHeadSeq: store.readHead(created.projectId)!.head_seq });
  store.addComment(created.projectId, { actor: owner, body: "first", cardId: "brief" });
  return { store, projectId: created.projectId };
}

const comment = (store: A4Store, projectId: string, body = "next") => store.addComment(projectId, { actor: owner, body, cardId: "brief" });

/** Rows of every parity side table in SQLite and in Postgres, liveness columns out, ints as numbers. */
function bothSides(workspace: string, store: A4Store, projectId: string): { sqlite: unknown; pg: unknown } {
  const read = (db: Database.Database, chain: boolean) => Object.fromEntries(LEDGER_SIDE_TABLES.filter((table) => table.scope === "a4" && table.parity).map((table) => {
    const columns = Object.keys(table.columns).filter((column) => !table.liveness?.includes(column));
    const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${table.name} WHERE project_id = ?${chain ? " AND chain_id IS NOT NULL" : ""} ORDER BY ${table.key.join(", ")}`)
      .all(projectId) as Record<string, unknown>[];
    return [table.name, rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] === null ? null
      : table.columns[column] === "int" ? Number(row[column]) : String(row[column])])))];
  }));
  return { sqlite: read(store.ledger.db, false), pg: pgSql(workspace, (db) => read(db, true)) };
}

function verified(workspace: string, projectId: string): string[] {
  const ledger = openLedger(workspace, { readonly: true });
  try {
    return verifyA4Chain(ledger, projectId, undefined, undefined, { mirror: true }).integrity.errors;
  } finally {
    ledger.close();
  }
}

describe("A4 on the Postgres ledger backend (P2-36)", () => {
  test("every side table spec names exactly the ledger's columns and key", () => {
    const { workspace } = governanceFixture();
    const ledger = openLedger(workspace, { readonly: true });
    try {
      const local = (ledger.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name GLOB 'a4_*' OR name GLOB 'action_*')").all() as Array<{ name: string }>)
        .map((row) => row.name).sort();
      expect(LEDGER_SIDE_TABLES.map((table) => table.name).sort()).toEqual(local);
      for (const table of LEDGER_SIDE_TABLES) {
        const info = ledger.db.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string; type: string; pk: number }>;
        expect(Object.keys(table.columns), table.name).toEqual(info.map((column) => column.name));
        expect(Object.values(table.columns), table.name).toEqual(info.map((column) => (column.type === "INTEGER" ? "int" : "text")));
        expect([...table.key], table.name).toEqual(info.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name));
      }
    } finally {
      ledger.close();
    }
  });

  test("each commit writes its project's rows through to Postgres, logged under a signed head, and verifies", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    const sides = bothSides(workspace, store, projectId);
    expect((sides.pg as Record<string, unknown[]>).a4_transitions).toHaveLength(3);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(pgSql(workspace, (db) => (db.prepare("SELECT count(*) AS n FROM amc_ledger_mirror_log").get() as { n: number }).n)).toBe(3);
    expect(existsSync(join(workspace, ".amc", "postgres-ledger-mirror-head.json"))).toBe(true);
    expect(verified(workspace, projectId)).toEqual([]);
    expect(store.snapshot(projectId).rows.a4_comments).toHaveLength(1);
  });

  test("a Postgres write that cannot commit rolls the A4 transition back; the next write commits both", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    const head = store.readHead(projectId)!.head_seq;
    writeFileSync(`${pgFile(workspace)}.down`, "");
    expect(() => comment(store, projectId)).toThrow(/LEDGER_MIRROR_UNAVAILABLE/);
    expect(store.readHead(projectId)!.head_seq).toBe(head);
    expect(store.ledger.db.prepare("SELECT count(*) AS n FROM a4_transitions WHERE project_id = ?").get(projectId)).toEqual({ n: head + 1 });
    // A read is not refused for an unreachable mirror: the SQLite chain verified on its own. Verification is.
    expect(store.snapshot(projectId).head.head_seq).toBe(head);
    expect(verified(workspace, projectId).some((error) => error.startsWith("LEDGER_MIRROR_UNAVAILABLE"))).toBe(true);
    unlinkSync(`${pgFile(workspace)}.down`);
    comment(store, projectId);
    const sides = bothSides(workspace, store, projectId);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
  });

  test("a commit whose reply is lost is read back and counts as committed", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    writeFileSync(`${pgFile(workspace)}.drop-after-commit`, "");
    comment(store, projectId);
    expect(existsSync(`${pgFile(workspace)}.drop-after-commit`)).toBe(false);
    const sides = bothSides(workspace, store, projectId);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
  });

  test("a Postgres row changed outside AMC refuses the next write and the read, and fails verification", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    pgSql(workspace, (db) => db.prepare("UPDATE a4_transitions SET actor_username = 'mallory' WHERE project_id = ? AND seq = 1").run(projectId));
    expect(() => comment(store, projectId)).toThrow(/LEDGER_MIRROR_DIVERGED/);
    expect(() => store.snapshot(projectId)).toThrow(/A4_INTEGRITY_FAILED/);
    expect(verified(workspace, projectId).join("\n")).toMatch(/differ from the mirror log: changed outside AMC/);
  });

  test("a row Postgres holds that the SQLite ledger does not is divergence, even when the log is rewritten to match", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    // A database writer plants a comment, then appends a log entry over the planted rows past the signed head (allowed: another writer may have appended).
    pgSql(workspace, (db) => {
      db.prepare(`INSERT INTO a4_comments (chain_id, comment_id, project_id, revision_no, stage, card_id, author_key, body_sha256, blob_ref,
        in_reply_to, evidence_event_id, ts) SELECT chain_id, 'a4c_planted', project_id, revision_no, stage, card_id, author_key, body_sha256, blob_ref, in_reply_to,
        evidence_event_id, ts FROM a4_comments WHERE project_id = ?`).run(projectId);
      const rows = new Map(LEDGER_SIDE_TABLES.filter((table) => table.scope === "a4").map((table) => [table.name,
        new Map((db.prepare(`SELECT * FROM ${table.name} WHERE project_id = ?`).all(projectId) as Record<string, string | number | null>[]).map((row, index) => [String(index), row]))]));
      const head = db.prepare("SELECT chain_id, head_hash, head_seq FROM amc_chain_heads WHERE chain_id LIKE '%/ledger-mirror'").get() as { chain_id: string; head_hash: string; head_seq: number };
      const chainId = head.chain_id.replace(/\/ledger-mirror$/, "");
      const digest = scopeDigest({ kind: "a4", id: projectId }, rows);
      const hash = mirrorEntryHash(chainId, head.head_seq + 1, `a4:${projectId}`, digest, head.head_hash);
      db.prepare("INSERT INTO amc_ledger_mirror_log VALUES (?, ?, ?, ?, ?, ?)").run(chainId, head.head_seq + 1, `a4:${projectId}`, digest, head.head_hash, hash);
      db.prepare("UPDATE amc_chain_heads SET head_hash = ?, head_seq = ? WHERE chain_id = ?").run(hash, head.head_seq + 1, head.chain_id);
    });
    const refused = (() => { try { comment(store, projectId); return null; } catch (error) { return error as { code?: string; detail?: string[] }; } })();
    expect(refused?.code).toBe("LEDGER_MIRROR_DIVERGED");
    expect(refused?.detail).toEqual([`LEDGER_MIRROR_DIVERGED: Postgres holds a4_comments ["a4c_planted"] that the SQLite ledger does not`]);
    expect(verified(workspace, projectId)).toEqual(expect.arrayContaining([`LEDGER_MIRROR_DIVERGED: the mirror log's digest of a4:${projectId} differs from the SQLite ledger`]));
  });

  test("a mirror log cut back below the workspace's signed head fails verification", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const { store, projectId } = project(workspace);
    pgSql(workspace, (db) => {
      const last = db.prepare("SELECT mirror_seq, prev_hash FROM amc_ledger_mirror_log ORDER BY mirror_seq DESC LIMIT 1").get() as { mirror_seq: number; prev_hash: string };
      db.prepare("DELETE FROM amc_ledger_mirror_log WHERE mirror_seq = ?").run(last.mirror_seq);
      db.prepare("UPDATE amc_chain_heads SET head_hash = ?, head_seq = ? WHERE chain_id LIKE '%/ledger-mirror'").run(last.prev_hash, last.mirror_seq - 1);
    });
    expect(verified(workspace, projectId).join("\n")).toMatch(/does not contain the workspace's signed head .*truncated or rewritten/);
    expect(() => comment(store, projectId)).toThrow(/LEDGER_MIRROR_DIVERGED/);
  });

  test("a store opened before the workspace was pinned mirrors from its next write; until then the project reads but verifies BEHIND", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    usePostgres(workspace);
    expect(verified(workspace, projectId)).toEqual([`LEDGER_MIRROR_BEHIND: a4:${projectId} is not mirrored to Postgres`]);
    expect(store.snapshot(projectId).head.head_seq).toBe(2);
    comment(store, projectId);
    const sides = bothSides(workspace, store, projectId);
    expect((sides.pg as Record<string, unknown[]>).a4_transitions).toHaveLength(4);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
  });

  test("the action journal's rows are written through too", () => {
    const { workspace } = governanceFixture();
    usePostgres(workspace);
    const journal = openActionJournal(workspace);
    const executionId = randomUUID();
    try {
      journal.request({ executionId, agentId: AGENT, toolName: "fixture.read", actionClass: "READ_ONLY", sessionId: null, callId: "c1",
        parentExecutionId: null, idempotencyKey: null });
      journal.deny(executionId, "fixture");
    } finally {
      journal.close();
    }
    const pg = pgSql(workspace, (db) => db.prepare("SELECT seq, receipt_digest FROM action_transitions WHERE execution_id = ? ORDER BY seq").all(executionId));
    const ledger = openLedger(workspace, { readonly: true });
    try {
      expect(pg).toEqual(ledger.db.prepare("SELECT seq, receipt_digest FROM action_transitions WHERE execution_id = ? ORDER BY seq").all(executionId));
      expect(pg).toHaveLength(2);
    } finally {
      ledger.close();
    }
    writeFileSync(`${pgFile(workspace)}.down`, "");
    const refused = openActionJournal(workspace);
    try {
      expect(() => refused.request({ executionId: randomUUID(), agentId: AGENT, toolName: "fixture.read", actionClass: "READ_ONLY", sessionId: null,
        callId: "c2", parentExecutionId: null, idempotencyKey: null })).toThrow(/Postgres|unavailable/i);
    } finally {
      refused.close();
    }
  });

  test("migrate --to postgres refuses a mirror log that does not verify inside the copy's transaction: nothing written, and the run after the fix succeeds", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    usePostgres(workspace, false);
    const client = new SyncPgClient(readPostgresUrl(), { driverModule: FAKE_PG });
    try { ensurePostgresSchema(client); } finally { client.close(); }
    pgSql(workspace, (db) => db.exec(`CREATE TRIGGER skew AFTER INSERT ON amc_ledger_mirror_log
      BEGIN UPDATE amc_ledger_mirror_log SET scope_digest = 'skewed' WHERE chain_id = NEW.chain_id AND mirror_seq = NEW.mirror_seq; END`));
    const amc = join(workspace, ".amc");
    // Every file but SQLite's shared-memory index, which any reader rewrites while the A4 store holds the ledger open.
    const bytes = () => Object.fromEntries((readdirSync(amc, { recursive: true }) as string[]).sort()
      .filter((path) => statSync(join(amc, path)).isFile() && !path.endsWith("-shm")).map((path) => [path, sha256Hex(readFileSync(join(amc, path)))]));
    const before = bytes();
    expect(() => migrateSqliteToPostgres(workspace, { pg: { driverModule: FAKE_PG } })).toThrow(/LEDGER_MIRROR_DIVERGED/);
    expect(bytes()).toEqual(before);
    expect(pgSql(workspace, (db) => ["a4_projects", "a4_transitions", "amc_ledger_mirror_log"]
      .map((table) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n))).toEqual([0, 0, 0]);

    pgSql(workspace, (db) => db.exec("DROP TRIGGER skew"));
    migrateSqliteToPostgres(workspace, { pg: { driverModule: FAKE_PG } });
    const sides = bothSides(workspace, store, projectId);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
  });

  test("migrate --to postgres carries existing A4 rows, compared row by row, and A4 keeps writing after the switch", () => {
    const { workspace } = governanceFixture();
    const { store, projectId } = project(workspace);
    usePostgres(workspace, false);
    const { receipt } = migrateSqliteToPostgres(workspace, { pg: { driverModule: FAKE_PG } });
    expect(receipt.rowsCopied).toMatchObject({ a4_projects: 1, a4_transitions: 3, a4_comments: 1 });
    const sides = bothSides(workspace, store, projectId);
    expect(sides.pg).toEqual(sides.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
    store.close();
    stores.splice(0);
    const after = openA4Store(workspace);
    stores.push(after);
    comment(after, projectId, "after the switch");
    const later = bothSides(workspace, after, projectId);
    expect((later.pg as Record<string, unknown[]>).a4_comments).toHaveLength(2);
    expect(later.pg).toEqual(later.sqlite);
    expect(verified(workspace, projectId)).toEqual([]);
  });
});
