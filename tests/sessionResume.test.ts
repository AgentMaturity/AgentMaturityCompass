import Database from "better-sqlite3";
import { startOwnerProcess } from "./helpers/sessionOwnerProcess.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { SessionService } from "../src/session/sessionService.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { assertSessionResumeAgent, forkSession, resumeSession, SessionResumeRefused } from "../src/session/sessionResume.js";
import type { RecoveryClaimant } from "../src/session/sessionRecovery.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

/**
 * AMC-1511 — resume and fork signed native sessions across processes.
 *
 * Before this: `SessionService.open({ sessionId })` seeded the chain head from
 * existing rows and then INSERTed a new sessions row, so re-opening threw;
 * every `agent-loop run` sealed its session at exit; recovery was a crash
 * takeover, not an operator flow. A "process B" here is a fresh SessionService
 * over the same workspace — the only state the two share is the ledger.
 */

const roots: string[] = [];
const A: RecoveryClaimant = { pid: 1001, hostId: "host-a", bootId: "boot-1", startedAt: 1_700_000_000 };
const B: RecoveryClaimant = { pid: 2002, hostId: "host-b", bootId: "boot-2", startedAt: 1_700_000_100 };
const OPEN = { agentId: "default", harnessVersion: "test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-resume-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "resume-test-passphrase";
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

/** One complete, sealed turn with a tool call — then the process "exits" without closing. */
function turnWithTool(service: SessionService, text: string, callId: string): void {
  service.startTurn({ trigger: "user" });
  service.recordUserMessage(text);
  service.startStep();
  service.recordToolCall({ toolCallId: callId, toolName: "bash", dispatch: "native", parentToken: null, args: JSON.stringify({ command: "true" }) });
  service.recordToolResult({ toolCallId: callId, content: "ok", outcome: "OK", exitCode: 0, timedOut: false, denied: false });
  service.endStep({ stopReason: "tool_use", usage: null });
  service.startStep();
  service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "done", stopReason: "end_turn" });
  service.endStep({ stopReason: "end_turn", usage: null });
  service.endTurn({ reason: "complete" });
  service.sealTurn();
}

function processA(dir: string): { sessionId: string; rows: readonly EvidenceEvent[] } {
  const a = new SessionService(dir);
  a.open(OPEN);
  a.recordSystemPrompt("You are the agent under test.");
  turnWithTool(a, "first", "call-1");
  a.releaseWithoutClosing();
  return { sessionId: a.sessionId, rows: rowsOf(dir, a.sessionId) };
}

/** Reach under the ledger's immutability triggers — deliberately, to stage tampering. */
function openRaw(dir: string): Database.Database {
  const db = new Database(join(dir, ".amc", "evidence.sqlite"));
  for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  return db;
}

function rowsOf(dir: string, sessionId: string): readonly EvidenceEvent[] {
  const store = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}

describe("AMC-1511 — resume across processes", () => {
  test("a different agent cannot take over or recover a signed session", () => {
    const dir = workspace();
    const a = new SessionService(dir);
    a.open({ ...OPEN, agentId: "reviewer" });
    a.startTurn({ trigger: "user" });
    a.recordUserMessage("unclosed turn must not be recovered by another identity");
    const before = rowsOf(dir, a.sessionId);
    try {
      expect(() => assertSessionResumeAgent({ workspace: dir, sessionId: a.sessionId, agentId: "default" })).toThrow(/AGENT_MISMATCH/);
      expect(() => resumeSession({ workspace: dir, sessionId: a.sessionId, claimant: B, ...OPEN })).toThrow(/AGENT_MISMATCH/);
      expect(rowsOf(dir, a.sessionId)).toEqual(before);
    } finally { a.releaseWithoutClosing(); }
  });

  test("B verifies and resumes A's session: byte-consistent history, old signatures kept, new evidence appended", () => {
    const dir = workspace();
    const { sessionId, rows: aRows } = processA(dir);

    const { service: b, report } = resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN });
    expect(report.verdict).toBe("RESUMED");
    expect(report.observedHeadEventId).toBe(aRows[aRows.length - 1]!.id);

    // History as B sees it is A's rows, hash for hash, before B appends anything else.
    const prefix = b.readEvents().slice(0, aRows.length);
    expect(prefix.map((r) => r.event_hash)).toEqual(aRows.map((r) => r.event_hash));
    expect(prefix.map((r) => r.writer_sig)).toEqual(aRows.map((r) => r.writer_sig));

    turnWithTool(b, "second", "call-2");
    b.close({ reason: "completed" });

    const all = rowsOf(dir, sessionId);
    const seqs = all.map((r) => extractEnvelope(r.meta_json)?.seq).filter((s): s is number => typeof s === "number");
    expect(seqs).toEqual(seqs.map((_, i) => i));                        // one unbroken chain, seq 0..n
    expect(all.filter((r) => r.event_type === "session/resume")).toHaveLength(1);
    expect(all.filter((r) => r.event_type === "turn/seal")).toHaveLength(2);
    const verdict = verifyLedgerIntegrity(dir);
    expect(verdict.errors).toEqual([]);
    expect(verdict.sessions.closed).toContain(sessionId);
  });

  test("tampered history is refused before anything is appended", () => {
    const dir = workspace();
    const { sessionId } = processA(dir);
    const db = openRaw(dir);
    const row = db.prepare("SELECT rowid AS rid, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/message'").get(sessionId) as { rid: number; meta_json: string };
    const meta = JSON.parse(row.meta_json); meta.amcSession.seq = 42;
    db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
    db.close();
    const before = rowsOf(dir, sessionId).length;

    expect(() => resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN })).toThrow(SessionResumeRefused);
    try { resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN }); } catch (e) { expect((e as SessionResumeRefused).code).toBe("TAMPERED"); }
    expect(rowsOf(dir, sessionId)).toHaveLength(before);
  });

  test("a sealed session cannot be resumed — fork it", () => {
    const dir = workspace();
    const a = new SessionService(dir); a.open(OPEN); turnWithTool(a, "x", "c"); a.close({ reason: "completed" });
    try { resumeSession({ workspace: dir, sessionId: a.sessionId, claimant: B, ...OPEN }); expect.unreachable(); }
    catch (e) { expect((e as SessionResumeRefused).code).toBe("SEALED"); }
  });

  test("a future envelope version is refused, not migrated in place", () => {
    const dir = workspace();
    const { sessionId } = processA(dir);
    const db = openRaw(dir);
    const row = db.prepare("SELECT rowid AS rid, meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1").get(sessionId) as { rid: number; meta_json: string };
    const meta = JSON.parse(row.meta_json); meta.amcSession.v = 2;
    db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
    db.close();
    const before = JSON.stringify(rowsOf(dir, sessionId));
    try { resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN }); expect.unreachable(); }
    catch (e) { expect((e as SessionResumeRefused).code).toBe("UNSUPPORTED_FORMAT"); }
    expect(JSON.stringify(rowsOf(dir, sessionId))).toBe(before);
  });

  test("a live writer wins: a second resumer is refused while the first is mid-work", () => {
    const dir = workspace();
    const { sessionId } = processA(dir);
    const first = resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN });
    first.service.startTurn({ trigger: "resume" });              // mid-turn, not stale
    try { resumeSession({ workspace: dir, sessionId, claimant: { ...A, pid: 3003 }, ...OPEN }); expect.unreachable(); }
    catch (e) { expect((e as SessionResumeRefused).code).toBe("LIVE_WRITER"); }
  });

  test("repeated resume: A → B → C keeps one monotonic chain that verifies", () => {
    const dir = workspace();
    const { sessionId } = processA(dir);
    const b = resumeSession({ workspace: dir, sessionId, claimant: B, ...OPEN }).service;
    turnWithTool(b, "second", "call-2"); b.releaseWithoutClosing();
    const c = resumeSession({ workspace: dir, sessionId, claimant: { ...A, pid: 3003 }, ...OPEN }).service;
    turnWithTool(c, "third", "call-3"); c.close({ reason: "completed" });
    const all = rowsOf(dir, sessionId);
    expect(all.filter((r) => r.event_type === "session/resume")).toHaveLength(2);
    expect(all.filter((r) => r.event_type === "turn/seal")).toHaveLength(3);
    expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
  });

  test("a crash after a side effect is recovered, never replayed", async () => {
    const dir = workspace();
    const a = await startOwnerProcess(dir, "tool");
    const sessionId = String(a.ready.sessionId); await a.kill();

    const { service: b, report } = resumeSession({ workspace: dir, sessionId, claimant: B, staleAfterMs: 0, ...OPEN });
    expect(report.recovery?.verdict).toBe("RECOVERED");
    turnWithTool(b, "after the crash", "call-new"); b.close({ reason: "completed" });
    const calls = rowsOf(dir, sessionId).filter((r) => r.event_type === "tool/call");
    expect(calls.map((r) => JSON.parse(r.meta_json).toolCallId)).toEqual(["call-crash-1", "call-new"]);
  });

  test("a missing session is refused", () => {
    const dir = workspace();
    try { resumeSession({ workspace: dir, sessionId: "no-such-session", claimant: B, ...OPEN }); expect.unreachable(); }
    catch (e) { expect((e as SessionResumeRefused).code).toBe("MISSING"); }
  });
});

describe("AMC-1511 — fork with verified lineage", () => {
  test("a fork records the parent's verified final hash and leaves the parent untouched", () => {
    const dir = workspace();
    const { sessionId: parentId, rows } = processA(dir);
    const { service: child, parent } = forkSession({ workspace: dir, parentSessionId: parentId, claimant: B, ...OPEN });
    expect(parent.finalEventHash).toBe(rows[rows.length - 1]!.event_hash);
    const open = child.readEvents().find((r) => r.event_type === "session/open")!;
    expect(JSON.parse(open.meta_json).parentSession).toEqual({ sessionId: parentId, finalEventHash: parent.finalEventHash, seq: parent.seq });
    turnWithTool(child, "forked", "call-f"); child.close({ reason: "completed" });
    expect(rowsOf(dir, parentId)).toHaveLength(rows.length);
    expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
  });

  test("forking a tampered parent is refused", () => {
    const dir = workspace();
    const { sessionId: parentId } = processA(dir);
    const db = openRaw(dir);
    const row = db.prepare("SELECT rowid AS rid, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'user/message'").get(parentId) as { rid: number; meta_json: string };
    const meta = JSON.parse(row.meta_json); meta.amcSession.prevSessionEventHash = "0".repeat(64);
    db.prepare("UPDATE evidence_events SET meta_json=? WHERE rowid=?").run(JSON.stringify(meta), row.rid);
    db.close();
    try { forkSession({ workspace: dir, parentSessionId: parentId, claimant: B, ...OPEN }); expect.unreachable(); }
    catch (e) { expect((e as SessionResumeRefused).code).toBe("TAMPERED"); }
  });
});
