import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  emitGuardEvent,
  readGuardEvents,
  verifyGuardEventChain,
  pruneGuardEvents,
  closeGuardDb
} from "../../src/enforce/evidenceEmitter.js";

/**
 * Guard decisions are read back by collectEvidenceFromLedger and scored as
 * OBSERVED — trust 1.0, the tier reserved for evidence AMC captured itself.
 * But guard_events.sqlite had no prev-hash, no event hash, no signature and no
 * immutability trigger; its only two triggers were value checks on `decision`
 * and `severity`. verifyLedgerIntegrity never opens the file. An edit to a row
 * was therefore undetectable while still counting at full trust.
 *
 * It also had no prune path of any kind — the one store retention and vacuum
 * could not reach, since both open a workspace through openLedger(), which
 * resolves to evidence.sqlite. The live file had reached 87,667 rows.
 */
describe("guard event chain", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-guard-"));
    process.env.AMC_GUARD_EVENTS_DB_PATH = join(dir, "guard_events.sqlite");
    closeGuardDb();
  });

  afterEach(() => {
    closeGuardDb();
    delete process.env.AMC_GUARD_EVENTS_DB_PATH;
    rmSync(dir, { recursive: true, force: true });
  });

  const emit = (reason: string) =>
    emitGuardEvent({
      agentId: "default",
      moduleCode: "test.module",
      decision: "deny",
      reason,
      severity: "high"
    });

  it("chains each event to its predecessor", () => {
    emit("first");
    emit("second");
    emit("third");
    const result = verifyGuardEventChain();
    expect(result.ok).toBe(true);
    expect(result.chained).toBe(3);
    expect(result.unchained).toBe(0);
  });

  it("detects a row edited in place", () => {
    emit("first");
    emit("second");
    closeGuardDb();

    const db = new Database(join(dir, "guard_events.sqlite"));
    db.prepare("UPDATE amc_guard_events SET reason = ? WHERE reason = ?").run("tampered", "first");
    db.close();

    const result = verifyGuardEventChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAt).not.toBeNull();
  });

  it("reports pre-migration rows as unchained rather than verified", () => {
    emit("chained");
    closeGuardDb();
    const db = new Database(join(dir, "guard_events.sqlite"));
    // A row as written before the chain existed.
    db.prepare(
      `INSERT INTO amc_guard_events (id, agent_id, module_code, decision, reason, severity, meta_json, created_at)
       VALUES ('legacy', 'default', 'm', 'allow', 'legacy row', 'low', NULL, '2020-01-01T00:00:00.000Z')`
    ).run();
    db.close();

    const result = verifyGuardEventChain();
    expect(result.unchained).toBe(1);
    // Honest: an unchained row is not counted as verified, and its presence is
    // not reported as tampering either.
    expect(result.ok).toBe(true);
  });

  it("prunes events older than a cutoff", () => {
    emit("keep me");
    closeGuardDb();
    const db = new Database(join(dir, "guard_events.sqlite"));
    db.prepare(
      `INSERT INTO amc_guard_events (id, agent_id, module_code, decision, reason, severity, meta_json, created_at, prev_hash, event_hash)
       VALUES ('old', 'default', 'm', 'allow', 'ancient', 'low', NULL, '2020-01-01T00:00:00.000Z', 'x', 'y')`
    ).run();
    db.close();

    expect(readGuardEvents("default")).toHaveLength(2);
    const removed = pruneGuardEvents("2021-01-01T00:00:00.000Z");
    expect(removed).toBe(1);
    const remaining = readGuardEvents("default");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.reason).toBe("keep me");
  });

  it("never throws, whatever the store is doing", () => {
    expect(() => verifyGuardEventChain()).not.toThrow();
    expect(() => pruneGuardEvents("not-a-date")).not.toThrow();
  });
});
