import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openGatewaySession } from "../src/gateway/gatewaySession.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { GATEWAY_RECOVER_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-INTEGRITY-07: the next gateway start event witnesses every gateway session sealed since the last start, and
 * verification holds each witnessed session to that seal, so an erased seal is never laundered into a crash recovery.
 */
let root: string;
const quiet = { log() {}, error() {} };
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-gateway-seal-witness");
  root = mkdtempSync(join(tmpdir(), "amc-gateway-seal-witness-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
});
afterEach(() => { lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function startRow(sessionId: string): { id: string; meta: Record<string, unknown> } {
  const ledger = openLedger(root, { readonly: true });
  try {
    const row = ledger.getAllEvents().find((event) => event.session_id === sessionId)!;
    return { id: row.id, meta: JSON.parse(row.meta_json) as Record<string, unknown> };
  } finally { ledger.close(); }
}
function finalHash(sessionId: string): string | null {
  const ledger = openLedger(root, { readonly: true });
  try { return ledger.getAllSessions().find((session) => session.session_id === sessionId)!.session_final_event_hash; }
  finally { ledger.close(); }
}
/** A workspace writer with the file: drops the triggers in the way, erases the seal (and optionally the last row). */
function tamper(sessionId: string, deleteLastRow: boolean): void {
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["protect_sessions_sealed_immutable", "no_delete_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?").run(sessionId);
    if (deleteLastRow) db.prepare("DELETE FROM evidence_events WHERE rowid = (SELECT MAX(rowid) FROM evidence_events WHERE session_id = ?)").run(sessionId);
  } finally { db.close(); }
}
/** A third gateway whose clock is past the recovery threshold sweeps the workspace. */
function laterSweep(): string[] {
  const ledger = openLedger(root);
  const session = openGatewaySession(ledger, { workspace: root, logger: quiet, now: () => Date.now() + 2 * GATEWAY_RECOVER_AFTER_MS,
    start: { eventType: "gateway", payload: "{}", meta: { stage: "start" } } });
  try { return session.sweep(); } finally { session.close(); ledger.close(); }
}

async function twoStarts(): Promise<{ first: string; second: string }> {
  const one = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: quiet });
  const first = one.gatewaySessionId;
  await one.close();
  const two = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: quiet });
  const second = two.gatewaySessionId;
  await two.close();
  return { first, second };
}

test("the next start witnesses the sealed session with its final hash, once", { timeout: 60_000 }, async () => {
  const { first, second } = await twoStarts();
  expect(startRow(second).meta.sealedGatewaySessions).toEqual([{ sessionId: first, finalHash: finalHash(first) }]);
  const three = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: quiet });
  try { expect(startRow(three.gatewaySessionId).meta.sealedGatewaySessions).toEqual([{ sessionId: second, finalHash: finalHash(second) }]); }
  finally { await three.close(); }
  expect(verifyLedgerIntegrity(root)).toMatchObject({ ok: true, errors: [] });
});

test("an erased witnessed seal fails verification even inside the liveness window, and no sweep re-seals it", { timeout: 60_000 }, async () => {
  const { first, second } = await twoStarts();
  tamper(first, false);
  const verdict = verifyLedgerIntegrity(root);
  expect(verdict.ok).toBe(false);
  expect(verdict.errors).toContain(`Session ${first} was sealed (witnessed by gateway start ${startRow(second).id}) but its seal is missing`);
  expect(laterSweep()).toEqual([]);
  expect(finalHash(first)).toBeNull();
  expect(verifyLedgerIntegrity(root).errors).toContain(`Session ${first} was sealed (witnessed by gateway start ${startRow(second).id}) but its seal is missing`);
});

test("an erased seal plus a deleted last row: the witness error stands beside the chain break", { timeout: 60_000 }, async () => {
  const { first, second } = await twoStarts();
  tamper(first, true);
  expect(laterSweep()).toEqual([]);
  const verdict = verifyLedgerIntegrity(root);
  expect(verdict.ok).toBe(false);
  expect(verdict.errors).toContain(`Session ${first} was sealed (witnessed by gateway start ${startRow(second).id}) but its seal is missing`);
});

test("a witnessed seal replaced by another one reads changed", { timeout: 60_000 }, async () => {
  const { first, second } = await twoStarts();
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    db.exec("DROP TRIGGER IF EXISTS protect_sessions_sealed_immutable");
    const other = db.prepare("SELECT session_final_event_hash AS hash, session_seal_sig AS sig FROM sessions WHERE session_id = ?").get(second) as { hash: string; sig: string };
    db.prepare("UPDATE sessions SET session_final_event_hash = ?, session_seal_sig = ? WHERE session_id = ?").run(other.hash, other.sig, first);
  } finally { db.close(); }
  expect(verifyLedgerIntegrity(root).errors).toContain(`Session ${first} was sealed (witnessed by gateway start ${startRow(second).id}) but its seal is changed`);
});
