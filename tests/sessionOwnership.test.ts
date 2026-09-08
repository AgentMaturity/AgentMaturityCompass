import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { forkSession, resumeSession } from "../src/session/sessionResume.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { openLedger } from "../src/ledger/ledger.js";
import { SessionService } from "../src/session/sessionService.js";
import { recoverSession } from "../src/session/sessionRecovery.js";
import { readSessionWriter, sessionWriterMeta, SESSION_WRITER_META } from "../src/session/sessionOwnership.js";
import { embedEnvelope, extractEnvelope, SESSION_GENESIS } from "../src/session/sessionTypes.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startOwnerProcess, type OwnerProcess } from "./helpers/sessionOwnerProcess.js";

const roots: string[] = [];
const children: OwnerProcess[] = [];
const identity = { agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const claimant = { pid: process.pid, hostId: "test", bootId: "parent", startedAt: Date.now() };
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "amc-owner-")); roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "ownership-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" }); return dir;
}
async function child(dir: string, mode: string, sessionId?: string) {
  const result = await startOwnerProcess(dir, mode, sessionId); children.push(result); return result;
}
function rows(dir: string, sessionId: string) {
  const store = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}
afterEach(async () => { for (const process of children.splice(0)) await process.kill(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("two genuinely live processes cannot take over the original writer between sealed turns", async () => {
  const dir = workspace(); const a = await child(dir, "sealed"); const sessionId = String(a.ready.sessionId);
  const before = rows(dir, sessionId);
  const b = await child(dir, "resume", sessionId);
  expect(b.ready.code).toBe("LIVE_WRITER");
  expect(rows(dir, sessionId)).toEqual(before);
  expect(await a.command("continue")).toEqual({ continued: true });
  expect(verifyLedgerIntegrity(dir).chain).toEqual({ ok: true, errors: [] });
});

test("a genuine crash after turn/end gets a recovery acknowledgement before the next turn", async () => {
  const dir = workspace(); const a = await child(dir, "ended"); const sessionId = String(a.ready.sessionId);
  const before = rows(dir, sessionId); await a.kill();
  const result = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  try {
    expect(result.report.recovery?.verdict).toBe("RECOVERED");
    expect(result.report.recovery?.syntheticTurnEnds).toBe(0);
    result.service.startTurn({ trigger: "user" }); result.service.recordUserMessage("next");
    result.service.endTurn({ reason: "complete" }); result.service.sealTurn();
    const after = rows(dir, sessionId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.filter((row) => row.event_type === "turn/end")).toHaveLength(2);
    expect(after.some((row) => row.event_type === "session/recovered")).toBe(true);
    expect(after.filter((row) => row.event_type === "turn/seal")).toHaveLength(2);
    result.service.close({ reason: "completed" });
    expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
  } finally { result.service.simulateCrash(); }
});

test("explicit release admits only one competing resumer and preserves the signed prefix", async () => {
  const dir = workspace(); const a = await child(dir, "sealed"); const sessionId = String(a.ready.sessionId);
  expect(await a.command("release")).toEqual({ released: true });
  const before = rows(dir, sessionId);
  expect(before[before.length - 1]?.event_type).toBe("session/release");
  const contenders = await Promise.all([child(dir, "resume", sessionId), child(dir, "resume", sessionId)]);
  expect(contenders.filter((process) => process.ready.ready === true)).toHaveLength(1);
  expect(rows(dir, sessionId).slice(0, before.length)).toEqual(before);
  expect(rows(dir, sessionId).filter((row) => row.event_type === "session/resume")).toHaveLength(1);
  expect(verifyLedgerIntegrity(dir).chain.ok).toBe(true);
});

test("a second genuine crash can recover after an earlier recovery claim", async () => {
  const dir = workspace(); const a = await child(dir, "tool"); const sessionId = String(a.ready.sessionId); await a.kill();
  const first = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  expect(first.report.recovery?.unknownToolOutcomes).toBe(1); first.service.releaseWithoutClosing();
  const b = await child(dir, "resume-tool", sessionId); expect(b.ready.ready).toBe(true); await b.kill();
  const second = resumeSession({ workspace: dir, sessionId, claimant, staleAfterMs: 0, ...identity });
  expect(second.report.recovery?.verdict).toBe("RECOVERED");
  expect(second.report.recovery?.unknownToolOutcomes).toBe(1);
  second.service.close({ reason: "completed" });
  const all = rows(dir, sessionId);
  expect(all.filter((row) => row.event_type === "session/recovery-claim")).toHaveLength(2);
  expect(all.filter((row) => row.event_type === "tool/result")).toHaveLength(2);
  expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
});

function blobs(dir: string): Record<string, string> {
  const root = join(dir, ".amc", "blobs"); const out: Record<string, string> = {};
  const walk = (path: string) => { if (!existsSync(path)) return; for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name); if (entry.isDirectory()) walk(full); else out[full] = sha256Hex(readFileSync(full));
  } }; walk(root); return out;
}

test.each(["single", "batch"])("%s append rejects a stale head before writing payloads or rows", (kind) => {
  const dir = workspace(); const service = new SessionService(dir); service.open(identity);
  const sessionId = service.sessionId; const head = rows(dir, sessionId)[0]!;
  const owner = readSessionWriter(head)!; const envelope = extractEnvelope(head.meta_json)!;
  service.recordSystemPrompt("advance the live writer");
  const beforeRows = rows(dir, sessionId); const beforeBlobs = blobs(dir);
  const ledger = openLedger(dir);
  try {
    const input = { sessionId, runtime: "amc" as const, eventType: "user/message" as const, payload: "must never be materialized",
      meta: embedEnvelope({ [SESSION_WRITER_META]: sessionWriterMeta(owner) }, { ...envelope, seq: 1, prevSessionEventHash: head.event_hash }),
      sessionWriteFence: { owner, mode: "append" as const, head: { eventId: head.id, eventHash: head.event_hash, seq: 0 } } };
    expect(() => kind === "single" ? ledger.appendEvidenceDetailed(input) : ledger.appendEvidenceBatch([input])).toThrow(kind === "single" ? /STALE_HEAD/ : /individual atomic appends/);
    expect(() => ledger.appendEvidenceDetailed({ sessionId, runtime: "amc", eventType: "stdout", payload: "also must not be materialized" })).toThrow(/INVALID_FENCE/);
    expect(rows(dir, sessionId)).toEqual(beforeRows); expect(blobs(dir)).toEqual(beforeBlobs);
  } finally { ledger.close(); service.close({ reason: "completed" }); }
});

test("a rejected mixed batch cannot leave an earlier legacy blob or signed blob-index mutation", () => {
  const dir = workspace(); const service = new SessionService(dir); service.open(identity);
  const ledger = openLedger(dir);
  try {
    ledger.startSession({ sessionId: "legacy", runtime: "unknown", binaryPath: "test", binarySha256: sha256Hex("test") });
    const beforeRows = ledger.getAllEvents(); const beforeBlobs = blobs(dir);
    expect(() => ledger.appendEvidenceBatch([
      { sessionId: "legacy", runtime: "unknown", eventType: "stdout", payload: "must not create the first batch blob" },
      { sessionId: service.sessionId, runtime: "amc", eventType: "stdout", payload: "unfenced native append" }
    ])).toThrow(/individual atomic appends/);
    expect(ledger.getAllEvents()).toEqual(beforeRows); expect(blobs(dir)).toEqual(beforeBlobs);
  } finally { ledger.close(); service.close({ reason: "completed" }); }
});

test("JSONL resume and recovery fail closed without appending", () => {
  const dir = workspace(); const store = openSessionEventStore(dir, "jsonl"); const service = new SessionService(dir, store);
  service.open(identity); service.releaseWithoutClosing(); const sessionId = service.sessionId;
  const before = rows(dir, sessionId);
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/JSONL resume requires atomic ownership/);
  const recovery = recoverSession({ workspace: dir, sessionId, claimant, force: true });
  expect(recovery.verdict).toBe("INDETERMINATE"); expect(recovery.reason).toMatch(/JSONL recovery requires atomic ownership/);
  expect(rows(dir, sessionId)).toEqual(before);
});

test("legacy unowned sessions remain readable and forkable but cannot be resumed", () => {
  const dir = workspace(); const ledger = openLedger(dir); const sessionId = "legacy-native";
  try {
    ledger.startSession({ sessionId, runtime: "amc", binaryPath: "default", binarySha256: identity.compositionDigest });
    ledger.appendEvidenceDetailed({ sessionId, runtime: "amc", eventType: "session/open",
      meta: embedEnvelope(identity, { v: 1, sessionId, seq: 0, prevSessionEventHash: SESSION_GENESIS, turn: null, step: null, surface: { op: "none" }, synthetic: false }) });
  } finally { ledger.close(); }
  const before = rows(dir, sessionId);
  expect(verifyLedgerIntegrity(dir).chain.ok).toBe(true);
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/no supported signed writer ownership/);
  const fork = forkSession({ workspace: dir, parentSessionId: sessionId, claimant, ...identity });
  fork.service.close({ reason: "completed" });
  expect(fork.parent.finalEventHash).toBe(before[0]!.event_hash);
  expect(rows(dir, sessionId)).toEqual(before); expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
});

test("malformed low-level fence modes and tokens cannot create unreadable ownership", () => {
  const dir = workspace(); const service = new SessionService(dir); service.open(identity);
  const sessionId = service.sessionId; const head = rows(dir, sessionId)[0]!; const owner = readSessionWriter(head)!;
  const ledger = openLedger(dir); const beforeBlobs = blobs(dir);
  try {
    for (const [mode, token] of [["unexpected", owner.token], ["append", 123]]) {
      const invalidOwner = { ...owner, token };
      const input = { sessionId, runtime: "amc", eventType: "user/message", payload: "must not persist",
        meta: embedEnvelope({ [SESSION_WRITER_META]: { v: 1, ...invalidOwner, state: "active" } },
          { ...extractEnvelope(head.meta_json)!, seq: 1, prevSessionEventHash: head.event_hash }),
        sessionWriteFence: { owner: invalidOwner, mode, head: { eventId: head.id, eventHash: head.event_hash, seq: 0 } } };
      expect(() => ledger.appendEvidenceDetailed(input as unknown as Parameters<typeof ledger.appendEvidenceDetailed>[0])).toThrow(/INVALID_FENCE/);
    }
    expect(rows(dir, sessionId)).toEqual([head]); expect(blobs(dir)).toEqual(beforeBlobs);
  } finally { ledger.close(); service.close({ reason: "completed" }); }
});
