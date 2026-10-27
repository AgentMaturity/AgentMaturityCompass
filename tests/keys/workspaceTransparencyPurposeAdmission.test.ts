import { generateKeyPairSync, sign, verify } from "node:crypto";
import nativeFs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import YAML from "yaml";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { getPurposeKeyHistory, getSigningPublicKeyPem, readHistory } from "../../src/keys/signingKeys.js";
import { addPublicKeyToHistory, getPublicKeyPem } from "../../src/crypto/keys.js";
import { verifyKeyHistoryEnvelope } from "../../src/crypto/keyHistoryEnvelope.js";
import { verifyKeyHistoryEntries } from "../../src/crypto/keyHistoryChain.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { describePolicySigner, signDigestWithPolicyAsync } from "../../src/crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath,
  trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signChecked } from "../../src/keys/provider.js";
import { verifyNotaryRequestAuth } from "../../src/notary/notaryAuth.js";
import { notarySignResponse } from "../../src/notary/notarySigner.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
import { lockVault } from "../../src/vault/vault.js";
import { appendTransparencyEntryAsync, readTransparencyEntries, transparencyLogPath, transparencySealPath, transparencySealSigPath, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleMigrationPath, merkleMigrationSigPath } from "../../src/transparency/merklePaths.js";
import { rebuildTransparencyMerkle, verifyTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { transparencyMerkleRebuildCli } from "../../src/transparency/transparencyMerkleCli.js";
import { entryTreeRoot } from "../../src/transparency/merkle.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = "owned-workspace-reader-purpose", roots: Array<{ root: string; workspace: string }> = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

test.each(["seal", "root"] as const)("workspace %s readers and async predecessor refuse a real distinct config-purpose signature", async target => {
  const root = mkdtempSync(join(tmpdir(), "amc-workspace-purpose-admission-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  rotatePurposeKeys({ workspace, purposes: ["config-signature"], passphrase: PASS });
  rotatePurposeKeys({ workspace, purposes: ["artifact-seal"], passphrase: PASS });
  const input = { workspace, type: "OWNED_READER_ADMISSION", agentId: "default", artifact: { kind: "bom" as const, sha256: sha256Hex("owned reader input") } };
  await appendTransparencyEntryAsync(input);
  expect(verifyTransparencyLog(workspace).ok).toBe(true); expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
  const body = target === "seal" ? transparencySealPath(workspace) : merkleCurrentRootPath(workspace);
  const sidecar = target === "seal" ? transparencySealSigPath(workspace) : merkleCurrentRootSigPath(workspace), original = readFileSync(sidecar);
  const digest = sha256Hex(readFileSync(body)), pem = getSigningPublicKeyPem(workspace, "config-signature");
  expect(getPurposeKeyHistory(workspace, "artifact-seal")).not.toContain(pem);
  const signed = signDigestWithVault({ workspace, kind: "OPS_POLICY", digestHex: digest });
  expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  writeFileSync(sidecar, JSON.stringify({ digestSha256: digest, signature: signed.signature, signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
  try {
    const local = target === "seal" ? verifyTransparencyLog(workspace) : verifyTransparencyMerkle(workspace);
    const attempted = await appendTransparencyEntryAsync(input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false);
    expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(sidecar, original); }
  await appendTransparencyEntryAsync(input);
  expect(verifyTransparencyLog(workspace).ok).toBe(true); expect(verifyTransparencyMerkle(workspace).ok).toBe(true);
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-workspace-admission-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), pem: getSigningPublicKeyPem(workspace, "artifact-seal"),
    input: { workspace, type: "OWNED_HISTORICAL_ADMISSION", agentId: "default", artifact: { kind: "bom" as const, sha256: sha256Hex("owned historical input") } } };
}
function healthy(workspace: string) {
  expect(verifyTransparencyLog(workspace)).toMatchObject({ ok: true, errors: [] });
  expect(verifyTransparencyMerkle(workspace)).toMatchObject({ ok: true, errors: [], lagPending: false });
}
type Target = "seal" | "root" | "migration";
function targetFiles(workspace: string, target: Target) {
  return target === "seal" ? [transparencySealPath(workspace), transparencySealSigPath(workspace)]
    : target === "root" ? [merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace)]
    : [merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)];
}
function localResult(workspace: string, target: Target) { return target === "seal" ? verifyTransparencyLog(workspace) : verifyTransparencyMerkle(workspace); }
function writeSigned(workspace: string, body: string, sidecar: string, row: object, kind: "MERKLE_ROOT" | "TRANSPARENCY_ROOT") {
  const bytes = Buffer.from(JSON.stringify(row, null, 2)), signed = signDigestWithVault({ workspace, kind, digestHex: sha256Hex(bytes) });
  writeFileSync(body, bytes); writeFileSync(sidecar, JSON.stringify(signed, null, 2));
}
function migrate(f: ReturnType<typeof fixture>) {
  const hashes = readTransparencyEntries(f.workspace).map(row => row.hash);
  const root = JSON.parse(readFileSync(merkleCurrentRootPath(f.workspace), "utf8")), seal = JSON.parse(readFileSync(transparencySealPath(f.workspace), "utf8"));
  delete root.algorithm; delete seal.merkleAlgorithm; root.root = entryTreeRoot("amc-legacy-v1", hashes);
  // Actual historical wire fixture followed by the existing owner migration flow; no claim that current CLI creates legacy logs.
  writeSigned(f.workspace, merkleCurrentRootPath(f.workspace), merkleCurrentRootSigPath(f.workspace), root, "MERKLE_ROOT");
  writeSigned(f.workspace, transparencySealPath(f.workspace), transparencySealSigPath(f.workspace), seal, "TRANSPARENCY_ROOT");
  rebuildTransparencyMerkle(f.workspace); healthy(f.workspace);
  expect(transparencyMerkleRebuildCli(f.workspace, { algorithm: "rfc9162-sha256" }).migration).not.toBeNull(); healthy(f.workspace);
}
function savePolicy(workspace: string, policy: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(policy))), signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  writeFileSync(trustConfigPath(workspace), bytes); writeFileSync(trustConfigSigPath(workspace), JSON.stringify(signed, null, 2));
  expect(verifyTrustConfigSignature(workspace)).toMatchObject({ valid: true, signatureExists: true });
}
async function nativeNotary(f: ReturnType<typeof fixture>, alreadyLocal = false) {
  const id = AWS_ARN("workspace-admission-notary"), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  if (alreadyLocal) addPublicKeyToHistory(f.workspace, "auditor", description.publicKeyPem, "local", { logRevision: false });
  const requests: Array<{ kind: string; payload: Buffer }> = [], dispatches: Promise<void>[] = [];
  const server = createServer((req, res) => { const pending = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks), config = loadTrustConfig(f.workspace);
    const auth = verifyNotaryRequestAuth({ req, bodyBytes: body, secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef),
      headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.writeHead(401); res.end(); return; }
    const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64"); requests.push({ kind: parsed.kind, payload });
    const signature = await signChecked(provider, description, payload);
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER",
      attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  })(); dispatches.push(pending); void pending.catch(error => res.destroy(error instanceof Error ? error : undefined)); });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); done(); }); });
  closers.push(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); await Promise.allSettled(dispatches); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("owned admission notary did not bind");
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "HARDWARE" });
  const config = loadTrustConfig(f.workspace); config.trust.enforcement.requireNotaryFor = ["TRANSPARENCY_ROOT", "MERKLE_ROOT"];
  config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, config);
  return { description, requests };
}
function assertNativePair(f: ReturnType<typeof fixture>, remote: Awaited<ReturnType<typeof nativeNotary>>, offset: number) {
  for (const [index, target, kind] of [[0, "seal", "TRANSPARENCY_ROOT"], [1, "root", "MERKLE_ROOT"]] as const) {
    const [body, sidecar] = targetFiles(f.workspace, target), bytes = readFileSync(body!), signed = JSON.parse(readFileSync(sidecar!, "utf8")), digest = sha256Hex(bytes);
    expect(remote.requests[offset + index]).toEqual({ kind, payload: Buffer.from(digest, "hex") });
    expect(signed.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", fingerprint: remote.description.keyId,
      signer: { type: "NOTARY", attestationLevel: "HARDWARE", attestationBasis: remote.description.protectionBasis } });
    expect(verify("sha256", Buffer.from(digest, "hex"), { key: remote.description.publicKeyPem, dsaEncoding: "ieee-p1363" }, Buffer.from(signed.signature, "base64"))).toBe(true);
    expect(verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [remote.description.publicKeyPem], requireTrustedKey: true })).toBe(true);
  }
}

test("two consecutive native NOTARY appends retain exact real phase requests and public local integrity", async () => {
  const f = fixture(), remote = await nativeNotary(f);
  await appendTransparencyEntryAsync(f.input); assertNativePair(f, remote, 0); healthy(f.workspace);
  await appendTransparencyEntryAsync({ ...f.input, type: "OWNED_SECOND_NATIVE" }); assertNativePair(f, remote, 2); healthy(f.workspace);
  expect(remote.requests).toHaveLength(4);
});

test("authenticated historical NOTARY roots remain readable after signed policy selects VAULT and permit the next VAULT append", async () => {
  const f = fixture(), remote = await nativeNotary(f); await appendTransparencyEntryAsync(f.input); assertNativePair(f, remote, 0); healthy(f.workspace);
  const pair = ["seal", "root"].flatMap(target => targetFiles(f.workspace, target as Target)).map(path => [path!, readFileSync(path!)] as const);
  const history = readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"));
  expect(history?.entries.find(entry => entry.publicKeyPem === remote.description.publicKeyPem)?.source).toBe("notary");
  const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = []; policy.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, policy);
  expect(describePolicySigner(f.workspace, "TRANSPARENCY_ROOT").mode).toBe("VAULT"); expect(describePolicySigner(f.workspace, "MERKLE_ROOT").mode).toBe("VAULT");
  healthy(f.workspace); for (const [path, bytes] of pair) expect(readFileSync(path)).toEqual(bytes);
  const spy = vi.spyOn(f.provider, "sign"); await appendTransparencyEntryAsync({ ...f.input, type: "OWNED_AFTER_NOTARY" }); healthy(f.workspace);
  expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, bytes: Buffer.from(bytes) }))).toEqual([
    { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex") },
    { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") }]);
  expect(remote.requests).toHaveLength(2);
});

test("current selected NOTARY pin admits an already-local key but disabling it refuses the ambiguous historical label", async () => {
  const f = fixture(), remote = await nativeNotary(f, true); await appendTransparencyEntryAsync(f.input); assertNativePair(f, remote, 0); healthy(f.workspace);
  expect(readHistory(f.workspace, "auditor", getPublicKeyPem(f.workspace, "auditor"))?.entries.find(entry => entry.publicKeyPem === remote.description.publicKeyPem)?.source).toBe("local");
  const originalBody = readFileSync(trustConfigPath(f.workspace)), originalSig = readFileSync(trustConfigSigPath(f.workspace));
  const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = []; policy.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, policy);
  try {
    const local = [verifyTransparencyLog(f.workspace), verifyTransparencyMerkle(f.workspace)];
    const attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.map(value => value.ok)).toEqual([false, false]); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(trustConfigPath(f.workspace), originalBody); writeFileSync(trustConfigSigPath(f.workspace), originalSig); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("current-pin fallback is selected for the actual reader kind rather than another kind using the same notary", async () => {
  const f = fixture(), remote = await nativeNotary(f, true), policy = loadTrustConfig(f.workspace);
  policy.trust.enforcement.requireNotaryFor = ["MERKLE_ROOT"]; savePolicy(f.workspace, policy);
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  expect(describePolicySigner(f.workspace, "TRANSPARENCY_ROOT").mode).toBe("VAULT"); expect(describePolicySigner(f.workspace, "MERKLE_ROOT").mode).toBe("NOTARY");
  const path = transparencySealSigPath(f.workspace), original = readFileSync(path), digest = sha256Hex(readFileSync(transparencySealPath(f.workspace)));
  const wrongKind = await signDigestWithPolicyAsync({ workspace: f.workspace, kind: "MERKLE_ROOT", digestHex: digest });
  expect(verifySignatureEnvelope(digest, wrongKind.envelope!, { trustedPublicKeys: [remote.description.publicKeyPem], requireTrustedKey: true })).toBe(true);
  writeFileSync(path, JSON.stringify(wrongKind, null, 2));
  try {
    const local = verifyTransparencyLog(f.workspace), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(path, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test.each(["seal", "root", "migration"] as const)("a plain artifact or distinct config signature cannot acquire NOTARY authority by relabelling the %s envelope", async target => {
  const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  await appendTransparencyEntryAsync(f.input); if (target === "migration") migrate(f); healthy(f.workspace);
  const [body, sidecar] = targetFiles(f.workspace, target), original = readFileSync(sidecar!), digest = sha256Hex(readFileSync(body!));
  try {
    for (const [purpose, kind] of [["artifact-seal", "MERKLE_ROOT"], ["config-signature", "OPS_POLICY"]] as const) {
      const signed = signDigestWithVault({ workspace: f.workspace, kind, digestHex: digest }), pem = getSigningPublicKeyPem(f.workspace, purpose);
      expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
      if (purpose === "config-signature") expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
      const relabelled = { ...signed, envelope: { ...signed.envelope!, signer: { ...signed.envelope!.signer, type: "NOTARY", notaryFingerprint: signed.envelope!.fingerprint } } };
      writeFileSync(sidecar!, JSON.stringify(relabelled, null, 2));
      const local = localResult(f.workspace, target), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
      expect(local.ok, purpose).toBe(false); expect(attempted, purpose).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
    }
  } finally { writeFileSync(sidecar!, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("actual migration readers and async predecessor refuse another purpose while its real raw crypto remains valid", async () => {
  const f = fixture(); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  await appendTransparencyEntryAsync(f.input); migrate(f);
  const [body, sidecar] = targetFiles(f.workspace, "migration"), original = readFileSync(sidecar!), digest = sha256Hex(readFileSync(body!));
  const signed = signDigestWithVault({ workspace: f.workspace, kind: "OPS_POLICY", digestHex: digest }), pem = getSigningPublicKeyPem(f.workspace, "config-signature");
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem); expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  writeFileSync(sidecar!, JSON.stringify(signed, null, 2));
  try {
    const local = verifyTransparencyMerkle(f.workspace), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(sidecar!, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test.each(["seal", "root"] as const)("an absent %s envelope retains legacy raw artifact bytes while a present wrong-key envelope has no raw fallback", async target => {
  const f = fixture(); await appendTransparencyEntryAsync(f.input);
  const [body, sidecar] = targetFiles(f.workspace, target), original = readFileSync(sidecar!), signed = JSON.parse(original.toString("utf8"));
  const digest = sha256Hex(readFileSync(body!)); expect(verify(null, Buffer.from(digest, "hex"), f.pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  const { envelope, ...raw } = signed; writeFileSync(sidecar!, JSON.stringify(raw, null, 2)); healthy(f.workspace);
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const wrong = { ...envelope, pubkeyB64: Buffer.from(other).toString("base64"), fingerprint: sha256Hex(other) };
  writeFileSync(sidecar!, JSON.stringify({ ...raw, envelope: wrong }, null, 2));
  try {
    const local = localResult(f.workspace, target), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(sidecar!, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("authenticated imported-only ordinary admission works unbound but a forged source label cannot supply historical NOTARY authority", async () => {
  const f = fixture(); await appendTransparencyEntryAsync(f.input);
  const key = generateKeyPairSync("ed25519"), pem = key.publicKey.export({ type: "spki", format: "pem" }).toString();
  addPublicKeyToHistory(f.workspace, "auditor", pem, "imported", { logRevision: false });
  const body = transparencySealPath(f.workspace), path = transparencySealSigPath(f.workspace), original = readFileSync(path), digest = sha256Hex(readFileSync(body));
  const signature = sign(null, Buffer.from(digest, "hex"), key.privateKey).toString("base64");
  const envelope = { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(pem), sigB64: signature,
    signedTs: Date.now(), signer: { type: "VAULT", attestationLevel: "SOFTWARE" } };
  const sidecar = { digestSha256: digest, signature, signedTs: envelope.signedTs, signer: "auditor", envelope };
  expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64"))).toBe(true);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
  writeFileSync(path, JSON.stringify(sidecar, null, 2)); healthy(f.workspace);
  const historyPath = join(f.workspace, ".amc/keys/auditor_history.json"), historyBytes = readFileSync(historyPath), history = JSON.parse(historyBytes.toString("utf8"));
  history.entries.find((entry: { publicKeyPem: string }) => entry.publicKeyPem === pem).source = "notary";
  expect(verifyKeyHistoryEntries(history.entries).ok).toBe(true);
  expect(verifyKeyHistoryEnvelope(history, "auditor", getPublicKeyPem(f.workspace, "auditor")).valid).toBe(false);
  writeFileSync(historyPath, JSON.stringify(history, null, 2));
  writeFileSync(path, JSON.stringify({ ...sidecar, envelope: { ...envelope, signer: { ...envelope.signer, type: "NOTARY", notaryFingerprint: envelope.fingerprint } } }, null, 2));
  try {
    const local = verifyTransparencyLog(f.workspace), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(historyPath, historyBytes); writeFileSync(path, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("a replaced current auditor alias supplies neither historical NOTARY admission nor ordinary fallback", async () => {
  const f = fixture(), remote = await nativeNotary(f); await appendTransparencyEntryAsync(f.input); assertNativePair(f, remote, 0);
  const path = join(f.workspace, ".amc/keys/auditor_ed25519.pub"), original = readFileSync(path), other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  writeFileSync(path, other);
  try {
    const local = [verifyTransparencyLog(f.workspace), verifyTransparencyMerkle(f.workspace)], attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.map(value => value.ok)).toEqual([false, false]); expect(attempted).toHaveProperty("error");
  } finally { writeFileSync(path, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("seal parsing and signature digest use one actual body read when its path is swapped after that read", async () => {
  const f = fixture(); await appendTransparencyEntryAsync(f.input);
  const bodyPath = transparencySealPath(f.workspace), sigPath = transparencySealSigPath(f.workspace), body = readFileSync(bodyPath), signature = readFileSync(sigPath);
  const altered = { ...JSON.parse(body.toString("utf8")), lastHash: "f".repeat(64) }, alteredBytes = Buffer.from(JSON.stringify(altered, null, 2));
  const signed = signDigestWithVault({ workspace: f.workspace, kind: "TRANSPARENCY_ROOT", digestHex: sha256Hex(alteredBytes) });
  expect(verify(null, Buffer.from(sha256Hex(alteredBytes), "hex"), f.pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  const actualRead = nativeFs.readFileSync; let reads = 0, verifierReached = false;
  const spy = vi.spyOn(nativeFs, "readFileSync").mockImplementation(((path: nativeFs.PathOrFileDescriptor, ...args: unknown[]) => {
    const result = (actualRead as (...values: unknown[]) => unknown)(path, ...args);
    if (String(path) === transparencyLogPath(f.workspace) && args[0] === "utf8") verifierReached = true;
    if (verifierReached && String(path) === bodyPath && ++reads === 1) { writeFileSync(bodyPath, alteredBytes); writeFileSync(sigPath, JSON.stringify(signed, null, 2)); }
    return result;
  }) as typeof nativeFs.readFileSync);
  syncBuiltinESMExports();
  try { const result = verifyTransparencyLog(f.workspace); expect(result.ok).toBe(false); expect(verifierReached).toBe(true); expect(reads).toBe(1); }
  finally { spy.mockRestore(); syncBuiltinESMExports(); writeFileSync(bodyPath, body); writeFileSync(sigPath, signature); }
  healthy(f.workspace); await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("an initialized workspace with all owned transparency state absent publishes its first async log without signing under the lock", async () => {
  const f = fixture(); rmSync(join(f.workspace, ".amc/transparency"), { recursive: true, force: true });
  expect(existsSync(transparencyLogPath(f.workspace))).toBe(false); const actual = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    expect(existsSync(join(f.workspace, ".amc/transparency/.workspace-transparency.lock"))).toBe(false);
    return actual(ref, bytes);
  });
  const entry = await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  expect(readTransparencyEntries(f.workspace)).toEqual([entry]);
  expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, bytes: Buffer.from(bytes) }))).toEqual([
    { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(readFileSync(transparencySealPath(f.workspace))), "hex") },
    { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(readFileSync(merkleCurrentRootPath(f.workspace))), "hex") }]);
});

test.each(["seal", "root"] as const)("a valid %s envelope cannot ignore an outer signature mismatch", async target => {
  const f = fixture(); await appendTransparencyEntryAsync(f.input);
  const [body, sidecar] = targetFiles(f.workspace, target), original = readFileSync(sidecar!), signed = JSON.parse(original.toString("utf8"));
  const digest = sha256Hex(readFileSync(body!)); expect(verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: [f.pem], requireTrustedKey: true })).toBe(true);
  const different = Buffer.from(signed.signature, "base64"); different[0] = different[0]! ^ 1;
  writeFileSync(sidecar!, JSON.stringify({ ...signed, signature: different.toString("base64") }, null, 2));
  try {
    const local = localResult(f.workspace, target), attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.ok).toBe(false); expect(attempted).toMatchObject({ error: { message: "transparency signed predecessor is invalid" } });
  } finally { writeFileSync(sidecar!, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});

test("an unrelated replaced keyset-pinned purpose file refuses historical NOTARY readers with their alias and history intact", async () => {
  const f = fixture(), remote = await nativeNotary(f); await appendTransparencyEntryAsync(f.input); assertNativePair(f, remote, 0);
  const alias = getPublicKeyPem(f.workspace, "auditor"), history = readHistory(f.workspace, "auditor", alias);
  expect(history?.entries.find(entry => entry.publicKeyPem === remote.description.publicKeyPem)?.source).toBe("notary");
  const path = join(f.workspace, ".amc/keys/ledger-row.pub"), original = readFileSync(path);
  const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString(); writeFileSync(path, other);
  try {
    const local = [verifyTransparencyLog(f.workspace), verifyTransparencyMerkle(f.workspace)], attempted = await appendTransparencyEntryAsync(f.input).then(value => ({ value }), error => ({ error }));
    expect(local.map(value => value.ok)).toEqual([false, false]); expect(attempted).toHaveProperty("error");
  } finally { writeFileSync(path, original); }
  await appendTransparencyEntryAsync(f.input); healthy(f.workspace);
});
