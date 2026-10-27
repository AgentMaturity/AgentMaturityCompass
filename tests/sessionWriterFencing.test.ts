import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_AGENT_LOOP_CONFIG } from "../src/agent/loopTypes.js";
import { DEFAULT_RETRY_RUNTIME } from "../src/agent/requestRetry.js";
import { runStep } from "../src/agent/stepRunner.js";
import { EMPTY_TOOL_SEAM } from "../src/agent/toolSeam.js";
import { readHighWater, recordHighWater } from "../src/keys/highWater.js";
import { openLedger } from "../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { SESSION_WRITER_META, sessionWriterMeta } from "../src/session/sessionOwnership.js";
import { embedEnvelope, extractEnvelope } from "../src/session/sessionTypes.js";
import { sessionJournalMarkKey } from "../src/session/writerFence.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import { startOwnerProcess, type OwnerProcess } from "./helpers/sessionOwnerProcess.js";

// P2-12: writer fencing. Every claim raises a signed epoch; a writer whose epoch is no longer the session's fails closed at
// its next append or dispatch, and the refusal is recorded. Remote or unknown owners are taken over only explicitly.
const host = vi.hoisted(() => ({ name: null as string | null }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const hostname = (): string => host.name ?? actual.hostname();
  return { ...actual, hostname, default: { ...actual, hostname } };
});

const LEASE_MS = 60_000;
const roots: string[] = [];
const children: OwnerProcess[] = [];
const identity = { agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const claimant = { pid: process.pid, hostId: "test", bootId: "parent", startedAt: Date.now() };
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fence-")); roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "ownership-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" }); return dir;
}
async function child(dir: string, mode: string, sessionId?: string): Promise<OwnerProcess> {
  const result = await startOwnerProcess(dir, mode, sessionId); children.push(result); return result;
}
function rows(dir: string, sessionId: string) {
  const store = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}
const writerOf = (row: { meta_json: string }) => JSON.parse(row.meta_json).amcSessionWriter as Record<string, unknown>;
function fenceRefusals(dir: string): Record<string, unknown>[] {
  const ledger = openLedger(dir, { readonly: true });
  try {
    return ledger.getAllEvents().map((row) => JSON.parse(row.meta_json) as Record<string, unknown>)
      .filter((meta) => meta.auditType === "SESSION_WRITER_FENCE_REFUSED");
  } finally { ledger.close(); }
}
afterEach(async () => {
  vi.restoreAllMocks(); host.name = null;
  for (const owner of children.splice(0)) { owner.child.kill("SIGCONT"); await owner.kill(); }
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("a second writer is refused while the first is live, and claims epoch 2 after the first is killed", async () => {
  const dir = workspace(); const a = await child(dir, "sealed"); const sessionId = String(a.ready.sessionId);
  expect(writerOf(rows(dir, sessionId)[0]!)).toMatchObject({ v: 2, epoch: 1, leaseMs: LEASE_MS, state: "active" });
  const before = rows(dir, sessionId);
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/LIVE_WRITER/);
  expect(rows(dir, sessionId)).toEqual(before);
  await a.kill();
  const b = resumeSession({ workspace: dir, sessionId, claimant, ...identity });
  try {
    const claim = rows(dir, sessionId).at(-1)!;
    expect(claim.event_type).toBe("session/resume");
    expect(writerOf(claim)).toMatchObject({ v: 2, epoch: 2, pid: process.pid, state: "active" });
  } finally { b.service.close({ reason: "completed" }); }
  expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
});

test("a SIGSTOPped writer resumed after a recorded takeover fails its next dispatch with STALE_EPOCH and appends nothing", async () => {
  const dir = workspace(); const a = await child(dir, "sealed"); const sessionId = String(a.ready.sessionId);
  const lastTs = rows(dir, sessionId).at(-1)!.ts;
  a.child.kill("SIGSTOP");
  try {
    // Alive but silent: refused without the option, and with it until the lease has been expired for one more lease.
    expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/LIVE_WRITER.*--takeover-expired-writer/);
    vi.spyOn(Date, "now").mockReturnValue(lastTs + LEASE_MS + LEASE_MS / 2);
    expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "writer hung" } })).toThrow(/LIVE_WRITER/);
    vi.spyOn(Date, "now").mockReturnValue(lastTs + 3 * LEASE_MS);
    const b = resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "writer hung during incident 42" } });
    const claim = rows(dir, sessionId).at(-1)!;
    expect(writerOf(claim)).toMatchObject({ v: 2, epoch: 2, pid: process.pid });
    expect(JSON.parse(claim.meta_json).takeover).toMatchObject({ reason: "writer hung during incident 42", previousEpoch: 1,
      previousOwner: { pid: a.child.pid }, previousLastRowTs: lastTs, leaseMs: LEASE_MS, leaseExpiredAt: lastTs + LEASE_MS });
    b.service.releaseWithoutClosing();
  } finally { vi.restoreAllMocks(); a.child.kill("SIGCONT"); }
  const before = rows(dir, sessionId);
  expect(await a.command("dispatch")).toMatchObject({ code: "STALE_EPOCH" });
  expect(await a.command("continue")).toMatchObject({ code: "STALE_EPOCH" });
  expect(rows(dir, sessionId)).toEqual(before);
  const refusals = fenceRefusals(dir);
  expect(refusals.length).toBeGreaterThanOrEqual(2);
  expect(refusals[0]).toMatchObject({ sessionId, code: "STALE_EPOCH", writerEpoch: 1, currentEpoch: 2, stage: "dispatch" });
  expect(verifyLedgerIntegrity(dir).chain.ok).toBe(true);
});

test("a remote owner is claimed only after its lease expired one lease ago, only with the option, and the claim records both clocks", () => {
  const dir = workspace();
  host.name = "remote-host.example";
  const remote = new SessionService(dir); remote.open(identity);
  remote.startTurn({ trigger: "user" }); remote.recordUserMessage("remote turn"); remote.endTurn({ reason: "complete" }); remote.sealTurn();
  const sessionId = remote.sessionId; remote.disposeWithoutClosing();
  host.name = null;
  const before = rows(dir, sessionId); const lastTs = before.at(-1)!.ts;
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/LIVE_WRITER: writer liveness on another host/);
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "too early" } })).toThrow(/LIVE_WRITER/);
  expect(rows(dir, sessionId)).toEqual(before);
  vi.spyOn(Date, "now").mockReturnValue(lastTs + 2 * LEASE_MS + 1);
  const b = resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "remote host decommissioned" } });
  try {
    const claim = rows(dir, sessionId).at(-1)!;
    expect(claim.ts).toBe(lastTs + 2 * LEASE_MS + 1);
    expect(JSON.parse(claim.meta_json).takeover).toMatchObject({ reason: "remote host decommissioned", previousEpoch: 1,
      previousOwner: { hostId: "remote-host.example" }, previousLastRowTs: lastTs, leaseExpiredAt: lastTs + LEASE_MS });
    expect(writerOf(claim)).toMatchObject({ epoch: 2 });
    // A duplicate takeover cannot claim the session from the live writer that just took it.
    expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "again" } })).toThrow(/LIVE_WRITER/);
  } finally { b.service.close({ reason: "completed" }); }
  expect(rows(dir, sessionId).slice(0, before.length)).toEqual(before);
});

test("a dispatch raises this machine's mark for the session journal; an older journal or a fork of it is refused", () => {
  const dir = workspace(); const service = new SessionService(dir); service.open(identity);
  service.startTurn({ trigger: "user" }); service.recordUserMessage("before dispatch");
  service.assertWritable();
  const sessionId = service.sessionId; const head = rows(dir, sessionId).at(-1)!;
  const key = sessionJournalMarkKey(dir, sessionId);
  expect(readHighWater(key)).toMatchObject({ sequence: extractEnvelope(head.meta_json)!.seq, sha256: head.event_hash });
  service.endTurn({ reason: "complete" }); service.sealTurn(); service.releaseWithoutClosing();
  const all = rows(dir, sessionId);
  // A fork: the marked sequence now names other bytes than the ones this machine accepted.
  recordHighWater(key, extractEnvelope(all.at(-1)!.meta_json)!.seq, "f".repeat(64));
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/FORK_DETECTED/);
  // An older journal: this machine accepted a later head than the one the workspace now holds (a restored backup).
  recordHighWater(key, extractEnvelope(all.at(-1)!.meta_json)!.seq + 5, "e".repeat(64));
  expect(() => resumeSession({ workspace: dir, sessionId, claimant, ...identity })).toThrow(/ROLLBACK_DETECTED/);
  expect(rows(dir, sessionId)).toEqual(all);
});

test("a claim must raise the epoch by exactly one and may carry only the takeover its replaced owner implies", () => {
  const dir = workspace(); const service = new SessionService(dir); service.open(identity); service.releaseWithoutClosing();
  const sessionId = service.sessionId; const head = rows(dir, sessionId).at(-1)!; const envelope = extractEnvelope(head.meta_json)!;
  const owner = { token: randomUUID(), pid: process.pid, hostId: hostname() };
  const claim = (epoch: number, extra: Record<string, unknown> = {}) => ({ sessionId, runtime: "amc" as const, eventType: "session/resume" as const,
    meta: embedEnvelope({ ...identity, ...extra, [SESSION_WRITER_META]: sessionWriterMeta({ ...owner, epoch }) },
      { ...envelope, seq: envelope.seq + 1, prevSessionEventHash: head.event_hash, turn: null, step: null, surface: { op: "none" } }),
    sessionWriteFence: { owner, mode: "claim" as const, head: { eventId: head.id, eventHash: head.event_hash, seq: envelope.seq } } });
  const ledger = openLedger(dir);
  try {
    expect(() => ledger.appendEvidenceDetailed(claim(1))).toThrow(/INVALID_FENCE: a claim must raise the session's writer epoch by exactly one/);
    expect(() => ledger.appendEvidenceDetailed(claim(3))).toThrow(/INVALID_FENCE: a claim must raise/);
    const forged = { reason: "forged", previousOwner: owner, previousEpoch: 1, previousLastRowTs: head.ts, leaseMs: LEASE_MS, leaseExpiredAt: head.ts + LEASE_MS };
    expect(() => ledger.appendEvidenceDetailed(claim(2, { takeover: forged }))).toThrow(/INVALID_FENCE: the recorded takeover does not match/);
    expect(rows(dir, sessionId).at(-1)!.id).toBe(head.id);
    ledger.appendEvidenceDetailed(claim(2));
    expect(writerOf(rows(dir, sessionId).at(-1)!)).toMatchObject({ token: owner.token, epoch: 2 });
  } finally { ledger.close(); }
});

test("a step whose writer was taken over sends no model request", async () => {
  const dir = workspace(); const stale = new SessionService(dir); stale.open(identity);
  const systemPromptEventId = stale.recordSystemPrompt("fenced step fixture").eventId;
  const sessionId = stale.sessionId; const lastTs = rows(dir, sessionId).at(-1)!.ts;
  // This process's own earlier writer stopped answering: an operator takes the session over after its lease lapsed.
  vi.spyOn(Date, "now").mockReturnValue(lastTs + 3 * LEASE_MS);
  const current = resumeSession({ workspace: dir, sessionId, claimant, ...identity, takeover: { reason: "writer stopped answering" } });
  vi.restoreAllMocks();
  const prepare = vi.fn(() => { throw new Error("a fenced writer must not prepare a model request"); });
  await expect(runStep({ session: stale, llm: { prepare }, tools: EMPTY_TOOL_SEAM, route: { providerId: "fence", model: "fence", params: {} },
    systemPromptEventId, config: DEFAULT_AGENT_LOOP_CONFIG, retryRuntime: DEFAULT_RETRY_RUNTIME, acceptContext: () => {}, notify: () => {} },
  1, 1, new AbortController().signal)).rejects.toThrow(/STALE_EPOCH/);
  expect(prepare).not.toHaveBeenCalled();
  stale.disposeWithoutClosing(); current.service.close({ reason: "completed" });
});
