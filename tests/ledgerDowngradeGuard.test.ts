/** P2-09 downgrade guard: an AMC never opens a ledger migrated by a newer AMC (P2-06 rollback check RB-2). */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runMigrations } from "../src/ledger/ledgerSchema.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function migratedDb(): { path: string; known: number } {
  const root = mkdtempSync(join(tmpdir(), "amc-downgrade-"));
  roots.push(root);
  const path = join(root, "evidence.sqlite");
  const db = new Database(path);
  try {
    runMigrations(db);
    return { path, known: (db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number }).v };
  } finally {
    db.close();
  }
}

it("refuses a ledger holding a migration one above the highest this AMC knows", () => {
  const { path, known } = migratedDb();
  const db = new Database(path);
  try {
    db.prepare("INSERT INTO schema_migrations(version, applied_ts) VALUES (?, ?)").run(known + 1, Date.now());
    expect(() => runMigrations(db)).toThrow(`ledger schema version ${known + 1} is newer than this AMC; restore the pre-upgrade backup or upgrade AMC`);
  } finally {
    db.close();
  }
});

it("opens a ledger at the current version", () => {
  const { path } = migratedDb();
  const db = new Database(path);
  try {
    expect(() => runMigrations(db)).not.toThrow();
  } finally {
    db.close();
  }
});
