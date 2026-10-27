import { randomUUID, sign, verify } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as records from "../../src/storage/workspaceRecordStore.js";
import * as fp from "../../src/assurance/falsePositiveTracker.js";
import * as keyFacade from "../../src/crypto/keys.js";
import * as files from "../../src/utils/fs.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";
import { activateEmergencyOverride, activateEmergencyOverrideAsync, getActiveOverrides } from "../../src/governor/canaryRegisters.js";

const PASS = "owned-workspace-record-passphrase", AT = { area: ["assurance"], kind: "false-positives" };
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks(); fp.resetFPTrackerState();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-workspace-record-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  fp.resetFPTrackerState(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), privateKey: getSigningKey(workspace, "artifact-seal"),
    publicKey: getSigningPublicKeyPem(workspace, "artifact-seal"),
    input: { scenarioId: "owned-scenario", packId: "owned-pack", assuranceRunId: "owned-run", response: "owned response", justification: "owned reason", reportedBy: "owned-reporter" } };
}
const path = (workspace: string, id: string) => join(workspace, ".amc", "assurance", "false-positives", id + ".json");
function verifyRecord(f: ReturnType<typeof fixture>, id: string, body: Record<string, unknown>, previous: string, storedTs: number) {
  const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: previous }));
  const signature = sign(null, Buffer.from(hash, "hex"), f.privateKey).toString("base64");
  const expected = { ...body, prev_record_hash: previous, record_hash: hash, signature, storedTs };
  expect(readFileSync(path(f.workspace, id), "utf8")).toBe(JSON.stringify(expected, null, 2));
  expect(verify(null, Buffer.from(hash, "hex"), f.publicKey, Buffer.from(signature, "base64"))).toBe(true);
  return expected;
}
async function positive(f: ReturnType<typeof fixture>) {
  const before = records.workspaceRecordHead(f.workspace, AT), report = await fp.submitFPReportAsync(f.input, f.workspace);
  verifyRecord(f, report.reportId, { ...report }, before, report.ts); return report;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>, artifactOnly = false) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider); let used = false;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await actual(ref, bytes);
    if (!used && (!artifactOnly || ref.id === "artifact-seal")) { used = true; entered.resolve(); await release.promise; }
    return signature;
  });
  return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused"),
      new Promise<string>(done => { timer = setTimeout(() => done("no actual Sign"), 5_000); })])).toBe("signed");
  } finally { clearTimeout(timer); }
}

describe("prepared workspace record and actual false-positive publication", () => {
  test("preserves literal default record bytes and one exact real raw32 artifact request", async () => {
    const f = fixture(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now); const spy = vi.spyOn(f.provider, "sign");
    const report = await fp.submitFPReportAsync(f.input, f.workspace);
    const body = { reportId: report.reportId, scenarioId: "owned-scenario", packId: "owned-pack", assuranceRunId: "owned-run",
      response: "owned response", justification: "owned reason", reportedBy: "owned-reporter", ts: now, status: "open" };
    expect(report).toEqual(body); verifyRecord(f, report.reportId, body, "GENESIS_FALSE_POSITIVES", now);
    const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: "GENESIS_FALSE_POSITIVES" }));
    expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" });
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(hash, "hex"));
    expect(fp.getFPReport(report.reportId, f.workspace)).toEqual(report);
    const durable = readFileSync(path(f.workspace, report.reportId));
    report.status = "confirmed"; report.justification = "caller mutated returned result";
    expect(fp.getFPReport(report.reportId, f.workspace)).toEqual(body);
    expect(readFileSync(path(f.workspace, report.reportId))).toEqual(durable);
    fp.resetFPTrackerState(); expect(fp.getFPReport(report.reportId, f.workspace)).toMatchObject(body);
  });

  test("retains old envelope fields in the replacement preimage and the unchanged outer overwrite order", async () => {
    const f = fixture(), body = { value: "before", signature: "inner-domain-signature", record_hash: "body-hash", storedTs: 3, prev_record_hash: "body-parent" };
    const old = records.saveWorkspaceRecord(f.workspace, AT, "legacy", body, 9);
    verifyRecord(f, "legacy", body, "GENESIS_FALSE_POSITIVES", 9);
    const nextBody = { ...old, value: "after" }, prepared = await records.prepareWorkspaceRecordAsync(f.workspace, AT, "legacy", nextBody, 10);
    const actual = records.withWorkspaceRecordPublicationLock(f.workspace, AT, () => prepared.publish());
    expect(actual).toEqual(verifyRecord(f, "legacy", nextBody, old.record_hash, 10));
  });

  test("synchronous compatibility signs and initializes before taking the common family lock", () => {
    const f = fixture(), actual = keyFacade.getSigningKey; let entered = false;
    vi.spyOn(keyFacade, "getSigningKey").mockImplementationOnce((workspace, purpose) => {
      records.withWorkspaceRecordPublicationLock(workspace, AT, () => { entered = true; });
      return actual(workspace, purpose);
    });
    const out = records.saveWorkspaceRecord(f.workspace, AT, "sync-before-lock", { owned: true }, 11);
    expect(entered).toBe(true); expect(out.signature).not.toBe("unsigned");
    verifyRecord(f, "sync-before-lock", { owned: true }, "GENESIS_FALSE_POSITIVES", 11);
  }, 15_000);

  test("retains the synchronous compatibility catch's literal unsigned wire without crediting it as provider success", () => {
    const f = fixture(), body = { owned: "legacy refusal" }, now = 12;
    vi.spyOn(keyFacade, "getSigningKey").mockImplementationOnce(() => { throw new Error("owned synchronous signing refusal"); });
    const record = records.saveWorkspaceRecord(f.workspace, AT, "legacy-unsigned", body, now);
    const expected = { ...body, prev_record_hash: "GENESIS_FALSE_POSITIVES", record_hash: sha256Hex(canonicalize({ ...body, prev_record_hash: "GENESIS_FALSE_POSITIVES" })), signature: "unsigned", storedTs: now };
    expect(record).toEqual(expected); expect(readFileSync(path(f.workspace, "legacy-unsigned"), "utf8")).toBe(JSON.stringify(expected, null, 2));
  });

  test("awaits real signing without publishing a report or holding the family lock and copies caller strings", async () => {
    const f = fixture(), input = { ...f.input }, paused = pauseSign(f), pending = fp.submitFPReportAsync(input, f.workspace);
    try {
      await atPause(paused, pending); expect(fp.listFPReports(undefined, f.workspace)).toEqual([]);
      records.withWorkspaceRecordPublicationLock(f.workspace, AT, () => expect(records.workspaceRecordHead(f.workspace, AT)).toBe("GENESIS_FALSE_POSITIVES"));
      input.justification = "caller changed"; input.response = "caller changed"; paused.release.resolve(); const report = await pending;
      expect(report.justification).toBe(f.input.justification); expect(report.response).toBe(f.input.response);
      verifyRecord(f, report.reportId, { ...report }, "GENESIS_FALSE_POSITIVES", report.ts);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  }, 15_000);

  test.each(["unavailable", "bad signature"] as const)("never converts %s into an unsigned file or successful cache entry", async failure => {
    const f = fixture(); vi.spyOn(f.provider, "sign").mockImplementationOnce(async () => { if (failure === "unavailable") throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned secret /not/output"); return Buffer.alloc(64); });
    await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(fp.listFPReports(undefined, f.workspace)).toEqual([]); await positive(f);
  });

  test("an actual final atomic-write failure leaves no successful process-cache mutation", async () => {
    const f = fixture(), actual = files.writeFileAtomic; let blocked: string | null = null;
    vi.spyOn(files, "writeFileAtomic").mockImplementation((file, data, mode) => {
      if (blocked === null && file.includes(join("assurance", "false-positives")) && file.endsWith(".json")) { blocked = file; mkdirSync(file); }
      return actual(file, data, mode);
    });
    try { await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toBeInstanceOf(Error); expect(blocked).not.toBeNull(); expect(fp.listFPReports()).toEqual([]); }
    finally { vi.restoreAllMocks(); if (blocked !== null) rmSync(blocked, { recursive: true, force: true }); }
    await positive(f);
  });

  test("an actual live-owner family lock refusal leaves file and cache unpublished and release restores success", async () => {
    const f = fixture(), dir = join(f.workspace, ".amc"), name = `workspace-records-${sha256Hex(join(...AT.area, AT.kind)).slice(0, 24)}`;
    const contenders = join(dir, `.${name}-locks`), token = randomUUID(), contender = join(contenders, token + ".json"), lock = join(dir, `.${name}.lock`);
    mkdirSync(contenders, { recursive: true }); writeFileSync(contender, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), { mode: 0o600 }); linkSync(contender, lock);
    try {
      await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toMatchObject({ code: "LOCK_TIMEOUT" });
      expect(fp.listFPReports(undefined, f.workspace)).toEqual([]);
    } finally { if (existsSync(lock)) unlinkSync(lock); if (existsSync(contender)) unlinkSync(contender); }
    await positive(f);
  }, 15_000);

  test("a real post-Sign vault lock refuses before file or cache publication and unlock restores success", async () => {
    const f = fixture(), paused = pauseSign(f), pending = fp.submitFPReportAsync(f.input, f.workspace), outcome = pending.then(() => null, error => error);
    try { await atPause(paused, pending); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); paused.release.resolve(); expect(await outcome).toBeInstanceOf(Error); expect(fp.listFPReports(undefined, f.workspace)).toEqual([]); }
    finally { paused.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("the producer rechecks whole-purpose generation after checked signing and final serialization", async () => {
    const f = fixture(), generation = assertKeysetComplete(f.workspace)!.generation, actual = JSON.stringify; let changed = false;
    vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => {
      if (!changed && value !== null && typeof value === "object" && (value as { packId?: string }).packId === "owned-pack" && "record_hash" in value) {
        changed = true; rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      }
      return actual(value, replacer as never, space);
    });
    await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(changed).toBe(true); expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation); expect(fp.listFPReports(undefined, f.workspace)).toEqual([]);
    vi.restoreAllMocks(); await positive(f);
  });

  test("a retained sync writer can win during signing and a stale selected head cannot publish", async () => {
    const f = fixture(), paused = pauseSign(f), pending = fp.submitFPReportAsync(f.input, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const winner = records.saveWorkspaceRecord(f.workspace, AT, "winner", { owned: "winner" }, Date.now());
      const winnerBytes = readFileSync(path(f.workspace, "winner")); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
      expect(readFileSync(path(f.workspace, "winner"))).toEqual(winnerBytes); expect(records.workspaceRecordHead(f.workspace, AT)).toBe(winner.record_hash); expect(fp.listFPReports()).toEqual([]);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test("a changed older target refuses independently of the unchanged selected head", async () => {
    const f = fixture(), report = await positive(f), original = readFileSync(path(f.workspace, report.reportId));
    const head = records.saveWorkspaceRecord(f.workspace, AT, "newer-head", { owned: "head" }, Date.now() + 60_000);
    const paused = pauseSign(f), pending = fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "prepared" }, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); records.saveWorkspaceRecord(f.workspace, AT, report.reportId, { ...report, justification: "concurrent target" }, 1);
      const winner = readFileSync(path(f.workspace, report.reportId)); expect(records.workspaceRecordHead(f.workspace, AT)).toBe(head.record_hash);
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
      expect(readFileSync(path(f.workspace, report.reportId))).toEqual(winner); expect(report.status).toBe("open");
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(path(f.workspace, report.reportId), original); }
    expect((await fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "fresh" }, f.workspace))?.status).toBe("confirmed");
  });

  test("a different-family append during signing is legitimate and does not invalidate the prepared FP body", async () => {
    const f = fixture(), paused = pauseSign(f), pending = fp.submitFPReportAsync(f.input, f.workspace);
    try {
      await atPause(paused, pending); records.saveWorkspaceRecord(f.workspace, { area: ["lab"], kind: "experiments" }, "unrelated", { owned: true }, Date.now());
      paused.release.resolve(); const report = await pending; verifyRecord(f, report.reportId, { ...report }, "GENESIS_FALSE_POSITIVES", report.ts);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("selected open-state refusal is independent of unchanged durable head and target bytes", async () => {
    const f = fixture(), report = await positive(f), original = readFileSync(path(f.workspace, report.reportId));
    const paused = pauseSign(f), pending = fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "prepared" }, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending);
      expect(fp.resolveFPReport(report.reportId, { status: "rejected", reason: "concurrent cache-only resolution" })?.status).toBe("rejected");
      paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "false-positive report changed while signing was prepared; retry" });
      expect(readFileSync(path(f.workspace, report.reportId))).toEqual(original);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); fp.resetFPTrackerState(); }
    expect((await fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "fresh" }, f.workspace))?.status).toBe("confirmed");
  });

  test("two actual resolves cannot overwrite the first durable resolution through a stale live cache", async () => {
    const f = fixture(), report = await positive(f), paused = pauseSign(f);
    const pending = fp.resolveFPReportAsync(report.reportId, { status: "rejected", reason: "late" }, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const winner = await fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "first" }, f.workspace);
      expect(winner?.status).toBe("confirmed"); const bytes = readFileSync(path(f.workspace, report.reportId)); paused.release.resolve();
      expect(await outcome).toBeInstanceOf(Error); expect(readFileSync(path(f.workspace, report.reportId))).toEqual(bytes);
      expect(fp.getFPReport(report.reportId, f.workspace)).toMatchObject({ status: "confirmed", resolution: "first" });
      fp.resetFPTrackerState(); expect(fp.getFPReport(report.reportId, f.workspace)).toMatchObject({ status: "confirmed", resolution: "first" });
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("same-read durable resolve works after a real cache reset and preserves loaded old-envelope bytes", async () => {
    const f = fixture(), report = await positive(f), previous = JSON.parse(readFileSync(path(f.workspace, report.reportId), "utf8")), now = Date.now();
    fp.resetFPTrackerState(); vi.spyOn(Date, "now").mockReturnValue(now);
    const resolved = await fp.resolveFPReportAsync(report.reportId, { status: "confirmed", reason: "durable" }, f.workspace);
    expect(resolved?.status).toBe("confirmed"); verifyRecord(f, report.reportId, { ...previous, status: "confirmed", resolution: "durable" }, previous.record_hash, now);
  });

  test("retains explicit memory-only behavior but refuses checked no-sign and locked ephemeral publication", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"), memory = await fp.submitFPReportAsync(f.input);
    expect(fp.getFPReport(memory.reportId)).toEqual(memory); expect(existsSync(path(f.workspace, memory.reportId))).toBe(false); expect(spy).not.toHaveBeenCalled(); fp.resetFPTrackerState();
    await positive(f); const before = fp.listFPReports(undefined, f.workspace), calls = spy.mock.calls.length;
    // Signed run-hash authority refuses no-sign mode even with an unlocked vault, before any Sign.
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toThrow("no-sign mode does not authorize policy signing");
    expect(fp.listFPReports(undefined, f.workspace)).toEqual(before); expect(spy).toHaveBeenCalledTimes(calls);
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    try { await expect(fp.submitFPReportAsync(f.input, f.workspace)).rejects.toBeInstanceOf(Error); expect(fp.listFPReports(undefined, f.workspace)).toEqual(before); }
    finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); vi.stubEnv("AMC_NO_SIGN", "0"); }
    await positive(f);
  });

  test("canary sync publication shares the family lock without nesting it and retains the async inventory refusal", async () => {
    const f = fixture(), input = { agentId: "default", reason: "owned outage", actionDescription: "owned action", ttlMs: 60_000 }, paused = pauseSign(f, true);
    const pending = activateEmergencyOverrideAsync(input, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const winner = activateEmergencyOverride({ ...input, reason: "sync winner" }, f.workspace);
      expect(getActiveOverrides("default", f.workspace).map(row => row.overrideId)).toContain(winner.overrideId);
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "canary override register changed while signing was prepared; retry" });
      expect(getActiveOverrides("default", f.workspace).map(row => row.overrideId)).toEqual([winner.overrideId]);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    const fresh = await activateEmergencyOverrideAsync(input, f.workspace); expect(getActiveOverrides("default", f.workspace).map(row => row.overrideId)).toContain(fresh.overrideId);
  }, 15_000);
});
