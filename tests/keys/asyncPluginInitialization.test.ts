import { randomUUID, sign } from "node:crypto";
import * as nativeFs from "node:fs";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initPluginWorkspace, initPluginWorkspaceAsync, listInstalledPlugins, verifyPluginWorkspace } from "../../src/plugins/pluginApi.js";
import { defaultInstalledPluginsLock, defaultPluginRegistriesConfig, loadInstalledPluginsLock, pluginInstalledPackagePath, pluginsInstalledLockPath, pluginsRegistriesPath, saveInstalledPluginsLock, savePluginRegistriesConfig, verifyInstalledPluginsLock } from "../../src/plugins/pluginStore.js";
import { pluginKeygen, pluginPack } from "../../src/plugins/pluginPackage.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { derToP1363, lowS, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider, type KmsCall } from "../../src/keys/providers/awsKms.js";
import { initApprovalPolicy } from "../../src/approvals/approvalPolicyEngine.js";
import { setMode } from "../../src/mode/mode.js";
import { runStudioForeground } from "../../src/studio/studioSupervisor.js";
import { initGatewayConfig, defaultGatewayConfig } from "../../src/gateway/config.js";
import { initBlobKey } from "../../src/storage/blobs/blobKeys.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import * as contained from "../../src/utils/containedFs.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";
import { assertNativeExecutableInstalled, readInstalledNativeExecutable } from "../../src/plugins/nativeExecutablePackage.js";
import { NATIVE_EXECUTABLE_LIMITS, type NativeExecutableReference } from "../../src/plugins/nativeExecutableSchema.js";
import { signDigestWithPolicyAsync } from "../../src/crypto/signing/signer.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined,
  afterClose: undefined as ((identity: { dev: number; ino: number }) => void) | undefined }));
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const closeSync = (fd: number) => { const hook = boundary.afterClose, info = hook === undefined ? undefined : actual.fstatSync(fd);
    actual.closeSync(fd); if (info !== undefined) hook!({ dev: info.dev, ino: info.ino }); };
  return { ...actual, closeSync, default: { ...actual, closeSync } };
});
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
const PASS = "plugin-initialization-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks(); boundary.call = undefined;
  boundary.afterClose = undefined;
  const failures: unknown[] = [];
  for (const close of closers.splice(0)) { try { await close(); } catch (error) { failures.push(error); } }
  for (const f of roots.splice(0)) { try { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } catch (error) { failures.push(error); } }
  vi.unstubAllEnvs(); if (failures.length) throw new AggregateError(failures, "owned plugin fixture cleanup failed");
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-plugin-init-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Approval remains a held independent cold-start dependency; initialize it under the real default key before binding.
  initApprovalPolicy(workspace); return { root, workspace };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const id = AWS_ARN("plugin-config-" + randomUUID()), key = fakeKey("p256"), fake = awsFake({ [id]: key });
  const control: { failure: "none" | "unavailable" | "corrupt"; afterSign?: () => Promise<void> } = { failure: "none" };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.failure === "unavailable") throw Object.assign(new Error("private endpoint PIN=do-not-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") {
      if (control.failure === "corrupt") { const signature = Buffer.from(answer.Signature as Uint8Array); signature[signature.length - 1] = signature[signature.length - 1]! ^ 1; answer.Signature = signature; }
      await control.afterSign?.();
    } return answer;
  };
  const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8")); config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
  await transitionConfigSignatureProvider(f.workspace, Buffer.from(YAML.stringify(config)), { passphrase: PASS });
  const pause = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, id, key, fake, control, pause, pem: publicPem(key) };
}
const paths = (workspace: string) => [pluginsRegistriesPath(workspace), pluginsRegistriesPath(workspace) + ".sig", pluginsInstalledLockPath(workspace), pluginsInstalledLockPath(workspace) + ".sig"];
const snapshot = (workspace: string) => paths(workspace).map(path => existsSync(path) ? readFileSync(path) : null);
async function entered(pause: { entered: ReturnType<typeof deferred> }, pending: Promise<unknown>) {
  expect(await Promise.race([pause.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
}
function expectProviderLock(f: Awaited<ReturnType<typeof bind>>) {
  const body = readFileSync(pluginsInstalledLockPath(f.workspace)), signed = JSON.parse(readFileSync(pluginsInstalledLockPath(f.workspace) + ".sig", "utf8"));
  expect(signed.digestSha256).toBe(sha256Hex(body)); expect(signed.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", pubkeyB64: Buffer.from(f.pem).toString("base64"), signer: { type: "VAULT" } });
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(signed.digestSha256, "hex"), f.pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(true); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
}
function installedFixture(f: ReturnType<typeof fixture>) {
  const id = "amc.plugin.p208.preserved", version = "1.0.0", source = join(f.root, "source"), keys = pluginKeygen({ outDir: join(f.root, "publisher") });
  mkdirSync(join(source, "content", "learn", "questions"), { recursive: true }); writeFileSync(join(source, "content", "learn", "questions", "AMC-P208.md"), "# preserved installed plugin\n");
  writeFileSync(join(source, "manifest.json"), JSON.stringify({ v: 1, plugin: { id, name: id, version, description: "actual preserved fixture", publisher: { org: "Owned fixture", contact: "ops@example.com", website: "https://example.com", pubkeyFingerprint: "0".repeat(64) },
    compatibility: { amcMinVersion: ">=1.0.0", nodeMinVersion: ">=20", schemaVersions: { policyPacks: 1, assurancePacks: 1, complianceMaps: 1, adapters: 1, outcomes: 1, casebooks: 1, transform: 1 } },
    risk: { category: "LOW", notes: "owned fixture", touches: ["learn"] } }, artifacts: [], generatedTs: Date.now(), signing: { algorithm: "ed25519", pubkeyFingerprint: "0".repeat(64) } }));
  const packageFile = join(f.root, "fixture.amcplug"); pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: packageFile });
  const installed = pluginInstalledPackagePath(f.workspace, id, version); mkdirSync(dirname(installed), { recursive: true }); copyFileSync(packageFile, installed);
  const lock = defaultInstalledPluginsLock(f.workspace); lock.installed = [{ id, version, sha256: sha256Hex(readFileSync(installed)), registryFingerprint: "f".repeat(64), publisherFingerprint: keys.fingerprint, installedTs: Date.now() }];
  saveInstalledPluginsLock(f.workspace, lock); return { lock, installed };
}

test("default initialization pins independent legacy registries/lock bytes and both exact Ed25519 sidecars", async () => {
  const f = fixture(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
  const registry = Buffer.from("pluginRegistries:\n  version: 1\n  registries: []\n"), hash = (rel: string, missing: string) => existsSync(join(f.workspace, rel)) ? sha256Hex(readFileSync(join(f.workspace, rel))) : sha256Hex(missing);
  const lock = Buffer.from(JSON.stringify({ v: 1, updatedTs: now, installed: [], policySnapshot: {
    actionPolicySha256: hash(".amc/action-policy.yaml", "missing-action-policy"), toolsSha256: hash(".amc/tools.yaml", "missing-tools"), budgetsSha256: hash(".amc/budgets.yaml", "missing-budgets"),
    approvalPolicySha256: hash(".amc/approval-policy.yaml", "missing-approval-policy"), opsPolicySha256: hash(".amc/ops-policy.yaml", "missing-ops-policy"), registriesSha256: sha256Hex(registry) } }, null, 2));
  const sidecar = (bytes: Buffer, purpose: "artifact-seal" | "config-signature") => { const digest = sha256Hex(bytes), pem = getSigningPublicKeyPem(f.workspace, purpose), signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, purpose)).toString("base64");
    return Buffer.from(JSON.stringify({ digestSha256: digest, signature, signedTs: now, signer: "auditor", envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(pem), sigB64: signature, signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } }, null, 2)); };
  const expected = [registry, sidecar(registry, "artifact-seal"), lock, sidecar(lock, "config-signature")];
  initPluginWorkspace({ workspace: f.workspace }); expect(snapshot(f.workspace)).toEqual(expected);
  rmSync(join(f.workspace, ".amc", "plugins"), { recursive: true }); await initPluginWorkspaceAsync({ workspace: f.workspace }); expect(snapshot(f.workspace)).toEqual(expected);
  expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
});

test("normal bound config initialization signs exact installed-lock bytes outside the publication lock and verifies through real public consumers", async () => {
  const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length;
  f.control.afterSign = async () => { expect(existsSync(join(f.workspace, ".amc", "plugins", ".plugin-initialization.lock"))).toBe(false); expect(snapshot(f.workspace)).toEqual([null, null, null, null]); };
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
  const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before); expect(calls).toHaveLength(1);
  expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(Buffer.from(sha256Hex(readFileSync(pluginsInstalledLockPath(f.workspace))), "hex"));
});

test("missing registries repair preserves real installed package rows and its exact authenticated lock/sidecar", async () => {
  const local = fixture(); initPluginWorkspace({ workspace: local.workspace }); const installed = installedFixture(local), before = snapshot(local.workspace), packageBytes = readFileSync(installed.installed);
  unlinkSync(pluginsRegistriesPath(local.workspace)); unlinkSync(pluginsRegistriesPath(local.workspace) + ".sig"); const f = await bind(local), calls = f.fake.requests.filter(row => row.operation === "Sign").length;
  await initPluginWorkspaceAsync({ workspace: f.workspace }); const after = snapshot(f.workspace);
  expect(after[2]).toEqual(before[2]); expect(after[3]).toEqual(before[3]); expect(readFileSync(installed.installed)).toEqual(packageBytes);
  expect(loadInstalledPluginsLock(f.workspace).installed).toEqual(installed.lock.installed); expect(listInstalledPlugins(f.workspace).items).toHaveLength(1);
  expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true); expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(calls);
});

test("a preserved custom registry pair is not reset when only the installed lock is missing", async () => {
  const local = fixture(), registries = defaultPluginRegistriesConfig(); registries.pluginRegistries.registries = [{ id: "owned", type: "file", base: "/owned/registry", pinnedRegistryPubkeyFingerprint: "a".repeat(64), allowPluginPublishers: [], allowRiskCategories: ["LOW"], autoUpdate: false }];
  savePluginRegistriesConfig(local.workspace, registries); const before = snapshot(local.workspace), f = await bind(local);
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expect(snapshot(f.workspace).slice(0, 2)).toEqual(before.slice(0, 2));
  expect(loadInstalledPluginsLock(f.workspace).policySnapshot.registriesSha256).toBe(sha256Hex(before[0]!)); expectProviderLock(f);
});

test.each(["unavailable", "corrupt"] as const)("actual %s config provider cannot publish either initial pair or fall back", async failure => {
  const f = await bind(fixture()); f.control.failure = failure; const error = await initPluginWorkspaceAsync({ workspace: f.workspace }).catch(error => error);
  expect(error).toMatchObject({ name: "KeyProviderError" }); expect(String(error)).not.toMatch(/PIN=|private endpoint/); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  f.control.failure = "none"; await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("synchronous compatibility init/save refuse a provider-held write before overwriting absent or complete pairs", async () => {
  const f = await bind(fixture()); expect(() => initPluginWorkspace({ workspace: f.workspace })).toThrow(); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  await initPluginWorkspaceAsync({ workspace: f.workspace }); const before = snapshot(f.workspace), lock = loadInstalledPluginsLock(f.workspace); lock.updatedTs++;
  expect(() => saveInstalledPluginsLock(f.workspace, lock)).toThrow(); expect(snapshot(f.workspace)).toEqual(before); expectProviderLock(f);
});

test("installed-lock verification keeps absent-envelope compatibility but refuses another actual auditor purpose and a present mislabeled envelope", async () => {
  const local = fixture(); rotatePurposeKeys({ workspace: local.workspace, purposes: ["artifact-seal"], passphrase: PASS }); const f = await bind(local);
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
  const path = pluginsInstalledLockPath(f.workspace) + ".sig", original = readFileSync(path), actual = JSON.parse(original.toString()), { envelope: _envelope, ...legacy } = actual;
  writeFileSync(path, JSON.stringify(legacy, null, 2)); expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(true); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
  writeFileSync(path, JSON.stringify({ ...actual, envelope: { ...actual.envelope, alg: "ed25519" } }, null, 2));
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(actual.digestSha256, "hex"), f.pem, Buffer.from(actual.signature, "base64"))).toBe(true);
  expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(false);
  const other = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: actual.digestSha256 });
  expect(verifyCanonical("ed25519", Buffer.from(actual.digestSha256, "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(other.signature, "base64"))).toBe(true);
  writeFileSync(path, JSON.stringify(other, null, 2)); expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(false); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(false);
  // The actual artifact key remains mathematically valid; changing an unsigned mode label cannot admit its purpose.
  const relabeled = { ...other, envelope: { ...other.envelope!, signer: { ...other.envelope!.signer, type: "NOTARY" as const, notaryFingerprint: other.envelope!.fingerprint } } };
  writeFileSync(path, JSON.stringify(relabeled, null, 2)); expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(false); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(false);
  writeFileSync(path, original); expectProviderLock(f);
});

test("every actual installation-policy body input is pinned across remote signing, including an appeared registry", async () => {
  const f = await bind(fixture());
  for (const rel of [".amc/action-policy.yaml", ".amc/tools.yaml", ".amc/budgets.yaml", ".amc/approval-policy.yaml", ".amc/ops-policy.yaml", ".amc/plugins/registries.yaml"]) {
    const path = join(f.workspace, rel), original = existsSync(path) ? readFileSync(path) : null, pause = f.pause(), pending = initPluginWorkspaceAsync({ workspace: f.workspace });
    try {
      await entered(pause, pending);
      if (rel.endsWith("registries.yaml")) savePluginRegistriesConfig(f.workspace, defaultPluginRegistriesConfig()); else writeFileSync(path, Buffer.concat([original ?? Buffer.alloc(0), Buffer.from("\n# actual concurrent policy input change\n")]));
      pause.gate.resolve(); await expect(pending, rel).rejects.toThrow("plugin initialization inputs changed while signatures were prepared; retry");
      expect(existsSync(pluginsInstalledLockPath(f.workspace))).toBe(false);
    } finally {
      pause.gate.resolve(); await Promise.allSettled([pending]);
      if (original === null) { rmSync(path, { force: true }); if (rel.endsWith("registries.yaml")) rmSync(path + ".sig", { force: true }); } else writeFileSync(path, original);
    }
  }
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("a sidecar-only policy change during Sign refuses before publication while exact restoration remains usable", async () => {
  const f = await bind(fixture()), path = join(f.workspace, ".amc", "ops-policy.yaml.sig"), original = readFileSync(path), pause = f.pause(), pending = initPluginWorkspaceAsync({ workspace: f.workspace });
  try {
    await entered(pause, pending); writeFileSync(path, Buffer.concat([original, Buffer.from("\n")])); pause.gate.resolve();
    await expect(pending).rejects.toThrow("plugin initialization inputs changed while signatures were prepared; retry"); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); writeFileSync(path, original); }
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("two actual initializers preserve the first accepted exact pair and the stale one refuses", async () => {
  const f = await bind(fixture()), pauses = [{ entered: deferred(), gate: deferred() }, { entered: deferred(), gate: deferred() }]; let count = 0;
  f.control.afterSign = async () => { const pause = pauses[count++]!; pause.entered.resolve(); await pause.gate.promise; };
  const first = initPluginWorkspaceAsync({ workspace: f.workspace }), second = initPluginWorkspaceAsync({ workspace: f.workspace });
  try {
    await entered(pauses[0]!, first); await entered(pauses[1]!, second); pauses[0]!.gate.resolve(); await first; const accepted = snapshot(f.workspace); pauses[1]!.gate.resolve();
    await expect(second).rejects.toThrow("plugin initialization inputs changed while signatures were prepared; retry"); expect(snapshot(f.workspace)).toEqual(accepted); expectProviderLock(f);
  } finally { pauses.forEach(pause => pause.gate.resolve()); f.control.afterSign = undefined; await Promise.allSettled([first, second]); }
});

test("the actual owner-mode rule is rechecked after Sign before initialization publishes", async () => {
  const f = await bind(fixture()), pause = f.pause(), pending = initPluginWorkspaceAsync({ workspace: f.workspace });
  try {
    await entered(pause, pending); setMode(f.workspace, "agent"); pause.gate.resolve();
    await expect(pending).rejects.toThrow("Command 'plugin init' is blocked in agent mode"); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  } finally { pause.gate.resolve(); await Promise.allSettled([pending]); setMode(f.workspace, "owner"); }
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("the first registry file signer must remain usable after the second config provider returns a real valid signature", async () => {
  const f = await bind(fixture()), dispatch = boundary.call!, waiting = deferred(), gate = deferred();
  let observed: { message: Buffer; signature: Buffer } | null = null;
  boundary.call = async (operation, input, region) => {
    const answer = await dispatch(operation, input, region);
    if (operation === "Sign" && observed === null) { observed = { message: Buffer.from(input.Message as Uint8Array), signature: Buffer.from(answer.Signature as Uint8Array) }; waiting.resolve(); await gate.promise; }
    return answer;
  };
  const pending = initPluginWorkspaceAsync({ workspace: f.workspace });
  try {
    expect(await Promise.race([waiting.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
    expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); gate.resolve();
    await expect(pending).rejects.toThrow("Vault locked"); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
    expect(observed).not.toBeNull();
    expect(verifyCanonical("ecdsa-p256-sha256", observed!.message, f.pem, lowS(derToP1363(observed!.signature)))).toBe(true);
  } finally {
    gate.resolve(); await Promise.allSettled([pending]); boundary.call = dispatch; vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
  }
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("plugin publication intentionally refuses no-sign even with an unlocked key while the generic synchronous signing SDK retains its old behavior", async () => {
  const f = fixture(), digest = sha256Hex("actual synchronous SDK compatibility control");
  vi.stubEnv("AMC_NO_SIGN", "1");
  try {
    const generic = signDigestWithPolicy({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: digest });
    expect(verifyCanonical("ed25519", Buffer.from(digest, "hex"), getSigningPublicKeyPem(f.workspace, "config-signature"), Buffer.from(generic.signature, "base64"))).toBe(true);
    expect(() => initPluginWorkspace({ workspace: f.workspace })).toThrow("no-sign mode does not authorize policy signing");
    await expect(initPluginWorkspaceAsync({ workspace: f.workspace })).rejects.toThrow("no-sign mode does not authorize policy signing");
    expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  } finally { vi.stubEnv("AMC_NO_SIGN", "0"); }
  await initPluginWorkspaceAsync({ workspace: f.workspace }); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
  const before = snapshot(f.workspace), lock = loadInstalledPluginsLock(f.workspace); lock.updatedTs++;
  vi.stubEnv("AMC_NO_SIGN", "1");
  try { expect(() => saveInstalledPluginsLock(f.workspace, lock)).toThrow("no-sign mode does not authorize policy signing"); expect(snapshot(f.workspace)).toEqual(before); }
  finally { vi.stubEnv("AMC_NO_SIGN", "0"); }
  expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
});

async function ownedNotary(f: Awaited<ReturnType<typeof bind>>) {
  const id = AWS_ARN("plugin-notary-" + randomUUID()), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call), description = await provider.describe({ provider: "aws-kms", id });
  const requests: Array<{ kind: string; payload: Buffer }> = [], pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem); let unavailable = false;
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks), config = loadTrustConfig(f.workspace);
      const auth = verifyNotaryRequestAuth({ req, bodyBytes: body, secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef), headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
      if (!auth.ok) { res.statusCode = 401; res.end("owned auth refused"); return; }
      const parsed = JSON.parse(body.toString()), payload = Buffer.from(parsed.payloadB64, "base64"); requests.push({ kind: parsed.kind, payload });
      if (unavailable) { res.statusCode = 503; res.end("private notary response"); return; }
      const signature = await signChecked(provider, description, payload);
      res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), { signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem,
        pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER", attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
    } catch { res.statusCode = 500; res.end("owned transport failure"); }
  });
  const socket = join(f.root, "plugin-notary.sock"); await new Promise<void>(done => server.listen(socket, done));
  closers.push(() => new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : done()); }));
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: "http://127.0.0.1:1", unixSocketPath: socket, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  // Real owner-signed policy: only the installed-lock kind takes the existing NOTARY route.
  const config = loadTrustConfig(f.workspace); config.trust.enforcement.requireNotaryFor = ["INSTALLED_LOCK"]; config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false;
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(config))), signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigPath(f.workspace), bytes); writeFileSync(trustConfigSigPath(f.workspace), JSON.stringify(signed, null, 2)); expect(verifyTrustConfigSignature(f.workspace).valid).toBe(true);
  return { description, requests, setUnavailable(value: boolean) { unavailable = value; } };
}

test("the actual signed policy selects NOTARY for installed-lock and its metadata/crypto survive without any config-provider fallback", async () => {
  const f = await bind(fixture()), notary = await ownedNotary(f), before = f.fake.requests.filter(row => row.operation === "Sign").length;
  await initPluginWorkspaceAsync({ workspace: f.workspace }); const signed = JSON.parse(readFileSync(pluginsInstalledLockPath(f.workspace) + ".sig", "utf8"));
  expect(notary.requests).toHaveLength(1); expect(notary.requests[0]).toEqual({ kind: "INSTALLED_LOCK", payload: Buffer.from(sha256Hex(readFileSync(pluginsInstalledLockPath(f.workspace))), "hex") });
  expect(signed.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", signer: { type: "NOTARY", attestationLevel: "HARDWARE", attestationBasis: "provider-metadata" } });
  expect(verifyCanonical("ecdsa-p256-sha256", notary.requests[0]!.payload, notary.description.publicKeyPem, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
  const sidecar = pluginsInstalledLockPath(f.workspace) + ".sig", original = readFileSync(sidecar);
  const other = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: signed.digestSha256 });
  expect(verifyCanonical("ed25519", Buffer.from(signed.digestSha256, "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(other.signature, "base64"))).toBe(true);
  const relabeled = { ...other, envelope: { ...other.envelope!, signer: { ...other.envelope!.signer, type: "NOTARY" as const, notaryFingerprint: other.envelope!.fingerprint } } };
  writeFileSync(sidecar, JSON.stringify(relabeled, null, 2));
  expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(false); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(false);
  writeFileSync(sidecar, original); expect(verifyInstalledPluginsLock(f.workspace).valid).toBe(true); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
});

test("a required real notary failure leaves both initial pairs absent and never substitutes the otherwise usable config provider", async () => {
  const f = await bind(fixture()), notary = await ownedNotary(f), before = f.fake.requests.filter(row => row.operation === "Sign").length; notary.setUnavailable(true);
  await expect(initPluginWorkspaceAsync({ workspace: f.workspace })).rejects.toThrow(); expect(snapshot(f.workspace)).toEqual([null, null, null, null]); expect(f.fake.requests.filter(row => row.operation === "Sign")).toHaveLength(before);
  notary.setUnavailable(false); await initPluginWorkspaceAsync({ workspace: f.workspace }); expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
});

test("a filesystem boundary failure reports actual published paths and refuses a later incomplete-pair overwrite", async () => {
  const f = await bind(fixture()), write = contained.writeContained; let fail = true;
  const fault = vi.spyOn(contained, "writeContained").mockImplementation((workspace, rel, bytes, mode) => {
    if (workspace === f.workspace && rel === ".amc/plugins/installed.lock.json.sig" && fail) { fail = false; throw new Error("owned filesystem publication failure"); }
    return write(workspace, rel, bytes, mode);
  });
  try {
    await expect(initPluginWorkspaceAsync({ workspace: f.workspace })).rejects.toMatchObject({ code: "PLUGIN_INITIALIZATION_PARTIAL", publishedPaths: [".amc/plugins/registries.yaml", ".amc/plugins/registries.yaml.sig", ".amc/plugins/installed.lock.json"] });
  } finally { fault.mockRestore(); }
  const before = snapshot(f.workspace); expect(before[0]).not.toBeNull(); expect(before[1]).not.toBeNull(); expect(before[2]).not.toBeNull(); expect(before[3]).toBeNull();
  await expect(initPluginWorkspaceAsync({ workspace: f.workspace })).rejects.toThrow("incomplete existing signed pair"); expect(snapshot(f.workspace)).toEqual(before);
  // Explicit owned-fixture recovery of the one unpublished lock pair; no automatic rollback is asserted.
  unlinkSync(pluginsInstalledLockPath(f.workspace)); await initPluginWorkspaceAsync({ workspace: f.workspace }); expectProviderLock(f);
});

test("the actual supervisor awaits missing plugin initialization after other owner-held startup prerequisites already exist", async () => {
  const local = fixture(), gateway = defaultGatewayConfig(); gateway.listen.port = 0; initGatewayConfig(local.workspace, gateway);
  initBlobKey(local.workspace);
  const f = await bind(local); expect(snapshot(f.workspace)).toEqual([null, null, null, null]);
  const runtime = await runStudioForeground({ workspace: f.workspace, apiPort: 0, dashboardPort: 0, gatewayPort: 0, proxyPort: 0, metricsPort: 0 });
  try { expectProviderLock(f); expect(runtime.state.apiPort).toBeGreaterThan(0); }
  finally { await runtime.stop(); }
});

function nativeWorkspace() {
  const root = nativeFs.realpathSync(mkdtempSync(join(tmpdir(), "amc-plugin-native-reader-"))), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initApprovalPolicy(workspace); return { root, workspace };
}
/** Real owned package and owner-signed row fixture, not an asynchronous install/approval transaction. */
async function nativePackage(f: Awaited<ReturnType<typeof bind>>) {
  const id = "amc.plugin.p208.native-reader", version = "1.0.0", entrypoint = "content/extensions/read-only.mjs", source = join(f.root, "native-source");
  const module = 'throw new Error("native verifier must not evaluate module text");\nexport function context() { return "owned"; }\n';
  mkdirSync(join(source, "content", "extensions"), { recursive: true }); writeFileSync(join(source, entrypoint), module);
  const keys = pluginKeygen({ outDir: join(f.root, "native-publisher") });
  writeFileSync(join(source, "manifest.json"), JSON.stringify({ v: 1, plugin: { id, name: id, version, description: "actual native reader package", publisher: { org: "Owned fixture", contact: "ops@example.com", website: "https://example.com", pubkeyFingerprint: "0".repeat(64) },
    compatibility: { amcMinVersion: "0.0.1", nodeMinVersion: "20.0.0", schemaVersions: { policyPacks: 1, assurancePacks: 1, complianceMaps: 1, adapters: 1, outcomes: 1, casebooks: 1, transform: 1 } },
    risk: { category: "HIGH", notes: "bounded signed text only", touches: ["extensions"] } }, artifacts: [], generatedTs: Date.now(), signing: { algorithm: "ed25519", pubkeyFingerprint: "0".repeat(64) } }));
  const archive = join(f.root, "native.amcplug"); pluginPack({ inputDir: source, keyPath: keys.privateKeyPath, outFile: archive });
  const installed = pluginInstalledPackagePath(f.workspace, id, version); mkdirSync(dirname(installed), { recursive: true }); copyFileSync(archive, installed);
  const bytes = readFileSync(installed), lock = loadInstalledPluginsLock(f.workspace); lock.updatedTs = Date.now();
  lock.installed = [{ id, version, sha256: sha256Hex(bytes), registryFingerprint: "a".repeat(64), publisherFingerprint: keys.fingerprint, installedTs: Date.now() }];
  const body = Buffer.from(JSON.stringify(lock, null, 2)), signed = await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "INSTALLED_LOCK", digestHex: sha256Hex(body) });
  writeFileSync(pluginsInstalledLockPath(f.workspace), body); writeFileSync(pluginsInstalledLockPath(f.workspace) + ".sig", JSON.stringify(signed, null, 2));
  const reference: NativeExecutableReference = { pluginId: id, version, packageSha256: sha256Hex(bytes), publisherFingerprint: keys.fingerprint, entrypoint };
  return { bytes, body, signed, reference, module };
}

test("the actual native installed-lock reader admits the owner-bound config provider and returns only signed package/module snapshots", async () => {
  const f = await bind(nativeWorkspace()); await initPluginWorkspaceAsync({ workspace: f.workspace }); const installed = await nativePackage(f);
  expect(verifyPluginWorkspace({ workspace: f.workspace }).ok).toBe(true);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sha256Hex(installed.body), "hex"), f.pem, Buffer.from(installed.signed.signature, "base64"))).toBe(true);
  expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
  expect(readInstalledNativeExecutable(f.workspace, installed.reference)).toMatchObject({ source: installed.module, moduleSha256: sha256Hex(installed.module), reference: installed.reference });
  const { envelope: _envelope, ...legacy } = installed.signed;
  writeFileSync(pluginsInstalledLockPath(f.workspace) + ".sig", JSON.stringify(legacy, null, 2));
  expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
});

test("native installed-lock admission refuses another actual auditor purpose and a NOTARY relabel without a selected notary", async () => {
  const local = nativeWorkspace(); rotatePurposeKeys({ workspace: local.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  const f = await bind(local); await initPluginWorkspaceAsync({ workspace: f.workspace }); const installed = await nativePackage(f), path = pluginsInstalledLockPath(f.workspace) + ".sig", original = readFileSync(path);
  expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(getSigningPublicKeyPem(f.workspace, "artifact-seal"));
  const other = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(installed.body) });
  expect(verifyCanonical("ed25519", Buffer.from(sha256Hex(installed.body), "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(other.signature, "base64"))).toBe(true);
  for (const candidate of [other, { ...other, envelope: { ...other.envelope!, signer: { ...other.envelope!.signer, type: "NOTARY" as const, notaryFingerprint: other.envelope!.fingerprint } } }]) {
    writeFileSync(path, JSON.stringify(candidate, null, 2));
    expect(() => assertNativeExecutableInstalled(f.workspace, installed.reference)).toThrow(expect.objectContaining({ code: "EXECUTABLE_AUTHORITY_INVALID" }));
  }
  writeFileSync(path, original); expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
});

test("native installed-lock admission uses the actual required-notary kind pin and rejects a valid artifact-key NOTARY relabel", async () => {
  const f = await bind(nativeWorkspace()), notary = await ownedNotary(f); await initPluginWorkspaceAsync({ workspace: f.workspace }); const installed = await nativePackage(f);
  expect(installed.signed.envelope?.signer.type).toBe("NOTARY"); expect(notary.requests.at(-1)).toEqual({ kind: "INSTALLED_LOCK", payload: Buffer.from(sha256Hex(installed.body), "hex") });
  expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
  expect(readInstalledNativeExecutable(f.workspace, installed.reference).source).toBe(installed.module);
  const path = pluginsInstalledLockPath(f.workspace) + ".sig", original = readFileSync(path), other = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(installed.body) });
  expect(verifyCanonical("ed25519", Buffer.from(sha256Hex(installed.body), "hex"), getSigningPublicKeyPem(f.workspace, "artifact-seal"), Buffer.from(other.signature, "base64"))).toBe(true);
  writeFileSync(path, JSON.stringify({ ...other, envelope: { ...other.envelope!, signer: { ...other.envelope!.signer, type: "NOTARY" as const, notaryFingerprint: other.envelope!.fingerprint } } }, null, 2));
  expect(() => assertNativeExecutableInstalled(f.workspace, installed.reference)).toThrow(expect.objectContaining({ code: "EXECUTABLE_AUTHORITY_INVALID" }));
  writeFileSync(path, original); expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
});

test("native lock verification uses the same bounded closed-inode snapshot rather than reopening a swapped path", async () => {
  const f = await bind(nativeWorkspace()); await initPluginWorkspaceAsync({ workspace: f.workspace }); const installed = await nativePackage(f), path = pluginsInstalledLockPath(f.workspace), identity = nativeFs.statSync(path);
  const changed = Buffer.from(JSON.stringify({ ...JSON.parse(installed.body.toString()), installed: [] }, null, 2)); let armed = true;
  boundary.afterClose = info => { if (armed && info.dev === identity.dev && info.ino === identity.ino) { armed = false; writeFileSync(path, changed); } };
  try { expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes); expect(readFileSync(path)).toEqual(changed); }
  finally { boundary.afterClose = undefined; writeFileSync(path, installed.body); }
  expect(readInstalledNativeExecutable(f.workspace, installed.reference).source).toBe(installed.module);
});

test("the native installed-lock handoff preserves its size, nonsymlink and fixed diagnostic limits", async () => {
  const f = await bind(nativeWorkspace()); await initPluginWorkspaceAsync({ workspace: f.workspace }); const installed = await nativePackage(f), path = pluginsInstalledLockPath(f.workspace), outside = join(f.root, "private-native-lock.json");
  try {
    writeFileSync(path, Buffer.alloc(NATIVE_EXECUTABLE_LIMITS.policyBytes + 1, 32));
    expect(() => assertNativeExecutableInstalled(f.workspace, installed.reference)).toThrow(expect.objectContaining({ code: "EXECUTABLE_SOURCE_UNREADABLE" }));
    writeFileSync(outside, installed.body); unlinkSync(path); nativeFs.symlinkSync(outside, path);
    const error = (() => { try { assertNativeExecutableInstalled(f.workspace, installed.reference); } catch (error) { return error; } })();
    expect(error).toMatchObject({ code: "EXECUTABLE_SOURCE_UNREADABLE" }); expect(String(error)).not.toContain(f.root); expect(String(error)).not.toContain("private-native-lock.json");
  } finally { rmSync(path, { force: true }); writeFileSync(path, installed.body); }
  expect(assertNativeExecutableInstalled(f.workspace, installed.reference)).toEqual(installed.bytes);
});
