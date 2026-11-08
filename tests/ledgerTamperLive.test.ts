import Database from "better-sqlite3";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startGateway, type GatewayHandle } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { GATEWAY_SESSION_STALE_AFTER_MS } from "../src/ledger/sessionLiveness.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-INTEGRITY-08: the tampering a live deployment must keep catching while its gateway runs, and, as truth tests, the
 * non-detections the deployment checklist states ("Open sessions and what verification cannot see"). Each case is a
 * workspace writer with the database file: it drops the triggers in its way first.
 */
let root: string, gateway: GatewayHandle | undefined;
beforeEach(async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-ledger-tamper-live");
  root = mkdtempSync(join(tmpdir(), "amc-ledger-tamper-live-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  gateway = await startGateway({ workspace: root, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
});
afterEach(async () => {
  await gateway?.close(); gateway = undefined;
  lockVault(root); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs();
});

/** A legacy session with `rows` inline rows `ageMs` old, sealed unless `seal` is false. Its rows are the ledger's newest. */
function session(sessionId: string, options: { rows?: number; ageMs?: number; seal?: boolean } = {}): void {
  const ledger = openLedger(root);
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    for (let row = 0; row < (options.rows ?? 2); row += 1) {
      ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "stdout", payload: `row ${row}`, inline: true, ts: Date.now() - (options.ageMs ?? 0) });
    }
    if (options.seal !== false) ledger.sealSession(sessionId);
  } finally { ledger.close(); }
}
function writer(change: (db: Database.Database) => void): void {
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence", "protect_sessions_core_immutable",
      "protect_sessions_seal_consistency", "protect_sessions_sealed_immutable"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    change(db);
  } finally { db.close(); }
}
function lastRowId(sessionId: string): string {
  const db = new Database(join(root, ".amc", "evidence.sqlite"), { readonly: true });
  try { return (db.prepare("SELECT id FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1").get(sessionId) as { id: string }).id; }
  finally { db.close(); }
}
const verdict = (now?: number) => verifyLedgerIntegrity(root, now === undefined ? {} : { now });

test("baseline: the running gateway's session is open and the ledger verifies", () => {
  expect(verdict()).toMatchObject({ ok: true, errors: [] });
  expect(verdict().sessions.liveLegacy.map((open) => open.sessionId)).toEqual([gateway!.gatewaySessionId]);
});

test("tail truncation of a sealed session: final hash mismatch", () => {
  session("sealed-1");
  writer((db) => db.prepare("DELETE FROM evidence_events WHERE id = ?").run(lastRowId("sealed-1")));
  expect(verdict().errors).toContain("Session sealed-1 final hash mismatch");
});

test("a NULLed seal with ended_ts kept: missing seal", () => {
  session("sealed-2");
  writer((db) => db.prepare("UPDATE sessions SET session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = 'sealed-2'").run());
  expect(verdict().errors).toContain("Session sealed-2 missing seal");
});

test("S1: a NULLed end and seal on a session with old rows: missing seal, not open", () => {
  session("closed-old", { ageMs: 60 * 60_000 });
  writer((db) => db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = 'closed-old'").run());
  const result = verdict();
  expect(result.errors).toContain("Session closed-old missing seal");
  expect(result.sessions.liveLegacy.map((open) => open.sessionId)).not.toContain("closed-old");
});

test("a row re-signed with another key: writer signature invalid", () => {
  session("sealed-3");
  const { privateKey } = generateKeyPairSync("ed25519");
  writer((db) => {
    const row = db.prepare("SELECT id, event_hash FROM evidence_events WHERE session_id = 'sealed-3' ORDER BY rowid LIMIT 1").get() as { id: string; event_hash: string };
    const forged = sign(null, Buffer.from(row.event_hash, "hex"), privateKey).toString("base64");
    db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run(forged, row.id);
  });
  expect(verdict().errors.join("\n")).toMatch(/Event .+ writer signature invalid/);
});

test("an edited meta_json: event hash mismatch", () => {
  session("sealed-4");
  writer((db) => db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify({ edited: true }), lastRowId("sealed-4")));
  expect(verdict().errors.join("\n")).toMatch(/Event .+ event_hash mismatch/);
});

test("a forged future started_ts on an event-less session: missing seal, never open", () => {
  session("empty-1", { rows: 0, seal: false });
  writer((db) => db.prepare("UPDATE sessions SET started_ts = ? WHERE session_id = 'empty-1'").run(Date.now() + 60 * 60_000));
  const result = verdict();
  expect(result.errors).toContain("Session empty-1 missing seal");
  expect(result.sessions.liveLegacy.map((open) => open.sessionId)).not.toContain("empty-1");
});

test("documented non-detection: deleting the newest rows of an open session leaves the ledger verifying", () => {
  const ledger = openLedger(root);
  try {
    for (const row of [1, 2]) ledger.appendEvidence({ sessionId: gateway!.gatewaySessionId, runtime: "gateway", eventType: "gateway", payload: `{"n":${row}}` });
  } finally { ledger.close(); }
  writer((db) => db.prepare("DELETE FROM evidence_events WHERE rowid IN (SELECT rowid FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 2)")
    .run(gateway!.gatewaySessionId));
  expect(verdict()).toMatchObject({ ok: true, errors: [] });
});

test("documented non-detection: an erased end and seal on a session whose last row is 1 min old reads open until the window passes", () => {
  session("closed-recent", { ageMs: 60_000 });
  writer((db) => db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = 'closed-recent'").run());
  const now = Date.now();
  expect(verdict(now).sessions.liveLegacy.map((open) => open.sessionId)).toContain("closed-recent");
  expect(verdict(now + GATEWAY_SESSION_STALE_AFTER_MS + 1).errors).toContain("Session closed-recent missing seal");
});
