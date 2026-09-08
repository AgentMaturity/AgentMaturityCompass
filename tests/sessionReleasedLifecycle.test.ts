import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { readSessionWriter, sessionWriterMeta, SESSION_WRITER_META } from "../src/session/sessionOwnership.js";
import { extractEnvelope, SESSION_ENVELOPE_META_KEY } from "../src/session/sessionTypes.js";

const identity = { agentId: "default", harnessVersion: "test", compositionDigest: "0".repeat(64), policyDigest: "0".repeat(64) };
let workspace: string;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "released-lifecycle-fixture-passphrase");
  workspace = mkdtempSync(join(tmpdir(), "amc-released-lifecycle-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function completedTurn(service: SessionService): void {
  service.startTurn({ trigger: "user" });
  service.startStep();
  service.recordUserMessage("A completed fixture turn.");
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "Recorded.", stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null });
  service.endTurn({ reason: "complete" });
  service.sealTurn();
}
function released(): string {
  const service = new SessionService(workspace); service.open(identity);
  completedTurn(service); service.releaseWithoutClosing(); return service.sessionId;
}

describe("signed native release lifecycle projection", () => {
  it("keeps an old deliberate handoff RELEASED instead of instructing crash recovery", () => {
    const id = released();
    const result = verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: -1 });
    expect(result.ok, result.errors.join("; ")).toBe(true);
    expect(result.sessions.released).toEqual([id]);
    expect(result.sessions.open).not.toContain(id);
    expect(result.sessions.interrupted).not.toContain(id);
    expect(result.sessions.closed).not.toContain(id);
  });

  it("does not reuse an older release after a resumed owner leaves an unsealed turn", () => {
    const id = released();
    const { service } = resumeSession({ workspace, sessionId: id, ...identity,
      claimant: { pid: process.pid, hostId: "fixture", bootId: "fixture", startedAt: Date.now() } });
    service.startTurn({ trigger: "user" }); service.startStep(); service.recordUserMessage("Interrupted after resume.");
    service.disposeWithoutClosing();
    const result = verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: -1 });
    expect(result.chain.ok, result.chain.errors.join("; ")).toBe(true);
    expect(result.sessions.interrupted).toContain(id);
    expect(result.sessions.released).not.toContain(id);
  });

  it("does not classify best-effort owner cleanup with an unsealed turn as a completed handoff", () => {
    const service = new SessionService(workspace); service.open(identity);
    service.startTurn({ trigger: "user" }); service.startStep(); service.recordUserMessage("Recovery still needed.");
    const id = service.sessionId; service.disposeWithoutClosing();
    const store = openSessionEventStore(workspace);
    try {
      const rows = store.readSessionEvents(id), head = rows.at(-1);
      if (!head) throw new Error("Fixture has no session head");
      const owner = readSessionWriter(head), envelope = extractEnvelope(head.meta_json);
      if (!owner || !envelope) throw new Error("Fixture has no signed owner/envelope");
      // Recovery's best-effort cleanup can release ownership before repair ends.
      // Model that valid, fenced control row without claiming a turn seal.
      store.appendSessionEvent({ sessionId: id, runtime: "amc", eventType: "session/release", meta: {
        [SESSION_ENVELOPE_META_KEY]: { ...envelope, seq: envelope.seq + 1, prevSessionEventHash: head.event_hash, turn: null, step: null, surface: { op: "none" } },
        [SESSION_WRITER_META]: sessionWriterMeta(owner, true), reason: "recovery-failed"
      }, sessionWriteFence: { owner, mode: "release", head: { eventId: head.id, eventHash: head.event_hash, seq: envelope.seq } } });
    } finally { store.close(); }
    const result = verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: -1 });
    expect(result.chain.ok, result.chain.errors.join("; ")).toBe(true);
    expect(result.sessions.interrupted).toContain(id);
    expect(result.sessions.released).not.toContain(id);
  });

  it("never reports an unauthenticated release as an accepted handoff", () => {
    const id = released();
    const db = new Database(join(workspace, ".amc/evidence.sqlite"));
    try {
      // Fixture-only attacker mutation: verification must still reject it.
      db.exec("DROP TRIGGER IF EXISTS protect_evidence_immutable; DROP TRIGGER IF EXISTS no_update_evidence;");
      db.prepare("UPDATE evidence_events SET writer_sig = 'unsigned' WHERE session_id = ? AND event_type = 'session/release'").run(id);
    } finally { db.close(); }
    const result = verifyLedgerIntegrity(workspace, { sessionStaleAfterMs: -1 });
    expect(result.chain.ok).toBe(false);
    expect(result.chain.errors.join("; ")).toMatch(/signature|unsigned/i);
    expect(result.sessions.released).not.toContain(id);
  });
});
