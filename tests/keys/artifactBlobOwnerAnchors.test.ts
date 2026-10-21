import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { prepareBlobIndexAuthorityOwner } from "../../src/keys/blobIndexOwner.js";
import { prepareArtifactBlobPurposeRotation } from "../../src/keys/purposeKeys.js";
import { verifyRotationStatement } from "../../src/keys/rotationStatement.js";
import { captureTransparencyState } from "../../src/transparency/workspacePublication.js";
import { machineMark } from "../../src/keys/anchors.js";
import { workspaceIdFromDirectory } from "../../src/workspaces/workspaceId.js";
import { bindPurposeProviderKey, loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { boundProviderKey, keysetIdentity, keysetPaths } from "../../src/keys/keyset.js";
import { rotateKeysForCli } from "../../src/keys/keysCli.js";
import { ArtifactBlobAnchoringError, captureArtifactBlobAnchorBoundary } from "../../src/keys/artifactBlobAnchors.js";
import { appendTransparencyEntryAsync, readTransparencyEntries, transparencyLogPath, transparencySealPath,
  transparencySealSigPath, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { verifyTransparencyMerkle } from "../../src/transparency/merkleIndexStore.js";
import { merkleCurrentRootPath, merkleCurrentRootSigPath } from "../../src/transparency/merklePaths.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, trustConfigSchema, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { sha256Hex } from "../../src/utils/hash.js";
import * as files from "../../src/utils/fs.js";
import * as vault from "../../src/vault/vault.js";
import { BLOB_OWNER_PASS as PASS, cleanupBlobOwnerFixtures, configureBlobOwner, makeBlobOwnerFixture } from "../helpers/blobIndexOwnerFixture.js";

const sdk = vi.hoisted(() => ({ dispatch: null as KmsCall | null }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => {
    if (sdk.dispatch === null) throw new Error("owned AWS dispatcher is absent");
    return sdk.dispatch(...args);
  })) };
});
afterEach(() => { vi.restoreAllMocks(); sdk.dispatch = null; cleanupBlobOwnerFixtures(); vi.unstubAllEnvs(); });
function fixture() { const f = makeBlobOwnerFixture(); sdk.dispatch = f.fake.call; return f; }
type Fixture = ReturnType<typeof fixture>;
function healthy(workspace: string) {
  expect(verifyTransparencyLog(workspace)).toMatchObject({ ok: true, errors: [] });
  expect(verifyTransparencyMerkle(workspace)).toMatchObject({ ok: true, errors: [], lagPending: false });
}
const input = (workspace: string) => ({ workspace, type: "OWNED_ARTIFACT_ANCHOR_CONTROL", agentId: "workspace",
  artifact: { kind: "bom" as const, sha256: sha256Hex("owned anchor control") } });
function publication(f: Fixture) {
  const optional = (path: string) => { try { return sha256Hex(readFileSync(path)); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  return { owned: f.ownedState(), keyset: keysetIdentity(f.workspace), pending: optional(keysetPaths(f.workspace).pending),
    artifactHistory: optional(f.target(".amc/keys/artifact-seal_history.json")), log: optional(transparencyLogPath(f.workspace)) };
}
function pause(f: Fixture, predicate: (operation: string, request: Record<string, unknown>) => boolean) {
  let reached!: () => void, release!: () => void, armed = true;
  const entered = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  sdk.dispatch = async (operation, request, region) => {
    if (armed && predicate(operation, request)) { armed = false; reached(); await gate; }
    return f.fake.call(operation, request, region);
  };
  return { entered, release };
}
const raw32 = (operation: string, request: Record<string, unknown>) => operation === "Sign" && Buffer.from(request.Message as Uint8Array).length === 32;
const popB = (f: Fixture) => (operation: string, request: Record<string, unknown>) =>
  operation === "Sign" && request.KeyId === f.nextId && Buffer.from(request.Message as Uint8Array).subarray(0, 15).toString("ascii") === "AMC_KEY_POP_V1\0";
const settled = <T>(pending: Promise<T>) => pending.then(value => ({ value }), error => ({ error }));
function outcomeError(result: unknown): Error & { cause?: unknown } {
  const error = (result as { error?: unknown }).error;
  expect(error).toBeInstanceOf(Error); return error as Error & { cause?: unknown };
}

describe("internal artifact/blob owner workspace anchors (not normal binding)", () => {
  it("first default owner commit signs the exact two anchor pairs and preserves ordinary public readers", async () => {
    const f = fixture(), bodies: Buffer[] = [], raw: Array<{ message: Buffer; signature: Buffer }> = [];
    const write = files.writeFileAtomic;
    vi.spyOn(files, "writeFileAtomic").mockImplementation((path, data, mode) => {
      if (path === transparencySealPath(f.workspace) || path === merkleCurrentRootPath(f.workspace)) bodies.push(Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data, "utf8"));
      return write(path, data, mode);
    });
    sdk.dispatch = async (operation, request, region) => {
      const answer = await f.fake.call(operation, request, region);
      if (raw32(operation, request)) raw.push({ message: Buffer.from(request.Message as Uint8Array), signature: Buffer.from((answer as { Signature: Uint8Array }).Signature) });
      return answer;
    };
    const result = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    expect(boundProviderKey(f.workspace, "artifact-seal")?.binding.keyId).toBe(signingKeyId(f.a.publicKey.export({ format: "pem", type: "spki" }).toString()));
    expect(result.generation).toBe(keysetIdentity(f.workspace)?.generation);
    expect(raw).toHaveLength(4); expect(bodies).toHaveLength(4);
    expect(raw.map(row => row.message)).toEqual(bodies.map(bytes => Buffer.from(sha256Hex(bytes), "hex")));
    for (const row of raw) expect(verify("sha256", row.message, f.a.publicKey, row.signature)).toBe(true);
    const anchors = readTransparencyEntries(f.workspace).filter(row => ["KEY_ROTATION", "KEY_HISTORY_REVISION"].includes(row.type)
      && row.artifact.id?.includes(":artifact-seal#"));
    expect(anchors.slice(-2).map(row => [row.type, row.artifact.kind])).toEqual([["KEY_ROTATION", "key-rotation"], ["KEY_HISTORY_REVISION", "key-history"]]);
    healthy(f.workspace);
    const calls = f.fake.requests.length;
    await expect(bindPurposeProviderKey(f.workspace, "artifact-seal", { passphrase: PASS })).rejects.toThrow("cannot be bound");
    expect(f.fake.requests).toHaveLength(calls);
  });

  it("the fixed rotation primitive refuses a different previous issuer before Sign and keeps actual owner crypto", async () => {
    const f = fixture(), boundary = captureArtifactBlobAnchorBoundary(f.workspace), provider = loadKeyProvider(f.workspace, "aws-kms");
    const description = await provider.describe({ provider: "aws-kms", id: f.id }), other = generateKeyPairSync("ed25519");
    const real = { workspace: f.workspace, previousPublicKeyPem: other.publicKey.export({ format: "pem", type: "spki" }).toString(),
      previous: { privateKeyPem: other.privateKey.export({ format: "pem", type: "pkcs8" }).toString() }, next: { provider, description }, now: new Date() };
    const requests = f.fake.requests.length;
    await expect(prepareArtifactBlobPurposeRotation(real, boundary)).rejects.toThrow("previous issuer");
    expect(f.fake.requests).toHaveLength(requests);
    const privateKeyPem = f.legacyPrivateKey, previousPublicKeyPem = createPublicKey(privateKeyPem).export({ format: "pem", type: "spki" }).toString();
    const plan = await prepareArtifactBlobPurposeRotation({ ...real, previousPublicKeyPem, previous: { privateKeyPem } }, boundary);
    expect(plan).not.toBeNull(); expect(plan?.previousKeyId).toBe(signingKeyId(previousPublicKeyPem));
    expect(verifyRotationStatement(plan!.bytes, { expected: { workspaceId: workspaceIdFromDirectory(f.workspace), purpose: "artifact-seal" }, trustedCurrentPublicKeyPem: previousPublicKeyPem, previous: null }).valid).toBe(true);
  });

  it("real A to B rebind preserves A-signed predecessors through exact issuer history and another async append", async () => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    const originalA = [readFileSync(transparencySealPath(f.workspace)), readFileSync(transparencySealSigPath(f.workspace))];
    const old = JSON.parse(originalA[1]!.toString("utf8")) as { signature: string; envelope: { alg: string } };
    expect(verify("sha256", Buffer.from(sha256Hex(originalA[0]!), "hex"), { key: f.a.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(old.signature, "base64"))).toBe(true);
    configureBlobOwner(f.workspace, f.nextId); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    const history = getPurposeKeyHistory(f.workspace, "artifact-seal");
    expect(history).toContain(f.a.publicKey.export({ format: "pem", type: "spki" }).toString());
    expect(history).toContain(f.b.publicKey.export({ format: "pem", type: "spki" }).toString());
    healthy(f.workspace); await appendTransparencyEntryAsync(input(f.workspace)); healthy(f.workspace);
  });

  it.each(["seal", "root"] as const)("imported-role-only %s refuses before every provider request and commit, with genuine crypto and restored owner positive", async target => {
    const f = fixture(), imported = generateKeyPairSync("ed25519"), pem = imported.publicKey.export({ format: "pem", type: "spki" }).toString();
    addPublicKeyToHistory(f.workspace, "auditor", pem, "imported", { logRevision: false });
    expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
    const body = target === "seal" ? transparencySealPath(f.workspace) : merkleCurrentRootPath(f.workspace);
    const path = target === "seal" ? transparencySealSigPath(f.workspace) : merkleCurrentRootSigPath(f.workspace), original = readFileSync(path);
    const digest = sha256Hex(readFileSync(body)), signature = sign(null, Buffer.from(digest, "hex"), imported.privateKey).toString("base64");
    expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64"))).toBe(true);
    writeFileSync(path, JSON.stringify({ digestSha256: digest, signature, signedTs: Date.now(), signer: "auditor" }, null, 2));
    try {
      expect((target === "seal" ? verifyTransparencyLog(f.workspace) : verifyTransparencyMerkle(f.workspace)).ok).toBe(true);
      const before = publication(f);
      await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toThrow();
      expect(f.fake.requests).toEqual([]); expect(publication(f)).toEqual(before);
    } finally { writeFileSync(path, original); }
    await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); healthy(f.workspace);
  });

  it("a real competing A log append prevents stale B owner publication and an explicit fresh attempt succeeds", async () => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); configureBlobOwner(f.workspace, f.nextId);
    const before = f.ownedState(), held = pause(f, popB(f)), pending = settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }));
    try {
      await held.entered; const other = await appendTransparencyEntryAsync(input(f.workspace)); held.release();
      outcomeError(await pending); expect(f.ownedState()).toEqual(before);
      expect(readTransparencyEntries(f.workspace).at(-1)?.hash).toBe(other.hash); healthy(f.workspace);
    } finally { held.release(); await pending; }
    await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); healthy(f.workspace);
  });

  it("whole trust policy drift with unchanged log descriptors refuses before the owner commit", async () => {
    const f = fixture(), before = publication(f), policyPath = trustConfigPath(f.workspace), sigPath = trustConfigSigPath(f.workspace);
    const oldBody = readFileSync(policyPath), oldSignature = readFileSync(sigPath), held = pause(f, (operation, request) =>
      operation === "Sign" && Buffer.from(request.Message as Uint8Array).subarray(0, 15).toString("ascii") === "AMC_KEY_POP_V1\0");
    const pending = settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }));
    try {
      await held.entered;
      const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = ["BOM"];
      // Real owner-key crypto on an alternate policy; runtime artifact signing remains correctly refused before binding.
      const body = Buffer.from(JSON.stringify(trustConfigSchema.parse(policy), null, 2)), digestSha256 = sha256Hex(body);
      const signature = sign(null, Buffer.from(digestSha256, "hex"), f.legacyPrivateKey).toString("base64");
      writeFileSync(policyPath, body); writeFileSync(sigPath, JSON.stringify({ digestSha256, signature, signedTs: Date.now(), signer: "auditor" }, null, 2));
      expect(verifyTrustConfigSignature(f.workspace).valid).toBe(true);
      held.release(); outcomeError(await pending); expect(publication(f)).toEqual(before);
    } finally { held.release(); await pending; writeFileSync(policyPath, oldBody); writeFileSync(sigPath, oldSignature); }
    await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); healthy(f.workspace);
  });

  it("late owner vault lock refuses a cryptographically usable first log Sign after the generation already committed", async () => {
    const f = fixture(), old = f.ownedState(), held = pause(f, raw32), pending = settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }));
    try {
      await held.entered; const committed = f.ownedState(); expect(committed).not.toEqual(old);
      vault.lockVault(f.workspace); held.release();
      const error = outcomeError(await pending);
      expect(error).toMatchObject({ committed: true, generation: keysetIdentity(f.workspace)?.generation });
      expect(f.ownedState()).toEqual(committed);
      expect(readTransparencyEntries(f.workspace).some(row => row.type === "KEY_ROTATION" && row.artifact.id?.includes(":artifact-seal#"))).toBe(false);
    } finally { held.release(); await pending; vault.unlockVault(f.workspace, PASS); }
    await rotateKeysForCli(f.workspace, { resume: true }); healthy(f.workspace);
  });

  it("postcommit exact original prefix refuses a valid older A log restored before log preparation", async () => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    const earlier = captureTransparencyState(f.workspace, true); await appendTransparencyEntryAsync(input(f.workspace));
    const originalPrefix = readFileSync(transparencyLogPath(f.workspace)); configureBlobOwner(f.workspace, f.nextId);
    const mark = vault.markWrittenHistories; let armed = true;
    const spy = vi.spyOn(vault, "markWrittenHistories").mockImplementation((workspace, writes) => {
      if (armed && workspace === f.workspace && writes.some(row => row.path.endsWith("artifact-seal_history.json"))) {
        armed = false;
        // Adversarial fixture replacement, not a product rollback/repair. Every restored member carries genuine A math.
        for (const [path, bytes] of earlier) if (Buffer.isBuffer(bytes)) writeFileSync(path, bytes);
      }
      return mark(workspace, writes);
    });
    try {
      const error = outcomeError(await settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })));
      expect(error).toMatchObject({ committed: true });
      expect(readFileSync(transparencyLogPath(f.workspace)).length).toBeLessThan(originalPrefix.length);
      healthy(f.workspace);
    } finally { spy.mockRestore(); }
  });

  it("typed postcommit provider refusal retains the generation and actual CLI resume is idempotent", async () => {
    const f = fixture(); let refused = false;
    sdk.dispatch = async (operation, request, region) => {
      if (!refused && raw32(operation, request)) { refused = true; throw Object.assign(new Error("owned KMS unavailable private detail"), { name: "ServiceUnavailableException" }); }
      return f.fake.call(operation, request, region);
    };
    const result = await settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })), error = outcomeError(result);
    expect(error).toBeInstanceOf(ArtifactBlobAnchoringError);
    expect(error).toMatchObject({ committed: true, phase: "rotation-log", cause: { code: "KEY_PROVIDER_UNAVAILABLE" } });
    const committed = f.ownedState(); sdk.dispatch = f.fake.call;
    configureBlobOwner(f.workspace, f.nextId); const beforeRetry = f.fake.requests.length;
    await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toThrow("--resume");
    expect(f.fake.requests).toHaveLength(beforeRetry); expect(f.ownedState()).toEqual(committed);
    configureBlobOwner(f.workspace, f.id);
    vault.lockVault(f.workspace); expect(vault.vaultStatus(f.workspace).unlocked).toBe(false);
    const resumed = await rotateKeysForCli(f.workspace, { resume: true });
    expect(resumed).toMatchObject({ action: "nothing-pending", artifactAnchors: { generation: keysetIdentity(f.workspace)?.generation, complete: true } });
    expect(vault.vaultStatus(f.workspace).unlocked).toBe(true);
    healthy(f.workspace); expect(f.ownedState()).toEqual(committed);
    const count = f.signatures(), log = readFileSync(transparencyLogPath(f.workspace));
    await rotateKeysForCli(f.workspace, { resume: true });
    expect(f.signatures()).toBe(count); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
  });

  it("cold actual CLI resume rejects the selected wrong passphrase without state or provider work, then the correct phrase completes", async () => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    vault.lockVault(f.workspace); const before = publication(f), requests = f.fake.requests.length;
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-wrong-artifact-resume-passphrase");
    try {
      await expect(rotateKeysForCli(f.workspace, { resume: true })).rejects.toThrow("incorrect passphrase or corrupted vault");
      expect(vault.vaultStatus(f.workspace).unlocked).toBe(false);
      expect(publication(f)).toEqual(before); expect(f.fake.requests).toHaveLength(requests);
    } finally { vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); }
    expect(await rotateKeysForCli(f.workspace, { resume: true })).toMatchObject({ action: "nothing-pending", artifactAnchors: { complete: true } });
    expect(vault.vaultStatus(f.workspace).unlocked).toBe(true);
    expect(publication(f)).toEqual(before); expect(f.fake.requests).toHaveLength(requests); healthy(f.workspace);
  });

  it("second history-anchor pre-line refusal retains only rotation completion and no stale attempted entry or pending marker", async () => {
    const f = fixture(), before = readTransparencyEntries(f.workspace).length; let calls = 0;
    const mark = vault.markWrittenHistories, marked: number[] = [];
    const spy = vi.spyOn(vault, "markWrittenHistories").mockImplementation((workspace, writes) => {
      const result = mark(workspace, writes);
      if (workspace === f.workspace && writes.some(row => row.path.endsWith("artifact-seal_history.json"))) marked.push(readTransparencyEntries(workspace).length);
      return result;
    });
    sdk.dispatch = async (operation, request, region) => {
      if (raw32(operation, request) && ++calls === 3) throw Object.assign(new Error("owned second-anchor unavailable detail"), { name: "ServiceUnavailableException" });
      return f.fake.call(operation, request, region);
    };
    try {
      const error = outcomeError(await settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })));
      expect(error).toBeInstanceOf(ArtifactBlobAnchoringError);
      expect(error).toMatchObject({ committed: true, generation: keysetIdentity(f.workspace)?.generation, phase: "history-log", cause: { code: "KEY_PROVIDER_UNAVAILABLE" } });
      const anchored = error as ArtifactBlobAnchoringError, entries = readTransparencyEntries(f.workspace), rotation = entries.at(-1)!;
      expect(entries).toHaveLength(before + 1); expect(rotation.type).toBe("KEY_ROTATION");
      expect(anchored.completedTargets).toHaveLength(1);
      expect(anchored.completedTargets[0]).toMatchObject({ type: "KEY_ROTATION", sha256: rotation.artifact.sha256 });
      expect(rotation.artifact.id).toBe(`${anchored.completedTargets[0]!.id}#${anchored.completedTargets[0]!.sequence}`);
      expect(machineMark(f.workspace, "KEY_ROTATION", anchored.completedTargets[0]!.id)).toMatchObject({ sequence: anchored.completedTargets[0]!.sequence, sha256: rotation.artifact.sha256 });
      expect(anchored.entryHash).toBeUndefined(); expect(anchored.pendingRecorded).toBeUndefined();
      expect(marked).toEqual([before]); healthy(f.workspace);
      const committed = f.ownedState(); sdk.dispatch = f.fake.call;
      await rotateKeysForCli(f.workspace, { resume: true });
      expect(f.ownedState()).toEqual(committed); expect(readTransparencyEntries(f.workspace)).toHaveLength(before + 2); healthy(f.workspace);
    } finally { sdk.dispatch = f.fake.call; spy.mockRestore(); }
  });

  it("A to B committed before the real history mark still resumes; higher authenticated history is not a known failure", async () => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); configureBlobOwner(f.workspace, f.nextId);
    const mark = vault.markWrittenHistories, fault = new Error("owned crash before history mark"); let armed = true;
    const spy = vi.spyOn(vault, "markWrittenHistories").mockImplementation((workspace, writes) => {
      if (armed && workspace === f.workspace && writes.some(row => row.path.endsWith("artifact-seal_history.json"))) { armed = false; throw fault; }
      return mark(workspace, writes);
    });
    const result = await settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }));
    expect(outcomeError(result)).toMatchObject({ committed: true, cause: fault }); spy.mockRestore();
    expect(boundProviderKey(f.workspace, "artifact-seal")?.binding.keyId).toBe(signingKeyId(f.b.publicKey.export({ format: "pem", type: "spki" }).toString()));
    expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).toContain(f.a.publicKey.export({ format: "pem", type: "spki" }).toString());
    healthy(f.workspace); await rotateKeysForCli(f.workspace, { resume: true }); healthy(f.workspace);
  });

  it.each(["seal", "Merkle root"] as const)("a real post-line %s I/O failure is retained and resume says REPAIR_REQUIRED without another Sign", async target => {
    const f = fixture(), before = readTransparencyEntries(f.workspace).length, failure = new Error("owned post-line writer failure"), write = files.writeFileAtomic;
    const id = `${workspaceIdFromDirectory(f.workspace)}:artifact-seal`, previousMark = machineMark(f.workspace, "KEY_ROTATION", id);
    const failPath = target === "seal" ? transparencySealPath(f.workspace) : merkleCurrentRootPath(f.workspace);
    const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => { if (path === failPath) throw failure; return write(path, bytes, mode); });
    const result = await settled(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })), error = outcomeError(result);
    expect(error).toMatchObject({ committed: true, phase: "rotation-log", cause: { cause: failure } });
    const entry = readTransparencyEntries(f.workspace).at(-1)!;
    expect(readTransparencyEntries(f.workspace)).toHaveLength(before + 1);
    expect(error).toMatchObject({ entryHash: entry.hash, pendingRecorded: true });
    expect(machineMark(f.workspace, "KEY_ROTATION", id)).toEqual(previousMark);
    spy.mockRestore();
    if (target === "Merkle root") { expect(verifyTransparencyLog(f.workspace).ok).toBe(true); expect(JSON.parse(readFileSync(merkleCurrentRootPath(f.workspace), "utf8")).leafCount).toBe(before); }
    const requests = f.fake.requests.length, log = readFileSync(transparencyLogPath(f.workspace)), state = f.ownedState();
    await expect(rotateKeysForCli(f.workspace, { resume: true })).rejects.toMatchObject({ code: "REPAIR_REQUIRED" });
    expect(f.fake.requests).toHaveLength(requests); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log); expect(f.ownedState()).toEqual(state);
  });

  it.each(["workspace-only generation", "artifact history", "adopted-only machine"] as const)("actual resume refuses %s authority without provider work, then restored original state succeeds", async target => {
    const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    const path = target === "artifact history" ? f.target(".amc/keys/artifact-seal_history.json") : keysetPaths(f.workspace).keyset;
    const original = readFileSync(path), home = process.env.AMC_HOME!, requests = f.fake.requests.length;
    try {
      if (target === "adopted-only machine") vi.stubEnv("AMC_HOME", join(f.root, "owned-adopting-machine"));
      else if (target === "artifact history") writeFileSync(path, Buffer.concat([original, Buffer.from("corrupt")]));
      else { const forged = JSON.parse(original.toString("utf8")); forged.generation += 1; writeFileSync(path, JSON.stringify(forged)); }
      await expect(rotateKeysForCli(f.workspace, { resume: true })).rejects.toThrow();
      expect(f.fake.requests).toHaveLength(requests);
    } finally { if (target === "adopted-only machine") vi.stubEnv("AMC_HOME", home); else writeFileSync(path, original); }
    await rotateKeysForCli(f.workspace, { resume: true }); healthy(f.workspace);
  });

  it("default unbound --resume preserves the original object fields and locked state without provider calls", async () => {
    const f = fixture(); vault.lockVault(f.workspace); const before = publication(f);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "owned-unbound-unused-resume-passphrase");
    expect(await rotateKeysForCli(f.workspace, { resume: true })).toEqual({ action: "nothing-pending", generation: null });
    expect(vault.vaultStatus(f.workspace).unlocked).toBe(false); expect(publication(f)).toEqual(before);
    expect(f.fake.requests).toEqual([]);
  });
});
