import { sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import * as log from "../src/transparency/logChain.js";
import { rebuildTransparencyMerkle, verifyTransparencyMerkle } from "../src/transparency/merkleIndexStore.js";
import { transparencyMerkleRebuildCli } from "../src/transparency/transparencyMerkleCli.js";
import { entryTreeRoot } from "../src/transparency/merkle.js";
import { frontierRoot } from "../src/transparency/merkleFrontier.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath, merkleFrontierPath, merkleLeavesPath,
  merkleMigrationPath, merkleMigrationSigPath, merklePendingPath, merkleRootsPath } from "../src/transparency/merklePaths.js";
import { readMerklePendingMarker, TransparencyMerkleLagError } from "../src/transparency/merkleIndexState.js";
import { loadKeyProvider } from "../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../src/keys/signingKeys.js";
import { lockVault, unlockVault } from "../src/vault/vault.js";
import { describePolicySigner } from "../src/crypto/signing/signer.js";
import { signDigestWithVault } from "../src/crypto/signing/signerVault.js";
import { enableNotaryTrust, loadTrustConfig, resolveNotaryAuthSecret, trustConfigPath, trustConfigSigPath,
  trustConfigSchema, verifyTrustConfigSignature, type TrustConfig } from "../src/trust/trustConfig.js";
import { signChecked } from "../src/keys/provider.js";
import { awsKmsProvider } from "../src/keys/providers/awsKms.js";
import { verifyNotaryRequestAuth } from "../src/notary/notaryAuth.js";
import { notarySignResponse } from "../src/notary/notarySigner.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import * as files from "../src/utils/fs.js";
import { AWS_ARN, awsFake, fakeKey } from "./keys/providerFakes.js";

const PASS = "p208-owned-workspace-log", roots: Array<{ root: string; workspace: string }> = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-workspace-log-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  log.appendTransparencyEntry({ workspace, type: "OWNED_SEED", agentId: "default", artifact: { kind: "bom", sha256: sha256Hex("owned seed") } });
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), pem: getSigningPublicKeyPem(workspace, "artifact-seal"),
    key: getSigningKey(workspace, "artifact-seal"), input: { workspace, type: "OWNED_ASYNC", agentId: "default",
      artifact: { kind: "bom" as const, sha256: sha256Hex("owned input"), id: "owned-entry" } } };
}
function paths(workspace: string) { return [log.transparencyLogPath(workspace), log.transparencySealPath(workspace), log.transparencySealSigPath(workspace),
  merkleCurrentRootPath(workspace), merkleCurrentRootSigPath(workspace), merkleLeavesPath(workspace), merkleRootsPath(workspace),
  merkleFrontierPath(workspace), merklePendingPath(workspace), merkleMigrationPath(workspace), merkleMigrationSigPath(workspace)]; }
const snapshot = (workspace: string) => paths(workspace).map(path => existsSync(path) ? readFileSync(path) : null);
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pause(f: ReturnType<typeof fixture>, ordinal: number) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider); let calls = 0;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await actual(ref, bytes);
    if (++calls === ordinal) { entered.resolve(); await release.promise; }
    return signature;
  });
  return { entered, release, spy };
}
async function reached(gate: ReturnType<typeof pause>, pending: Promise<unknown>) {
  expect(await Promise.race([gate.entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
}
function healthy(workspace: string) {
  expect(log.verifyTransparencyLog(workspace)).toMatchObject({ ok: true, errors: [] });
  expect(verifyTransparencyMerkle(workspace)).toMatchObject({ ok: true, errors: [], lagPending: false });
}
function savePolicy(workspace: string, value: TrustConfig): void {
  const prepared = preparePolicy(workspace, value);
  files.writeFileAtomic(trustConfigPath(workspace), prepared.bytes, 0o644);
  files.writeFileAtomic(trustConfigSigPath(workspace), prepared.signature, 0o644);
  expect(verifyTrustConfigSignature(workspace)).toMatchObject({ valid: true, signatureExists: true });
}
function preparePolicy(workspace: string, value: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(trustConfigSchema.parse(value)));
  const signed = signDigestWithVault({ workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  return { bytes, signature: JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2) };
}
function writeOwnedSignedBody(workspace: string, path: string, sidecar: string, row: object, kind: "MERKLE_ROOT" | "TRANSPARENCY_ROOT" = "MERKLE_ROOT"): void {
  const bytes = Buffer.from(JSON.stringify(row, null, 2)), signed = signDigestWithVault({ workspace, kind, digestHex: sha256Hex(bytes) });
  writeFileSync(path, bytes); writeFileSync(sidecar, JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
    signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
}

describe("awaitable workspace transparency publication", () => {
  test("preserves independent default Ed25519 wire and two exact real raw32 signature requests", async () => {
    const f = fixture(), now = Date.now(), previous = log.readTransparencyEntries(f.workspace), spy = vi.spyOn(f.provider, "sign");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const payload = { v: 1, ts: now, type: f.input.type, agentId: f.input.agentId, artifact: f.input.artifact, prev: previous.at(-1)?.hash ?? "" };
    const entry = { ...payload, hash: sha256Hex(canonicalize(payload)) };
    const seal = { v: 1, ts: now, lastHash: entry.hash, signerFingerprint: sha256Hex(f.pem), merkleAlgorithm: "rfc9162-sha256" };
    const root = { v: 1, ts: now, leafCount: previous.length + 1, root: entryTreeRoot("rfc9162-sha256", [...previous.map(row => row.hash), entry.hash]),
      lastEntryHash: entry.hash, algorithm: "rfc9162-sha256" };
    const expectedSignature = (body: object) => {
      const digest = sha256Hex(JSON.stringify(body, null, 2)), signature = sign(null, Buffer.from(digest, "hex"), f.key).toString("base64");
      return { digestSha256: digest, signature, signedTs: now, signer: "auditor", envelope: { v: 1, alg: "ed25519",
        pubkeyB64: Buffer.from(f.pem).toString("base64"), fingerprint: sha256Hex(f.pem), sigB64: signature, signedTs: now,
        signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } };
    };
    expect(await log.appendTransparencyEntryAsync(f.input)).toEqual(entry);
    expect(readFileSync(log.transparencySealPath(f.workspace), "utf8")).toBe(JSON.stringify(seal, null, 2));
    expect(readFileSync(log.transparencySealSigPath(f.workspace), "utf8")).toBe(JSON.stringify(expectedSignature(seal), null, 2));
    expect(readFileSync(merkleCurrentRootPath(f.workspace), "utf8")).toBe(JSON.stringify(root, null, 2));
    expect(readFileSync(merkleCurrentRootSigPath(f.workspace), "utf8")).toBe(JSON.stringify(expectedSignature(root), null, 2));
    expect(spy.mock.calls.map(([ref, bytes]) => ({ ref, bytes: Buffer.from(bytes) }))).toEqual([
      { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(JSON.stringify(seal, null, 2)), "hex") },
      { ref: { provider: "file", id: "artifact-seal" }, bytes: Buffer.from(sha256Hex(JSON.stringify(root, null, 2)), "hex") }]);
    healthy(f.workspace);
  });

  test.each(["append", "rebuild"] as const)("refuses one stale prepared attempt after a real synchronous %s wins without holding the log lock during Sign", async winner => {
    const f = fixture(), gate = pause(f, 1), input = { ...f.input, artifact: { ...f.input.artifact } };
    const pending = log.appendTransparencyEntryAsync(input), outcome = pending.then(() => null, error => error);
    try {
      await reached(gate, pending); expect(existsSync(join(f.workspace, ".amc/transparency/.workspace-transparency.lock"))).toBe(false);
      input.type = "mutated caller type"; input.artifact.sha256 = "f".repeat(64);
      if (winner === "append") log.appendTransparencyEntry({ ...f.input, type: "SYNC_WINNER" }); else rebuildTransparencyMerkle(f.workspace);
      const afterWinner = snapshot(f.workspace); gate.release.resolve();
      expect(await outcome).toMatchObject({ message: expect.stringContaining("transparency state changed while signing was prepared") });
      expect(snapshot(f.workspace)).toEqual(afterWinner); expect(gate.spy).toHaveBeenCalledTimes(2); healthy(f.workspace);
    } finally { gate.release.resolve(); await Promise.allSettled([pending]); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test("refuses corrupted real provider crypto before a line or pending marker is published", async () => {
    const f = fixture(), before = snapshot(f.workspace), actual = f.provider.sign.bind(f.provider);
    const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
      const signature = Buffer.from(await actual(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature;
    });
    await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(spy).toHaveBeenCalledTimes(1); expect(snapshot(f.workspace)).toEqual(before); expect(readMerklePendingMarker(f.workspace)).toBeNull();
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test("rehashes actual captured entry payloads even when their old hashes still match the signed seal and root", async () => {
    const f = fixture(), path = log.transparencyLogPath(f.workspace), original = readFileSync(path), spy = vi.spyOn(f.provider, "sign");
    const rows = log.readTransparencyEntries(f.workspace); expect(rows.length).toBeGreaterThan(0);
    rows[0] = { ...rows[0]!, type: "OWNED_TAMPER_WITH_OLD_HASH" }; writeFileSync(path, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
    try { const before = snapshot(f.workspace); await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toThrow("transparency predecessor chain is invalid");
      expect(spy).not.toHaveBeenCalled(); expect(snapshot(f.workspace)).toEqual(before);
    } finally { writeFileSync(path, original); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test.each(["seal", "root"] as const)("verifies the actual captured %s signature before any new Sign", async target => {
    const f = fixture(), body = target === "seal" ? log.transparencySealPath(f.workspace) : merkleCurrentRootPath(f.workspace);
    const path = target === "seal" ? log.transparencySealSigPath(f.workspace) : merkleCurrentRootSigPath(f.workspace), original = readFileSync(path);
    const sig = JSON.parse(original.toString("utf8")), bytes = Buffer.from(sig.signature, "base64"); bytes[0] = bytes[0]! ^ 1;
    sig.signature = bytes.toString("base64"); sig.envelope.sigB64 = sig.signature; writeFileSync(path, JSON.stringify(sig, null, 2));
    expect(verify(null, Buffer.from(sha256Hex(readFileSync(body)), "hex"), f.pem, bytes)).toBe(false);
    const spy = vi.spyOn(f.provider, "sign");
    try { const before = snapshot(f.workspace); await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toThrow("transparency signed predecessor is invalid");
      expect(spy).not.toHaveBeenCalled(); expect(snapshot(f.workspace)).toEqual(before);
    } finally { writeFileSync(path, original); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test.each(["root prefix", "migration prefix"] as const)("refuses real owner-signed but mathematically false %s claims", async target => {
    const f = fixture(), hashes = log.readTransparencyEntries(f.workspace).map(row => row.hash);
    const bodyPath = target === "root prefix" ? merkleCurrentRootPath(f.workspace) : merkleMigrationPath(f.workspace);
    const sigPath = target === "root prefix" ? merkleCurrentRootSigPath(f.workspace) : merkleMigrationSigPath(f.workspace);
    const originalBody = existsSync(bodyPath) ? readFileSync(bodyPath) : null, originalSig = existsSync(sigPath) ? readFileSync(sigPath) : null;
    const row = target === "root prefix" ? { ...JSON.parse(originalBody!.toString("utf8")), leafCount: hashes.length + 1 }
      : { v: 1, ts: Date.now(), legacyRoot: entryTreeRoot("amc-legacy-v1", hashes), rfc9162Root: "f".repeat(64), leafCount: hashes.length, lastEntryHash: hashes.at(-1) ?? "" };
    const bytes = Buffer.from(JSON.stringify(row, null, 2)), signed = signDigestWithVault({ workspace: f.workspace, kind: "MERKLE_ROOT", digestHex: sha256Hex(bytes) });
    writeFileSync(bodyPath, bytes); writeFileSync(sigPath, JSON.stringify({ digestSha256: signed.digestSha256, signature: signed.signature,
      signedTs: signed.signedTs, signer: "auditor", envelope: signed.envelope }, null, 2));
    expect(verify(null, Buffer.from(sha256Hex(bytes), "hex"), f.pem, Buffer.from(signed.signature, "base64"))).toBe(true);
    const spy = vi.spyOn(f.provider, "sign");
    try { const before = snapshot(f.workspace); await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toThrow(target === "root prefix"
      ? "transparency predecessor root does not cover its claimed prefix" : "transparency migration predecessor does not cover the log");
      expect(spy).not.toHaveBeenCalled(); expect(snapshot(f.workspace)).toEqual(before);
    } finally { if (originalBody === null) rmSync(bodyPath); else writeFileSync(bodyPath, originalBody);
      if (originalSig === null) rmSync(sigPath); else writeFileSync(sigPath, originalSig); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test("records actual post-line I/O failure and retains the committed entry until explicit repair", async () => {
    const f = fixture(), actualWrite = files.writeFileAtomic; let blocked = false;
    const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => {
      actualWrite(path, bytes, mode);
      if (path === log.transparencySealSigPath(f.workspace) && !blocked) {
        blocked = true; const root = merkleCurrentRootPath(f.workspace); rmSync(root); mkdirSync(root); writeFileSync(join(root, "occupied"), "owned I/O refusal");
      }
    });
    try {
      const error = await log.appendTransparencyEntryAsync(f.input).then(() => null, value => value);
      expect(blocked).toBe(true); expect(error).toBeInstanceOf(TransparencyMerkleLagError);
      expect(error).toMatchObject({ pendingRecorded: true, message: expect.stringContaining("committed to log.jsonl") });
      expect(log.readTransparencyEntries(f.workspace).at(-1)?.hash).toBe(error.entryHash);
      expect(log.verifyTransparencyLog(f.workspace).ok).toBe(true); expect(verifyTransparencyMerkle(f.workspace)).toMatchObject({ ok: false, lagPending: true });
    } finally { spy.mockRestore(); rmSync(merkleCurrentRootPath(f.workspace), { recursive: true, force: true }); rebuildTransparencyMerkle(f.workspace); }
    healthy(f.workspace); await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test("refuses a real final whole-policy edit even when both selected log signers remain identical", async () => {
    const f = fixture(), before = snapshot(f.workspace), seal = describePolicySigner(f.workspace, "TRANSPARENCY_ROOT"), root = describePolicySigner(f.workspace, "MERKLE_ROOT");
    const policyBody = readFileSync(trustConfigPath(f.workspace)), policySig = readFileSync(trustConfigSigPath(f.workspace));
    const next = loadTrustConfig(f.workspace); next.trust.enforcement.requireNotaryFor.push("CERT"); const prepared = preparePolicy(f.workspace, next);
    try {
      await expect(log.appendTransparencyEntryAsync(f.input, { beforeCommit: () => {
        files.writeFileAtomic(trustConfigPath(f.workspace), prepared.bytes, 0o644); files.writeFileAtomic(trustConfigSigPath(f.workspace), prepared.signature, 0o644);
        expect(verifyTrustConfigSignature(f.workspace)).toMatchObject({ valid: true, signatureExists: true });
        expect(describePolicySigner(f.workspace, "TRANSPARENCY_ROOT")).toEqual(seal); expect(describePolicySigner(f.workspace, "MERKLE_ROOT")).toEqual(root);
      } })).rejects.toThrow("transparency signing policy changed while signing was prepared");
      expect(snapshot(f.workspace)).toEqual(before);
    } finally { files.writeFileAtomic(trustConfigPath(f.workspace), policyBody, 0o644); files.writeFileAtomic(trustConfigSigPath(f.workspace), policySig, 0o644); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });

  test("retains legacy synchronous no-sign behavior while the explicitly async policy path refuses", async () => {
    const f = fixture(); vi.stubEnv("AMC_NO_SIGN", "1");
    const entry = log.appendTransparencyEntry(f.input); expect(log.readTransparencyEntries(f.workspace).at(-1)?.hash).toBe(entry.hash);
    const before = snapshot(f.workspace); await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toThrow("no-sign mode");
    expect(snapshot(f.workspace)).toEqual(before); vi.stubEnv("AMC_NO_SIGN", "0"); healthy(f.workspace);
  });

  test("the legacy incremental path rebuilds a self-consistent forged cache instead of signing its invented root", () => {
    const f = fixture(), path = merkleFrontierPath(f.workspace), state = JSON.parse(readFileSync(path, "utf8"));
    const frontier = state.frontier.map((node: { level: number; hash: string }, index: number) => index === 0 ? { ...node, hash: "f".repeat(64) } : node);
    const forged = { ...state, frontier, root: frontierRoot(frontier, "rfc9162-sha256") };
    expect(forged.root).not.toBe(state.root); expect(forged.lastEntryHash).toBe(state.lastEntryHash); expect(forged.leafCount).toBe(state.leafCount);
    writeFileSync(path, JSON.stringify(forged, null, 2)); log.appendTransparencyEntry(f.input); healthy(f.workspace);
    const hashes = log.readTransparencyEntries(f.workspace).map(row => row.hash), repaired = JSON.parse(readFileSync(path, "utf8"));
    expect(repaired.root).toBe(entryTreeRoot("rfc9162-sha256", hashes)); expect(repaired.leafCount).toBe(hashes.length);
  });

  test("extends actual owned legacy signed state, uses the existing migration owner flow, and refuses a crypto-valid tree downgrade", async () => {
    const f = fixture(), hashes = log.readTransparencyEntries(f.workspace).map(row => row.hash);
    const oldRoot = JSON.parse(readFileSync(merkleCurrentRootPath(f.workspace), "utf8")), oldSeal = JSON.parse(readFileSync(log.transparencySealPath(f.workspace), "utf8"));
    delete oldRoot.algorithm; delete oldSeal.merkleAlgorithm; oldRoot.root = entryTreeRoot("amc-legacy-v1", hashes);
    // Owned historical-format fixture, not a claim that a current CLI creates new legacy logs.
    writeOwnedSignedBody(f.workspace, merkleCurrentRootPath(f.workspace), merkleCurrentRootSigPath(f.workspace), oldRoot);
    writeOwnedSignedBody(f.workspace, log.transparencySealPath(f.workspace), log.transparencySealSigPath(f.workspace), oldSeal, "TRANSPARENCY_ROOT");
    rebuildTransparencyMerkle(f.workspace); healthy(f.workspace);
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
    expect(JSON.parse(readFileSync(merkleCurrentRootPath(f.workspace), "utf8")).algorithm).toBe("amc-legacy-v1");
    const migrated = transparencyMerkleRebuildCli(f.workspace, { algorithm: "rfc9162-sha256" }); expect(migrated.migration).not.toBeNull();
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
    const bodyPath = merkleCurrentRootPath(f.workspace), sigPath = merkleCurrentRootSigPath(f.workspace), body = readFileSync(bodyPath), signature = readFileSync(sigPath);
    const downgrade = { ...JSON.parse(body.toString("utf8")), algorithm: "amc-legacy-v1",
      root: entryTreeRoot("amc-legacy-v1", log.readTransparencyEntries(f.workspace).map(row => row.hash)) };
    writeOwnedSignedBody(f.workspace, bodyPath, sigPath, downgrade);
    const forgedSig = JSON.parse(readFileSync(sigPath, "utf8"));
    expect(verify(null, Buffer.from(sha256Hex(readFileSync(bodyPath)), "hex"), f.pem, Buffer.from(forgedSig.signature, "base64"))).toBe(true);
    try { const before = snapshot(f.workspace); await expect(log.appendTransparencyEntryAsync(f.input)).rejects.toThrow("transparency predecessor attempts a tree downgrade");
      expect(snapshot(f.workspace)).toEqual(before);
    } finally { writeFileSync(bodyPath, body); writeFileSync(sigPath, signature); }
    await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  });
});

async function notary(f: ReturnType<typeof fixture>) {
  const id = AWS_ARN("owned-workspace-transparency"), fake = awsFake({ [id]: fakeKey("p256") }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id }), pin = join(f.root, "notary.pub"); writeFileSync(pin, description.publicKeyPem);
  const requests: Array<{ kind: string; payload: Buffer }> = []; let beforeReply: (() => Promise<void>) | undefined;
  const dispatches: Promise<void>[] = [];
  const server = createServer((req, res) => { const dispatch = (async () => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks), config = loadTrustConfig(f.workspace);
    const auth = verifyNotaryRequestAuth({ req, bodyBytes: body, secret: resolveNotaryAuthSecret(f.workspace, config.trust.notary.auth.secretRef),
      headerName: config.trust.notary.auth.headerName, tsHeaderName: "x-amc-notary-ts", maxClockSkewSeconds: 30, path: "/sign" });
    if (!auth.ok) { res.writeHead(401); res.end(); return; }
    const parsed = JSON.parse(body.toString("utf8")), payload = Buffer.from(parsed.payloadB64, "base64"); requests.push({ kind: parsed.kind, payload });
    const signature = await signChecked(provider, description, payload); if (beforeReply) await beforeReply();
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(notarySignResponse(parsed.kind, sha256Hex(payload), {
      signatureB64: signature.toString("base64"), pubkeyPem: description.publicKeyPem, pubkeyFingerprint: description.keyId, backend: "KEY_PROVIDER",
      attestationLevel: "HARDWARE", attestationBasis: description.protectionBasis, claims: { provider: "aws-kms" }, signedTs: Date.now() })));
  })(); dispatches.push(dispatch); void dispatch.catch(error => res.destroy(error instanceof Error ? error : undefined)); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  closers.push(async () => { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); await Promise.all(dispatches); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("owned notary did not bind");
  await enableNotaryTrust({ workspace: f.workspace, baseUrl: `http://127.0.0.1:${address.port}`, pinPubkeyPath: pin, requiredAttestationLevel: "HARDWARE" });
  return { description, requests, setBeforeReply(value: typeof beforeReply) { beforeReply = value; } };
}

test("native P256 log policy signs both actual kinds and publishes truthful selected seal metadata", async () => {
  const f = fixture(), remote = await notary(f); await log.appendTransparencyEntryAsync(f.input);
  const seal = JSON.parse(readFileSync(log.transparencySealPath(f.workspace), "utf8"));
  expect(seal.signerFingerprint).toBe(remote.description.keyId);
  for (const [index, body, signature, kind] of [[0, log.transparencySealPath(f.workspace), log.transparencySealSigPath(f.workspace), "TRANSPARENCY_ROOT"],
    [1, merkleCurrentRootPath(f.workspace), merkleCurrentRootSigPath(f.workspace), "MERKLE_ROOT"]] as const) {
    const bytes = readFileSync(body), sig = JSON.parse(readFileSync(signature, "utf8"));
    expect(sig.envelope).toMatchObject({ alg: "ecdsa-p256-sha256", fingerprint: remote.description.keyId,
      signer: { type: "NOTARY", attestationLevel: "HARDWARE", attestationBasis: remote.description.protectionBasis } });
    expect(remote.requests[index]).toEqual({ kind, payload: Buffer.from(sha256Hex(bytes), "hex") });
    expect(verify("sha256", Buffer.from(sha256Hex(bytes), "hex"), { key: remote.description.publicKeyPem, dsaEncoding: "ieee-p1363" }, Buffer.from(sig.signature, "base64"))).toBe(true);
  }
  expect(remote.requests).toHaveLength(2); healthy(f.workspace);
});

test("rechecks the original first VAULT authority after a second independently selected native notary Sign", async () => {
  const f = fixture(), remote = await notary(f), config = loadTrustConfig(f.workspace);
  config.trust.enforcement.requireNotaryFor = ["MERKLE_ROOT"]; config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, config);
  expect(describePolicySigner(f.workspace, "TRANSPARENCY_ROOT").mode).toBe("VAULT");
  expect(describePolicySigner(f.workspace, "MERKLE_ROOT").mode).toBe("NOTARY");
  const entered = deferred(), release = deferred(); remote.setBeforeReply(async () => { entered.resolve(); await release.promise; });
  const before = snapshot(f.workspace), pending = log.appendTransparencyEntryAsync(f.input), outcome = pending.then(() => null, error => error);
  try {
    expect(await Promise.race([entered.promise.then(() => "paused"), pending.then(() => "returned", () => "refused")])).toBe("paused");
    expect(existsSync(join(f.workspace, ".amc/transparency/.workspace-transparency.lock"))).toBe(false);
    lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); release.resolve();
    expect(await outcome).toBeInstanceOf(Error); expect(remote.requests).toHaveLength(1); expect(snapshot(f.workspace)).toEqual(before);
  } finally { release.resolve(); await Promise.allSettled([pending]); remote.setBeforeReply(undefined); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  expect(JSON.parse(readFileSync(log.transparencySealPath(f.workspace), "utf8")).signerFingerprint).toBe(sha256Hex(f.pem));
});

test("rechecks the original last VAULT authority after its checked signature and the first native notary signature are both prepared", async () => {
  const f = fixture(), remote = await notary(f), config = loadTrustConfig(f.workspace);
  config.trust.enforcement.requireNotaryFor = ["TRANSPARENCY_ROOT"]; config.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled = false; savePolicy(f.workspace, config);
  const before = snapshot(f.workspace), actual = f.provider.sign.bind(f.provider); let checked: { bytes: Buffer; signature: Buffer } | undefined;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await actual(ref, bytes); checked = { bytes: Buffer.from(bytes), signature: Buffer.from(signature) }; return signature;
  });
  let callbackReached = false;
  try {
    const error = await log.appendTransparencyEntryAsync(f.input, { beforeCommit: () => {
      callbackReached = true;
      lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    } }).then(() => null, value => value);
    expect(callbackReached).toBe(true); expect(error).toBeInstanceOf(Error);
    expect(remote.requests).toHaveLength(1); expect(spy).toHaveBeenCalledTimes(1); expect(checked).toBeDefined();
    expect(verify(null, checked!.bytes, f.pem, checked!.signature)).toBe(true);
    expect(snapshot(f.workspace)).toEqual(before);
  } finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  await log.appendTransparencyEntryAsync(f.input); healthy(f.workspace);
  expect(JSON.parse(readFileSync(log.transparencySealPath(f.workspace), "utf8")).signerFingerprint).toBe(remote.description.keyId);
});
