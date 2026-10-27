/** P2-09c guard-events cutover: gated on identical parity, per workspace, and pruned through the hold-aware gate. */
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeGuardDb, emitGuardEvent, withWorkspaceScope } from "../src/enforce/evidenceEmitter.js";
import { openLedger } from "../src/ledger/ledger.js";
import { loadOpsPolicy, opsPolicyPath, signOpsPolicy } from "../src/ops/policy.js";
import { runRetention } from "../src/ops/retention/retentionEngine.js";
import { closeSqlitePool } from "../src/storage/sqlitePool.js";
import { compareGuardEventStores, currentStage, cutOverGuardEvents, guardEventStagePath } from "../src/storage/consolidation/guardEventConsolidation.js";

import { initWorkspace } from "../src/workspace.js";

let workspace: string;
let legacyDbPath: string;
beforeEach(() => {
  vi.stubEnv("AMC_GUARD_EVENTS_STAGE", undefined);
  vi.stubEnv("AMC_GUARD_EVENTS_DB_PATH", undefined);
  workspace = mkdtempSync(join(tmpdir(), "amc-guard-cutover-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  legacyDbPath = join(workspace, ".amc", "guard_events.sqlite");
});
afterEach(() => {
  closeGuardDb();
  vi.unstubAllEnvs();
  closeSqlitePool(`ledger:${resolve(workspace)}:${join(workspace, ".amc", "evidence.sqlite")}`);
  rmSync(workspace, { recursive: true, force: true });
});

const emit = (reason: string) => emitGuardEvent({ workspace, agentId: "agent-a", moduleCode: "M1", decision: "deny", reason, severity: "high" });

describe("guard-events cutover (P2-09c)", () => {
  it("refuses cutover while parity diverges and leaves the workspace in DUAL_WRITE", () => {
    emit("first");
    const legacy = new Database(legacyDbPath);
    legacy.prepare("UPDATE amc_guard_events SET reason = 'edited'").run();
    legacy.close();
    const result = cutOverGuardEvents({ workspace, legacyDbPath });
    expect(result.cutOver).toBe(false);
    expect(result.comparison.divergent).toHaveLength(1);
    expect(existsSync(guardEventStagePath(workspace))).toBe(false);
    expect(currentStage(workspace)).toBe("DUAL_WRITE");
  });

  it("allows cutover on identical parity; new events then go only to the evidence store, and the legacy file stays untouched", () => {
    emit("before");
    expect(cutOverGuardEvents({ workspace, legacyDbPath }).cutOver).toBe(true);
    expect(currentStage(workspace)).toBe("CUTOVER");
    const legacyRows = () => { const db = new Database(legacyDbPath, { readonly: true }); try { return db.prepare("SELECT * FROM amc_guard_events ORDER BY id").all(); } finally { db.close(); } };
    const before = legacyRows();
    closeGuardDb();
    emit("after");
    expect(legacyRows()).toEqual(before);
    const comparison = compareGuardEventStores({ workspace, legacyDbPath });
    expect(comparison).toMatchObject({ legacyRows: 1, consolidatedRows: 2 });
    vi.stubEnv("AMC_GUARD_EVENTS_STAGE", "DUAL_WRITE");
    expect(currentStage(workspace)).toBe("DUAL_WRITE");
  });

  it("prunes both stores after pruneGuardEventsAfterDays under DUAL_WRITE, keeping parity", () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    emit("old");
    emit("new");
    for (const db of [new Database(legacyDbPath), openLedger(workspace).db]) {
      db.prepare("UPDATE amc_guard_events SET created_at = ? WHERE reason = 'old'").run(old);
    }
    const policy = loadOpsPolicy(workspace);
    policy.opsPolicy.retention.pruneGuardEventsAfterDays = 5;
    writeFileSync(opsPolicyPath(workspace), YAML.stringify(policy));
    signOpsPolicy(workspace);
    const result = withWorkspaceScope(workspace, () => runRetention({ workspace, dryRun: false }));
    expect(result.prunedGuardEventCount).toBe(1);
    expect(compareGuardEventStores({ workspace, legacyDbPath })).toMatchObject({ identical: true, legacyRows: 1, consolidatedRows: 1 });
  });
});
