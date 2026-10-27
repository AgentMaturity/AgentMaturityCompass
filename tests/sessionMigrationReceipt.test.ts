import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { verifyLedgerIntegrity } from "../src/ledger/ledgerVerification.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import type { SessionWriterOwner } from "../src/session/sessionOwnership.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { SessionService } from "../src/session/sessionService.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

// P2-12: a session written by a version-1 writer (no epoch, no lease) gets one signed `session/migration` row when a
// version-2 writer first appends to it. Earlier rows are never rewritten.
const legacy = vi.hoisted(() => ({ on: false }));
vi.mock("../src/session/sessionOwnership.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/session/sessionOwnership.js")>();
  // What a pre-P2-12 binary wrote: `{ v: 1, token, pid, hostId, state }`.
  const sessionWriterMeta = (owner: SessionWriterOwner, released = false) => legacy.on
    ? { v: 1, token: owner.token, pid: owner.pid, hostId: owner.hostId, state: released ? "released" : "active" }
    : actual.sessionWriterMeta(owner, released);
  return { ...actual, sessionWriterMeta };
});

const roots: string[] = [];
const identity = { agentId: "default", harnessVersion: "ownership-test", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") };
const claimant = { pid: process.pid, hostId: "test", bootId: "parent", startedAt: Date.now() };
afterEach(() => { legacy.on = false; for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function rows(dir: string, sessionId: string) {
  const store = openSessionEventStore(dir, undefined, { readOnly: true });
  try { return store.readSessionEvents(sessionId); } finally { store.close(); }
}

test("a version-1 owner gets exactly one session/migration row and its earlier rows stay byte-identical", () => {
  const dir = mkdtempSync(join(tmpdir(), "amc-migration-")); roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  legacy.on = true;
  const old = new SessionService(dir); old.open(identity);
  old.startTurn({ trigger: "user" }); old.recordUserMessage("written by a version-1 writer"); old.endTurn({ reason: "complete" }); old.sealTurn();
  const sessionId = old.sessionId; old.releaseWithoutClosing();
  legacy.on = false;
  const before = rows(dir, sessionId);
  expect(before.every((row) => JSON.parse(row.meta_json).amcSessionWriter.v === 1)).toBe(true);

  const first = resumeSession({ workspace: dir, sessionId, claimant, ...identity });
  first.service.releaseWithoutClosing();
  const second = resumeSession({ workspace: dir, sessionId, claimant, ...identity });
  second.service.close({ reason: "completed" });

  const after = rows(dir, sessionId);
  expect(after.slice(0, before.length)).toEqual(before);
  const migrations = after.filter((row) => row.event_type === "session/migration");
  expect(migrations).toHaveLength(1);
  expect(after[before.length]!.event_type).toBe("session/resume");
  expect(after[before.length + 1]!.event_type).toBe("session/migration");
  expect(JSON.parse(migrations[0]!.meta_json)).toMatchObject({ fromVersion: 1, toVersion: 2, sourceHeadEventId: before.at(-1)!.id,
    sourceHeadHash: before.at(-1)!.event_hash, reason: "writer-meta-v2: epoch and lease fencing (P2-12)",
    amcSessionWriter: { v: 2, epoch: 1, state: "active" } });
  expect(verifyLedgerIntegrity(dir).errors).toEqual([]);
});

test("a version-2 writer cannot be followed by a version-1 row: a downgrade is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "amc-migration-")); roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  const service = new SessionService(dir); service.open(identity);
  const before = rows(dir, service.sessionId);
  legacy.on = true;
  try {
    expect(() => service.recordSystemPrompt("a stale binary's row")).toThrow(/INVALID_FENCE/);
  } finally { legacy.on = false; }
  expect(rows(dir, service.sessionId)).toEqual(before);
  service.close({ reason: "completed" });
});
