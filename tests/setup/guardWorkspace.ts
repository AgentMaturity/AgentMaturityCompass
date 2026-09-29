import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, vi } from "vitest";

// Setup runs before each test file's imports. Real guard emission stays enabled,
// but its implicit persistence must never reach the developer's cwd or an
// inherited operator database. Assign directly so vi.unstubAllEnvs() restores
// these sandbox values, rather than removing a setup-owned stub mid-suite.
const workspace = mkdtempSync(join(tmpdir(), "amc-vitest-guard-"));
const previousDbPath = process.env.AMC_GUARD_EVENTS_DB_PATH;
const previousReceiptWorkspace = process.env.AMC_GUARD_RECEIPTS_WORKSPACE;
process.env.AMC_GUARD_EVENTS_DB_PATH = join(workspace, ".amc", "guard_events.sqlite");
process.env.AMC_GUARD_RECEIPTS_WORKSPACE = workspace;

afterAll(async () => {
  try {
    // Do not preload product modules: individual test files must remain free to
    // mock them. Only a file that actually persisted guard data needs cleanup.
    if (existsSync(join(workspace, ".amc"))) {
      const { closeGuardDb } = await vi.importActual<typeof import("../../src/enforce/evidenceEmitter.js")>("../../src/enforce/evidenceEmitter.js");
      const { closeSqlitePool } = await vi.importActual<typeof import("../../src/storage/sqlitePool.js")>("../../src/storage/sqlitePool.js");
      closeGuardDb();
      closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
    }
    rmSync(workspace, { recursive: true, force: true });
  } finally {
    if (previousDbPath === undefined) delete process.env.AMC_GUARD_EVENTS_DB_PATH;
    else process.env.AMC_GUARD_EVENTS_DB_PATH = previousDbPath;
    if (previousReceiptWorkspace === undefined) delete process.env.AMC_GUARD_RECEIPTS_WORKSPACE;
    else process.env.AMC_GUARD_RECEIPTS_WORKSPACE = previousReceiptWorkspace;
  }
});
