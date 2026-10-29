import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { prepareOrgPairsAsync } from "../src/org/preparedOrgPairs.js";
import { sha256Hex } from "../src/utils/hash.js";
import { SessionService } from "../src/session/sessionService.js";
import { setMode } from "../src/mode/mode.js";
import { claimDueRun, closeInterruptedClaim, completeRun, readSchedules, saveSchedules, type Schedule } from "../src/autonomy/scheduleStore.js";
import { assertObjectiveSchedule, beginObjectiveRound, finishObjectiveRound, manageObjective, objectivePath,
  readObjective, stopObjective, type ObjectiveRoundAuthority } from "../src/autonomy/objectiveStore.js";

const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup(maxRounds = 3) {
  process.env.AMC_VAULT_PASSPHRASE = "objective-store-test-passphrase";
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-objective-")));
  dirs.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const schedule = { id: "durable", runAs: "worker", goal: "Produce a verified report", maxRounds, everyMs: 60_000, enabled: true,
    scope: ["READ_ONLY"], objective: { version: 1, ownerPrincipal: "owner-one", completionCheck: {
      kind: "file-sha256", path: "report.txt", sha256: "a".repeat(64)
    } } } as Schedule;
  saveSchedules(workspace, [schedule]);
  const digest = readSchedules(workspace);
  if (!digest.ok) throw new Error(digest.reason);
  return { workspace, schedule, digest: digest.digest };
}
function claim(workspace: string, now = 1_000_000) {
  const claimed = claimDueRun(workspace, "durable", now);
  if (!claimed.ok) throw new Error(claimed.reason);
  return { claimId: claimed.claimId, configDigest: claimed.configDigest, round: 1, sessionId: `child-${now}` };
}

describe("signed durable objective authority", () => {
  it("starts only with an explicit owner action and refuses unsigned bytes", async () => {
    const { workspace, digest } = setup();
    expect(readObjective(workspace, "durable")).toBeNull();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    expect(created).toMatchObject({ version: 1, id: "durable", scheduleId: "durable", revision: 1, status: "active",
      ownerPrincipal: "owner-one", roundsUsed: 0, currentRound: null });
    expect(readObjective(workspace, "durable")).toEqual(created);
    const path = objectivePath(workspace, "durable");
    const signature = readFileSync(`${path}.sig`);
    writeFileSync(`${path}.sig`, "{}");
    expect(() => readObjective(workspace, "durable")).toThrow(/signature|admitted/i);
    writeFileSync(`${path}.sig`, signature);
    writeFileSync(path, readFileSync(path, "utf8").replace('"status":"active"', '"status":"paused"'));
    expect(() => readObjective(workspace, "durable")).toThrow(/signature|canonical|admitted/i);
    await expect(manageObjective(workspace, "durable", 1, digest, "resume")).rejects.toThrow(/signature|canonical|admitted/i);
  });

  it("rejects replay or deletion of an older validly signed active revision", async () => {
    const { workspace, digest } = setup();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    const path = objectivePath(workspace, "durable"), original = readFileSync(path), signature = readFileSync(`${path}.sig`);
    const paused = await manageObjective(workspace, "durable", created.revision, digest, "pause");
    expect(paused.status).toBe("paused");
    writeFileSync(path, original); writeFileSync(`${path}.sig`, signature);
    expect(() => readObjective(workspace, "durable")).toThrow(/journal|replay/i);
    await expect(manageObjective(workspace, "durable", created.revision, digest, "resume")).rejects.toThrow(/journal|replay/i);
    rmSync(path); rmSync(`${path}.sig`);
    expect(() => readObjective(workspace, "durable")).toThrow(/journal|deletion/i);
    await expect(manageObjective(workspace, "durable", "absent", digest, "create")).rejects.toThrow(/journal|deletion/i);
  });

  it("requires exact revision, signed schedule digest, owner mode and configured owner", async () => {
    const { workspace, digest, schedule } = setup();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    await expect(manageObjective(workspace, "durable", 0, digest, "pause")).rejects.toThrow(/revision/i);
    await expect(manageObjective(workspace, "durable", 1, "0".repeat(64), "pause")).rejects.toThrow(/digest|configuration/i);
    setMode(workspace, "agent");
    await expect(manageObjective(workspace, "durable", 1, digest, "pause")).rejects.toThrow(/owner|agent mode/i);
    setMode(workspace, "owner");
    expect(() => assertObjectiveSchedule(created, { ...schedule, goal: "other" })).toThrow(/definition|objective/i);
    expect(() => assertObjectiveSchedule(created, { ...schedule, maxRounds: 4 })).toThrow(/definition|objective/i);
    expect(() => assertObjectiveSchedule(created, { ...schedule, scope: ["WRITE_LOW"] })).toThrow(/definition|objective/i);
    expect(() => assertObjectiveSchedule(created, { ...schedule, objective: { ...schedule.objective!, ownerPrincipal: "other" } })).toThrow(/owner/i);
    expect(readObjective(workspace, "durable")).toEqual(created);
  });

  it("rejects absent objective configuration and orphan signature files", async () => {
    const { workspace, schedule } = setup();
    const { objective: _objective, ...plain } = schedule;
    saveSchedules(workspace, [plain]);
    const read = readSchedules(workspace);
    if (!read.ok) throw new Error(read.reason);
    await expect(manageObjective(workspace, "durable", "absent", read.digest, "create")).rejects.toThrow(/configured objective/i);
    saveSchedules(workspace, [schedule]);
    await manageObjective(workspace, "durable", "absent", digestFor(workspace), "create");
    rmSync(objectivePath(workspace, "durable"));
    expect(() => readObjective(workspace, "durable")).toThrow(/signature/i);
  });

  it("does not sign in no-sign mode and allows only one concurrent revision winner", async () => {
    const { workspace, digest } = setup();
    const before = process.env.AMC_NO_SIGN;
    process.env.AMC_NO_SIGN = "1";
    try { await expect(manageObjective(workspace, "durable", "absent", digest, "create")).rejects.toThrow(/no-sign/i); }
    finally { if (before === undefined) delete process.env.AMC_NO_SIGN; else process.env.AMC_NO_SIGN = before; }
    expect(readObjective(workspace, "durable")).toBeNull();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    const results = await Promise.allSettled([
      manageObjective(workspace, "durable", created.revision, digest, "pause"),
      manageObjective(workspace, "durable", created.revision, digest, "pause")
    ]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(row => row.status === "rejected")).toHaveLength(1);
    expect(readObjective(workspace, "durable")).toMatchObject({ revision: 2, status: "paused" });
  });

  it("rechecks owner authority across the signing wait before replacing any bytes", async () => {
    const { workspace, digest } = setup();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    const pending = manageObjective(workspace, "durable", created.revision, digest, "pause");
    setMode(workspace, "agent");
    await expect(pending).rejects.toThrow(/owner|agent mode/i);
    setMode(workspace, "owner");
    expect(readObjective(workspace, "durable")).toEqual(created);
    const before = process.env.AMC_NO_SIGN;
    const noSign = manageObjective(workspace, "durable", created.revision, digest, "pause");
    process.env.AMC_NO_SIGN = "1";
    try { await expect(noSign).rejects.toThrow(/no-sign/i); }
    finally { if (before === undefined) delete process.env.AMC_NO_SIGN; else process.env.AMC_NO_SIGN = before; }
    expect(readObjective(workspace, "durable")).toEqual(created);
    let reviewed = true;
    const selected = manageObjective(workspace, "durable", created.revision, digest, "pause", { beforePublish() {
      if (!reviewed) throw new Error("reviewed input changed");
    } });
    reviewed = false;
    await expect(selected).rejects.toThrow(/reviewed input changed/i);
    expect(readObjective(workspace, "durable")).toEqual(created);
  });

  it("requires the signed current occurrence before consuming any round", async () => {
    const { workspace, digest } = setup();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    const forged = { claimId: "forged", configDigest: digest, round: 1, sessionId: "forged-child" };
    await expect(beginObjectiveRound(workspace, "durable", created.revision, forged)).rejects.toThrow(/claim/i);
    const authority = claim(workspace);
    await expect(beginObjectiveRound(workspace, "durable", created.revision, { ...authority, round: 2 })).rejects.toThrow(/round|sequential/i);
    await expect(beginObjectiveRound(workspace, "durable", created.revision, { ...authority, claimId: "forged" })).rejects.toThrow(/claim/i);
    expect(readObjective(workspace, "durable")).toEqual(created);
    setMode(workspace, "agent");
    await expect(beginObjectiveRound(workspace, "durable", created.revision, authority)).rejects.toThrow(/owner|agent mode/i);
    setMode(workspace, "owner");
    const path = join(workspace, ".amc", "schedules.yaml");
    writeFileSync(path, `${readFileSync(path, "utf8")}\n# unsigned edit\n`);
    await expect(beginObjectiveRound(workspace, "durable", created.revision, authority)).rejects.toThrow(/signature/i);
    expect(readObjective(workspace, "durable")).toEqual(created);
  });

  it("binds stop-check semantics to explicit edit and keeps edits paused", async () => {
    const { workspace, schedule, digest } = setup();
    const created = await manageObjective(workspace, "durable", "absent", digest, "create");
    const updated = { ...schedule, goal: "An amended report", objective: { ...schedule.objective!,
      completionCheck: { ...schedule.objective!.completionCheck, sha256: "b".repeat(64) } } };
    expect(() => assertObjectiveSchedule(created, { ...schedule, objective: updated.objective })).toThrow(/definition/i);
    saveSchedules(workspace, [updated]);
    const nextDigest = digestFor(workspace);
    await expect(manageObjective(workspace, "durable", created.revision, nextDigest, "resume")).rejects.toThrow(/definition/i);
    const edited = await manageObjective(workspace, "durable", created.revision, nextDigest, "edit");
    expect(edited).toMatchObject({ status: "paused", objective: updated.goal, roundsUsed: 0 });
    expect(() => assertObjectiveSchedule(edited, updated)).not.toThrow();
    saveSchedules(workspace, [{ ...updated, objective: { ...updated.objective, ownerPrincipal: "other-owner" } }]);
    await expect(manageObjective(workspace, "durable", edited.revision, digestFor(workspace), "edit")).rejects.toThrow(/owner/i);
  });

  it("keeps a total budget across occurrences and binds finish to exact round and session", async () => {
    const { workspace, digest } = setup(2);
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    expect(current).toMatchObject({ roundsUsed: 1, currentRound: authorityWithoutDigest(authority) });
    await expect(finishObjectiveRound(workspace, "durable", current.revision, { ...authority, sessionId: "forged" }, "active", "next", "failed")).rejects.toThrow(/round|authority/i);
    await expect(finishObjectiveRound(workspace, "durable", current.revision, authority, "complete", "agent says done", "failed")).rejects.toThrow(/complete|check/i);
    await expect(finishObjectiveRound(workspace, "durable", current.revision, authority, "complete", "missing check", "unavailable")).rejects.toThrow(/complete|check/i);
    current = await finishObjectiveRound(workspace, "durable", current.revision, authority, "active", "check failed", "failed");
    expect(current.currentRound).toBeNull();
    expect(current.lastRound).toEqual(authorityWithoutDigest(authority));
    completeRun(workspace, "durable", { ok: false, summary: "later" }, authority.claimId);
    const second = { ...claim(workspace, 1_060_000), round: 2 };
    current = await beginObjectiveRound(workspace, "durable", current.revision, second);
    expect(current.roundsUsed).toBe(2);
    current = await finishObjectiveRound(workspace, "durable", current.revision, second, "active", "check failed", "failed");
    await expect(beginObjectiveRound(workspace, "durable", current.revision, { ...second, round: 3 })).rejects.toThrow(/budget|ceiling|round/i);
    await expect(stopObjective(workspace, "durable", current.revision, { ...second, sessionId: "other" }, "forged stop", "failed")).rejects.toThrow(/authority/i);
    current = await stopObjective(workspace, "durable", current.revision, second, "round budget exhausted", "failed");
    expect(current.status).toBe("blocked");
    completeRun(workspace, "durable", { ok: false, summary: "budget exhausted" }, second.claimId);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/budget|ceiling/i);
  });

  it("refuses another round after pause and never settles a different current claim", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const paused = await manageObjective(workspace, "durable", current.revision, digest, "pause");
    expect(paused.currentRound).toEqual(current.currentRound);
    await expect(beginObjectiveRound(workspace, "durable", paused.revision, { ...authority, round: 2 })).rejects.toThrow(/active|paused/i);
    await expect(manageObjective(workspace, "durable", paused.revision, digest, "resume")).rejects.toThrow(/claim|interrupted/i);
    await expect(finishObjectiveRound(workspace, "durable", paused.revision, { ...authority, claimId: "other" }, "complete", "verified", "complete")).rejects.toThrow(/claim|authority/i);
    const settled = await finishObjectiveRound(workspace, "durable", paused.revision, authority, "complete", "verified", "complete");
    expect(settled.status).toBe("paused");
    expect(settled.currentRound).toBeNull();
    await expect(beginObjectiveRound(workspace, "durable", settled.revision, { ...authority, round: 2 })).rejects.toThrow(/active|paused/i);
  });

  it("refuses to clear an unresolved round after only unsigned operational completion", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const first = claim(workspace);
    current = await beginObjectiveRound(workspace, "durable", current.revision, first);
    await expect(beginObjectiveRound(workspace, "durable", current.revision, { ...first, round: 2 })).rejects.toThrow(/current|unsettled|round/i);
    completeRun(workspace, "durable", { ok: false, summary: "interrupted", reason: "interrupted" }, first.claimId);
    const second = { ...claim(workspace, 1_060_000), round: 2 };
    await expect(beginObjectiveRound(workspace, "durable", current.revision, second)).rejects.toThrow(/current|unsettled|round/i);
    completeRun(workspace, "durable", { ok: false, summary: "refused" }, second.claimId);
    current = await manageObjective(workspace, "durable", current.revision, digest, "pause");
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/closure|unresolved|signed/i);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "edit")).rejects.toThrow(/closure|unresolved|signed/i);
    expect(readObjective(workspace, "durable")).toEqual(current);
  });

  it.each(["deleted", "forged"] as const)("refuses edit and resume when %s claim state hides a live signed child", async alteration => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority);
    try {
      parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "worker", childSessionId: authority.sessionId,
        governedAs: "owner-one", depth: 1, packetId: "packet-one" });
      // Even an authenticated parent settlement cannot substitute for this live child's missing closure.
      settleParent(parent, authority);
      current = await manageObjective(workspace, "durable", current.revision, digest, "pause");
      const state = join(workspace, ".amc", "schedule-state.json");
      if (alteration === "deleted") rmSync(state); else writeFileSync(state, '{"schedules":{}}');
      await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/closure|unresolved|signed/i);
      await expect(manageObjective(workspace, "durable", current.revision, digest, "edit")).rejects.toThrow(/closure|unresolved|signed/i);
      expect(readObjective(workspace, "durable")).toEqual(current);
    } finally { parent.disposeWithoutClosing(); child.disposeWithoutClosing(); }
  });

  it("reconciles only after an exact signed parent settlement and sealed child close", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority);
    child.close({ reason: "completed" });
    settleParent(parent, authority); parent.close({ reason: "completed" });
    completeRun(workspace, "durable", { ok: false, summary: "driver stopped before objective settlement" }, authority.claimId);
    current = await manageObjective(workspace, "durable", current.revision, digest, "pause");
    current = await manageObjective(workspace, "durable", current.revision, digest, "resume");
    expect(current).toMatchObject({ status: "active", roundsUsed: 1, currentRound: null });
  });

  it("reconciles the exact WP42 signed closure only when parent and known child owners are dead", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority);
    parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "worker", childSessionId: authority.sessionId,
      governedAs: "owner-one", depth: 1, packetId: "packet-one" });
    parent.disposeWithoutClosing(); child.disposeWithoutClosing();
    current = await manageObjective(workspace, "durable", current.revision, digest, "pause");
    const dead = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
    await closeInterruptedClaim(workspace, "durable", authority.claimId, digest);
    const pending = manageObjective(workspace, "durable", current.revision, digest, "resume");
    dead.mockRestore();
    await expect(pending).rejects.toThrow(/LIVE_WRITER|alive|closure/i);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/LIVE_WRITER|alive|closure/i);
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
    current = await manageObjective(workspace, "durable", current.revision, digest, "edit");
    expect(current).toMatchObject({ status: "paused", roundsUsed: 1, currentRound: null });
    current = await manageObjective(workspace, "durable", current.revision, digest, "resume");
    expect(current.status).toBe("active");
  });

  it.each([
    { goalSha256: "0".repeat(64) }, { maxRounds: 4 }, { scope: ["WRITE_HIGH"] }, { agentId: "other-owner" }
  ])("refuses a signed closure for a different claim definition or principal %j", async mismatch => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority, mismatch);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority); child.close({ reason: "completed" });
    settleParent(parent, authority); parent.close({ reason: "completed" });
    completeRun(workspace, "durable", { ok: false, summary: "fixture ended" }, authority.claimId);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "edit")).rejects.toThrow(/signed claim|definition|owner/i);
    expect(readObjective(workspace, "durable")).toEqual(current);
  });

  it("refuses a signed settlement whose exact child belongs to another principal", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority, "other-owner"); child.close({ reason: "completed" });
    settleParent(parent, authority); parent.close({ reason: "completed" });
    completeRun(workspace, "durable", { ok: false, summary: "fixture ended" }, authority.claimId);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/child|principal/i);
  });

  it("requires the interrupted child's own availability after its parent has released", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority);
    parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "worker", childSessionId: authority.sessionId,
      governedAs: "owner-one", depth: 1, packetId: "packet-one" });
    try {
      const dead = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
      await closeInterruptedClaim(workspace, "durable", authority.claimId, digest); dead.mockRestore();
      parent.close({ reason: "parent released after interrupted closure authorization" });
      await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/LIVE_WRITER|alive|closure/i);
      child.close({ reason: "completed" });
      current = await manageObjective(workspace, "durable", current.revision, digest, "resume");
      expect(current.currentRound).toBeNull();
    } finally { parent.disposeWithoutClosing(); child.disposeWithoutClosing(); }
  });

  it("refuses an interrupted closure when an announced child has no signed session evidence", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    parent.recordLoopEvent({ kind: "delegation-started", childRunAs: "worker", childSessionId: authority.sessionId,
      governedAs: "owner-one", depth: 1, packetId: "packet-one" });
    parent.disposeWithoutClosing();
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
    await closeInterruptedClaim(workspace, "durable", authority.claimId, digest);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/announced|no signed/i);
  });

  it("requires the interrupted parent's own availability even when its child has sealed", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority); child.close({ reason: "completed" });
    try {
      const dead = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
      await closeInterruptedClaim(workspace, "durable", authority.claimId, digest); dead.mockRestore();
      await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/LIVE_WRITER|alive|closure/i);
    } finally { parent.disposeWithoutClosing(); }
  });

  it.each(["sourceEventHash", "ownerNonce"] as const)("refuses an auditor-signed interrupted closure with a different %s", async mismatch => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace), parent = nativeParent(workspace, authority);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    const child = nativeChild(workspace, authority); child.close({ reason: "completed" }); parent.disposeWithoutClosing();
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("fixture owner exited"), { code: "ESRCH" }); });
    const closed = await closeInterruptedClaim(workspace, "durable", authority.claimId, digest);
    const path = join(workspace, closed.auditPath), audit = JSON.parse(readFileSync(path, "utf8"));
    if (mismatch === "sourceEventHash") audit.sourceEventHash = "0".repeat(64); else audit.owner.token = "different-owner-nonce";
    (await prepareOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(JSON.stringify(audit, null, 2)) }])).publish();
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/source|nonce|exact signed/i);
  });

  it("requires an edit before a completed objective can be resumed", async () => {
    const { workspace, digest } = setup();
    let current = await manageObjective(workspace, "durable", "absent", digest, "create");
    const authority = claim(workspace);
    current = await beginObjectiveRound(workspace, "durable", current.revision, authority);
    current = await finishObjectiveRound(workspace, "durable", current.revision, authority, "complete", "verified", "complete");
    expect(current).toMatchObject({ status: "complete", lastCheckStatus: "complete", currentRound: null });
    completeRun(workspace, "durable", { ok: true, summary: "verified" }, authority.claimId);
    await expect(manageObjective(workspace, "durable", current.revision, digest, "resume")).rejects.toThrow(/edit|complete/i);
    current = await manageObjective(workspace, "durable", current.revision, digest, "edit");
    expect(current.status).toBe("paused");
    current = await manageObjective(workspace, "durable", current.revision, digest, "resume");
    expect(current).toMatchObject({ status: "active", roundsUsed: 1 });
  });
});
function authorityWithoutDigest(authority: ObjectiveRoundAuthority) {
  return { claimId: authority.claimId, round: authority.round, sessionId: authority.sessionId };
}

function digestFor(workspace: string): string {
  const read = readSchedules(workspace);
  if (!read.ok) throw new Error(read.reason);
  return read.digest;
}

function nativeParent(workspace: string, authority: ObjectiveRoundAuthority, override: Record<string, unknown> = {}): SessionService {
  const parent = new SessionService(workspace);
  parent.open({ sessionId: `parent-${authority.claimId}`, agentId: "owner-one", harnessVersion: "objective-recovery-fixture",
    compositionDigest: "fixture-composition", policyDigest: authority.configDigest });
  const selected = readSchedules(workspace);
  if (!selected.ok) throw new Error(selected.reason);
  const schedule = selected.schedules.find(row => row.id === "durable")!;
  parent.recordProjectedEvidence({ eventType: "audit", payload: "Native schedule occurrence claimed before dispatch", meta: {
    type: "native_schedule_claimed", agentId: "owner-one", scheduleId: "durable", claimId: authority.claimId,
    parentSessionId: parent.sessionId, schedulesDigest: authority.configDigest, now: 1_000_000,
    goalSha256: sha256Hex(schedule.goal), maxRounds: schedule.maxRounds, scope: schedule.scope ?? null, runAs: schedule.runAs, ...override
  } });
  return parent;
}
function nativeChild(workspace: string, authority: ObjectiveRoundAuthority, agentId = "owner-one"): SessionService {
  const child = new SessionService(workspace);
  child.open({ sessionId: authority.sessionId, agentId, harnessVersion: "objective-child-fixture",
    compositionDigest: "fixture-child-composition", policyDigest: authority.configDigest });
  return child;
}
function settleParent(parent: SessionService, authority: ObjectiveRoundAuthority): void {
  parent.recordProjectedEvidence({ eventType: "audit", payload: "Native schedule execution settled", meta: {
    type: "native_schedule_execution_settled", agentId: "owner-one", scheduleId: "durable", claimId: authority.claimId,
    parentSessionId: parent.sessionId, schedulesDigest: authority.configDigest, childSessionIds: [authority.sessionId],
    ok: false, rounds: 1, stoppedBy: "failed", outcome: "failed", answerHashes: []
  } });
}
