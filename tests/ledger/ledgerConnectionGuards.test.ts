import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() => ({ fail: false }));
vi.mock("../../src/ledger/ledgerSchema.js", async (original) => {
  const real = await original<typeof import("../../src/ledger/ledgerSchema.js")>();
  return {
    ...real,
    reconcileLegacyMigrationState: (db: Parameters<typeof real.reconcileLegacyMigrationState>[0]) => {
      if (reconcile.fail) throw new Error("reconcile refused");
      real.reconcileLegacyMigrationState(db);
    }
  };
});

import { openLedgerConnection, UNSIGNED_EVIDENCE_STORE, writerStore } from "../../src/ledger/ledgerConnection.js";
import { closeAllSqlitePools } from "../../src/storage/sqlitePool.js";

describe("ledger connection guards", () => {
  let workspace: string;
  const saved = { noSign: process.env.AMC_NO_SIGN, pool: process.env.AMC_LEDGER_SQLITE_POOL_SIZE };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-ledger-conn-"));
    reconcile.fail = false;
    delete process.env.AMC_NO_SIGN;
  });
  afterEach(() => {
    closeAllSqlitePools();
    rmSync(workspace, { recursive: true, force: true });
    if (saved.noSign === undefined) delete process.env.AMC_NO_SIGN; else process.env.AMC_NO_SIGN = saved.noSign;
    if (saved.pool === undefined) delete process.env.AMC_LEDGER_SQLITE_POOL_SIZE; else process.env.AMC_LEDGER_SQLITE_POOL_SIZE = saved.pool;
  });

  it("refuses the unsigned store unless AMC_NO_SIGN=1, and names it for writers only then", () => {
    expect(writerStore()).toEqual({});
    expect(() => openLedgerConnection(workspace, { unsignedSignatures: true, store: "unsigned" }))
      .toThrow("The unsigned evidence store is only for AMC_NO_SIGN=1 runs");
    process.env.AMC_NO_SIGN = "1";
    expect(writerStore()).toEqual({ store: "unsigned" });
    const opened = openLedgerConnection(workspace, { unsignedSignatures: true, store: "unsigned" });
    try {
      expect(opened.db.name).toBe(join(workspace, UNSIGNED_EVIDENCE_STORE));
    } finally {
      opened.lease?.release();
    }
  });

  it("a read-only open of a workspace with no ledger fails and creates nothing", () => {
    expect(() => openLedgerConnection(workspace, { readonly: true, unsignedSignatures: true })).toThrow();
  });

  it("gives the connection back when reconciling the migration state fails, so the next open works", () => {
    process.env.AMC_LEDGER_SQLITE_POOL_SIZE = "1";
    reconcile.fail = true;
    expect(() => openLedgerConnection(workspace, { unsignedSignatures: true })).toThrow("reconcile refused");
    reconcile.fail = false;
    // With a pool of one, this open can only succeed if the failed open released its lease.
    const opened = openLedgerConnection(workspace, { unsignedSignatures: true });
    try {
      expect(opened.db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: expect.any(Number) });
    } finally {
      opened.lease?.release();
    }
  });
});
