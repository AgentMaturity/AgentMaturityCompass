import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { emitGuardEvent, closeGuardDb } from "../src/enforce/evidenceEmitter.js";
import {
  compareGuardEventStores,
  backfillGuardEvents,
  currentStage,
  guardEventFingerprint,
  type GuardEventRow
} from "../src/storage/consolidation/guardEventConsolidation.js";

/**
 * Guard events lived in .amc/guard_events.sqlite, outside the evidence store.
 * That is not a filing detail: every ops engine opens a workspace through
 * openLedger(), so retention, vacuum, backup and integrity verification all
 * reach exactly one file. Guard events reached 87,667 rows with no prune path,
 * and nobody had to make a mistake for that — it followed from the second file
 * existing.
 *
 * The consolidation is staged and never one-way. These tests hold each stage to
 * its promise: dual-write changes no answer, parity can actually fail, and the
 * legacy file survives cutover so reverting is a setting change.
 */
describe("guard event consolidation", () => {
  let workspace: string;
  let legacyDbPath: string;
  const priorPath = process.env["AMC_GUARD_EVENTS_DB_PATH"];
  const priorStage = process.env["AMC_GUARD_EVENTS_STAGE"];

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-guard-consol-"));
    initWorkspace({ workspacePath: workspace, agentId: "default" });
    legacyDbPath = join(workspace, ".amc", "guard_events.sqlite");
    process.env["AMC_GUARD_EVENTS_DB_PATH"] = legacyDbPath;
  });

  afterEach(() => {
    closeGuardDb();
    if (priorPath === undefined) delete process.env["AMC_GUARD_EVENTS_DB_PATH"];
    else process.env["AMC_GUARD_EVENTS_DB_PATH"] = priorPath;
    if (priorStage === undefined) delete process.env["AMC_GUARD_EVENTS_STAGE"];
    else process.env["AMC_GUARD_EVENTS_STAGE"] = priorStage;
    rmSync(workspace, { recursive: true, force: true });
  });

  const emit = (reason: string) =>
    emitGuardEvent({
      agentId: "agent-a",
      moduleCode: "M1",
      decision: "deny",
      reason,
      severity: "high"
    });

  it("defaults to dual-write, never to cutover", () => {
    // A consolidation that flips on upgrade is a one-way migration wearing a
    // staged migration's clothes.
    delete process.env["AMC_GUARD_EVENTS_STAGE"];
    expect(currentStage()).toBe("DUAL_WRITE");
  });

  it("writes each event to both stores", () => {
    emit("first");
    emit("second");

    const comparison = compareGuardEventStores({ workspace, legacyDbPath });
    expect(comparison.legacyRows).toBe(2);
    expect(comparison.consolidatedRows).toBe(2);
    expect(comparison.identical, JSON.stringify(comparison)).toBe(true);
  });

  it("leaves the legacy store authoritative and intact", () => {
    emit("only");
    // Dual-write must not change what the existing reader sees, or the stage
    // that is supposed to be a no-op is not one.
    const legacy = new Database(legacyDbPath, { readonly: true });
    try {
      const rows = legacy.prepare("SELECT reason FROM amc_guard_events").all() as { reason: string }[];
      expect(rows.map((r) => r.reason)).toEqual(["only"]);
    } finally {
      legacy.close();
    }
    expect(existsSync(legacyDbPath)).toBe(true);
  });

  it("reports a difference when the stores diverge", () => {
    // The parity check is the gate to cutover, so it has to be able to fail. A
    // comparison that cannot report a difference is not evidence of none.
    emit("shared");
    const legacy = new Database(legacyDbPath);
    try {
      legacy
        .prepare(
          `INSERT INTO amc_guard_events
             (id, agent_id, module_code, decision, reason, severity, meta_json, created_at)
           VALUES ('legacy-only', 'agent-a', 'M1', 'allow', 'written before dual-write', 'low', NULL, '2020-01-01T00:00:00.000Z')`
        )
        .run();
    } finally {
      legacy.close();
    }

    const comparison = compareGuardEventStores({ workspace, legacyDbPath });
    expect(comparison.identical).toBe(false);
    expect(comparison.missingFromConsolidated).toEqual(["legacy-only"]);
  });

  it("backfills history that predates dual-write", () => {
    // Without this a workspace with existing rows could never reach parity, so
    // it could never be cut over.
    const legacy = new Database(legacyDbPath);
    try {
      legacy.exec(`
        CREATE TABLE IF NOT EXISTS amc_guard_events (
          id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, module_code TEXT NOT NULL,
          decision TEXT NOT NULL, reason TEXT NOT NULL, severity TEXT NOT NULL,
          meta_json TEXT, created_at TEXT NOT NULL, prev_hash TEXT, event_hash TEXT
        )
      `);
      legacy
        .prepare(
          `INSERT INTO amc_guard_events
             (id, agent_id, module_code, decision, reason, severity, meta_json, created_at)
           VALUES ('old-1', 'agent-a', 'M1', 'warn', 'from before', 'low', NULL, '2020-01-01T00:00:00.000Z')`
        )
        .run();
    } finally {
      legacy.close();
    }

    expect(compareGuardEventStores({ workspace, legacyDbPath }).identical).toBe(false);
    expect(backfillGuardEvents({ workspace, legacyDbPath }).copied).toBe(1);
    expect(compareGuardEventStores({ workspace, legacyDbPath }).identical).toBe(true);

    // Idempotent: running it again copies nothing and breaks nothing.
    expect(backfillGuardEvents({ workspace, legacyDbPath }).copied).toBe(0);
    expect(compareGuardEventStores({ workspace, legacyDbPath }).identical).toBe(true);
  });

  it("reads and writes the evidence store after cutover, keeping the legacy file", () => {
    // Dual-write first, so the evidence store holds real history.
    emit("before cutover");
    expect(compareGuardEventStores({ workspace, legacyDbPath }).identical).toBe(true);
    closeGuardDb();

    process.env["AMC_GUARD_EVENTS_STAGE"] = "CUTOVER";
    emit("after cutover");
    closeGuardDb();

    // The new event landed in the evidence store...
    const evidence = new Database(join(workspace, ".amc", "evidence.sqlite"), { readonly: true });
    try {
      const reasons = (evidence.prepare("SELECT reason FROM amc_guard_events ORDER BY created_at").all() as {
        reason: string;
      }[]).map((r) => r.reason);
      expect(reasons).toContain("before cutover");
      expect(reasons).toContain("after cutover");
    } finally {
      evidence.close();
    }

    // ...and the legacy file still holds everything it held before, untouched.
    // That is what makes reverting a setting change rather than a restore.
    const legacy = new Database(legacyDbPath, { readonly: true });
    try {
      const reasons = (legacy.prepare("SELECT reason FROM amc_guard_events").all() as { reason: string }[]).map(
        (r) => r.reason
      );
      expect(reasons).toEqual(["before cutover"]);
    } finally {
      legacy.close();
    }
  });

  it("reverts to the legacy store when cutover is switched back off", () => {
    process.env["AMC_GUARD_EVENTS_STAGE"] = "CUTOVER";
    emit("cutover era");
    closeGuardDb();

    delete process.env["AMC_GUARD_EVENTS_STAGE"];
    emit("back on legacy");
    closeGuardDb();

    const legacy = new Database(legacyDbPath, { readonly: true });
    try {
      const reasons = (legacy.prepare("SELECT reason FROM amc_guard_events").all() as { reason: string }[]).map(
        (r) => r.reason
      );
      // The legacy store keeps working; the rollback path is a real one.
      expect(reasons).toContain("back on legacy");
    } finally {
      legacy.close();
    }
  });

  it("fingerprints content, not row placement", () => {
    // Insertion order and rowid differ between the stores for reasons that
    // carry no meaning; flagging those would report drift on every workspace.
    const row: GuardEventRow = {
      id: "x",
      agent_id: "a",
      module_code: "M1",
      decision: "allow",
      reason: "r",
      severity: "low",
      meta_json: null,
      created_at: "2020-01-01T00:00:00.000Z",
      prev_hash: null,
      event_hash: null
    };
    expect(guardEventFingerprint(row)).toBe(guardEventFingerprint({ ...row }));
    expect(guardEventFingerprint(row)).not.toBe(guardEventFingerprint({ ...row, reason: "other" }));
  });
});
