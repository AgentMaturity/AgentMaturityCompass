import { randomUUID, sign, verify } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as canary from "../../src/governor/canaryRegisters.js";
import * as sdk from "../../src/governor/policyCanary.js";
import * as records from "../../src/storage/workspaceRecordStore.js";
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

const PASS = "owned-canary-postmortem-passphrase", AT = { area: ["governor"], kind: "emergency-overrides" };
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks(); canary.resetCanaryRegisters();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture(ttlMs = 60_000) {
  const root = mkdtempSync(join(tmpdir(), "amc-async-canary-postmortem-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  canary.resetCanaryRegisters(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const override = canary.activateEmergencyOverride({ agentId: "default", reason: "owned outage", actionDescription: "owned deployment", ttlMs }, workspace);
  const file = join(workspace, ".amc", "governor", "emergency-overrides", override.overrideId + ".json");
  return { root, workspace, override, file, provider: loadKeyProvider(workspace, "file"), privateKey: getSigningKey(workspace, "artifact-seal"),
    publicKey: getSigningPublicKeyPem(workspace, "artifact-seal"), configPublicKey: getSigningPublicKeyPem(workspace, "config-signature") };
}
const read = (f: ReturnType<typeof fixture>) => JSON.parse(readFileSync(f.file, "utf8"));
function checkReplacement(f: ReturnType<typeof fixture>, previous: ReturnType<typeof read>, artifact: string, head: string, now: number) {
  const inner = previous.override_signature ?? "";
  const body = { ...previous, signature: inner, postmortemFiled: true, postmortemArtifactId: artifact, override_signature: inner };
  const hash = sha256Hex(canonicalize({ ...body, prev_record_hash: head }));
  const signature = sign(null, Buffer.from(hash, "hex"), f.privateKey).toString("base64");
  const expected = { ...body, prev_record_hash: head, record_hash: hash, signature, storedTs: now };
  expect(readFileSync(f.file, "utf8")).toBe(JSON.stringify(expected, null, 2));
  expect(verify(null, Buffer.from(hash, "hex"), f.publicKey, Buffer.from(signature, "base64"))).toBe(true);
  expect(expected.override_signature).toBe(previous.override_signature); return expected;
}
async function positive(f: ReturnType<typeof fixture>, artifact = "owned-fresh-artifact") {
  const previous = read(f), head = records.workspaceRecordHead(f.workspace, AT);
  expect(await canary.filePostmortemAsync(f.override.overrideId, artifact, f.workspace)).toBe(true);
  const next = read(f); checkReplacement(f, previous, artifact, head, next.storedTs); return next;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
    const signature = await actual(ref, bytes); entered.resolve(); await release.promise; return signature;
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

describe("actual async canary postmortem record replacement", () => {
  test("preserves loaded old envelope bytes and the domain signature with one exact outer raw32 Sign", async () => {
    const f = fixture(), previous = read(f), head = records.workspaceRecordHead(f.workspace, AT), now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now); const spy = vi.spyOn(f.provider, "sign");
    expect(await canary.filePostmortemAsync(f.override.overrideId, "owned-artifact", f.workspace)).toBe(true);
    const record = checkReplacement(f, previous, "owned-artifact", head, now);
    expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" });
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(record.record_hash, "hex"));
    const o = f.override, domain = { overrideId: o.overrideId, agentId: "default", reason: "owned outage", actionDescription: "owned deployment", ttlMs: o.ttlMs, startedTs: o.startedTs, expiresTs: o.expiresTs };
    const domainBytes = Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1\0", "ascii"), Buffer.from(sha256Hex(canonicalize(domain)), "hex")]);
    expect(verify(null, domainBytes, f.configPublicKey, Buffer.from(record.override_signature, "base64"))).toBe(true);
    expect(canary.getActiveOverrides("default", f.workspace)).toMatchObject([{ postmortemFiled: true, postmortemArtifactId: "owned-artifact", signature: f.override.signature }]);
    expect(canary.getInvalidOverrides("default", f.workspace)).toEqual([]);
  });

  test("the maintained policyCanary SDK variant permits before-expiry filing and repeated replacements", async () => {
    const f = fixture(), expiry = f.override.expiresTs;
    expect(sdk.filePostmortemAsync).toBe(canary.filePostmortemAsync);
    expect(await sdk.filePostmortemAsync(f.override.overrideId, "first", f.workspace)).toBe(true);
    await positive(f, "replacement"); expect(read(f).expiresTs).toBe(expiry);
    expect(canary.getActiveOverrides("default", f.workspace)[0]?.postmortemArtifactId).toBe("replacement");
  });

  test("an expired verified override accepts a postmortem and retains its original expiry and inner signature", async () => {
    const f = fixture(-1), signature = f.override.signature;
    expect(canary.getOverridesMissingPostmortem("default", f.workspace).map(o => o.overrideId)).toContain(f.override.overrideId);
    await positive(f); expect(read(f).expiresTs).toBe(f.override.expiresTs); expect(read(f).override_signature).toBe(signature);
    expect(canary.getOverridesMissingPostmortem("default", f.workspace)).toEqual([]); expect(canary.getActiveOverrides("default", f.workspace)).toEqual([]);
  });

  test("absent workspace, missing id and unreadable target return false before provider work", async () => {
    const f = fixture(), original = readFileSync(f.file), spy = vi.spyOn(f.provider, "sign");
    expect(await canary.filePostmortemAsync(f.override.overrideId, "artifact")).toBe(false);
    expect(await canary.filePostmortemAsync(f.override.overrideId, "artifact", "")).toBe(false);
    expect(await canary.filePostmortemAsync("not-present", "artifact", f.workspace)).toBe(false);
    const outside = join(f.workspace, ".amc", "governor", "owned-outside.json"), outsideBytes = JSON.stringify({ ...read(f), overrideId: "../owned-outside" });
    writeFileSync(outside, outsideBytes); expect(await canary.filePostmortemAsync("../owned-outside", "artifact", f.workspace)).toBe(false); expect(readFileSync(outside, "utf8")).toBe(outsideBytes);
    try { writeFileSync(f.file, "{broken"); expect(await canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace)).toBe(false); }
    finally { writeFileSync(f.file, original); }
    expect(spy).not.toHaveBeenCalled(); await positive(f);
  });

  test("filing does not add inner authority: an invalid stored override remains excluded by verifiedOverrides", async () => {
    const f = fixture(), invalid = { ...read(f), override_signature: "unsigned" }; writeFileSync(f.file, JSON.stringify(invalid, null, 2));
    expect(canary.getActiveOverrides("default", f.workspace)).toEqual([]); expect(canary.getInvalidOverrides("default", f.workspace)).toHaveLength(1);
    await positive(f); expect(read(f).override_signature).toBe("unsigned"); expect(canary.getActiveOverrides("default", f.workspace)).toEqual([]);
    expect(canary.getInvalidOverrides("default", f.workspace)).toHaveLength(1);
  });

  test("real signing runs outside the common family lock and publishes no postmortem while paused", async () => {
    const f = fixture(), before = readFileSync(f.file), paused = pauseSign(f), pending = canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace);
    try {
      await atPause(paused, pending); expect(readFileSync(f.file)).toEqual(before);
      records.withWorkspaceRecordPublicationLock(f.workspace, AT, () => expect(read(f).postmortemFiled).toBe(false));
      paused.release.resolve(); expect(await pending).toBe(true); expect(read(f).postmortemFiled).toBe(true);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  }, 15_000);

  test.each(["unavailable", "bad crypto"] as const)("never converts %s into unsigned or successful postmortem publication", async failure => {
    const f = fixture(), before = readFileSync(f.file);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async () => { if (failure === "unavailable") throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned secret /not/output"); return Buffer.alloc(64); });
    await expect(canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace)).rejects.toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(readFileSync(f.file)).toEqual(before); expect(canary.getActiveOverrides("default", f.workspace)[0]?.postmortemFiled).toBe(false); await positive(f);
  });

  test("post-Sign vault locking refuses before replacement and restores actual success after unlock", async () => {
    const f = fixture(), before = readFileSync(f.file), paused = pauseSign(f), pending = canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); paused.release.resolve();
      expect(await outcome).toBeInstanceOf(Error); expect(readFileSync(f.file)).toEqual(before);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("final prepared publication rechecks whole-purpose generation after checked Sign and serialization", async () => {
    const f = fixture(), before = readFileSync(f.file), generation = assertKeysetComplete(f.workspace)!.generation, actual = JSON.stringify; let changed = false;
    vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => {
      if (!changed && value !== null && typeof value === "object" && (value as { overrideId?: string }).overrideId === f.override.overrideId && "record_hash" in value && (value as { postmortemFiled?: boolean }).postmortemFiled === true) {
        changed = true; rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      }
      return actual(value, replacer as never, space);
    });
    await expect(canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(changed).toBe(true); expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation); expect(readFileSync(f.file)).toEqual(before);
    vi.restoreAllMocks(); await positive(f);
  });

  test("an actual atomic replacement failure cannot report postmortem success", async () => {
    const f = fixture(), before = readFileSync(f.file), backup = join(f.root, "before.json"), actual = files.writeFileAtomic; let blocked = false;
    vi.spyOn(files, "writeFileAtomic").mockImplementation((file, data, mode) => {
      if (!blocked && file === f.file) { blocked = true; renameSync(file, backup); mkdirSync(file); }
      return actual(file, data, mode);
    });
    try { await expect(canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace)).rejects.toBeInstanceOf(Error); expect(blocked).toBe(true); }
    finally { vi.restoreAllMocks(); if (blocked) { rmSync(f.file, { recursive: true, force: true }); renameSync(backup, f.file); } }
    expect(readFileSync(f.file)).toEqual(before); await positive(f);
  });

  test("a real live-owner common lock refuses replacement and releasing it restores success", async () => {
    const f = fixture(), before = readFileSync(f.file), dir = join(f.workspace, ".amc"), name = `workspace-records-${sha256Hex(join(...AT.area, AT.kind)).slice(0, 24)}`;
    const contenders = join(dir, `.${name}-locks`), token = randomUUID(), contender = join(contenders, token + ".json"), lock = join(dir, `.${name}.lock`);
    mkdirSync(contenders, { recursive: true }); writeFileSync(contender, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), { mode: 0o600 }); linkSync(contender, lock);
    try { await expect(canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace)).rejects.toMatchObject({ code: "LOCK_TIMEOUT" }); expect(readFileSync(f.file)).toEqual(before); }
    finally { if (existsSync(lock)) unlinkSync(lock); if (existsSync(contender)) unlinkSync(contender); }
    await positive(f);
  }, 15_000);

  test("a same-family activation winner invalidates the captured head without overwriting either override", async () => {
    const f = fixture(), before = readFileSync(f.file), paused = pauseSign(f), pending = canary.filePostmortemAsync(f.override.overrideId, "stale", f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1_000);
      let winner: ReturnType<typeof canary.activateEmergencyOverride>;
      try { winner = canary.activateEmergencyOverride({ agentId: "default", reason: "winner", actionDescription: "winner", ttlMs: 60_000 }, f.workspace); }
      finally { clock.mockRestore(); }
      const winnerFile = join(f.workspace, ".amc", "governor", "emergency-overrides", winner.overrideId + ".json"), winnerBytes = readFileSync(winnerFile);
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
      expect(readFileSync(f.file)).toEqual(before); expect(readFileSync(winnerFile)).toEqual(winnerBytes);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test("a newer postmortem on an older target refuses stale replacement independently of the unchanged head", async () => {
    const f = fixture(), head = records.saveWorkspaceRecord(f.workspace, AT, "owned-later-head-only", { owned: "head selection only" }, Date.now() + 60_000);
    const paused = pauseSign(f), pending = canary.filePostmortemAsync(f.override.overrideId, "stale", f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); expect(canary.filePostmortem(f.override.overrideId, "winner", f.workspace)).toBe(true); const winner = readFileSync(f.file);
      expect(records.workspaceRecordHead(f.workspace, AT)).toBe(head.record_hash); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
      expect(readFileSync(f.file)).toEqual(winner); expect(canary.getActiveOverrides("default", f.workspace)[0]?.postmortemArtifactId).toBe("winner");
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test("selected body and predecessor come from the same read even when a real sync filing wins during parsing", async () => {
    const f = fixture(), actual = JSON.parse; let selectedReads = 0, changed = false, winner: Buffer | null = null;
    vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
      const parsed = actual(text, reviver);
      // Existing selection and the frozen head helper read the one owned row first; the third matching parse is the captured target body.
      if (!changed && parsed !== null && typeof parsed === "object" && parsed.overrideId === f.override.overrideId && "override_signature" in parsed && ++selectedReads === 3) {
        changed = true; expect(canary.filePostmortem(f.override.overrideId, "same-read-winner", f.workspace)).toBe(true); winner = readFileSync(f.file);
      }
      return parsed;
    });
    await expect(canary.filePostmortemAsync(f.override.overrideId, "stale-read", f.workspace)).rejects.toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
    expect(changed).toBe(true); expect(winner).not.toBeNull(); expect(readFileSync(f.file)).toEqual(winner);
    vi.restoreAllMocks(); await positive(f);
  });

  test("a legitimate different-family rollback append does not invalidate the selected postmortem", async () => {
    const f = fixture(), paused = pauseSign(f), pending = canary.filePostmortemAsync(f.override.overrideId, "artifact", f.workspace);
    try {
      await atPause(paused, pending); const pack = canary.createRollbackPack("default", "policy: {}", "different family", f.workspace);
      paused.release.resolve(); expect(await pending).toBe(true); expect(read(f).postmortemArtifactId).toBe("artifact");
      expect(canary.getRollbackPacks("default", f.workspace).map(p => p.packId)).toContain(pack.packId);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("checked filing refuses no-sign mode with an unlocked vault and locked ephemeral persistence", async () => {
    // Signed run-hash authority refuses no-sign mode even with an unlocked vault (no unsigned or ephemeral record is written).
    const f = fixture(); vi.stubEnv("AMC_NO_SIGN", "1"); const before = readFileSync(f.file);
    await expect(canary.filePostmortemAsync(f.override.overrideId, "unlocked-no-sign", f.workspace)).rejects.toThrow("no-sign mode does not authorize policy signing");
    expect(readFileSync(f.file)).toEqual(before);
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    try { await expect(canary.filePostmortemAsync(f.override.overrideId, "locked", f.workspace)).rejects.toBeInstanceOf(Error); expect(readFileSync(f.file)).toEqual(before); }
    finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); vi.stubEnv("AMC_NO_SIGN", "0"); }
    await positive(f);
  });
});
