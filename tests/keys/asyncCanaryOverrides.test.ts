import { randomUUID, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { activateEmergencyOverride, activateEmergencyOverrideAsync, filePostmortem, generatePolicyCanaryReport, getActiveOverrides, resetPolicyCanaryState } from "../../src/governor/policyCanary.js";
import { BreakGlassSigningError } from "../../src/governor/overrideSignature.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { verifyCanonical, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, nonce: "",
  outerAfterSign: undefined as (() => Promise<void>) | undefined, outerMessages: [] as Uint8Array[] }));
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () => boundary.nonce ? boundary.nonce as ReturnType<typeof actual.randomUUID> : actual.randomUUID();
  return { ...actual, randomUUID, default: { ...actual, randomUUID } };
});
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
// Pause the real file provider after its actual signature. Authority, key lookup, crypto and purpose admission remain real.
vi.mock("../../src/keys/providers/file.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/file.js")>();
  return { ...actual, fileKeyProvider: (workspace: string) => {
    const provider = actual.fileKeyProvider(workspace);
    return { ...provider, async sign(...args: Parameters<typeof provider.sign>) {
      const answer = await provider.sign(...args);
      if (args[0].id === "artifact-seal") { boundary.outerMessages.push(Uint8Array.from(args[1])); await boundary.outerAfterSign?.(); }
      return answer;
    } };
  } };
});
const PASS = "canary-override-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
const PARAMS = { agentId: "default", reason: "Production incident requires documented recovery", actionDescription: "allow DEPLOY during incident response", ttlMs: 3_600_000 };
afterEach(() => {
  boundary.nonce = ""; boundary.call = undefined; boundary.outerAfterSign = undefined; boundary.outerMessages.length = 0;
  vi.restoreAllMocks(); resetPolicyCanaryState();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-canary-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); return { root, workspace };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("canary-a-" + randomUUID()), b = AWS_ARN("canary-b-" + randomUUID()), key = fakeKey("p256"), next = fakeKey("p256");
  const fake = awsFake({ [a]: key, [b]: next }), control: { unavailable: boolean; afterSign?: () => Promise<void> } = { unavailable: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("secret https://private.invalid PIN=never-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region); if (operation === "Sign") await control.afterSign?.(); return answer;
  };
  const candidate = (id = a) => { const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } }; return Buffer.from(YAML.stringify(config)); };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS }); boundary.outerMessages.length = 0;
  const pauseRemote = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, a, b, key, next, fake, control, candidate, pauseRemote, pem: publicPem(key) };
}
function pauseOuter() { const entered = deferred(), gate = deferred(); boundary.outerAfterSign = async () => { boundary.outerAfterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; }
const directory = (workspace: string) => join(workspace, ".amc", "governor", "emergency-overrides");
const files = (workspace: string) => existsSync(directory(workspace)) ? readdirSync(directory(workspace)).filter(name => name.endsWith(".json")) : [];
type Override = Awaited<ReturnType<typeof activateEmergencyOverrideAsync>>;
function domainBytes(entry: Override) {
  const { overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs } = entry;
  return Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]),
    Buffer.from(sha256Hex(canonicalize({ overrideId, agentId, reason, actionDescription, ttlMs, startedTs, expiresTs })), "hex")]);
}
function record(workspace: string, entry: Override) { return JSON.parse(readFileSync(join(directory(workspace), `${entry.overrideId}.json`), "utf8")); }
function expectActual(workspace: string, entry: Override, pem: string) {
  expect(verifyCanonical("ecdsa-p256-sha256", domainBytes(entry), pem, Buffer.from(entry.signature, "base64"))).toBe(true);
  const saved = record(workspace, entry), initialBody = { ...entry, override_signature: entry.signature };
  expect(saved.override_signature).toBe(entry.signature); expect(saved.signature).not.toBe("unsigned");
  expect(saved.record_hash).toBe(sha256Hex(canonicalize({ ...initialBody, prev_record_hash: saved.prev_record_hash })));
  expect(verifyWithKey(Buffer.from(saved.record_hash, "hex"), getSigningPublicKeyPem(workspace, "artifact-seal"), Buffer.from(saved.signature, "base64"))).toBe(true);
  expect(getActiveOverrides("default", workspace).map(row => row.overrideId)).toContain(entry.overrideId);
  expect(generatePolicyCanaryReport("default", workspace)).toMatchObject({ invalidOverrides: 0 });
}
async function entered(pause: ReturnType<typeof pauseOuter>, pending: Promise<unknown>) {
  expect(await Promise.race([pause.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
}

describe("actual async canary override publication", () => {
  test("recorded-at time is the actual final publication clock after both signatures, while activation time stays owned", async () => {
    const f = await bind(fixture()), started = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(started);
    const outer = pauseOuter(), pending = activateEmergencyOverrideAsync(PARAMS, f.workspace);
    try {
      await entered(outer, pending); clock.mockReturnValue(started + 2_500); outer.gate.resolve();
      const entry = await pending; expect(entry.startedTs).toBe(started); expect(entry.expiresTs).toBe(started + PARAMS.ttlMs);
      expect(record(f.workspace, entry).storedTs).toBe(started + 2_500); expectActual(f.workspace, entry, f.pem);
    } finally { outer.gate.resolve(); await Promise.allSettled([pending]); clock.mockRestore(); }
  });

  test("default activation independently pins legacy JSON field order and both exact Ed25519 signatures", async () => {
    const f = fixture(), now = Date.now(), uuid = "a1f38f50-f34e-4210-8f34-df8b7b965833";
    const configKey = getSigningKey(f.workspace, "config-signature"), artifactKey = getSigningKey(f.workspace, "artifact-seal");
    boundary.nonce = uuid; vi.spyOn(Date, "now").mockReturnValue(now);
    const body = { overrideId: `emo_${uuid.slice(0, 12)}`, agentId: PARAMS.agentId, reason: PARAMS.reason, actionDescription: PARAMS.actionDescription,
      ttlMs: PARAMS.ttlMs, startedTs: now, expiresTs: now + PARAMS.ttlMs };
    const hash = sha256Hex(canonicalize(body)), signature = sign(null, Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]), Buffer.from(hash, "hex")]), configKey).toString("base64");
    const expected = { ...body, postmortemFiled: false, postmortemArtifactId: null, signature };
    const recordBody = { ...expected, override_signature: signature }, prev_record_hash = "GENESIS_EMERGENCY_OVERRIDES";
    const record_hash = sha256Hex(canonicalize({ ...recordBody, prev_record_hash }));
    const expectedRecord = { ...recordBody, prev_record_hash, record_hash, signature: sign(null, Buffer.from(record_hash, "hex"), artifactKey).toString("base64"), storedTs: now };
    expect(activateEmergencyOverride(PARAMS, f.workspace)).toEqual(expected);
    const path = join(directory(f.workspace), `${expected.overrideId}.json`), bytes = readFileSync(path);
    expect(bytes.toString()).toBe(JSON.stringify(expectedRecord, null, 2)); unlinkSync(path);
    expect(await activateEmergencyOverrideAsync(PARAMS, f.workspace)).toEqual(expected); expect(readFileSync(path)).toEqual(bytes);
    expect(generatePolicyCanaryReport("default", f.workspace)).toMatchObject({ activeOverrides: 1, invalidOverrides: 0 });
  });

  test("normal owner P256 config binding reaches both actual signatures and the public active/report readers", async () => {
    const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
    const entry = await activateEmergencyOverrideAsync(PARAMS, f.workspace); expectActual(f.workspace, entry, f.pem);
    const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before); expect(calls).toHaveLength(1);
    expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(domainBytes(entry));
    expect(boundary.outerMessages).toHaveLength(1); expect(Buffer.from(boundary.outerMessages[0]!)).toEqual(Buffer.from(record(f.workspace, entry).record_hash, "hex"));
    const beforeFiles = files(f.workspace); expect(() => activateEmergencyOverride(PARAMS, f.workspace)).toThrow(expect.objectContaining({ code: "BREAK_GLASS_UNSIGNED" }));
    expect(files(f.workspace)).toEqual(beforeFiles); expect(generatePolicyCanaryReport("default", f.workspace).activeOverrides).toBe(1);
  });

  test("provider failure, no-sign and locked outer vault refuse without a record, unsigned fallback or initial lock directory", async () => {
    const f = await bind(fixture()); f.control.unavailable = true;
    const error = await activateEmergencyOverrideAsync(PARAMS, f.workspace).catch(error => error);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(String(error)).not.toMatch(/private\.invalid|PIN=|never-output/);
    expect(existsSync(directory(f.workspace))).toBe(false); f.control.unavailable = false;
    vi.stubEnv("AMC_NO_SIGN", "1"); await expect(activateEmergencyOverrideAsync(PARAMS, f.workspace)).rejects.toMatchObject({ code: "BREAK_GLASS_UNSIGNED" });
    expect(existsSync(directory(f.workspace))).toBe(false); vi.stubEnv("AMC_NO_SIGN", "0");
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(activateEmergencyOverrideAsync(PARAMS, f.workspace)).rejects.toMatchObject({ code: "BREAK_GLASS_UNSIGNED" }); expect(existsSync(directory(f.workspace))).toBe(false);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); expectActual(f.workspace, await activateEmergencyOverrideAsync(PARAMS, f.workspace), f.pem);
  });

  test.each(["provider", "outer"] as const)("no-sign enabled during the actual %s wait refuses final canary publication, then a fresh positive works", async phase => {
    const f = await bind(fixture()), paused = phase === "provider" ? f.pauseRemote() : pauseOuter();
    const pending = activateEmergencyOverrideAsync(PARAMS, f.workspace), outcome = pending.then(() => null, error => error);
    try {
      await entered(paused, pending); expect(files(f.workspace)).toEqual([]);
      if (phase === "outer") expect(boundary.outerMessages).toHaveLength(1);
      vi.stubEnv("AMC_NO_SIGN", "1"); paused.gate.resolve();
      const refused = await outcome; expect(refused).toBeInstanceOf(BreakGlassSigningError);
      expect(refused).toMatchObject({ code: "BREAK_GLASS_UNSIGNED" }); expect(files(f.workspace)).toEqual([]);
      expect(existsSync(join(directory(f.workspace), ".canary-overrides.lock"))).toBe(false);
      expect(getActiveOverrides("default", f.workspace)).toEqual([]);
    } finally { paused.gate.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
    const fresh = await activateEmergencyOverrideAsync(PARAMS, f.workspace); expectActual(f.workspace, fresh, f.pem);
    expect(files(f.workspace)).toEqual([fresh.overrideId + ".json"]);
    expect(generatePolicyCanaryReport("default", f.workspace)).toMatchObject({ activeOverrides: 1, invalidOverrides: 0 });
  });

  test("mutable input is owned before the config await and expiry during the outer await refuses publication", async () => {
    const f = await bind(fixture()), params = { ...PARAMS }, remote = f.pauseRemote(), pending = activateEmergencyOverrideAsync(params, f.workspace);
    try {
      await entered(remote, pending); params.reason = "mutated"; params.actionDescription = "mutated"; params.ttlMs = 1;
      remote.gate.resolve(); const entry = await pending; expect(entry).toMatchObject(PARAMS); expectActual(f.workspace, entry, f.pem);
    } finally { remote.gate.resolve(); await Promise.allSettled([pending]); }
    const before = files(f.workspace), now = Date.now(), outer = pauseOuter(), expired = activateEmergencyOverrideAsync({ ...PARAMS, ttlMs: 60_000 }, f.workspace);
    try {
      await entered(outer, expired); vi.spyOn(Date, "now").mockReturnValue(now + 70_000); outer.gate.resolve();
      await expect(expired).rejects.toThrow("canary override expired while signing was prepared");
    } finally { outer.gate.resolve(); await Promise.allSettled([expired]); vi.restoreAllMocks(); }
    expect(files(f.workspace)).toEqual(before); expectActual(f.workspace, await activateEmergencyOverrideAsync(PARAMS, f.workspace), f.pem);
  });

  test("owner config rebind during the actual outer signature wait refuses stale authority before any record", async () => {
    const f = await bind(fixture()), outer = pauseOuter(), pending = activateEmergencyOverrideAsync(PARAMS, f.workspace);
    try {
      await entered(outer, pending); expect(existsSync(join(directory(f.workspace), ".canary-overrides.lock"))).toBe(false);
      await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); outer.gate.resolve();
      await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    } finally { outer.gate.resolve(); await Promise.allSettled([pending]); }
    expect(files(f.workspace)).toEqual([]); expectActual(f.workspace, await activateEmergencyOverrideAsync(PARAMS, f.workspace), publicPem(f.next));
  });

  test("locking the actual file signer after its outer signature refuses publication, then unlock restores a real positive", async () => {
    const f = await bind(fixture()), outer = pauseOuter(), pending = activateEmergencyOverrideAsync(PARAMS, f.workspace);
    try {
      await entered(outer, pending); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); outer.gate.resolve();
      await expect(pending).rejects.toThrow();
    } finally { outer.gate.resolve(); await Promise.allSettled([pending]); }
    expect(files(f.workspace)).toEqual([]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
    expectActual(f.workspace, await activateEmergencyOverrideAsync(PARAMS, f.workspace), f.pem);
  });

  test("two real outer signatures prepare outside the lock and exact inventory refuses a stale concurrent publication", async () => {
    const f = await bind(fixture()), pauses = [{ entered: deferred(), gate: deferred() }, { entered: deferred(), gate: deferred() }]; let count = 0;
    boundary.outerAfterSign = async () => { const pause = pauses[count++]!; expect(existsSync(join(directory(f.workspace), ".canary-overrides.lock"))).toBe(false); pause.entered.resolve(); await pause.gate.promise; };
    const first = activateEmergencyOverrideAsync(PARAMS, f.workspace), second = activateEmergencyOverrideAsync({ ...PARAMS, reason: "Independent second incident response" }, f.workspace);
    try {
      await entered(pauses[0]!, first); await entered(pauses[1]!, second); pauses[0]!.gate.resolve(); const entry = await first, before = files(f.workspace);
      pauses[1]!.gate.resolve(); await expect(second).rejects.toThrow("canary override register changed while signing was prepared; retry");
      expect(files(f.workspace)).toEqual(before); expectActual(f.workspace, entry, f.pem); expect(generatePolicyCanaryReport("default", f.workspace).activeOverrides).toBe(1);
    } finally { pauses.forEach(pause => pause.gate.resolve()); boundary.outerAfterSign = undefined; await Promise.allSettled([first, second]); }
  });

  test("an actual public postmortem update during the outer wait invalidates the exact captured register", async () => {
    const f = fixture(), legacy = activateEmergencyOverride(PARAMS, f.workspace), bound = await bind(f), before = readFileSync(join(directory(f.workspace), `${legacy.overrideId}.json`));
    const outer = pauseOuter(), pending = activateEmergencyOverrideAsync(PARAMS, f.workspace);
    try {
      await entered(outer, pending); expect(filePostmortem(legacy.overrideId, "actual-postmortem-artifact", f.workspace)).toBe(true);
      const updated = readFileSync(join(directory(f.workspace), `${legacy.overrideId}.json`)); expect(updated).not.toEqual(before);
      outer.gate.resolve(); await expect(pending).rejects.toThrow("canary override register changed while signing was prepared; retry");
      expect(files(f.workspace)).toHaveLength(1); expect(readFileSync(join(directory(f.workspace), `${legacy.overrideId}.json`))).toEqual(updated);
    } finally { outer.gate.resolve(); await Promise.allSettled([pending]); }
    expect(getActiveOverrides("default", f.workspace).find(row => row.overrideId === legacy.overrideId)).toMatchObject({ postmortemFiled: true, postmortemArtifactId: "actual-postmortem-artifact" });
    // No reconstructed historical hash claim: the next activation preserves the old record store's current-head rule.
    const oldHead = record(f.workspace, legacy).record_hash, fresh = await activateEmergencyOverrideAsync(PARAMS, f.workspace);
    expect(record(f.workspace, fresh).prev_record_hash).toBe(oldHead); expectActual(f.workspace, fresh, bound.pem);
  });
});
