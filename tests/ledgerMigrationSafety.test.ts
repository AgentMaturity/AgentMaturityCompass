import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-migrations-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("ledger migration safety", () => {
  test("startup tolerates legacy migration row drift when columns already exist", () => {
    const workspace = newWorkspace();

    const first = openLedger(workspace);
    first.close();

    const dbPath = join(workspace, ".amc", "evidence.sqlite");
    const raw = new Database(dbPath);
    raw.prepare("DELETE FROM schema_migrations WHERE version = 5").run();
    raw.close();

    const reopened = openLedger(workspace);
    const row = reopened.db
      .prepare("SELECT version FROM schema_migrations WHERE version = 5")
      .get() as { version: number } | undefined;
    reopened.close();

    expect(row?.version).toBe(5);
  });
});
