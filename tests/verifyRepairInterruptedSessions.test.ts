import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { runVerifyRepair } from "../src/cli-verify-repair.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { GATEWAY_SESSION_STALE_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { planVerifyRepair, sealPlannedSessions } from "../src/ledger/verifyRepair.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { checkpointLedger, checkpointsDir } from "../src/time/checkpoint.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig } from "../src/workspace.js";

/**
 * LIVE-INTEGRITY-05 (D-INT-8): when every failure is an interrupted legacy session's missing seal (a crashed tool run,
 * a copy nobody will start Studio on), `amc verify --repair` proposes seal_interrupted_sessions and `--apply` seals them
 * with a signed marker after a typed confirmation; anything else still proposes archiving the store. SR-I1: a stripped
 * seal plus a deleted tail reads exactly like a crash, so the plan says so, and a signed ledger checkpoint that the
 * session predates, or whose head the ledger no longer holds, refuses the seal.
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
/** Ledger checkpoints with a TSA whose anchor no trust list pins: each checkpoint is signed and stays pending, offline. */
function enableCheckpoints(root: string): void {
  const config = loadAMCConfig(root);
  config.time = { required: false, tsa: [{ name: "unpinned", url: "https://tsa.invalid/", anchorIds: ["unpinned-anchor"] }] } as typeof config.time;
  saveAMCConfig(root, config);
  signAmcConfig(root);
}
const INDISTINGUISHABLE = "Nothing signed here tells an interrupted session from a sealed one whose seal was erased and newest rows deleted";
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
  expect(planned.out).toContain(INDISTINGUISHABLE);
  expect(planned.out).toContain("Run amc verify --repair --apply to seal them (asks to type seal; --yes in scripts).");
  vi.restoreAllMocks();

  const applied = await repair(root, true, true);
  expect(applied.code).toBe(0);
  expect(applied.out).toContain("Sealed 2 interrupted session(s), each with a signed interrupted-sealed marker: gw-crashed, tool-crashed");
  expect(applied.out).toContain("Integrity check passed after sealing.");
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
  // Follow-up 5: the paths named work without a terminal too (`amc vault unlock` alone refuses there).
  expect(result.out).toContain("Refused: the vault is locked. Export AMC_VAULT_PASSPHRASE, or set AMC_VAULT_PASSPHRASE_FILE, or run `amc vault unlock` from a terminal, then retry. Nothing was changed.");
  expect(state(root)).toEqual(before);
});

test("--apply without --yes off a terminal needs the typed confirmation: refused, nothing changed", { timeout: 60_000 }, async () => {
  const root = workspace();
  interrupted(root, [["tool-crashed", "unknown"]]);
  const before = state(root);
  const result = await repair(root, true);
  expect(result.code).toBe(2);
  expect(result.out).toContain("Refused: --apply needs the typed confirmation seal on a terminal, or --yes. Nothing has been changed.");
  expect(state(root)).toEqual(before);
});

test("SR-I1: a sealed session older than the last signed checkpoint, its seal erased and its tail deleted, is never sealed", { timeout: 60_000 }, async () => {
  const root = workspace();
  const ledger = openLedger(root);
  try {
    ledger.startSession({ sessionId: "tool-done", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    for (const line of ["routine", "incriminating"]) ledger.appendEvidence({ sessionId: "tool-done", runtime: "unknown", eventType: "stdout", payload: line, inline: true, ts: Date.now() - 60 * 60_000 });
    ledger.sealSession("tool-done");
  } finally { ledger.close(); closeAllSqlitePools(); }
  enableCheckpoints(root);
  expect(await checkpointLedger(root)).toMatchObject({ sequence: 1, status: "pending" });
  // A writer without the monitor key: delete the session's newest row (the ledger head) and erase its seal.
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["no_delete_evidence", "protect_sessions_sealed_immutable", "protect_sessions_seal_consistency"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.prepare("DELETE FROM evidence_events WHERE rowid = (SELECT MAX(rowid) FROM evidence_events WHERE session_id = 'tool-done')").run();
    db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = 'tool-done'").run();
  } finally { db.close(); }
  expect(verifyLedgerIntegrity(root).errors).toEqual(["Session tool-done missing seal"]);
  const plan = planVerifyRepair(root);
  expect(plan.action).toBe("archive_evidence_store");
  expect(plan.sessions).toBeUndefined();
  expect(plan.sealRefused?.join("\n")).toContain("the ledger no longer holds the head of signed checkpoint 1");
  const printed = await repair(root, false);
  expect(printed.out).toContain("Not sealing: the ledger no longer holds the head of signed checkpoint 1");
});

test("SR-I1: a crashed session that started before the last signed checkpoint is refused; one started after it may be sealed", { timeout: 60_000 }, async () => {
  const root = workspace();
  interrupted(root, [["tool-before", "unknown"]]);
  enableCheckpoints(root);
  await checkpointLedger(root); // checkpoint 1: its head is tool-before's row
  const plan = planVerifyRepair(root);
  expect(plan.action).toBe("archive_evidence_store");
  expect(plan.sealRefused).toEqual([expect.stringMatching(/^Session tool-before started before signed checkpoint 1 \(/)]);
  // A plan made before the checkpoint is refused at apply time too.
  const stale = { ...plan, action: "seal_interrupted_sessions" as const, sessions: [{ sessionId: "tool-before", runtime: "unknown", tailAgeMs: 0 }] };
  expect(() => sealPlannedSessions(root, stale)).toThrow(/started before signed checkpoint 1/);

  const after = workspace();
  interrupted(after, [["tool-seed", "unknown"]]);
  enableCheckpoints(after);
  await checkpointLedger(after);
  const ledger = openLedger(after);
  try { ledger.sealSession("tool-seed"); } finally { ledger.close(); closeAllSqlitePools(); }
  interrupted(after, [["tool-after", "unknown"]]);
  expect(planVerifyRepair(after)).toMatchObject({ action: "seal_interrupted_sessions", sessions: [expect.objectContaining({ sessionId: "tool-after" })] });
});

test("SR-I1: signed checkpoints that do not verify refuse every seal (fail closed)", { timeout: 60_000 }, async () => {
  const root = workspace();
  interrupted(root, [["tool-crashed", "unknown"]]);
  enableCheckpoints(root);
  await checkpointLedger(root);
  writeFileSync(join(checkpointsDir(root), "1.json"), "{\"not\": \"a checkpoint\"}\n");
  const plan = planVerifyRepair(root);
  expect(plan.action).toBe("archive_evidence_store");
  expect(plan.sealRefused).toEqual([expect.stringMatching(/^the signed ledger checkpoints do not verify/)]);
});

test("SR-I1: a signed time/checkpoint row naming a checkpoint whose file was deleted refuses every seal", { timeout: 60_000 }, () => {
  const root = workspace();
  interrupted(root, [["tool-crashed", "unknown"]]);
  // What a timestamped checkpoint leaves in the ledger (stampCheckpoint): one signed time/checkpoint row in its own sealed
  // session. The checkpoint files were then deleted, so the chain alone would refuse nothing.
  const ledger = openLedger(root);
  try {
    const meta = { checkpointSequence: 1, checkpointSha256: "a".repeat(64), tokenSha256: "b".repeat(64) };
    ledger.startSession({ sessionId: "time-checkpoint", runtime: "unknown", binaryPath: "amc-time-checkpoint", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "time-checkpoint", runtime: "unknown", eventType: "time/checkpoint", payload: JSON.stringify(meta), payloadExt: "json", inline: true, meta });
    ledger.sealSession("time-checkpoint");
  } finally { ledger.close(); closeAllSqlitePools(); }
  expect(verifyLedgerIntegrity(root).errors).toEqual(["Session tool-crashed missing seal"]);
  const plan = planVerifyRepair(root);
  expect(plan.action).toBe("archive_evidence_store");
  expect(plan.sealRefused).toEqual(["the ledger records signed checkpoint 1, which the checkpoint files no longer hold"]);
});
