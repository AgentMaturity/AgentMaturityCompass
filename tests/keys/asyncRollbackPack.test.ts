import { randomUUID, sign, verify } from "node:crypto";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
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
import { setMode } from "../../src/mode/mode.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const PASS = "owned-rollback-pack-passphrase", AT = { area: ["governor"], kind: "rollback-packs" };
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks(); canary.resetCanaryRegisters();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-rollback-pack-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  canary.resetCanaryRegisters(); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), policy: "# exact owned snapshot\npolicy: { rules: [] }\n" };
}
function path(f: ReturnType<typeof fixture>, id: string) { return join(f.workspace, ".amc", "governor", "rollback-packs", id + ".json"); }
function storedFiles(f: ReturnType<typeof fixture>) { const dir = join(f.workspace, ".amc", "governor", "rollback-packs"); return existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")) : []; }
function checkWire(f: ReturnType<typeof fixture>, pack: Awaited<ReturnType<typeof canary.createRollbackPackAsync>>, head: string) {
  const body = { packId: pack.packId, agentId: pack.agentId, policyFileSha256: sha256Hex(pack.policyContent), reason: pack.reason, createdTs: pack.createdTs };
  const digest = sha256Hex(canonicalize(body)), pem = getSigningPublicKeyPem(f.workspace, "artifact-seal"), key = getSigningKey(f.workspace, "artifact-seal");
  expect(pack).toEqual({ ...body, policyContent: pack.policyContent, signature: sign(null, Buffer.from(digest, "hex"), key).toString("base64") });
  expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(pack.signature, "base64"))).toBe(true);
  const hash = sha256Hex(canonicalize({ ...pack, prev_record_hash: head })), outer = sign(null, Buffer.from(hash, "hex"), key).toString("base64");
  const expected = { ...pack, prev_record_hash: head, record_hash: hash, signature: outer, storedTs: pack.createdTs };
  expect(readFileSync(path(f, pack.packId), "utf8")).toBe(JSON.stringify(expected, null, 2));
  expect(verify(null, Buffer.from(hash, "hex"), pem, Buffer.from(outer, "base64"))).toBe(true);
  return { digest, hash, expected };
}
async function positive(f: ReturnType<typeof fixture>, reason = "fresh owned pack") {
  const head = records.workspaceRecordHead(f.workspace, AT), pack = await canary.createRollbackPackAsync("default", f.policy, reason, f.workspace);
  checkWire(f, pack, head); return pack;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>, phase: 1 | 2) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider); let calls = 0;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await actual(ref, bytes); if (++calls === phase) { entered.resolve(); await release.promise; } return signature;
  });
  return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused"),
    new Promise<string>(done => { timer = setTimeout(() => done("no actual Sign"), 5_000); })])).toBe("signed"); }
  finally { clearTimeout(timer); }
}

describe("actual async rollback-pack producer", () => {
  test("preserves the returned inner signature, legacy stored overwrite, exact raw32 requests and durable cold read", async () => {
    const f = fixture(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    const spy = vi.spyOn(f.provider, "sign"), pack = await canary.createRollbackPackAsync("default", f.policy, "pre-deploy", f.workspace);
    expect(pack.packId).toMatch(/^rbp_[a-f0-9-]{12}$/); expect(pack.createdTs).toBe(now); expect(pack.policyContent).toBe(f.policy);
    const { digest, hash, expected } = checkWire(f, pack, "GENESIS_ROLLBACK_PACKS");
    expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, bytes: Buffer.from(bytes) }))).toEqual([
      { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(digest, "hex") },
      { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(hash, "hex") }]);
    expect(expected.signature).not.toBe(pack.signature); expect(expected).not.toHaveProperty("rollback_signature");
    expect(canary.getRollbackPacks("default", f.workspace)).toEqual([pack]);
    canary.resetCanaryRegisters(); expect(canary.getLatestRollbackPack("default", f.workspace)).toEqual(expected);
  });

  test.each([undefined, ""])("preserves memory-only unsigned behavior without a workspace (%s)", async workspace => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign");
    const pack = await canary.createRollbackPackAsync("memory-only", f.policy, "no durable destination", workspace);
    expect(pack).toMatchObject({ agentId: "memory-only", policyContent: f.policy, signature: "unsigned" });
    expect(canary.getRollbackPacks("memory-only")).toEqual([pack]); expect(spy).not.toHaveBeenCalled(); expect(storedFiles(f)).toEqual([]);
  });

  test("the maintained SDK variant preserves existing agent-mode policy without inventing a blocked command", async () => {
    const f = fixture(); expect(sdk.createRollbackPackAsync).toBe(canary.createRollbackPackAsync); setMode(f.workspace, "agent");
    try { const pack = await sdk.createRollbackPackAsync("default", f.policy, "existing allowed command", f.workspace); checkWire(f, pack, "GENESIS_ROLLBACK_PACKS"); }
    finally { setMode(f.workspace, "owner"); }
  });

  test.each([1, 2] as const)("real Sign phase %s runs before the common lock and before any file/cache publication", async phase => {
    const f = fixture(), paused = pauseSign(f, phase), pending = canary.createRollbackPackAsync("default", f.policy, "paused", f.workspace);
    try {
      await atPause(paused, pending); expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]);
      records.withWorkspaceRecordPublicationLock(f.workspace, AT, () => expect(storedFiles(f)).toEqual([]));
      paused.release.resolve(); const pack = await pending; checkWire(f, pack, "GENESIS_ROLLBACK_PACKS");
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test.each([[1, "unavailable"], [1, "bad crypto"], [2, "unavailable"], [2, "bad crypto"]] as const)("phase %s %s never becomes an unsigned or successful pack", async (phase, failure) => {
    const f = fixture(), actual = f.provider.sign.bind(f.provider); let calls = 0;
    const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
      if (++calls === phase) { if (failure === "unavailable") throw new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned secret /not/output"); return Buffer.alloc(64); }
      return actual(ref, bytes);
    });
    await expect(canary.createRollbackPackAsync("default", f.policy, "refused", f.workspace)).rejects.toMatchObject({ code: failure === "unavailable" ? "KEY_PROVIDER_UNAVAILABLE" : "KEY_PROVIDER_KEY_REFUSED" });
    expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]); spy.mockRestore(); await positive(f);
  });

  test.each([1, 2] as const)("a real post-Sign vault lock in phase %s refuses both durable and cache publication", async phase => {
    const f = fixture(), paused = pauseSign(f, phase), pending = canary.createRollbackPackAsync("default", f.policy, "locked", f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); paused.release.resolve();
      expect(await outcome).toBeInstanceOf(Error); expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("the original inner authority cannot be replaced before the second checked Sign captures a new generation", async () => {
    const f = fixture(), firstPem = getSigningPublicKeyPem(f.workspace, "artifact-seal"), generation = assertKeysetComplete(f.workspace)!.generation;
    const actual = structuredClone; let changed = false;
    vi.spyOn(globalThis, "structuredClone").mockImplementation((value, options) => {
      const copied = actual(value, options);
      if (!changed && copied !== null && typeof copied === "object" && "packId" in copied && "policyContent" in copied && "signature" in copied) {
        changed = true; rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
      }
      return copied;
    });
    const signed: Array<{ bytes: Buffer; signature: Uint8Array }> = [], realSign = f.provider.sign.bind(f.provider);
    vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => { const signature = await realSign(ref, bytes); signed.push({ bytes: Buffer.from(bytes), signature }); return signature; });
    await expect(canary.createRollbackPackAsync("default", f.policy, "changed between signatures", f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(changed).toBe(true); expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation); expect(signed).toHaveLength(2);
    expect(verify(null, signed[0]!.bytes, firstPem, signed[0]!.signature)).toBe(true);
    expect(verify(null, signed[1]!.bytes, getSigningPublicKeyPem(f.workspace, "artifact-seal"), signed[1]!.signature)).toBe(true);
    expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]); vi.restoreAllMocks(); await positive(f);
  });

  test("a late serialization lock refuses after both actual signatures without a successful cache entry", async () => {
    const f = fixture(), actual = JSON.stringify; let changed = false;
    vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => {
      const bytes = actual(value, replacer as never, space);
      if (!changed && value !== null && typeof value === "object" && "packId" in value && "record_hash" in value) {
        changed = true; vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
      }
      return bytes;
    });
    const spy = vi.spyOn(f.provider, "sign");
    try {
      await expect(canary.createRollbackPackAsync("default", f.policy, "late lock", f.workspace)).rejects.toBeInstanceOf(Error);
      expect(changed).toBe(true); expect(spy).toHaveBeenCalledTimes(2); expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]);
    } finally { vi.restoreAllMocks(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("a real final atomic-write failure leaves no successful process-cache entry", async () => {
    const f = fixture(), actual = files.writeFileAtomic; let blocked: string | null = null;
    vi.spyOn(files, "writeFileAtomic").mockImplementation((file, bytes, mode) => {
      if (blocked === null && file.includes(join("governor", "rollback-packs")) && file.endsWith(".json")) { blocked = file; mkdirSync(file); }
      return actual(file, bytes, mode);
    });
    try { await expect(canary.createRollbackPackAsync("default", f.policy, "I/O refusal", f.workspace)).rejects.toBeInstanceOf(Error); expect(blocked).not.toBeNull(); expect(canary.getRollbackPacks("default")).toEqual([]); }
    finally { vi.restoreAllMocks(); if (blocked !== null) rmSync(blocked, { recursive: true, force: true }); }
    await positive(f);
  });

  test("a live-owner common-family lock refuses publication and release restores success", async () => {
    const f = fixture(), dir = join(f.workspace, ".amc"), name = `workspace-records-${sha256Hex(join(...AT.area, AT.kind)).slice(0, 24)}`;
    const contenders = join(dir, `.${name}-locks`), token = randomUUID(), contender = join(contenders, token + ".json"), lock = join(dir, `.${name}.lock`);
    mkdirSync(contenders, { recursive: true }); writeFileSync(contender, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), { mode: 0o600 }); linkSync(contender, lock);
    try { await expect(canary.createRollbackPackAsync("default", f.policy, "lock refusal", f.workspace)).rejects.toMatchObject({ code: "LOCK_TIMEOUT" }); expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]); }
    finally { if (existsSync(lock)) unlinkSync(lock); if (existsSync(contender)) unlinkSync(contender); }
    await positive(f);
  }, 15_000);

  test("a retained sync same-family winner during outer Sign invalidates only the signed predecessor", async () => {
    const f = fixture(), paused = pauseSign(f, 2), pending = canary.createRollbackPackAsync("default", f.policy, "stale outer head", f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const winner = canary.createRollbackPack("default", "owned: winner", "concurrent", f.workspace), before = readFileSync(path(f, winner.packId));
      paused.release.resolve(); expect(await outcome).toMatchObject({ message: "workspace record predecessor or destination changed while signing was prepared; retry" });
      expect(readFileSync(path(f, winner.packId))).toEqual(before); expect(canary.getRollbackPacks("default")).toEqual([winner]); expect(storedFiles(f)).toEqual([winner.packId + ".json"]);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test("a same-family append before outer preparation is legitimate and becomes the real predecessor", async () => {
    const f = fixture(), paused = pauseSign(f, 1), pending = canary.createRollbackPackAsync("default", f.policy, "first Sign paused", f.workspace);
    try {
      await atPause(paused, pending); const winner = canary.createRollbackPack("default", "owned: predecessor", "earlier durable write", f.workspace);
      const head = records.workspaceRecordHead(f.workspace, AT); paused.release.resolve(); const pack = await pending; checkWire(f, pack, head);
      expect(canary.getRollbackPacks("default").map(row => row.packId)).toEqual([winner, pack].sort((a, b) => a.createdTs - b.createdTs).map(row => row.packId));
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("a different-family append during outer Sign does not invalidate the prepared rollback body", async () => {
    const f = fixture(), paused = pauseSign(f, 2), pending = canary.createRollbackPackAsync("default", f.policy, "unrelated write", f.workspace);
    try {
      await atPause(paused, pending); records.saveWorkspaceRecord(f.workspace, { area: ["lab"], kind: "experiments" }, "unrelated", { owned: true }, Date.now());
      paused.release.resolve(); const pack = await pending; checkWire(f, pack, "GENESIS_ROLLBACK_PACKS");
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("unlocked no-sign compatibility remains signed while locked async refusal does not rewrite retained sync unsigned/ephemeral behavior", async () => {
    const f = fixture(); vi.stubEnv("AMC_NO_SIGN", "1"); await positive(f, "unlocked no-sign compatibility");
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); const before = storedFiles(f), live = [...canary.getRollbackPacks("default")];
    try {
      await expect(canary.createRollbackPackAsync("default", f.policy, "locked no-sign", f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
      expect(storedFiles(f)).toEqual(before); expect(canary.getRollbackPacks("default")).toEqual(live);
      const legacy = canary.createRollbackPack("legacy", f.policy, "retained ephemeral", f.workspace);
      const digest = sha256Hex(canonicalize({ packId: legacy.packId, agentId: legacy.agentId, policyFileSha256: legacy.policyFileSha256, reason: legacy.reason, createdTs: legacy.createdTs }));
      expect(verify(null, Buffer.from(digest, "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(legacy.signature, "base64"))).toBe(false);
      vi.stubEnv("AMC_NO_SIGN", "0"); const unsigned = canary.createRollbackPack("legacy", f.policy, "retained unsigned", f.workspace);
      expect(unsigned.signature).toBe("unsigned"); expect(JSON.parse(readFileSync(path(f, unsigned.packId), "utf8")).signature).toBe("unsigned");
    } finally { vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("an unbound configured provider refuses before Sign and never fabricates normal artifact binding", async () => {
    const f = fixture(), file = join(f.workspace, ".amc", "amc.config.yaml"), original = readFileSync(file), config = YAML.parse(original.toString("utf8"));
    config.keys = { provider: "aws-kms", refs: { "artifact-seal": { id: "owned-unbound-ref" } } }; writeFileSync(file, YAML.stringify(config));
    const spy = vi.spyOn(f.provider, "sign");
    try {
      await expect(canary.createRollbackPackAsync("default", f.policy, "unbound", f.workspace)).rejects.toMatchObject({ code: "KEY_PROVIDER_HELD" });
      expect(spy).not.toHaveBeenCalled(); expect(storedFiles(f)).toEqual([]); expect(canary.getRollbackPacks("default")).toEqual([]);
    } finally { writeFileSync(file, original); }
    await positive(f);
  });
});
