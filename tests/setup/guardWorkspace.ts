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
const previousAmcHome = process.env.AMC_HOME;
process.env.AMC_GUARD_EVENTS_DB_PATH = join(workspace, ".amc", "guard_events.sqlite");
process.env.AMC_GUARD_RECEIPTS_WORKSPACE = workspace;
// P1-08: anti-rollback marks live in <AMC home>/state, so the suite never writes the developer's real AMC home.
// A test that needs its own home still stubs AMC_HOME; this only replaces an unset one.
if (!previousAmcHome) process.env.AMC_HOME = join(workspace, "amc-home");

// Closing real guard stores and removing owned fixtures can exceed the default
// hook budget under parallel coverage. Preserve the complete cleanup and restore.
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
    if (previousAmcHome === undefined) delete process.env.AMC_HOME;
    else process.env.AMC_HOME = previousAmcHome;
  }
}, 120_000);
