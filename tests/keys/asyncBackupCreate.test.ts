// Proposed destination: tests/keys/asyncBackupCreate.test.ts. Root alone applies/builds/runs.
import { sign, verify } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { createBackup, createBackupAsync, verifyBackup } from "../../src/ops/backup/backupEngine.js";
import { backupCreateCliAsync } from "../../src/ops/backup/backupCli.js";
import { decryptBackupPayload } from "../../src/ops/backup/backupCrypto.js";
import { defaultOpsPolicy, loadOpsPolicy, opsPolicyPath, opsPolicySigPath, signOpsPolicy, verifyOpsPolicySignature } from "../../src/ops/policy.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import type { KeyRef } from "../../src/keys/provider.js";
import { signChecked } from "../../src/keys/provider.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { setMode } from "../../src/mode/mode.js";
import { currentTransparencyMerkleRoot } from "../../src/transparency/merkleIndexStore.js";
import { merkleCurrentRootPath } from "../../src/transparency/merklePaths.js";
import { rebuildTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { TransparencyMerkleLagError } from "../../src/transparency/merkleIndexState.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { ownedAsyncWorkspaceLogNotary } from "../helpers/ownedAsyncWorkspaceLogNotary.js";
import * as files from "../../src/utils/fs.js";
import { transparencyLogPath, transparencySealPath, transparencySealSigPath, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { withPins } from "../../src/trust/index.js";
import { extractValidatedTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { writeFileAtomic } from "../../src/utils/fs.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ calls: [] as Array<{ ref: KeyRef; bytes: Buffer; signature: Buffer }>,
  afterSign: undefined as undefined | (() => Promise<void>), afterArchive: undefined as undefined | (() => void) }));
vi.mock("../../src/keys/providers/file.js", async original => {
  const real = await original<typeof import("../../src/keys/providers/file.js")>();
  return { ...real, fileKeyProvider(workspace: string) { const provider = real.fileKeyProvider(workspace);
    return { ...provider, async sign(ref: KeyRef, bytes: Uint8Array) {
      const snapshot = Buffer.from(bytes), signature = Buffer.from(await provider.sign(ref, snapshot));
      boundary.calls.push({ ref: { ...ref }, bytes: snapshot, signature: Buffer.from(signature) });
      const pause = boundary.afterSign; boundary.afterSign = undefined; await pause?.(); return signature;
    } };
  } };
});
// Native tar always executes. A scheduling callback after the actual prepared archive isolates the final publisher gates.
vi.mock("node:child_process", async original => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, spawnSync: ((...args: unknown[]) => {
    const result = Reflect.apply(real.spawnSync, real, args), argv = args[1];
    if (result.status === 0 && args[0] === "tar" && Array.isArray(argv) && argv[0] === "-czf"
      && typeof argv[1] === "string" && basename(argv[1]) === "prepared.amcbackup") {
      const after = boundary.afterArchive; boundary.afterArchive = undefined; after?.();
    }
    return result;
  }) as typeof real.spawnSync };
});
const PASS = "owned-backup-vault-passphrase", BACKUP_PASS = "owned-encrypted-backup-passphrase", roots: string[] = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  boundary.afterSign = undefined; boundary.afterArchive = undefined; boundary.calls.length = 0; vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
  for (const root of roots.splice(0)) { lockVault(join(root, "workspace")); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-backup-async-")), workspace = join(root, "workspace"); roots.push(root);
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_BACKUP_PASSPHRASE", BACKUP_PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const source = join(workspace, "backup-source", "owned.txt"); mkdirSync(join(workspace, "backup-source")); writeFileAtomic(source, "actual selected source\n", 0o640);
  const policy = loadOpsPolicy(workspace); policy.opsPolicy.backups.includePaths = ["backup-source"]; policy.opsPolicy.backups.excludePaths = [];
  writeFileAtomic(opsPolicyPath(workspace), YAML.stringify(policy), 0o644); signOpsPolicy(workspace);
  expect(verifyOpsPolicySignature(workspace).valid).toBe(true);
  return { root, workspace, source, params: { workspace, outFile: "owned.amcbackup" }, pem: getSigningPublicKeyPem(workspace, "artifact-seal"), trust: workspaceKeyTrust(workspace) };
}
function unpack(f: ReturnType<typeof fixture>, file: string) {
  const root = mkdtempSync(join(f.root, "unpacked-"));
  extractValidatedTarGzipArchive({ file, destination: root, label: "owned encrypted backup", limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024,
    maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  return root;
}
function inspect(f: ReturnType<typeof fixture>, file: string, trust = f.trust, pem = f.pem) {
  const root = unpack(f, file), bytes = readFileSync(join(root, "manifest.json")), sigBytes = readFileSync(join(root, "manifest.sig"));
  const manifest = JSON.parse(bytes.toString()), sig = JSON.parse(sigBytes.toString()), payload = readFileSync(join(root, "payload", "workspace.tar.gz.enc"));
  expect(sha256Hex(bytes)).toBe(sig.digestSha256); expect(sig.signature).toBe(sig.envelope.sigB64);
  expect(readFileSync(join(root, "keys", "auditor.pub"), "utf8")).toBe(pem);
  expect(manifest.payload.payloadSha256).toBe(sha256Hex(payload)); expect(readFileSync(join(root, "payload.sha256"), "utf8")).toBe(`${sha256Hex(payload)}\n`);
  expect(verifyBackup({ backupFile: file, passphrase: BACKUP_PASS, trust }).ok).toBe(true);
  const plain = decryptBackupPayload({ encrypted: payload, passphrase: BACKUP_PASS, envelope: manifest.payload.encryption });
  const tar = join(root, "decrypted.tar.gz"); writeFileAtomic(tar, plain, 0o600);
  const extracted = join(root, "decrypted"); mkdirSync(extracted);
  extractValidatedTarGzipArchive({ file: tar, destination: extracted, label: "owned actual decrypted payload", limits: { maxEntries: 10_000, maxCompressedBytes: 128 * 1024 * 1024,
    maxEntryBytes: 128 * 1024 * 1024, maxTotalBytes: 512 * 1024 * 1024, maxPathBytes: 1024 } });
  for (const row of manifest.files) { const actual = readFileSync(join(extracted, row.path)); expect(row.sha256).toBe(sha256Hex(actual)); expect(row.bytes).toBe(actual.byteLength); }
  return { root, manifest, sig, bytes, sigBytes, extracted };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause() { const entered = deferred(), release = deferred(); boundary.afterSign = async () => { entered.resolve(); await release.promise; }; return { entered, release }; }
async function expectEntered(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  expect(await Promise.race([p.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
}
function actualSignature(f: ReturnType<typeof fixture>) {
  const call = boundary.calls.at(-1)!; expect(call.ref).toMatchObject({ provider: "file", id: "artifact-seal" });
  expect(call.bytes).toHaveLength(32); expect(verify(null, call.bytes, f.pem, call.signature)).toBe(true);
}
function file(path: string) { return existsSync(path) ? { bytes: readFileSync(path), mode: lstatSync(path).mode & 0o777 } : null; }
function restore(path: string, original: ReturnType<typeof file>) { if (original) writeFileAtomic(path, original.bytes, original.mode); else rmSync(path, { force: true }); }
function saveTrust(workspace: string, candidate: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(candidate))); writeFileAtomic(trustConfigPath(workspace), bytes, 0o644);
  const signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileAtomic(trustConfigSigPath(workspace), JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature, signedTs: signed.signedTs,
    signer: "auditor", envelope: signed.envelope }, null, 2), 0o644); expect(verifyTrustConfigSignature(workspace).valid).toBe(true);
}

test("the maintained async backup wrapper encrypts exact selected bytes and preserves the default manifest and Ed25519 wire", async () => {
  const f = fixture(), now = Date.now() + 1000, source = readFileSync(f.source), policy = readFileSync(opsPolicyPath(f.workspace));
  const seal = file(transparencySealSigPath(f.workspace)), db = file(join(f.workspace, ".amc", "evidence.sqlite")), root = currentTransparencyMerkleRoot(f.workspace);
  vi.spyOn(Date, "now").mockReturnValue(now); const before = boundary.calls.length, made = await backupCreateCliAsync(f.workspace, f.params.outFile), actual = inspect(f, made.outFile);
  expect(boundary.calls).toHaveLength(before + 3); expect(boundary.calls.slice(before).map(call => call.bytes)).toEqual([
    Buffer.from(actual.sig.digestSha256, "hex"), Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex"),
    Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") ]);
  for (const call of boundary.calls.slice(before)) expect(verify(null, call.bytes, f.pem, call.signature)).toBe(true);
  const legacyManifest = { v: 1, backupId: made.backupId, createdTs: now, workspace: { pathHint: f.workspace, amcVersion: "unknown", nodeVersion: process.version },
    policy: { opsPolicySha256: sha256Hex(policy) }, payload: actual.manifest.payload,
    files: [{ path: "backup-source/owned.txt", sha256: sha256Hex(source), bytes: source.byteLength }],
    integrity: { transparencyRoot: root?.root ?? "", transparencySealSigSha256: sha256Hex(seal?.bytes ?? Buffer.alloc(0)), evidenceDbSha256: db ? sha256Hex(db.bytes) : null },
    signing: { algorithm: "ed25519", auditorFingerprint: sha256Hex(f.pem) } };
  expect(actual.bytes).toEqual(Buffer.from(JSON.stringify(legacyManifest, null, 2)));
  const digestSha256 = sha256Hex(actual.bytes), signature = sign(null, Buffer.from(digestSha256, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
  expect(actual.sigBytes).toEqual(Buffer.from(JSON.stringify({ digestSha256, signature, signedTs: now, signer: "auditor",
    envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(f.pem).toString("base64"), fingerprint: sha256Hex(f.pem), sigB64: signature, signedTs: now, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } }, null, 2)));
  expect(readFileSync(join(actual.extracted, "backup-source", "owned.txt"))).toEqual(source);
  expect(made.manifestPath).toBe(`${made.outFile}#manifest.json`);
});

test("backup argument snapshot retains its original destination across actual file Sign", async () => {
  const f = fixture(), p = pause(), input = { ...f.params }, pending = createBackupAsync(input);
  try {
    await expectEntered(p, pending); actualSignature(f); input.outFile = "redirected.amcbackup";
    p.release.resolve(); const made = await pending; expect(made.outFile).toBe(join(f.workspace, "owned.amcbackup"));
    expect(existsSync(join(f.workspace, "redirected.amcbackup"))).toBe(false); inspect(f, made.outFile);
  } finally { p.release.resolve(); await Promise.allSettled([pending]); }
});

test("the actual default dot-amc inventory publishes inside its backup directory without copying its own publication lock", async () => {
  const f = fixture(), policy = loadOpsPolicy(f.workspace); policy.opsPolicy.backups = defaultOpsPolicy().opsPolicy.backups;
  writeFileAtomic(opsPolicyPath(f.workspace), YAML.stringify(policy), 0o644); signOpsPolicy(f.workspace);
  const made = await createBackupAsync({ workspace: f.workspace, outFile: ".amc/backups/default.amcbackup" }), actual = inspect(f, made.outFile);
  actualSignature(f); expect(actual.manifest.files.length).toBeGreaterThan(0);
  expect(actual.manifest.files.some((row: { path: string }) => row.path.includes(".backup-create-"))).toBe(false);
  expect(actual.manifest.files.some((row: { path: string }) => row.path === ".amc/ops-policy.yaml")).toBe(true);
});

test.each(["body", "signature"] as const)("an actual invalid ops-policy %s refuses async backup before every provider Sign", async target => {
  const f = fixture(), path = target === "body" ? opsPolicyPath(f.workspace) : opsPolicySigPath(f.workspace), original = file(path)!;
  const log = readFileSync(transparencyLogPath(f.workspace)), calls = boundary.calls.length;
  try {
    if (target === "body") writeFileAtomic(path, Buffer.concat([original.bytes, Buffer.from("\n# owned unsigned change\n")]), original.mode);
    else {
      const signed = JSON.parse(original.bytes.toString()), wrong = Buffer.alloc(64, 1).toString("base64");
      signed.signature = wrong; if (signed.envelope) signed.envelope.sigB64 = wrong;
      writeFileAtomic(path, JSON.stringify(signed, null, 2), original.mode);
    }
    expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false);
    await expect(createBackupAsync(f.params)).rejects.toThrow("ops policy invalid");
    expect(boundary.calls).toHaveLength(calls); expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { restore(path, original); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test.each(["file", "membership", "ops-body", "ops-sidecar", "merkle-root", "seal-sidecar", "database", "package"] as const)(
  "real backup signing followed by %s source drift refuses publication and restoration permits a verified archive", async target => {
  const f = fixture(), p = pause(), path = target === "file" ? f.source : target === "membership" ? join(f.workspace, "backup-source", "new.txt")
    : target === "ops-body" ? opsPolicyPath(f.workspace) : target === "ops-sidecar" ? opsPolicySigPath(f.workspace)
    : target === "merkle-root" ? merkleCurrentRootPath(f.workspace) : target === "seal-sidecar" ? transparencySealSigPath(f.workspace)
    : target === "database" ? join(f.workspace, ".amc", "evidence.sqlite") : join(f.workspace, "package.json");
  const original = file(path), log = readFileSync(transparencyLogPath(f.workspace)), pending = createBackupAsync(f.params);
  try {
    await expectEntered(p, pending); actualSignature(f);
    writeFileAtomic(path, original ? Buffer.concat([original.bytes, Buffer.from("\n ")]) : Buffer.from(target === "package" ? '{"version":"owned-created"}\n' : "owned new source\n"), original?.mode ?? 0o644);
    p.release.resolve(); await expect(pending).rejects.toThrow("backup inputs changed while preparing");
    expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { p.release.resolve(); await Promise.allSettled([pending]); restore(path, original); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test("a real preexisting backup copied by a competing writer during Sign is preserved by destination CAS", async () => {
  const f = fixture(), competing = createBackup({ workspace: f.workspace, outFile: "actual-competing.amcbackup" }), validBytes = readFileSync(competing.outFile);
  inspect(f, competing.outFile);
  const p = pause(), log = readFileSync(transparencyLogPath(f.workspace)), pending = createBackupAsync(f.params);
  try {
    await expectEntered(p, pending); actualSignature(f); writeFileAtomic(join(f.workspace, f.params.outFile), validBytes, 0o640);
    p.release.resolve(); await expect(pending).rejects.toThrow("backup output changed while preparing");
    expect(readFileSync(join(f.workspace, f.params.outFile))).toEqual(validBytes); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log); inspect(f, join(f.workspace, f.params.outFile));
  } finally { p.release.resolve(); await Promise.allSettled([pending]); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test.each(["input", "output", "vault-lock", "owner-mode", "whole-trust", "no-sign"] as const)(
  "a real prepared backup archive followed by final %s drift refuses before archive replacement", async target => {
  const f = fixture(), competing = target === "output" ? readFileSync(createBackup({ workspace: f.workspace, outFile: "actual-competing.amcbackup" }).outFile) : null;
  const original = file(f.source), trustBody = file(trustConfigPath(f.workspace)), trustSig = file(trustConfigSigPath(f.workspace)), log = readFileSync(transparencyLogPath(f.workspace));
  let reached = false;
  boundary.afterArchive = () => {
    reached = true; actualSignature(f);
    if (target === "input") writeFileAtomic(f.source, Buffer.concat([original!.bytes, Buffer.from("\n ")]), original!.mode);
    else if (target === "output") writeFileAtomic(join(f.workspace, f.params.outFile), competing!, 0o640);
    else if (target === "vault-lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); }
    else if (target === "owner-mode") setMode(f.workspace, "agent");
    else if (target === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
    else {
      const before = describePolicySigner(f.workspace, "BACKUP_MANIFEST"), config = loadTrustConfig(f.workspace);
      expect(config.trust.enforcement.requireNotaryFor.includes("BOM")).toBe(false);
      config.trust.enforcement.requireNotaryFor = [...new Set([...config.trust.enforcement.requireNotaryFor, "BOM" as const])]; saveTrust(f.workspace, config);
      expect(describePolicySigner(f.workspace, "BACKUP_MANIFEST")).toEqual(before); assertPolicySignerCurrent(f.workspace, before);
    }
  };
  try {
    await expect(createBackupAsync(f.params)).rejects.toThrow();
    expect(reached).toBe(true); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    if (competing) { expect(readFileSync(join(f.workspace, f.params.outFile))).toEqual(competing); inspect(f, join(f.workspace, f.params.outFile)); }
    else expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
  } finally {
    boundary.afterArchive = undefined; vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); setMode(f.workspace, "owner");
    restore(f.source, original); restore(trustConfigPath(f.workspace), trustBody); restore(trustConfigSigPath(f.workspace), trustSig);
  }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test("the async backup refuses a no-sign flag arriving after actual file crypto and publishes after restoration", async () => {
  const f = fixture(), p = pause(), log = readFileSync(transparencyLogPath(f.workspace)), pending = createBackupAsync(f.params);
  try {
    await expectEntered(p, pending); actualSignature(f); vi.stubEnv("AMC_NO_SIGN", "1");
    p.release.resolve(); await expect(pending).rejects.toThrow(); expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { p.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_NO_SIGN", "0"); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test("an independently pinned actual P256 notary signs the async backup manifest while retained audit and log routes stay local", async () => {
  const f = fixture(), id = AWS_ARN("owned-async-backup"), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  const requests: Array<{ kind: string; payload: Buffer }> = [], dispatches: Promise<void>[] = [];
  const server = createServer((req, res) => {
    const work = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks), config = loadTrustConfig(f.workspace);
    const auth = verifyNotaryRequestAuth({ req, bodyBytes: bytes, secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef),
      headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.statusCode = 401; res.end("owned auth refused"); return; }
    const body = JSON.parse(bytes.toString()), payload = Buffer.from(body.payloadB64, "base64"); requests.push({ kind: body.kind, payload });
    const signature = await signChecked(provider, description, payload);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(body.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER",
      attestationLevel: "SOFTWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
    })(); dispatches.push(work); void work.catch(error => res.destroy(error instanceof Error ? error : undefined));
  });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); done(); }); });
  closers.push(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); await Promise.all(dispatches); });
  const address = server.address(); if (typeof address !== "object" || address === null) throw new Error("owned notary address unavailable");
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "SOFTWARE" });
  const config = loadTrustConfig(f.workspace); config.trust.enforcement.requireNotaryFor = ["BACKUP_MANIFEST"]; config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; saveTrust(f.workspace, config);
  const trust = withPins(f.trust, [{ keyId: description.keyId, purposes: ["artifact-seal"], origin: "owned independent backup notary key before archive" }]);
  const beforeFile = boundary.calls.length, made = await createBackupAsync(f.params), actual = inspect(f, made.outFile, trust, description.publicKeyPem);
  expect(boundary.calls.slice(beforeFile).map(call => call.bytes)).toEqual([
    Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex"), Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") ]);
  expect(actual.manifest.signing).toEqual({ algorithm: "ecdsa-p256-sha256", auditorFingerprint: description.keyId });
  expect(actual.sig.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", signer: { type: "NOTARY", attestationLevel: "SOFTWARE", attestationBasis: description.protectionBasis } });
  expect(requests).toEqual([{ kind: "BACKUP_MANIFEST", payload: Buffer.from(actual.sig.digestSha256, "hex") }]);
  expect(fake.requests.filter(request => request.operation === "Sign")).toHaveLength(1);
  expect(verifyBackup({ backupFile: made.outFile, passphrase: BACKUP_PASS, trust: f.trust }).ok).toBe(false);
});

test.skipIf(process.platform === "win32")("the compiled backup create CLI awaits actual file-provider signing and emits a verified encrypted archive", async () => {
  const f = fixture(), actual = pathToFileURL(resolve("dist/keys/providers/file.js")).href, purpose = pathToFileURL(resolve("dist/keys/purposeProviders.js")).href;
  const replacement = join(f.root, "file-boundary.mjs"), loader = join(f.root, "file-loader.mjs"), requests = join(f.root, "calls.jsonl"); writeFileSync(requests, "");
  writeFileSync(replacement, `import {appendFileSync} from "node:fs"; import {fileKeyProvider as actual} from ${JSON.stringify(actual)};
export function fileKeyProvider(workspace) { const provider=actual(workspace); return {...provider, async sign(ref,bytes) { const signature=await provider.sign(ref,bytes); appendFileSync(process.env.P208_BACKUP_CALLS,JSON.stringify({purpose:ref.id,size:bytes.length,hex:Buffer.from(bytes).toString("hex")})+"\\n"); return signature; }}; }\n`);
  writeFileSync(loader, `import {pathToFileURL} from "node:url";
export async function resolve(specifier,context,nextResolve) { if (["@aws-sdk/","@google-cloud/","@azure/","pkcs11js"].some(prefix=>specifier.startsWith(prefix))) throw new Error("owned backup test forbids remote SDK imports"); const found=await nextResolve(specifier,context); if(context.parentURL===${JSON.stringify(purpose)}&&found.url===${JSON.stringify(actual)}) return {url:pathToFileURL(process.env.P208_BACKUP_BOUNDARY).href,shortCircuit:true}; return found; }\n`);
  const child = spawnOwnedNode(["--experimental-loader", pathToFileURL(loader).href, resolve("dist/cli.js"), "backup", "create", "--out", "cli.amcbackup"],
    { cwd: f.workspace, env: { ...process.env, NO_COLOR: "1", P208_BACKUP_CALLS: requests, P208_BACKUP_BOUNDARY: replacement } });
  try {
    const result = await child.wait(30_000); expect(result.code, result.stderr).toBe(0); expect(result.signal).toBeNull(); expect(result.stdout).toContain("Backup created:");
    const observed = inspect(f, join(f.workspace, "cli.amcbackup"));
    expect(readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))).toEqual([
      { purpose: "artifact-seal", size: 32, hex: observed.sig.digestSha256 },
      { purpose: "artifact-seal", size: 32, hex: sha256Hex(readFileSync(transparencySealPath(f.workspace))) },
      { purpose: "artifact-seal", size: 32, hex: sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))) } ]);
  } finally { await child.stop(); }
}, 60_000);


function pauseBackupLog() {
  const entered = deferred(), release = deferred(); let remaining = 3;
  const wait = async () => { if (--remaining === 0) { entered.resolve(); await release.promise; } else boundary.afterSign = wait; };
  boundary.afterSign = wait; return { entered, release };
}
function completedAudit(f: ReturnType<typeof fixture>, backupId: string) {
  const ledger = openLedger(f.workspace, { readonly: true });
  try {
    const rows = ledger.db.prepare("SELECT id, event_hash, session_id, payload_inline, meta_json FROM evidence_events WHERE event_type = 'audit'").all() as Array<{
      id: string; event_hash: string; session_id: string; payload_inline: string | null; meta_json: string }>;
    const matching = rows.filter(row => { if (row.payload_inline === null) return false;
      try { const payload = JSON.parse(row.payload_inline); return payload?.auditType === "BACKUP_CREATED" && payload.backupId === backupId; } catch { return false; } });
    expect(matching).toHaveLength(1); const row = matching[0]!;
    expect(JSON.parse(row.meta_json).receipt).toEqual(expect.any(String));
    const session = ledger.db.prepare("SELECT ended_ts, session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ?").get(row.session_id) as {
      ended_ts: number | null; session_final_event_hash: string; session_seal_sig: string };
    expect(session.ended_ts).not.toBeNull(); expect(session.session_final_event_hash).toBe(row.event_hash); expect(session.session_seal_sig).toEqual(expect.any(String));
    return { eventId: row.id, eventHash: row.event_hash };
  } finally { ledger.close(); }
}
test("default dot-amc backup refuses to replace a selected old archive and retains it inside the next encrypted snapshot with its own audit and log", async () => {
  const f = fixture(), policy = loadOpsPolicy(f.workspace); policy.opsPolicy.backups = defaultOpsPolicy().opsPolicy.backups;
  writeFileAtomic(opsPolicyPath(f.workspace), YAML.stringify(policy), 0o644); signOpsPolicy(f.workspace);
  const now = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(now + 1000);
  const first = await createBackupAsync({ workspace: f.workspace, outFile: ".amc/backups/default.amcbackup" }), old = readFileSync(first.outFile);
  const firstAudit = completedAudit(f, first.backupId); expect(firstAudit.eventId).not.toBe("");
  clock.mockReturnValue(now + 2000); const before = boundary.calls.length, log = readFileSync(transparencyLogPath(f.workspace));
  // The old archive is a selected source: the output may not alias it (P2-08), and the refusal precedes every Sign and write.
  await expect(createBackupAsync({ workspace: f.workspace, outFile: ".amc/backups/default.amcbackup" })).rejects.toThrow(/backup output aliases an actual source/);
  expect(readFileSync(first.outFile)).toEqual(old); expect(boundary.calls).toHaveLength(before); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  const second = await createBackupAsync({ workspace: f.workspace, outFile: ".amc/backups/next.amcbackup" }), actual = inspect(f, second.outFile);
  expect(second.backupId).not.toBe(first.backupId); expect(readFileSync(second.outFile)).not.toEqual(old);
  expect(readFileSync(join(actual.extracted, ".amc/backups/default.amcbackup"))).toEqual(old);
  expect(actual.manifest.files.find((row: { path: string }) => row.path === ".amc/backups/default.amcbackup")).toMatchObject({ sha256: sha256Hex(old), bytes: old.length });
  expect(boundary.calls.slice(before).map(call => call.bytes)).toEqual([
    Buffer.from(actual.sig.digestSha256, "hex"), Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex"),
    Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") ]);
  completedAudit(f, second.backupId);
  expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!)).toMatchObject({
    type: "BACKUP_CREATED", artifact: { kind: "policy", id: second.backupId, sha256: actual.sig.digestSha256 } });
});

test.each(["ops-body", "ops-sidecar", "archive", "archive-mode", "owner-mode", "whole-trust", "no-sign"] as const)(
  "late backup %s drift refuses transparency after real archive and audit publication", async target => {
    const f = fixture(), competing = target === "archive" ? readFileSync(createBackup({ workspace: f.workspace, outFile: "actual-other.amcbackup" }).outFile) : null;
    const gate = pauseBackupLog(), before = boundary.calls.length, pending = createBackupAsync(f.params), outcome = pending.then(() => null, error => error);
    let path: string | undefined, original: ReturnType<typeof file> | undefined;
    const trustBody = file(trustConfigPath(f.workspace)), trustSig = file(trustConfigSigPath(f.workspace));
    try {
      expect(await Promise.race([gate.entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
      const out = join(f.workspace, f.params.outFile), actual = inspect(f, out), archive = readFileSync(out), audit = completedAudit(f, actual.manifest.backupId);
      const calls = boundary.calls.slice(before); expect(calls).toHaveLength(3);
      for (const call of calls) expect(verify(null, call.bytes, f.pem, call.signature)).toBe(true);
      const log = readFileSync(transparencyLogPath(f.workspace)); expect(existsSync(join(f.workspace, ".amc/transparency/.workspace-transparency.lock"))).toBe(false);
      if (target === "owner-mode") setMode(f.workspace, "agent");
      else if (target === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
      else if (target === "whole-trust") {
        const before = describePolicySigner(f.workspace, "BACKUP_MANIFEST"), config = loadTrustConfig(f.workspace);
        config.trust.enforcement.requireNotaryFor = [...new Set([...config.trust.enforcement.requireNotaryFor, "BOM" as const])]; saveTrust(f.workspace, config);
        expect(describePolicySigner(f.workspace, "BACKUP_MANIFEST")).toEqual(before);
      } else {
        path = target === "ops-body" ? opsPolicyPath(f.workspace) : target === "ops-sidecar" ? opsPolicySigPath(f.workspace) : out; original = file(path)!;
        if (target === "archive-mode") chmodSync(path, original.mode === 0o600 ? 0o640 : 0o600);
        else writeFileAtomic(path, competing ?? Buffer.concat([original.bytes, Buffer.from("\n ")]), original.mode);
      }
      const edited = file(out)!; gate.release.resolve(); const error = await outcome;
      expect(error).toMatchObject({ code: "BACKUP_PUBLICATION_INCOMPLETE", phase: "transparency", publication: { outFile: out, backupId: actual.manifest.backupId },
        archiveSha256: sha256Hex(archive), opsAudit: audit, cause: expect.any(Error) });
      expect(String(error.cause)).toContain(target.startsWith("ops-") ? "backup ops policy changed while preparing or continuing publication"
        : target.startsWith("archive") ? "backup acknowledged archive changed during publication continuation"
        : target === "whole-trust" ? "policy signing state changed while signing" : target === "no-sign" ? "no-sign mode does not authorize policy signing" : "blocked in agent mode");
      expect(file(out)).toEqual(edited); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
      expect(completedAudit(f, actual.manifest.backupId)).toEqual(audit);
    } finally {
      gate.release.resolve(); await Promise.allSettled([pending]); boundary.afterSign = undefined; vi.stubEnv("AMC_NO_SIGN", "0"); setMode(f.workspace, "owner");
      if (path && original !== undefined) restore(path, original); restore(trustConfigPath(f.workspace), trustBody); restore(trustConfigSigPath(f.workspace), trustSig);
    }
    inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
  });

test("ordinary source drift after archive publication preserves the historical encrypted payload and completes transparency", async () => {
  const f = fixture(), original = file(f.source)!, gate = pauseBackupLog(), pending = createBackupAsync(f.params);
  try {
    expect(await Promise.race([gate.entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
    const out = join(f.workspace, f.params.outFile), before = inspect(f, out), archive = readFileSync(out); completedAudit(f, before.manifest.backupId);
    writeFileAtomic(f.source, Buffer.concat([original.bytes, Buffer.from("actual later source edit\n")]), original.mode);
    gate.release.resolve(); const made = await pending, actual = inspect(f, made.outFile);
    expect(readFileSync(out)).toEqual(archive); expect(readFileSync(join(actual.extracted, "backup-source/owned.txt"))).toEqual(original.bytes);
    expect(readFileSync(f.source)).not.toEqual(original.bytes);
    expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!)).toMatchObject({
      artifact: { kind: "policy", id: made.backupId, sha256: actual.sig.digestSha256 } });
  } finally { gate.release.resolve(); await Promise.allSettled([pending]); boundary.afterSign = undefined; restore(f.source, original); }
});

test("backup final original file authority remains required while both actual P256 notary log signers remain usable", async () => {
  const f = fixture(), remote = await ownedAsyncWorkspaceLogNotary(f.workspace, f.root), entered = deferred(), release = deferred();
  remote.setBeforeReply(async kind => { if (kind === "MERKLE_ROOT") { entered.resolve(); await release.promise; } });
  const pending = createBackupAsync(f.params), outcome = pending.then(() => null, error => error);
  try {
    try {
      expect(await Promise.race([entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
      const out = join(f.workspace, f.params.outFile), actual = inspect(f, out, remote.trust), archive = readFileSync(out), audit = completedAudit(f, actual.manifest.backupId);
      const log = readFileSync(transparencyLogPath(f.workspace)); expect(remote.requests.map(row => row.kind)).toEqual(["TRANSPARENCY_ROOT", "MERKLE_ROOT"]);
      lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); release.resolve();
      expect(await outcome).toMatchObject({ code: "BACKUP_PUBLICATION_INCOMPLETE", phase: "transparency", archiveSha256: sha256Hex(archive), opsAudit: audit, cause: expect.any(Error) });
      expect(readFileSync(out)).toEqual(archive); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    } finally { release.resolve(); await Promise.allSettled([pending]); remote.setBeforeReply(undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    const fresh = await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" }); inspect(f, fresh.outFile, remote.trust);
    expect(remote.requests.slice(-2)).toEqual([
      { kind: "TRANSPARENCY_ROOT", payload: Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex") },
      { kind: "MERKLE_ROOT", payload: Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") } ]);
    expect(JSON.parse(readFileSync(transparencySealSigPath(f.workspace), "utf8")).envelope).toMatchObject({ alg: "ecdsa-p256-sha256", fingerprint: remote.keyId });
  } finally { await remote.close(); }
});

test("backup reports the published archive and ops-audit phase when a real post-write vault lock refuses the actual audit", async () => {
  const f = fixture(), out = join(f.workspace, f.params.outFile), before = boundary.calls.length, log = readFileSync(transparencyLogPath(f.workspace)), actualWrite = files.writeFileAtomic;
  let reached = false;
  const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => { actualWrite(path, bytes, mode);
    if (path === out && !reached) { reached = true; lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", ""); } });
  try {
    const error = await createBackupAsync(f.params).then(() => null, value => value);
    expect(reached).toBe(true); const actual = inspect(f, out);
    expect(error).toMatchObject({ code: "BACKUP_PUBLICATION_INCOMPLETE", phase: "ops-audit", opsAudit: null,
      publication: { outFile: out, backupId: actual.manifest.backupId }, archiveSha256: sha256Hex(readFileSync(out)), cause: expect.any(Error) });
    expect(boundary.calls.slice(before)).toHaveLength(1); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test("backup retains the archive completed audit and native committed-entry cause after a real post-line log I/O failure", async () => {
  const f = fixture(), actualWrite = files.writeFileAtomic; let reached = false;
  // A native write failure (ENOTDIR under the existing root file) that leaves every captured log-family member unchanged;
  // an external change to an owned member would instead refuse even the unsigned lag marker (P2-08).
  const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => {
    if (path === merkleCurrentRootPath(f.workspace) && !reached) { reached = true; return actualWrite(join(path, "owned-post-line-failure"), bytes, mode); }
    return actualWrite(path, bytes, mode); });
  try {
    const error = await createBackupAsync(f.params).then(() => null, value => value);
    expect(reached).toBe(true); const out = join(f.workspace, f.params.outFile), actual = inspect(f, out), audit = completedAudit(f, actual.manifest.backupId);
    expect(error).toMatchObject({ code: "BACKUP_PUBLICATION_INCOMPLETE", phase: "transparency", publication: { outFile: out },
      archiveSha256: sha256Hex(readFileSync(out)), opsAudit: audit });
    expect(error.cause).toBeInstanceOf(TransparencyMerkleLagError); expect(error.cause.pendingRecorded).toBe(true);
    expect(JSON.parse(readFileSync(transparencyLogPath(f.workspace), "utf8").trim().split(/\r?\n/).at(-1)!)).toMatchObject({
      hash: error.cause.entryHash, artifact: { kind: "policy", id: actual.manifest.backupId, sha256: actual.sig.digestSha256 } });
    expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
  } finally { spy.mockRestore(); rebuildTransparencyMerkle(f.workspace); }
  inspect(f, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});

test.each(["VAULT", "NOTARY"] as const)("actual backup caller refuses a real wrong-purpose ops signature labelled %s before every provider Sign", async label => {
  const f = fixture(), original = file(opsPolicySigPath(f.workspace))!;
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  const pem = getSigningPublicKeyPem(f.workspace, "artifact-seal"), current = { ...f, pem, trust: workspaceKeyTrust(f.workspace) };
  expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(pem);
  const bytes = readFileSync(opsPolicyPath(f.workspace)), digest = sha256Hex(bytes), signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: digest });
  expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  const sidecar = JSON.parse(JSON.stringify({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }));
  expect(sidecar.envelope.signer.type).toBe("VAULT"); sidecar.envelope.signer.type = label;
  const before = boundary.calls.length, log = readFileSync(transparencyLogPath(f.workspace));
  try {
    writeFileAtomic(opsPolicySigPath(f.workspace), JSON.stringify(sidecar, null, 2), original.mode);
    expect(verifyOpsPolicySignature(f.workspace).valid).toBe(false);
    const error = await createBackupAsync(f.params).then(() => null, value => value);
    expect(boundary.calls).toHaveLength(before); expect(existsSync(join(f.workspace, f.params.outFile))).toBe(false);
    expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log); expect(error).toBeInstanceOf(Error); expect(String(error)).toContain("ops policy invalid");
  } finally { restore(opsPolicySigPath(f.workspace), original); }
  expect(verifyOpsPolicySignature(f.workspace).valid).toBe(true);
  inspect(current, (await createBackupAsync({ ...f.params, outFile: "fresh.amcbackup" })).outFile);
});
