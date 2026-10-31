import { randomUUID, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { activateOverride, activateOverrideAsync, getActiveOverrides, verifyOverrideEntry } from "../../src/governor/emergencyOverride.js";
import { BreakGlassSigningError } from "../../src/governor/overrideSignature.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, nonce: "" }));
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () => boundary.nonce ? boundary.nonce as ReturnType<typeof actual.randomUUID> : actual.randomUUID();
  return { ...actual, randomUUID, default: { ...actual, randomUUID } };
});
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
const PASS = "governor-override-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
const PARAMS = { agentId: "default", reason: "Production outage needs a documented bypass", ttlMs: 3_600_000, mode: "dry-run" as const };
afterEach(() => {
  boundary.nonce = ""; boundary.call = undefined; vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-governor-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); return { root, workspace };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("override-a-" + randomUUID()), b = AWS_ARN("override-b-" + randomUUID()), key = fakeKey("p256"), next = fakeKey("p256");
  const fake = awsFake({ [a]: key, [b]: next }), control: { unavailable: boolean; afterSign?: () => Promise<void> } = { unavailable: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("secret https://private.invalid PIN=never-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region); if (operation === "Sign") await control.afterSign?.(); return answer;
  };
  const candidate = (id = a) => { const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } }; return Buffer.from(YAML.stringify(config)); };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS });
  const pause = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, a, b, key, next, fake, control, candidate, pause, pem: publicPem(key) };
}
const directory = (workspace: string) => join(workspace, ".amc", "governor", "overrides");
const files = (workspace: string) => existsSync(directory(workspace)) ? readdirSync(directory(workspace)).filter(name => name.endsWith(".json")) : [];
function domainBytes(hash: string) { return Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]), Buffer.from(hash, "hex")]); }
function expectP256(workspace: string, entry: Awaited<ReturnType<typeof activateOverrideAsync>>, pem: string) {
  expect(verifyCanonical("ecdsa-p256-sha256", domainBytes(entry.override_hash), pem, Buffer.from(entry.signature, "base64"))).toBe(true);
  expect(verifyOverrideEntry(workspace, entry)).toEqual({ valid: true });
}

describe("actual async governor override config-purpose activation", () => {
  test("default sync and async activation pin independent legacy fields, domain bytes and exact Ed25519 file bytes", async () => {
    const f = fixture(), now = Date.now(), key = getSigningKey(f.workspace, "config-signature"), uuid = "d9f38f50-f34e-4210-8f34-df8b7b965833";
    boundary.nonce = uuid; vi.spyOn(Date, "now").mockReturnValue(now);
    const body = { overrideId: `eor_${uuid.slice(0, 12)}`, agentId: PARAMS.agentId, reason: PARAMS.reason, ttlMs: PARAMS.ttlMs, mode: PARAMS.mode,
      startedTs: now, expiresTs: now + PARAMS.ttlMs, active: true, postmortemRequired: true, postmortemDueTs: now + PARAMS.ttlMs + 48 * 3_600_000,
      postmortemFiled: false, postmortemArtifactPath: null, prev_override_hash: "GENESIS_OVERRIDES" };
    const hash = sha256Hex(canonicalize(body)), signature = sign(null, domainBytes(hash), key).toString("base64");
    const expected = { ...body, actionLog: [], override_hash: hash, signature }, legacy = activateOverride(f.workspace, PARAMS);
    const path = join(directory(f.workspace), `${legacy.overrideId}.json`), bytes = readFileSync(path);
    expect(legacy).toEqual(expected); expect(bytes.toString()).toBe(JSON.stringify(expected, null, 2));
    unlinkSync(path); const issued = await activateOverrideAsync(f.workspace, PARAMS);
    expect(issued).toEqual(expected); expect(readFileSync(path)).toEqual(bytes); expect(getActiveOverrides(f.workspace, "default")).toEqual([expected]);
  });

  test("a real bound P256 provider activates with the vault locked and the public active reader verifies the exact domain signature", async () => {
    const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); const entry = await activateOverrideAsync(f.workspace, PARAMS);
    expectP256(f.workspace, entry, f.pem); expect(getActiveOverrides(f.workspace, "default").map(row => row.overrideId)).toEqual([entry.overrideId]);
    const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before); expect(calls).toHaveLength(1);
    expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(domainBytes(entry.override_hash));
    const beforeFiles = files(f.workspace); expect(() => activateOverride(f.workspace, PARAMS)).toThrow(expect.objectContaining({ code: "BREAK_GLASS_UNSIGNED" }));
    expect(files(f.workspace)).toEqual(beforeFiles);
    const bare = await signWithPurposeKey(f.workspace, "config-signature", Buffer.from(entry.override_hash, "hex"));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(entry.override_hash, "hex"), f.pem, bare.signature)).toBe(true);
    expect(verifyOverrideEntry(f.workspace, { ...entry, signature: bare.signature.toString("base64") })).toMatchObject({ valid: false, code: "SIGNATURE_INVALID" });
  });

  test("typed provider failure, no-sign and locked file refusal create no override or lock directory", async () => {
    const f = await bind(fixture()); f.control.unavailable = true;
    const error = await activateOverrideAsync(f.workspace, PARAMS).catch(error => error);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(String(error)).not.toMatch(/private\.invalid|PIN=|never-output/); expect(existsSync(directory(f.workspace))).toBe(false);
    f.control.unavailable = false; vi.stubEnv("AMC_NO_SIGN", "1"); await expect(activateOverrideAsync(f.workspace, PARAMS)).rejects.toMatchObject({ code: "BREAK_GLASS_UNSIGNED" });
    expect(existsSync(directory(f.workspace))).toBe(false); vi.stubEnv("AMC_NO_SIGN", "0");
    const local = fixture(); lockVault(local.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", "");
    await expect(activateOverrideAsync(local.workspace, PARAMS)).rejects.toMatchObject({ code: "BREAK_GLASS_UNSIGNED" }); expect(existsSync(directory(local.workspace))).toBe(false);
  });

  test("no-sign enabled during the actual provider wait refuses final governor publication, then a fresh positive works", async () => {
    const f = await bind(fixture()), paused = f.pause(), pending = activateOverrideAsync(f.workspace, PARAMS);
    const outcome = pending.then(() => null, error => error);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      expect(files(f.workspace)).toEqual([]); vi.stubEnv("AMC_NO_SIGN", "1"); paused.gate.resolve();
      const refused = await outcome; expect(refused).toBeInstanceOf(BreakGlassSigningError);
      expect(refused).toMatchObject({ code: "BREAK_GLASS_UNSIGNED" }); expect(files(f.workspace)).toEqual([]);
      expect(existsSync(join(directory(f.workspace), ".override-register.lock"))).toBe(false);
      expect(getActiveOverrides(f.workspace, "default")).toEqual([]);
    } finally { paused.gate.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
    const fresh = await activateOverrideAsync(f.workspace, PARAMS); expectP256(f.workspace, fresh, f.pem);
    expect(files(f.workspace)).toEqual([fresh.overrideId + ".json"]);
    expect(getActiveOverrides(f.workspace, "default").map(row => row.overrideId)).toEqual([fresh.overrideId]);
  });

  test("the prepared reason and lifetime cannot mutate during signing, and expiry during the wait refuses before any override file", async () => {
    const f = await bind(fixture()), params = { ...PARAMS }, paused = f.pause(), pending = activateOverrideAsync(f.workspace, params);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      params.reason = "mutated"; params.ttlMs = 1; paused.gate.resolve(); const entry = await pending;
      expect(entry.reason).toBe(PARAMS.reason); expect(entry.ttlMs).toBe(PARAMS.ttlMs); expectP256(f.workspace, entry, f.pem);
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    const before = files(f.workspace), started = Date.now(), late = f.pause(), expired = activateOverrideAsync(f.workspace, { ...PARAMS, ttlMs: 60_000 });
    try {
      expect(await Promise.race([late.entered.promise.then(() => "signed"), expired.then(() => "returned", () => "rejected")])).toBe("signed");
      vi.spyOn(Date, "now").mockReturnValue(started + 70_000); late.gate.resolve(); await expect(expired).rejects.toThrow("override expired while signing was prepared");
    } finally { late.gate.resolve(); await expired.catch(() => {}); vi.restoreAllMocks(); }
    expect(files(f.workspace)).toEqual(before); expectP256(f.workspace, await activateOverrideAsync(f.workspace, PARAMS), f.pem);
  });

  test("same-clock valid serial activations follow the signed unique chain rather than filename order", async () => {
    const f = await bind(fixture()), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    boundary.nonce = "f0000000-0000-4000-8000-000000000001"; const first = await activateOverrideAsync(f.workspace, PARAMS);
    boundary.nonce = "00000000-0000-4000-8000-000000000002"; const second = await activateOverrideAsync(f.workspace, PARAMS);
    boundary.nonce = "a0000000-0000-4000-8000-000000000003"; const third = await activateOverrideAsync(f.workspace, PARAMS);
    expect(first.prev_override_hash).toBe("GENESIS_OVERRIDES"); expect(second.prev_override_hash).toBe(first.override_hash); expect(third.prev_override_hash).toBe(second.override_hash);
    for (const entry of [first, second, third]) expectP256(f.workspace, entry, f.pem);
    expect(getActiveOverrides(f.workspace, "default")).toHaveLength(3);
  });

  test.each(["signed-fork", "invalid-signature"] as const)("an actual %s register refuses new activation without signing or erasing its audit evidence", async mutation => {
    const f = await bind(fixture()), first = await activateOverrideAsync(f.workspace, PARAMS), second = await activateOverrideAsync(f.workspace, PARAMS);
    const path = join(directory(f.workspace), `${second.overrideId}.json`), original = readFileSync(path);
    if (mutation === "signed-fork") {
      const { signature: _signature, override_hash: _hash, actionLog: _actions, ...body } = second; body.prev_override_hash = "GENESIS_OVERRIDES";
      const hash = sha256Hex(canonicalize(body)), signed = await signWithPurposeKey(f.workspace, "config-signature", domainBytes(hash));
      const fork = { ...second, prev_override_hash: "GENESIS_OVERRIDES", override_hash: hash, signature: signed.signature.toString("base64") };
      expectP256(f.workspace, fork, f.pem); writeFileSync(path, JSON.stringify(fork, null, 2));
    } else {
      const signature = Buffer.from(second.signature, "base64"); signature[0] = signature[0]! ^ 1;
      const altered = { ...second, signature: signature.toString("base64") }; expect(verifyOverrideEntry(f.workspace, altered).valid).toBe(false);
      writeFileSync(path, JSON.stringify(altered, null, 2));
    }
    const changed = readFileSync(path), before = f.fake.requests.filter(row => row.operation === "Sign").length;
    await expect(activateOverrideAsync(f.workspace, PARAMS)).rejects.toThrow("override register has no unique verified chain");
    expect(readFileSync(path)).toEqual(changed); expect(files(f.workspace)).toHaveLength(2);
    expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before);
    writeFileSync(path, original); const next = await activateOverrideAsync(f.workspace, PARAMS);
    expect(next.prev_override_hash).toBe(second.override_hash); expectP256(f.workspace, first, f.pem); expectP256(f.workspace, next, f.pem);
  });

  test("two actual waiting activations sign outside the publication lock, then the stale one refuses without forking the first", async () => {
    const f = await bind(fixture()), entered = [deferred(), deferred()], gates = [deferred(), deferred()]; let count = 0;
    f.control.afterSign = async () => { const index = count++; expect(existsSync(join(directory(f.workspace), ".override-register.lock"))).toBe(false); entered[index]!.resolve(); await gates[index]!.promise; };
    const first = activateOverrideAsync(f.workspace, PARAMS), second = activateOverrideAsync(f.workspace, { ...PARAMS, reason: "A second independently authorized owner request" });
    try {
      expect(await Promise.race([entered[0]!.promise.then(() => "signed"), first.then(() => "returned", () => "rejected")])).toBe("signed");
      expect(await Promise.race([entered[1]!.promise.then(() => "signed"), second.then(() => "returned", () => "rejected")])).toBe("signed");
      gates[0]!.resolve(); const entry = await first, before = files(f.workspace); gates[1]!.resolve();
      await expect(second).rejects.toThrow("override register changed while signing was prepared; retry"); expect(files(f.workspace)).toEqual(before);
      expectP256(f.workspace, entry, f.pem); expect(getActiveOverrides(f.workspace, "default").map(row => row.overrideId)).toEqual([entry.overrideId]);
    } finally { gates.forEach(gate => gate.resolve()); f.control.afterSign = undefined; await Promise.allSettled([first, second]); }
  });

  test("real owner rebind during signing refuses before activation and the next provider remains independently usable", async () => {
    const f = await bind(fixture()), paused = f.pause(), pending = activateOverrideAsync(f.workspace, PARAMS);
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); paused.gate.resolve();
      await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    expect(files(f.workspace)).toEqual([]); expectP256(f.workspace, await activateOverrideAsync(f.workspace, PARAMS), publicPem(f.next));
  });
});
