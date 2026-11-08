import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { runVerifyRepair } from "../src/cli-verify-repair.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { GATEWAY_SESSION_STALE_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { planVerifyRepair } from "../src/ledger/verifyRepair.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-INTEGRITY-05 (D-INT-8): when every failure is an interrupted legacy session's missing seal (a crashed tool run,
 * a copy nobody will start Studio on), `amc verify --repair` proposes seal_interrupted_sessions and `--apply` seals them
 * with a signed marker; anything else still proposes archiving the store.
 */
const STALE_TS = () => Date.now() - GATEWAY_SESSION_STALE_AFTER_MS - 60_000;
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-repair-interrupted");
  const root = mkdtempSync(join(tmpdir(), "amc-repair-interrupted-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
/** Leftover sessions of dead writers: started, one signed inline row past the liveness window, never sealed. */
function interrupted(root: string, sessions: ReadonlyArray<readonly [string, "gateway" | "unknown"]>, withEvent = true): void {
  const ledger = openLedger(root);
  try {
    for (const [sessionId, runtime] of sessions) {
      ledger.startSession({ sessionId, runtime, binaryPath: "fixture", binarySha256: "fixture" });
      if (withEvent) ledger.appendEvidence({ sessionId, runtime, eventType: "stdout", payload: "last row", inline: true, ts: STALE_TS() });
    }
  } finally { ledger.close(); closeAllSqlitePools(); }
}
function raw(root: string, sql: string, ...args: unknown[]): void {
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["protect_sessions_core_immutable", "protect_evidence_immutable", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.prepare(sql).run(...args);
  } finally { db.close(); }
}
async function repair(root: string, apply: boolean, yes = false): Promise<{ code: number; out: string }> {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => { lines.push(stripVTControlCharacters(String(line))); });
  const code = await runVerifyRepair({ apply, yes });
  return { code, out: lines.join("\n") };
}
function state(root: string) {
  const ledger = openLedger(root, { readonly: true });
  try { return { sessions: ledger.getAllSessions(), events: ledger.getAllEvents().length }; } finally { ledger.close(); }
}

test("stale gateway and tool sessions: the plan lists both; --apply seals each with the marker and the ledger verifies", { timeout: 60_000 }, async () => {
  const root = workspace();
  interrupted(root, [["gw-crashed", "gateway"], ["tool-crashed", "unknown"]]);
  const plan = planVerifyRepair(root);
  expect(plan).toMatchObject({ verified: false, action: "seal_interrupted_sessions", files: [] });
  expect(plan.sessions?.map((session) => [session.sessionId, session.runtime])).toEqual([["gw-crashed", "gateway"], ["tool-crashed", "unknown"]]);
  expect(plan.sessions?.every((session) => session.tailAgeMs > GATEWAY_SESSION_STALE_AFTER_MS)).toBe(true);

  const planned = await repair(root, false);
  expect(planned.code).toBe(1);
  expect(planned.out).toContain("tool-crashed (unknown; last signed activity 16 min ago)");
  vi.restoreAllMocks();

  const applied = await repair(root, true);
  expect(applied.code).toBe(0);
  expect(applied.out).toContain("Sealed 2 interrupted session(s), each with a signed interrupted-sealed marker: gw-crashed, tool-crashed");
  expect(applied.out).toContain("Verification passed.");
  const ledger = openLedger(root, { readonly: true });
  try {
    for (const id of ["gw-crashed", "tool-crashed"]) {
      const last = ledger.getAllEvents().filter((event) => event.session_id === id).at(-1)!;
      expect(JSON.parse(last.meta_json)).toMatchObject({ stage: "interrupted-sealed", recoveredBy: "amc verify --repair" });
      expect(ledger.getAllSessions().find((session) => session.session_id === id)?.session_final_event_hash).toBe(last.event_hash);
    }
  } finally { ledger.close(); }
  expect(verifyLedgerIntegrity(root)).toMatchObject({ ok: true, errors: [] });
});

test("a session with no signed event, or a missing seal beside any other error, still proposes archiving the store", { timeout: 60_000 }, () => {
  const empty = workspace();
  interrupted(empty, [["no-event", "unknown"]], false);
  raw(empty, "UPDATE sessions SET started_ts = ? WHERE session_id = 'no-event'", STALE_TS()); // stale by its recorded start
  expect(planVerifyRepair(empty).action).toBe("archive_evidence_store");

  const forged = workspace();
  interrupted(forged, [["gw-crashed", "gateway"]]);
  raw(forged, "UPDATE evidence_events SET writer_sig = 'invalid-fixture-signature' WHERE session_id = 'gw-crashed'");
  const plan = planVerifyRepair(forged);
  expect(plan.errors.join("\n")).toContain("Session gw-crashed missing seal");
  expect(plan.action).toBe("archive_evidence_store");
});

test("a locked vault refuses with the unlock step and changes nothing", { timeout: 60_000 }, async () => {
  const root = workspace();
  interrupted(root, [["tool-crashed", "unknown"]]);
  lockVault(root);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", undefined);
  const before = state(root);
  const result = await repair(root, true, true);
  expect(result.code).toBe(2);
  expect(result.out).toContain("Refused: the vault is locked; run `amc vault unlock` (or set AMC_VAULT_PASSPHRASE) and retry. Nothing was changed.");
  expect(state(root)).toEqual(before);
});
