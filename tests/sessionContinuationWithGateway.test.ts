import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { startGateway, type GatewayHandle } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity, verifyNativeSessionContinuation } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { recoverSession } from "../src/session/sessionRecovery.js";
import { startOwnerProcess, type OwnerProcess } from "./helpers/sessionOwnerProcess.js";

let root: string, prior: string | undefined, gateway: GatewayHandle | undefined;
const owners: OwnerProcess[] = [];
const identity = { agentId: "default", harnessVersion: "continuation-fixture", compositionDigest: "fixture", policyDigest: "fixture" };
const claimant = { pid: process.pid, hostId: hostname(), bootId: "continuation-fixture", startedAt: Date.now() };
beforeEach(async () => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = "synthetic-continuation-vault";
  root = mkdtempSync(join(tmpdir(), "amc-native-continuation-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  gateway = await startGateway({ workspace: root, listenPort: 0, logger: { log() {}, error() {} } });
});
afterEach(async () => {
  for (const owner of owners.splice(0)) await owner.kill();
  await gateway?.close(); gateway = undefined;
  lockVault(root); rmSync(root, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
});
function rows() { const ledger = openLedger(root, { readonly: true }); try { return ledger.getAllEvents(); } finally { ledger.close(); } }
function raw(change: (db: Database.Database) => void): void {
  const db = new Database(join(root, ".amc", "evidence.sqlite"));
  try {
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence",
      "protect_sessions_seal_consistency", "protect_sessions_sealed_immutable"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    change(db);
  } finally { db.close(); }
}
function released(): string {
  const writer = new SessionService(root);
  try {
    writer.open(identity); writer.startTurn({ trigger: "user" }); writer.recordUserMessage("Synthetic continuation fixture."); writer.startStep();
    writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "Recorded fixture output.", stopReason: "end_turn" });
    writer.endStep({ stopReason: "end_turn", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
    writer.releaseWithoutClosing(); return writer.sessionId;
  } finally { writer.disposeWithoutClosing(); }
}
function resume(sessionId: string) { return resumeSession({ workspace: root, sessionId, claimant, ...identity }); }
/** Resume under the session's own recorded configuration; a different composition or policy digest is refused by design. */
function resumeAsRecorded(sessionId: string) {
  const opening = loadSessionEventHistory({ workspace: root, sessionId }).events.find(row => row.event_type === "session/open");
  if (!opening) throw new Error("session/open row missing");
  const meta = JSON.parse(opening.meta_json) as { agentId: string; harnessVersion: string; compositionDigest: string; policyDigest: string };
  return resumeSession({ workspace: root, sessionId, claimant, agentId: meta.agentId, harnessVersion: meta.harnessVersion,
    compositionDigest: meta.compositionDigest, policyDigest: meta.policyDigest });
}

test("a real live gateway permits verified native handoff without becoming a cold complete-ledger success", async () => {
  const sessionId = released(), before = rows(), gatewayId = before.find(row => row.runtime === "gateway")!.session_id;
  const cold = verifyLedgerIntegrity(root);
  expect(cold.chain.ok).toBe(false); expect(cold.chain.errors).toContain(`Session ${gatewayId} missing seal`);
  const prefix = verifyNativeSessionContinuation(root, sessionId);
  expect(prefix.scope).toBe("verified-prefix"); expect(prefix.chain).toEqual({ ok: true, errors: [] });
  expect(prefix.incompleteLegacySessions).toEqual([gatewayId]); expect(prefix).not.toHaveProperty("ok");
  const resumed = resume(sessionId);
  try { expect(resumed.report.verdict).toBe("RESUMED"); expect(resumed.service.sessionId).toBe(sessionId); resumed.service.releaseWithoutClosing(); }
  finally { resumed.service.disposeWithoutClosing(); }
  expect(rows().slice(0, before.length)).toEqual(before);
  expect(verifyLedgerIntegrity(root).chain.ok).toBe(false);
  await gateway!.close(); gateway = undefined;
  expect(verifyLedgerIntegrity(root).chain).toEqual({ ok: true, errors: [] });
});

test("direct recovery claims a genuinely dead native writer while the gateway stays open", async () => {
  const owner = await startOwnerProcess(root, "tool"); owners.push(owner);
  const sessionId = String(owner.ready.sessionId); await owner.kill();
  const recovered = recoverSession({ workspace: root, sessionId, claimant, force: true, staleAfterMs: 0 });
  expect(recovered.verdict).toBe("RECOVERED"); expect(recovered.unknownToolOutcomes).toBe(1);
  expect(verifyNativeSessionContinuation(root, sessionId).chain).toEqual({ ok: true, errors: [] });
  expect(verifyLedgerIntegrity(root).chain.ok).toBe(false);
  expect(() => resume(sessionId)).toThrow(/original execution settings and signed policy/);
  const resumed = resumeAsRecorded(sessionId);
  try { resumed.service.releaseWithoutClosing(); } finally { resumed.service.disposeWithoutClosing(); }
  await gateway!.close(); gateway = undefined;
  expect(verifyLedgerIntegrity(root).chain).toEqual({ ok: true, errors: [] });
}, 20_000);

test.each(["signature-only", "hash-only", "invalid-signature", "empty-signature"] as const)("an unrelated gateway %s seal refuses before native ownership changes", (kind) => {
  const sessionId = released(), before = rows(), gatewayRow = before.find(row => row.runtime === "gateway")!;
  raw(db => {
    const hash = kind === "signature-only" ? null : gatewayRow.event_hash;
    const signature = kind === "hash-only" ? null : kind === "empty-signature" ? "" : "invalid-fixture-signature";
    expect(db.prepare("UPDATE sessions SET session_final_event_hash = ?, session_seal_sig = ? WHERE session_id = ?").run(hash, signature, gatewayRow.session_id).changes).toBe(1);
  });
  expect(verifyNativeSessionContinuation(root, sessionId).chain.ok).toBe(false);
  expect(() => resume(sessionId)).toThrow("TAMPERED"); expect(rows()).toEqual(before);
});

test.each(["target-signature", "unrelated-signature", "unrelated-payload"] as const)("%s corruption is refused rather than hidden by incomplete gateway status", (kind) => {
  const sessionId = released();
  const event = rows().find(row => kind === "target-signature" ? row.session_id === sessionId : row.runtime === "gateway")!;
  raw(db => {
    const result = kind === "unrelated-payload"
      ? db.prepare("UPDATE evidence_events SET canonical_payload_inline = ? WHERE id = ?").run("corrupted-fixture-payload", event.id)
      : db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("invalid-fixture-signature", event.id);
    expect(result.changes).toBe(1);
  });
  const corrupted = rows();
  expect(verifyNativeSessionContinuation(root, sessionId).chain.ok).toBe(false);
  expect(() => resume(sessionId)).toThrow("TAMPERED"); expect(rows()).toEqual(corrupted);
});

test("a present malformed seal on the open native target is refused, and a legacy ID is never a native target", () => {
  const sessionId = released(), gatewayId = rows().find(row => row.runtime === "gateway")!.session_id;
  expect(verifyNativeSessionContinuation(root, gatewayId).chain.ok).toBe(false);
  raw(db => { expect(db.prepare("UPDATE sessions SET session_seal_sig = '' WHERE session_id = ?").run(sessionId).changes).toBe(1); });
  expect(verifyNativeSessionContinuation(root, sessionId).chain.ok).toBe(false);
  expect(() => resume(sessionId)).toThrow();
});

test("an ended unrelated legacy session with its seal removed remains a continuation failure", async () => {
  const sessionId = released(), gatewayId = rows().find(row => row.runtime === "gateway")!.session_id;
  await gateway!.close(); gateway = undefined;
  raw(db => { expect(db.prepare("UPDATE sessions SET session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?").run(gatewayId).changes).toBe(1); });
  expect(verifyNativeSessionContinuation(root, sessionId).chain.ok).toBe(false);
  expect(() => resume(sessionId)).toThrow("TAMPERED");
});
