import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import * as store from "../src/autonomy/scheduleStore.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { verifySignedFileWithAuditor } from "../src/org/orgSigner.js";
import * as orgPairs from "../src/org/preparedOrgPairs.js";
import * as fsUtils from "../src/utils/fs.js";
import { setMode } from "../src/mode/mode.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { canonicalMetadataForHash } from "../src/ledger/eventHash.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { EvidenceEvent } from "../src/types.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function workspace() {
  for (const key of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(key, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "native-schedule-recovery-fixture-only");
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-schedule-recovery-")));
  dirs.push(dir); initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  store.saveSchedules(dir, [{ id: "review", runAs: "reader", goal: "review only", maxRounds: 2,
    everyMs: 60_000, enabled: true, scope: ["READ_ONLY"] }]);
  return dir;
}
function digest(dir: string) {
  const read = store.readSchedules(dir); if (!read.ok) throw new Error(read.reason); return read.digest;
}
function stateBytes(dir: string) { return readFileSync(join(dir, ".amc", "schedule-state.json"), "utf8"); }
function claim(dir: string, now = 1_000_000, backend: "sqlite" | "jsonl" = "sqlite", duplicate = false) {
  const owned = store.claimDueRun(dir, "review", now, digest(dir));
  if (!owned.ok) throw new Error(owned.reason);
  const session = new SessionService(dir, openSessionEventStore(dir, backend));
  try {
    session.open({ sessionId: `recovery-${owned.claimId}`, agentId: "default", harnessVersion: "schedule-recovery-fixture",
      compositionDigest: "fixture-composition", policyDigest: "fixture-policy" });
    const projection = { eventType: "audit" as const, payload: "Native schedule occurrence claimed before dispatch",
      meta: { type: "native_schedule_claimed", scheduleId: "review", claimId: owned.claimId,
        schedulesDigest: owned.configDigest, parentSessionId: session.sessionId, now } };
    session.recordProjectedEvidence(projection);
    if (duplicate) session.recordProjectedEvidence(projection);
  } finally { session.disposeWithoutClosing(); }
  const event = loadSessionEventHistory({ workspace: dir }).events.at(-1)!;
  return { ...owned, event };
}
// Adversarial signed fixtures: ownership checks must fail for their own reason,
// independently of the metadata signature guard.
function rewriteSignedOwner(dir: string, change: (meta: Record<string, unknown>) => void) {
  const path = join(dir, ".amc", "jsonl", "events.jsonl");
  const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as EvidenceEvent);
  const row = rows.at(-1)!; const meta = JSON.parse(row.meta_json) as Record<string, unknown>; change(meta);
  row.meta_json = JSON.stringify(meta);
  const canonical = canonicalMetadataForHash({ id: row.id, ts: row.ts, sessionId: row.session_id, runtime: row.runtime,
    eventType: row.event_type, payloadPath: row.canonical_payload_path ?? row.payload_path,
    payloadInline: row.canonical_payload_inline ?? row.payload_inline, metaJson: row.meta_json });
  row.event_hash = sha256Hex(`${row.prev_event_hash}${canonical}${row.payload_sha256}`);
  row.writer_sig = signHexDigest(row.event_hash, getPrivateKeyPem(dir, "monitor"));
  writeFileSync(path, rows.map(value => JSON.stringify(value)).join("\n") + "\n");
  expect(loadSessionEventHistory({ workspace: dir }).events.at(-1)!.id).toBe(row.id);
}
function deadOwner() {
  return vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
}
function close(dir: string, claimId: string, expectedDigest = digest(dir)) {
  return store.closeInterruptedClaim(dir, "review", claimId, expectedDigest);
}

describe("audited closure of an interrupted native schedule occurrence", () => {
  it.each(["sqlite", "jsonl"] as const)("closes a verified dead %s owner as interrupted without spending another occurrence", async backend => {
    const dir = workspace(); const owned = claim(dir, 1_000_000, backend); const beforeConfig = readFileSync(store.schedulesPath(dir));
    const beforeSignature = readFileSync(`${store.schedulesPath(dir)}.sig`); deadOwner();
    expect(store.dueSchedules(dir, 9_000_000)).toEqual([]);
    const result = await close(dir, owned.claimId);
    expect(dirname(result.auditPath)).toBe(join(".amc", "schedule-closures"));
    expect(basename(result.auditPath)).toMatch(/^[a-f0-9-]+\.json$/);
    const auditPath = join(dir, result.auditPath);
    expect(verifySignedFileWithAuditor(dir, auditPath).valid).toBe(true);
    expect(JSON.parse(readFileSync(auditPath, "utf8"))).toMatchObject({
      auditType: "NATIVE_SCHEDULE_CLOSE_INTERRUPTED", phase: "authorized", scheduleId: "review", claimId: owned.claimId,
      configDigest: owned.configDigest, claimedConfigDigest: owned.configDigest,
      sourceEventId: owned.event.id, sourceEventHash: owned.event.event_hash, reason: "interrupted", ok: false
    });
    const status = store.scheduleStatus(dir, 1_000_001).schedules[0]!;
    expect(status).toMatchObject({ lastClaimedTs: 1_000_000, inFlightSince: null, claimId: null, consecutiveFailures: 1,
      lastOutcome: { claimId: owned.claimId, ok: false, reason: "interrupted", auditPath: result.auditPath } });
    expect(store.interruptedClaims(dir)).toEqual([]);
    expect(store.dueSchedules(dir, 1_059_999)).toEqual([]);
    expect(store.dueSchedules(dir, 1_060_000)).toHaveLength(1);
    expect(readFileSync(store.schedulesPath(dir))).toEqual(beforeConfig);
    expect(readFileSync(`${store.schedulesPath(dir)}.sig`)).toEqual(beforeSignature);
    expect(loadSessionEventHistory({ workspace: dir }).events.at(-1)!.id).toBe(owned.event.id);
  });

  it("requires exact nonempty claim and current configuration pins, preserving the claim on refusal", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    for (const [claimId, expectedDigest] of [["wrong-claim", digest(dir)], ["", digest(dir)],
      [owned.claimId, "0".repeat(64)], [owned.claimId, ""], [owned.claimId, undefined]]) {
      await expect(store.closeInterruptedClaim(dir, "review", claimId!, expectedDigest as string)).rejects.toThrow(/claim|digest/i);
      expect(stateBytes(dir)).toBe(before);
    }
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("refuses a live owner even if its heartbeat and schedule timestamps are old", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir);
    await expect(close(dir, owned.claimId)).rejects.toThrow(/alive|live/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("refuses unknown liveness instead of treating an inaccessible owner as dead", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir);
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("inaccessible"), { code: "EPERM" }); });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/liveness|live/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("does not let fabricated unsigned claim state bypass authenticated ownership", async () => {
    const dir = workspace(); claim(dir); const raw = JSON.parse(stateBytes(dir)); raw.schedules.review.claimId = "fabricated-claim";
    writeFileSync(join(dir, ".amc", "schedule-state.json"), JSON.stringify(raw)); const before = stateBytes(dir); deadOwner();
    await expect(close(dir, "fabricated-claim")).rejects.toThrow(/signed|authenticated|claim/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it.each(["remote", "missing", "released"] as const)("refuses %s signed ownership without trusting a mutable local PID", async kind => {
    const dir = workspace(); const owned = claim(dir, 1_000_000, "jsonl"); const before = stateBytes(dir); deadOwner();
    rewriteSignedOwner(dir, meta => {
      if (kind === "missing") delete meta.amcSessionWriter;
      else if (kind === "released") (meta.amcSessionWriter as Record<string, unknown>).state = "released";
      else (meta.amcSessionWriter as Record<string, unknown>).hostId = "different-host.fixture";
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/writer|ownership|liveness/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it.each(["timestamp", "parent-session", "configuration-digest"] as const)("requires signed claim %s metadata to match the occurrence", async kind => {
    const dir = workspace(); const owned = claim(dir, 1_000_000, "jsonl"); const before = stateBytes(dir); deadOwner();
    rewriteSignedOwner(dir, meta => {
      if (kind === "timestamp") meta.now = 1_000_001;
      else if (kind === "parent-session") meta.parentSessionId = "another-session";
      else meta.schedulesDigest = "malformed-digest";
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/claim|occurrence/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("refuses altered claim evidence instead of trusting unsigned ownership metadata", async () => {
    const dir = workspace(); const owned = claim(dir, 1_000_000, "jsonl"); const before = stateBytes(dir); deadOwner();
    const path = join(dir, ".amc", "jsonl", "events.jsonl");
    const rows = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line) as EvidenceEvent);
    const row = rows.at(-1)!; const metadata = JSON.parse(row.meta_json); metadata.claimId = "forged";
    row.meta_json = JSON.stringify(metadata); writeFileSync(path, rows.map(value => JSON.stringify(value)).join("\n") + "\n");
    await expect(close(dir, owned.claimId)).rejects.toThrow(/TAMPERED|signature|verified|evidence/i);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("requires one unique authenticated claim projection", async () => {
    const dir = workspace(); const owned = claim(dir, 1_000_000, "jsonl", true); const before = stateBytes(dir); deadOwner();
    await expect(close(dir, owned.claimId)).rejects.toThrow(/unique|claim/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("refuses an unsigned state rollback to an older signed claim when a newer occurrence exists", async () => {
    const dir = workspace(); const first = claim(dir); const oldState = stateBytes(dir);
    store.completeRun(dir, "review", { ok: false, summary: "original settled" }, first.claimId);
    const second = claim(dir, 1_060_000); expect(second.claimId).not.toBe(first.claimId);
    writeFileSync(join(dir, ".amc", "schedule-state.json"), oldState); deadOwner();
    await expect(close(dir, first.claimId)).rejects.toThrow(/latest|claim/i);
    expect(stateBytes(dir)).toBe(oldState);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("refuses the original signed claim id when mutable state names a different current claim", async () => {
    const dir = workspace(); const owned = claim(dir); const raw = JSON.parse(stateBytes(dir)); raw.schedules.review.claimId = "different-current-claim";
    writeFileSync(join(dir, ".amc", "schedule-state.json"), JSON.stringify(raw)); const before = stateBytes(dir); deadOwner();
    await expect(close(dir, owned.claimId)).rejects.toThrow(/matching|claim/i);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("refuses legacy claims with no authenticated native occurrence projection", async () => {
    const dir = workspace(); const owned = store.claimDueRun(dir, "review", 1_000_000, digest(dir));
    if (!owned.ok) throw new Error(owned.reason);
    const before = stateBytes(dir); deadOwner();
    await expect(close(dir, owned.claimId)).rejects.toThrow(/history|claim|evidence/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("preserves current authority when disable changed the reviewed configuration since the claim", async () => {
    const dir = workspace(); const owned = claim(dir); store.manageSchedule(dir, digest(dir), { kind: "disable", id: "review" });
    const currentDigest = digest(dir); deadOwner();
    await expect(close(dir, owned.claimId, owned.configDigest)).rejects.toThrow(/digest/i);
    const result = await close(dir, owned.claimId, currentDigest);
    expect(JSON.parse(readFileSync(join(dir, result.auditPath), "utf8"))).toMatchObject({
      configDigest: currentDigest, claimedConfigDigest: owned.configDigest
    });
    expect(store.scheduleStatus(dir, 9_000_000).schedules[0]).toMatchObject({ enabled: false, due: false });
  });

  it("requires owner mode even for an exact dead claim", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner(); setMode(dir, "agent");
    await expect(close(dir, owned.claimId)).rejects.toThrow(/agent mode/i);
    expect(stateBytes(dir)).toBe(before);
  });

  it("refuses a symlinked audit directory before writing outside the workspace", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "amc-schedule-audit-outside-"))); dirs.push(outside);
    symlinkSync(outside, join(dir, ".amc", "schedule-closures"), "junction");
    await expect(close(dir, owned.claimId)).rejects.toThrow(/audit|directory|link/i);
    expect(stateBytes(dir)).toBe(before); expect(readdirSync(outside)).toEqual([]);
  });

  it("leaves the claim unchanged if audit preparation cannot sign", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockRejectedValueOnce(new Error("audit signer unavailable"));
    await expect(close(dir, owned.claimId)).rejects.toThrow(/audit signer unavailable/);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("retains a signed authorization after state publication fails and retries with a distinct audit", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const write = fsUtils.writeFileAtomic; let refuseState = true;
    vi.spyOn(fsUtils, "writeFileAtomic").mockImplementation((path, ...args) => {
      if (refuseState && path === join(dir, ".amc", "schedule-state.json")) {
        refuseState = false; throw new Error("operational state publication failed");
      }
      return write(path, ...args);
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/operational state publication failed/);
    expect(stateBytes(dir)).toBe(before); expect(store.interruptedClaims(dir)[0]?.claimId).toBe(owned.claimId);
    const auditDir = join(dir, ".amc", "schedule-closures");
    const first = readdirSync(auditDir).filter(name => name.endsWith(".json")); expect(first).toHaveLength(1);
    const firstPath = join(auditDir, first[0]!); const firstBytes = readFileSync(firstPath); const firstSignature = readFileSync(`${firstPath}.sig`);
    expect(JSON.parse(firstBytes.toString("utf8"))).toMatchObject({ phase: "authorized", claimId: owned.claimId, reason: "interrupted", ok: false });
    expect(verifySignedFileWithAuditor(dir, firstPath).valid).toBe(true);
    const result = await close(dir, owned.claimId);
    expect(join(dir, result.auditPath)).not.toBe(firstPath);
    expect(readdirSync(auditDir).filter(name => name.endsWith(".json"))).toHaveLength(2);
    expect(readFileSync(firstPath)).toEqual(firstBytes); expect(readFileSync(`${firstPath}.sig`)).toEqual(firstSignature);
    expect(store.scheduleStatus(dir, 1_000_001).schedules[0]).toMatchObject({ inFlightSince: null, consecutiveFailures: 1,
      lastOutcome: { reason: "interrupted", auditPath: result.auditPath } });
  });

  it("rechecks the reviewed configuration after the async audit signer returns", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const prepare = orgPairs.prepareOrgPairsAsync;
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockImplementationOnce(async (...args) => {
      const prepared = await prepare(...args);
      store.manageSchedule(dir, digest(dir), { kind: "disable", id: "review" });
      return prepared;
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/digest|configuration/i);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("does not overwrite a completion that wins while audit signing is pending", async () => {
    const dir = workspace(); const owned = claim(dir); deadOwner(); let completedState = "";
    const prepare = orgPairs.prepareOrgPairsAsync;
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockImplementationOnce(async (...args) => {
      const prepared = await prepare(...args);
      store.completeRun(dir, "review", { ok: false, summary: "actual completion won" }, owned.claimId);
      completedState = stateBytes(dir); return prepared;
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/claim|changed/i);
    expect(completedState).not.toBe(""); expect(stateBytes(dir)).toBe(completedState);
    expect(store.scheduleStatus(dir, 1_000_001).schedules[0]?.lastOutcome?.summary).toBe("actual completion won");
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("rechecks process liveness after signing instead of using an earlier dead-owner observation", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); const kill = deadOwner();
    const prepare = orgPairs.prepareOrgPairsAsync;
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockImplementationOnce(async (...args) => {
      const prepared = await prepare(...args); kill.mockImplementation(() => true); return prepared;
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/alive|live/i);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("reauthenticates the latest native occurrence after audit signing", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const prepare = orgPairs.prepareOrgPairsAsync;
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockImplementationOnce(async (...args) => {
      const prepared = await prepare(...args);
      const session = new SessionService(dir, openSessionEventStore(dir));
      try {
        session.open({ sessionId: "newer-signed-occurrence", agentId: "default", harnessVersion: "schedule-recovery-fixture",
          compositionDigest: "fixture-composition", policyDigest: "fixture-policy" });
        session.recordProjectedEvidence({ eventType: "audit", payload: "Newer signed schedule occurrence",
          meta: { type: "native_schedule_claimed", scheduleId: "review", claimId: "newer-authenticated-claim",
            schedulesDigest: digest(dir), parentSessionId: session.sessionId, now: 1_060_000 } });
      } finally { session.disposeWithoutClosing(); }
      return prepared;
    });
    await expect(close(dir, owned.claimId)).rejects.toThrow(/latest|claim|occurrence/i);
    expect(stateBytes(dir)).toBe(before);
    expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
  });

  it("reacquires the store lock after async audit signing before publishing or changing state", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const prepare = orgPairs.prepareOrgPairsAsync; const lock = store.scheduleLockPath(dir); let fd: number | undefined;
    vi.spyOn(orgPairs, "prepareOrgPairsAsync").mockImplementationOnce(async (...args) => {
      const prepared = await prepare(...args); fd = openSync(lock, "wx", 0o600); return prepared;
    });
    try {
      await expect(close(dir, owned.claimId)).rejects.toThrow(/locked/i);
      expect(stateBytes(dir)).toBe(before); expect(existsSync(lock)).toBe(true);
      expect(existsSync(join(dir, ".amc", "schedule-closures"))).toBe(false);
    } finally { if (fd !== undefined) { closeSync(fd); unlinkSync(lock); } }
  });

  it("does not steal a competing transaction lock or change its claim", async () => {
    const dir = workspace(); const owned = claim(dir); const before = stateBytes(dir); deadOwner();
    const lock = store.scheduleLockPath(dir); const fd = openSync(lock, "wx", 0o600);
    try {
      await expect(close(dir, owned.claimId)).rejects.toThrow(/locked/i);
      expect(existsSync(lock)).toBe(true); expect(stateBytes(dir)).toBe(before);
    } finally { closeSync(fd); unlinkSync(lock); }
  });

  it("rejects repeated or stale closure without discarding a newer owner", async () => {
    const dir = workspace(); const first = claim(dir); deadOwner(); await close(dir, first.claimId);
    const before = stateBytes(dir);
    await expect(close(dir, first.claimId)).rejects.toThrow(/claim/i); expect(stateBytes(dir)).toBe(before);
    const second = claim(dir, 1_060_000); const current = stateBytes(dir);
    await expect(close(dir, first.claimId)).rejects.toThrow(/claim/i);
    expect(stateBytes(dir)).toBe(current); expect(store.interruptedClaims(dir)[0]?.claimId).toBe(second.claimId);
    expect(readdirSync(join(dir, ".amc", "schedule-closures")).filter(name => name.endsWith(".json"))).toHaveLength(1);
  });
});
