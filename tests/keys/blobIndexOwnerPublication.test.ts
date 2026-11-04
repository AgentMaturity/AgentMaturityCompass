// PROPOSED: depends on the fixed artifact-owner anchor implementation; no bound keyset is fabricated.
import { createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { signAmcConfig } from "../../src/workspace.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import { lockVault, unlockVault, getBlobIndexChildKey } from "../../src/vault/vault.js";
import { prepareBlobIndexAuthorityOwner } from "../../src/keys/blobIndexOwner.js";
import { blobAuthorityArchive, blobAuthorityIssuer, BLOB_AUTHORITY_CURRENT, BLOB_CHILD_FILE, parseBlobIndexAuthority } from "../../src/keys/blobIndexAuthority.js";
import { assertKeysetComplete, commitKeyset, keysetPaths } from "../../src/keys/keyset.js";
import { bindPurposeProviderKey, loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { verifyWithKey, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { loadTrustContext, type TrustContext } from "../../src/trust/trustContext.js";
import { admitKey } from "../../src/trust/admission.js";
import { signTrustList, verifySignedTrustList } from "../../src/trust/trustList.js";
import { storeEncryptedBlob, loadBlobPlaintext, verifyBlobIndexChain, verifyBlobIndexSignature } from "../../src/storage/blobs/blobStore.js";
import { signBlobCurrentKey } from "../../src/storage/blobs/blobKeys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { canonicalize } from "../../src/utils/json.js";
import { captureTransparencyState } from "../../src/transparency/workspacePublication.js";
import { sha256Hex } from "../../src/utils/hash.js";
import * as fsUtil from "../../src/utils/fs.js";
import * as blobState from "../../src/keys/blobIndexState.js";
import * as contained from "../../src/utils/containedFs.js";
import { AWS_ARN, awsFake, publicPem, type FakeKey } from "./providerFakes.js";
import { BLOB_OWNER_PASS, makeBlobOwnerFixture, configureBlobOwner, cleanupBlobOwnerFixtures } from "../helpers/blobIndexOwnerFixture.js";
const commitFault = vi.hoisted(() => ({ destination: null as string | null }));
vi.mock("node:fs", async original => {
  const real = await original<typeof import("node:fs")>();
  const renameSync: typeof real.renameSync = (from, to) => {
    if (String(to) === commitFault.destination) { commitFault.destination = null; throw Object.assign(new Error("owned blob child rename refusal"), { code: "EIO" }); }
    return real.renameSync(from, to);
  };
  return { ...real, renameSync, default: { ...real, renameSync } };
});
const sdk = vi.hoisted(() => ({ dispatch: null as null | ((...args: Parameters<import("../../src/keys/providers/awsKms.js").KmsCall>) => ReturnType<import("../../src/keys/providers/awsKms.js").KmsCall>) }));
// Normal runtime factory boundary, real provider implementation, unique owned refs; no SDK/network or setter API.
vi.mock("../../src/keys/providers/awsKms.js", async original => {
  const real = await original<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...real, awsKmsProvider: (call?: import("../../src/keys/providers/awsKms.js").KmsCall) => real.awsKmsProvider(call ?? ((...args) => {
    if (!sdk.dispatch) throw new Error("owned blob fixture has no provider dispatcher"); return sdk.dispatch(...args);
  })) };
});
const PASS = BLOB_OWNER_PASS;
afterEach(() => { vi.restoreAllMocks(); commitFault.destination = null; sdk.dispatch = null; cleanupBlobOwnerFixtures(); vi.unstubAllEnvs(); });
function fixture(legacy = 0, splitArtifact = false) { const f = makeBlobOwnerFixture(legacy, splitArtifact); sdk.dispatch = f.fake.call; return f; }
const configure = configureBlobOwner;
function paused() { let enter!: () => void, release!: () => void; const entered = new Promise<void>(done => { enter = done; }), wait = new Promise<void>(done => { release = done; }); return { entered, release, hold: async () => { enter(); await wait; } }; }
async function entered(gate: ReturnType<typeof paused>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { expect(await Promise.race([gate.entered.then(() => "entered"), pending.then(() => "returned", () => "refused"), new Promise<string>(done => { timer = setTimeout(() => done("no-certificate-sign"), 5_000); })])).toBe("entered"); }
  finally { clearTimeout(timer); }
}

test("a real prior blob child with valid provider PoP cannot become the next artifact issuer before certificate or commit", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  const certificate = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT)), child = getBlobIndexChildKey(f.workspace);
  const candidateKey: FakeKey = { kind: "ed25519", privateKey: child, publicKey: createPublicKey(child) }, candidateId = AWS_ARN(randomUUID());
  expect(signingKeyId(publicPem(candidateKey))).toBe(certificate.authority.childKeyId);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(publicPem(candidateKey));
  const transport = awsFake({ [f.id]: f.a, [f.nextId]: f.b, [candidateId]: candidateKey });
  const proofs: Array<{ bytes: Buffer; signature: Buffer }> = [];
  sdk.dispatch = async (operation, input, region) => {
    const response = await transport.call(operation, input, region);
    if (operation === "Sign" && input.KeyId === candidateId)
      proofs.push({ bytes: Buffer.from(input.Message as Uint8Array), signature: Buffer.from((response as { Signature: Uint8Array }).Signature) });
    return response;
  };
  configure(f.workspace, candidateId);
  const state = f.ownedState(), keyset = f.read(".amc/keys/keyset.json"), history = f.read(".amc/keys/artifact-seal_history.json");
  const log = captureTransparencyState(f.workspace, true), archives = readdirSync(f.target(".amc/keys/blob-index-authorities")).sort();
  const failure = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }).then(() => null, error => error);
  const pop = proofs.find(proof => proof.bytes.subarray(0, 15).toString("ascii") === "AMC_KEY_POP_V1\0");
  expect(pop).toBeDefined(); expect(verify(null, pop!.bytes, candidateKey.publicKey, pop!.signature)).toBe(true);
  expect(proofs.filter(proof => proof.bytes.toString("ascii").startsWith("AMC_BLOB_INDEX_AUTHORITY_V1\0"))).toHaveLength(0);
  expect(f.ownedState()).toEqual(state); expect(f.read(".amc/keys/keyset.json")).toEqual(keyset);
  expect(f.read(".amc/keys/artifact-seal_history.json")).toEqual(history); expect(captureTransparencyState(f.workspace, true)).toEqual(log);
  expect(readdirSync(f.target(".amc/keys/blob-index-authorities")).sort()).toEqual(archives); expect(existsSync(keysetPaths(f.workspace).pending)).toBe(false);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(publicPem(candidateKey));
  expect(failure).toBeInstanceOf(Error); expect(failure.message).toBe("a prior blob operation child cannot become the artifact provider issuer");
  expect(failure.committed).toBeUndefined();
  // Restore the actual configured ordinary issuer route; the original valid child and generation were never replaced.
  configure(f.workspace, f.nextId);
  const valid = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  expect(valid.issuerKeyId).toBe(signingKeyId(publicPem(f.b))); storeEncryptedBlob(f.workspace, Buffer.from("real restored issuer after child refusal"));
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test("real internal owner preparation commits a distinct sealed blob child and normal artifact binding remains disabled", async () => {
  const f = fixture(), before = f.ownedState(); await expect(bindPurposeProviderKey(f.workspace, "artifact-seal", { passphrase: PASS })).rejects.toThrow("cannot be bound");
  expect(f.fake.requests).toHaveLength(0); expect(f.ownedState()).toEqual(before);
  const result = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(f.signatures()).toBeGreaterThan(0);
  const keyset = assertKeysetComplete(f.workspace)!, certBytes = f.read(BLOB_AUTHORITY_CURRENT), cert = parseBlobIndexAuthority(certBytes);
  expect(keyset.providers?.["artifact-seal"]?.blobIndexAuthoritySha256).toBe(result.authoritySha256);
  expect(f.read(blobAuthorityArchive(result.authoritySha256))).toEqual(certBytes); expect(sha256Hex(certBytes)).toBe(result.authoritySha256);
  expect(statSync(f.target(BLOB_CHILD_FILE)).mode & 0o777).toBe(0o600); expect(f.read(BLOB_CHILD_FILE).toString()).not.toContain("PRIVATE KEY");
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(cert.authority.childPublicKeyPem);
  expect(cert.authority.childKeyId).not.toBe(keyset.keys["artifact-seal"]); expect(cert.authority.childKeyId).not.toBe(result.issuerKeyId);
  await expect(bindPurposeProviderKey(f.workspace, "artifact-seal", { passphrase: PASS })).rejects.toThrow("cannot be bound");
});
test("an actual empty bound blob index requires independent issuer admission before any blob is written", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  expect(verifyBlobIndexSignature(f.workspace, f.trust)).toMatchObject({ valid: true, signatureExists: false });
  expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 0 });
  expect(verifyBlobIndexSignature(f.workspace, loadTrustContext()).valid).toBe(false); expect(verifyBlobIndexChain(f.workspace).ok).toBe(false);
});
test("real bound blob writes use only the local certified child, retain payload crypto, and hash-bind the row authority and time", async () => {
  const f = fixture(1); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); const count = f.signatures();
  const written = storeEncryptedBlob(f.workspace, Buffer.from("owned child payload")); expect(f.signatures()).toBe(count);
  expect(loadBlobPlaintext(f.workspace, written.path).bytes.toString()).toBe("owned child payload");
  const lines = f.read(".amc/blobs/index.jsonl").toString().trim().split("\n"), row = JSON.parse(lines.at(-1)!), sig = JSON.parse(f.read(".amc/blobs/index.jsonl.sig").toString());
  const cert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT)); expect(row).toMatchObject({ v: 2, blobId: written.blobId, authoritySha256: sha256Hex(f.read(BLOB_AUTHORITY_CURRENT)) });
  expect(Object.keys(row)).toEqual(["v", "ts", "blobId", "keyVersion", "path", "payloadSha256", "encryptedBytes", "prev", "authoritySha256", "hash"]);
  expect(sig).toMatchObject({ v: 2, ts: row.ts, lastHash: row.hash, authoritySha256: row.authoritySha256 });
  expect(verifyWithKey(Buffer.from(row.hash, "hex"), cert.authority.childPublicKeyPem, Buffer.from(sig.signature, "base64"))).toBe(true);
  expect(verifyWithKey(Buffer.from(row.hash, "hex"), publicPem(f.a), Buffer.from(sig.signature, "base64"))).toBe(false);
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true); expect(verifyBlobIndexChain(f.workspace).ok).toBe(false);
  const original = f.read(".amc/blobs/index.jsonl.sig"); sig.ts++; writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), JSON.stringify(sig));
  expect(verifyWithKey(Buffer.from(row.hash, "hex"), cert.authority.childPublicKeyPem, Buffer.from(sig.signature, "base64"))).toBe(true);
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false); writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), original);
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});
test("zero-row rebind keeps the previous child's real head and requires every epoch issuer pin", async () => {
  const f = fixture(); const first = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("epoch A"));
  const head = f.read(".amc/blobs/index.jsonl.sig"), firstCert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT)); configure(f.workspace, f.nextId);
  const next = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(next.epoch).toBe(2); expect(next.childKeyId).not.toBe(first.childKeyId);
  expect(f.read(".amc/blobs/index.jsonl.sig")).toEqual(head); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
  const noB = { ...f.trust, explicitPins: f.trust.explicitPins.filter(pin => pin.keyId !== signingKeyId(publicPem(f.b))) };
  expect(verifyBlobIndexChain(f.workspace, noB).ok).toBe(false);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).toContain(publicPem(f.a)); expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).toContain(publicPem(f.b));
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(firstCert.authority.childPublicKeyPem);
  const count = f.signatures(); storeEncryptedBlob(f.workspace, Buffer.from("epoch B")); expect(f.signatures()).toBe(count); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});
test.each(["no-sign", "locked", "expired"] as const)("a real %s local append refuses before payload/index changes and restores", async state => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS, ...(state === "expired" ? { hours: 1 / 60 } : {}) }); const before = readdirSync(f.target(".amc/blobs")), count = f.signatures();
  if (state === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1"); else if (state === "locked") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
  else { const cert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT)); vi.spyOn(Date, "now").mockReturnValue(Date.parse(cert.authority.notAfter)); }
  try { expect(() => storeEncryptedBlob(f.workspace, Buffer.from("must not publish"))).toThrow(); expect(readdirSync(f.target(".amc/blobs"))).toEqual(before); expect(f.signatures()).toBe(count); }
  finally { vi.restoreAllMocks(); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  storeEncryptedBlob(f.workspace, Buffer.from("fresh restored positive")); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});
test.each(["sqlite", "jsonl"] as const)("actual %s content writer appends through its local child without remote artifact Sign", async backend => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); const count = f.signatures();
  if (backend === "sqlite") {
    const ledger = openLedger(f.workspace);
    try { ledger.startSession({ sessionId: "owned-sql-blob", runtime: "unknown", binaryPath: "owned", binarySha256: "a".repeat(64) });
      ledger.db.transaction(() => { expect(ledger.db.inTransaction).toBe(true); ledger.appendEvidence({ sessionId: "owned-sql-blob", runtime: "unknown", eventType: "audit", payload: "actual nested SQL blob", inline: false }); })();
    } finally { ledger.close(); }
  } else {
    const store = openSessionEventStore(f.workspace, "jsonl");
    try { store.startSession({ sessionId: "owned-jsonl-blob", runtime: "unknown", binaryPath: "owned", binarySha256: "a".repeat(64) });
      store.appendSessionEvent({ sessionId: "owned-jsonl-blob", runtime: "unknown", eventType: "audit", payload: "actual JSONL blob", meta: {} });
      expect(store.readSessionEvents("owned-jsonl-blob")).toHaveLength(1);
    } finally { store.close(); }
  }
  expect(f.signatures()).toBe(count); expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 1 });
});


test.each(["vault", "signed-policy", "signed-blob-metadata", "raw-valid-legacy-prefix"] as const)("real owner certificate await refuses %s drift before atomic publication and restores", async change => {
  const f = fixture(1), before = f.ownedState(), configPath = f.target(".amc/amc.config.yaml"), configBytes = readFileSync(configPath), configSig = readFileSync(configPath + ".sig");
  const metadata = f.read(".amc/blob-keys/current.json"), metadataSig = f.read(".amc/blob-keys/current.json.sig");
  const index = f.read(".amc/blobs/index.jsonl"), head = f.read(".amc/blobs/index.jsonl.sig"), provider = loadKeyProvider(f.workspace, "aws-kms"), original = provider.sign.bind(provider), gate = paused();
  const spy = vi.spyOn(provider, "sign").mockImplementation(async (ref, bytes) => { const signature = await original(ref, bytes);
    if (Buffer.from(bytes).subarray(0, 28).equals(Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"))) await gate.hold(); return signature; });
  const pending = prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  try { await entered(gate, pending);
    if (change === "vault") { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
    else if (change === "signed-policy") { const candidate = YAML.parse(configBytes.toString()) as { keys: { algorithmPolicy?: unknown } };
      candidate.keys.algorithmPolicy = { allowed: ["ed25519"] }; writeFileSync(configPath, YAML.stringify(candidate)); signAmcConfig(f.workspace); }
    else if (change === "signed-blob-metadata") { const candidate = JSON.parse(metadata.toString()); candidate.createdTs++;
      writeFileSync(f.target(".amc/blob-keys/current.json"), JSON.stringify(candidate)); signBlobCurrentKey(f.workspace);
      const signed = JSON.parse(f.read(".amc/blob-keys/current.json.sig").toString());
      expect(getPurposeKeyHistory(f.workspace, "config-signature").some(pem => verifyWithKey(Buffer.from(signed.digestSha256, "hex"), pem, Buffer.from(signed.signature, "base64")))).toBe(true); }
    else {
      const row = JSON.parse(index.toString().trim()); row.ts++; const preimage = { ...row }; delete preimage.hash; row.hash = sha256Hex(canonicalize(preimage));
      const signature = sign(null, Buffer.from(row.hash, "hex"), f.legacyPrivateKey).toString("base64");
      expect(getPurposeKeyHistory(f.workspace, "artifact-seal").some(pem => verifyWithKey(Buffer.from(row.hash, "hex"), pem, Buffer.from(signature, "base64")))).toBe(true);
      writeFileSync(f.target(".amc/blobs/index.jsonl"), JSON.stringify(row) + "\n");
      writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), JSON.stringify({ ...JSON.parse(head.toString()), lastHash: row.hash, signature }));
    }
    gate.release(); await expect(pending).rejects.toThrow(); expect(f.ownedState()).toEqual(before);
  } finally { gate.release(); await pending.catch(() => {}); spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
    writeFileSync(configPath, configBytes); writeFileSync(configPath + ".sig", configSig); writeFileSync(f.target(".amc/blob-keys/current.json"), metadata); writeFileSync(f.target(".amc/blob-keys/current.json.sig"), metadataSig); writeFileSync(f.target(".amc/blobs/index.jsonl"), index); writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), head); }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test("a raw-valid child head cannot authorize a foreign row marker even when sidecar and row labels agree", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("owned row"));
  const index = f.read(".amc/blobs/index.jsonl"), head = f.read(".amc/blobs/index.jsonl.sig"), child = getBlobIndexChildKey(f.workspace);
  const row = JSON.parse(index.toString().trim()); row.authoritySha256 = "f".repeat(64); const preimage = { ...row }; delete preimage.hash; row.hash = sha256Hex(canonicalize(preimage));
  const signature = sign(null, Buffer.from(row.hash, "hex"), child).toString("base64"), cert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT));
  expect(verifyWithKey(Buffer.from(row.hash, "hex"), cert.authority.childPublicKeyPem, Buffer.from(signature, "base64"))).toBe(true);
  try { writeFileSync(f.target(".amc/blobs/index.jsonl"), JSON.stringify(row) + "\n");
    writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), JSON.stringify({ ...JSON.parse(head.toString()), lastHash: row.hash, authoritySha256: row.authoritySha256, signature }));
    expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false);
  } finally { writeFileSync(f.target(".amc/blobs/index.jsonl"), index); writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), head); }
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test("real sidecar rename failure reports payload/index partial publication with native cause and no remote fallback", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); const child = getBlobIndexChildKey(f.workspace), count = f.signatures();
  const sigPath = f.target(".amc/blobs/index.jsonl.sig"), actual = fsUtil.writeFileAtomic;
  const spy = vi.spyOn(fsUtil, "writeFileAtomic").mockImplementation((...args) => { if (args[0] === sigPath) mkdirSync(sigPath); return actual(...args); });
  let caught: unknown;
  try { storeEncryptedBlob(f.workspace, Buffer.from("partial native write")); } catch (error) { caught = error; } finally { spy.mockRestore(); }
  expect(caught).toMatchObject({ name: "BlobPublicationIncompleteError", cause: expect.any(Error) });
  const published = (caught as { published: string[] }).published; expect(published).toHaveLength(2); expect(published[1]).toBe(".amc/blobs/index.jsonl");
  expect(existsSync(f.target(published[0]!))).toBe(true); expect(f.signatures()).toBe(count); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false);
  // Owned fixture reseals only the observed head; this is not a new production repair/rollback API.
  rmSync(sigPath, { recursive: true }); const row = JSON.parse(f.read(".amc/blobs/index.jsonl").toString().trim());
  writeFileSync(sigPath, JSON.stringify({ v: 2, ts: row.ts, lastHash: row.hash, signature: sign(null, Buffer.from(row.hash, "hex"), child).toString("base64"), signer: "auditor", authoritySha256: row.authoritySha256 }));
  storeEncryptedBlob(f.workspace, Buffer.from("fresh after owned reseal")); expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 2 });
});


test("a real unrelated generation carries every blob authority file and exact issuer history", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("before other generation"));
  const before = assertKeysetComplete(f.workspace)!, carried = Object.entries(before.files).filter(([rel]) => rel.startsWith("keys/blob-index-") || rel === "keys/artifact-seal_history.json");
  expect(carried.map(([rel]) => rel)).toEqual(expect.arrayContaining(["keys/blob-index-authorities/current.json", "keys/blob-index-child.amcvault", "keys/artifact-seal_history.json"]));
  const next = commitKeyset(f.workspace, { expectedGeneration: before.generation, keys: before.keys, writes: [] });
  expect(next.generation).toBe(before.generation + 1);
  for (const [rel, digest] of carried) { expect(next.files[rel]).toBe(digest); expect(sha256Hex(f.read(".amc/" + rel))).toBe(digest); }
  const count = f.signatures(); storeEncryptedBlob(f.workspace, Buffer.from("after other generation"));
  expect(f.signatures()).toBe(count); expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 2 });
});

test("committed artifact issuer history is pinned even when a same-signature-valid entry list is reformatted", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  const path = f.target(".amc/keys/artifact-seal_history.json"), original = readFileSync(path), before = readdirSync(f.target(".amc/blobs")), count = f.signatures();
  // The cryptographically identical history object and entries remain intact; only exact committed file bytes change.
  writeFileSync(path, JSON.stringify(JSON.parse(original.toString())));
  try { expect(() => storeEncryptedBlob(f.workspace, Buffer.from("must not publish"))).toThrow();
    expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false); expect(readdirSync(f.target(".amc/blobs"))).toEqual(before); expect(f.signatures()).toBe(count);
  } finally { writeFileSync(path, original); }
  storeEncryptedBlob(f.workspace, Buffer.from("restored exact history")); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test("an unavailable genuine predecessor issuer cannot be replaced using only the next provider", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("retained old issuer"));
  configure(f.workspace, f.nextId); const before = f.ownedState(), history = f.read(".amc/keys/artifact-seal_history.json"), previousDispatch = sdk.dispatch!;
  sdk.dispatch = async (operation, input, region) => {
    if (String(input.KeyId) === f.id) throw Object.assign(new Error("owned old issuer unavailable"), { name: "KMSInternalException", $metadata: { httpStatusCode: 500 } });
    return previousDispatch(operation, input, region);
  };
  try { await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
    expect(f.ownedState()).toEqual(before); expect(f.read(".amc/keys/artifact-seal_history.json")).toEqual(history);
  } finally { sdk.dispatch = previousDispatch; }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});


test("real wrong-purpose blob-key metadata refuses owner preparation before provider requests", async () => {
  const f = fixture(0, true), path = f.target(".amc/blob-keys/current.json.sig"), original = readFileSync(path), metadata = f.read(".amc/blob-keys/current.json");
  const digest = sha256Hex(metadata), signature = sign(null, Buffer.from(digest, "hex"), f.legacyPrivateKey).toString("base64");
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal").some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64")))).toBe(true);
  expect(getPurposeKeyHistory(f.workspace, "config-signature").some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64")))).toBe(false);
  writeFileSync(path, JSON.stringify({ ...JSON.parse(original.toString()), digestSha256: digest, signature })); const before = f.ownedState();
  try { await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toThrow("config-signature"); expect(f.fake.requests).toHaveLength(0); expect(f.ownedState()).toEqual(before); }
  finally { writeFileSync(path, original); }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("restored exact config metadata"));
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});


test("a real child signature over a row at the exclusive expiry cannot extend its certificate window", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("window owned row"));
  const index = f.read(".amc/blobs/index.jsonl"), head = f.read(".amc/blobs/index.jsonl.sig"), child = getBlobIndexChildKey(f.workspace), cert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT));
  const retrospective = { ...f.trust, asOf: new Date(Date.parse(cert.authority.notAfter) + 1_000) }; // independent later verifier clock avoids a separate future-claim refusal masking expiry
  const row = JSON.parse(index.toString().trim()); row.ts = Date.parse(cert.authority.notAfter); const preimage = { ...row }; delete preimage.hash; row.hash = sha256Hex(canonicalize(preimage));
  const signature = sign(null, Buffer.from(row.hash, "hex"), child).toString("base64");
  expect(verifyWithKey(Buffer.from(row.hash, "hex"), cert.authority.childPublicKeyPem, Buffer.from(signature, "base64"))).toBe(true);
  try { writeFileSync(f.target(".amc/blobs/index.jsonl"), JSON.stringify(row) + "\n");
    writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), JSON.stringify({ ...JSON.parse(head.toString()), ts: row.ts, lastHash: row.hash, signature }));
    expect(verifyBlobIndexChain(f.workspace, retrospective).ok).toBe(false);
  } finally { writeFileSync(f.target(".amc/blobs/index.jsonl"), index); writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), head); }
  expect(verifyBlobIndexChain(f.workspace, retrospective).ok).toBe(true);
});


test("a real child rename interruption leaves a pending keyset that refuses hot append and public verification", async () => {
  const f = fixture(), before = readdirSync(f.target(".amc/blobs")); commitFault.destination = f.target(BLOB_CHILD_FILE);
  try { await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toThrow("owned blob child rename refusal"); }
  finally { commitFault.destination = null; }
  expect(existsSync(keysetPaths(f.workspace).pending)).toBe(true);
  expect(() => storeEncryptedBlob(f.workspace, Buffer.from("must not publish during pending generation"))).toThrow(/key set generation .* incomplete/);
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false); expect(readdirSync(f.target(".amc/blobs"))).toEqual(before);
  // Existing async --resume recovery is exercised by the anchor-owner packet; do not silently repair this fixture.
  const fresh = fixture(); await prepareBlobIndexAuthorityOwner(fresh.workspace, { passphrase: PASS }); storeEncryptedBlob(fresh.workspace, Buffer.from("transport restored fresh owner"));
  expect(verifyBlobIndexChain(fresh.workspace, fresh.trust).ok).toBe(true);
});


test("a real local append prepared before another writer chains to the live valid head", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); const count = f.signatures(), original = blobState.withBlobIndexLock;
  let other: ReturnType<typeof storeEncryptedBlob> | undefined;
  const spy = vi.spyOn(blobState, "withBlobIndexLock").mockImplementation((workspace, operation) => {
    spy.mockRestore(); other = storeEncryptedBlob(workspace, Buffer.from("actual other writer")); return original(workspace, operation);
  });
  let first: ReturnType<typeof storeEncryptedBlob>;
  try { first = storeEncryptedBlob(f.workspace, Buffer.from("actual initially prepared writer")); } finally { spy.mockRestore(); }
  expect(other).toBeDefined(); expect(loadBlobPlaintext(f.workspace, other!.path).bytes.toString()).toBe("actual other writer");
  expect(loadBlobPlaintext(f.workspace, first!.path).bytes.toString()).toBe("actual initially prepared writer");
  const rows = f.read(".amc/blobs/index.jsonl").toString().trim().split("\n").map(line => JSON.parse(line));
  expect(rows).toHaveLength(2); expect(rows[1].prev).toBe(rows[0].hash); expect(f.signatures()).toBe(count);
  expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 2 }); // scheduling interleave, not interprocess evidence
});

test("a malformed live prefix selected under the real append lock refuses before another payload and restores", async () => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("existing actual prefix"));
  const index = f.read(".amc/blobs/index.jsonl"), before = readdirSync(f.target(".amc/blobs")), count = f.signatures(), original = blobState.withBlobIndexLock;
  const spy = vi.spyOn(blobState, "withBlobIndexLock").mockImplementation((workspace, operation) => {
    spy.mockRestore(); writeFileSync(f.target(".amc/blobs/index.jsonl"), "{malformed"); return original(workspace, operation);
  });
  try { expect(() => storeEncryptedBlob(f.workspace, Buffer.from("must not publish"))).toThrow();
    expect(readdirSync(f.target(".amc/blobs"))).toEqual(before); expect(f.signatures()).toBe(count); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(false);
  } finally { spy.mockRestore(); writeFileSync(f.target(".amc/blobs/index.jsonl"), index); }
  storeEncryptedBlob(f.workspace, Buffer.from("restored live prefix")); expect(verifyBlobIndexChain(f.workspace, f.trust)).toMatchObject({ ok: true, rows: 2 });
});


test("the owner cutover uses the actual final clock after a real certificate Sign", async () => {
  const f = fixture(), before = f.ownedState(), provider = loadKeyProvider(f.workspace, "aws-kms"), original = provider.sign.bind(provider), gate = paused();
  let expiresAt: string | undefined;
  const spy = vi.spyOn(provider, "sign").mockImplementation(async (ref, bytes) => {
    const signature = await original(ref, bytes), received = Buffer.from(bytes);
    if (received.subarray(0, 28).equals(Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"))) { expiresAt = JSON.parse(received.subarray(28).toString()).notAfter; await gate.hold(); }
    return signature;
  });
  const pending = prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS, hours: 1 / 60 });
  try { await entered(gate, pending); expect(expiresAt).toBeDefined(); vi.spyOn(Date, "now").mockReturnValue(Date.parse(expiresAt!));
    gate.release(); await expect(pending).rejects.toThrow("final publication window"); expect(f.ownedState()).toEqual(before);
  } finally { gate.release(); await pending.catch(() => {}); spy.mockRestore(); vi.restoreAllMocks(); }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("fresh final-clock positive"));
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});


test("a genuinely owner-imported role-only blob head remains legacy-valid but refuses implicit provider purpose promotion", async () => {
  const f = fixture(1), configPath = f.target(".amc/amc.config.yaml"), config = YAML.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  delete config.keys; writeFileSync(configPath, YAML.stringify(config)); signAmcConfig(f.workspace);
  addPublicKeyToHistory(f.workspace, "auditor", publicPem(f.b), "imported"); configure(f.workspace, f.id);
  const original = f.read(".amc/blobs/index.jsonl.sig"), sidecar = JSON.parse(original.toString());
  const signature = sign(null, Buffer.from(sidecar.lastHash, "hex"), f.b.privateKey).toString("base64");
  expect(verifyWithKey(Buffer.from(sidecar.lastHash, "hex"), publicPem(f.b), Buffer.from(signature, "base64"))).toBe(true);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(publicPem(f.b));
  writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), JSON.stringify({ ...sidecar, signature })); const before = f.ownedState();
  try { expect(verifyBlobIndexSignature(f.workspace).valid).toBe(true); // preserved intrinsic role-import compatibility, not exact-purpose promotion
    await expect(prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS })).rejects.toThrow("imported role-only migration is unsupported");
    expect(f.fake.requests).toHaveLength(0); expect(f.ownedState()).toEqual(before);
  } finally { writeFileSync(f.target(".amc/blobs/index.jsonl.sig"), original); }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("restored exact-purpose prefix"));
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test.each(["issuer", "archive"] as const)("the actual owner preserves a conflicting new %s created after its captured immutable read", async kind => {
  const f = fixture(), before = f.ownedState(), actualRead = contained.readContainedOrNull, conflict = Buffer.from(`owned concurrent ${kind} winner`);
  let conflictPath: string | undefined, pending: ReturnType<typeof prepareBlobIndexAuthorityOwner> | undefined;
  const spy = vi.spyOn(contained, "readContainedOrNull").mockImplementation((workspace, relative, limit) => {
    const captured = actualRead(workspace, relative, limit);
    const match = kind === "issuer" ? /^\.amc\/keys\/blob-index-issuers\/[0-9a-f]{64}\.pub$/ : /^\.amc\/keys\/blob-index-authorities\/[0-9a-f]{64}\.json$/;
    if (workspace === f.workspace && conflictPath === undefined && match.test(relative)) {
      expect(captured).toBeNull(); conflictPath = f.target(relative);
      mkdirSync(f.target(kind === "issuer" ? ".amc/keys/blob-index-issuers" : ".amc/keys/blob-index-authorities"), { recursive: true });
      writeFileSync(conflictPath, conflict); // The returned first read stays null; a real competing file now exists.
    }
    return captured;
  });
  try {
    pending = prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
    await expect(pending).rejects.toThrow("immutable blob authority path changed while publication was prepared");
    expect(conflictPath).toBeDefined(); expect(readFileSync(conflictPath!)).toEqual(conflict); expect(f.ownedState()).toEqual(before);
  } finally {
    await pending?.catch(() => {}); spy.mockRestore();
    if (conflictPath && existsSync(conflictPath) && readFileSync(conflictPath).equals(conflict)) rmSync(conflictPath);
  }
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); storeEncryptedBlob(f.workspace, Buffer.from("fresh same-read immutable positive"));
  expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test("the actual owner retains a preexisting equal immutable issuer as a normal successful input", async () => {
  const f = fixture(), relative = blobAuthorityIssuer(signingKeyId(publicPem(f.a))!), bytes = Buffer.from(publicPem(f.a));
  mkdirSync(f.target(".amc/keys/blob-index-issuers"), { recursive: true }); writeFileSync(f.target(relative), bytes);
  await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(f.read(relative)).toEqual(bytes);
  storeEncryptedBlob(f.workspace, Buffer.from("equal existing issuer control")); expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true);
});

test.each([false, true] as const)("an issuer-certified unpinned child with rows=%s obeys explicit operator distrust and verified revocation", async hasRow => {
  const f = fixture(); await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS });
  if (hasRow) storeEncryptedBlob(f.workspace, Buffer.from("actual child-negative row"));
  const cert = parseBlobIndexAuthority(f.read(BLOB_AUTHORITY_CURRENT)), child = cert.authority.childPublicKeyPem, now = new Date();
  const control: TrustContext = { ...f.trust, asOf: now };
  const claimed = hasRow ? new Date(JSON.parse(f.read(".amc/blobs/index.jsonl").toString().trim()).ts) : cert.authority.notBefore;
  const childAdmission = (trust: TrustContext) => admitKey({ publicKeyPem: child, purpose: "artifact-seal", signature: "owned-child-negative-control", context: trust, claimedSignedAt: claimed });
  expect(control.explicitPins.some(pin => pin.keyId === cert.authority.childKeyId)).toBe(false); expect(childAdmission(control).status).toBe("not-pinned");
  expect(verifyBlobIndexChain(f.workspace, control)).toMatchObject({ ok: true, rows: hasRow ? 1 : 0 });
  expect(verifyBlobIndexSignature(f.workspace, control).valid).toBe(true);
  if (hasRow) {
    const row = JSON.parse(f.read(".amc/blobs/index.jsonl").toString().trim()), sig = JSON.parse(f.read(".amc/blobs/index.jsonl.sig").toString());
    expect(verifyWithKey(Buffer.from(row.hash, "hex"), child, Buffer.from(sig.signature, "base64"))).toBe(true);
  }
  const denied: TrustContext = { ...control, distrust: [...control.distrust, { keyId: cert.authority.childKeyId, distrustedFrom: null,
    reason: "key-compromise", source: "owned independent blob operator", note: "negative only; the child is never enrolled" }] };
  expect(childAdmission(denied).status).toBe("distrusted");
  expect(verifyBlobIndexChain(f.workspace, denied).ok).toBe(false); expect(verifyBlobIndexSignature(f.workspace, denied).valid).toBe(false);
  const rootPrivate = f.b.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), rootKeyId = signingKeyId(publicPem(f.b))!;
  const list = verifySignedTrustList(signTrustList({ type: "amc.trust-list", version: 1, listId: "owned-blob-child-negative", sequence: 1,
    issuedAt: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 3_600_000).toISOString(), distrust: [],
    entries: [{ keyId: cert.authority.childKeyId, algorithm: "ed25519", publicKeyPem: child, purposes: ["artifact-seal"], subject: "owned revoked child",
      validFrom: new Date(now.getTime() - 60_000).toISOString(), validTo: null, revokedAt: now.toISOString(), revocationReason: "key-compromise", source: "operator" }]
  }, rootPrivate), { pinnedRootKeyIds: [rootKeyId], now });
  const revoked: TrustContext = { ...control, lists: [...control.lists, list] };
  expect(childAdmission(revoked).status).toBe("revoked");
  expect(verifyBlobIndexChain(f.workspace, revoked).ok).toBe(false); expect(verifyBlobIndexSignature(f.workspace, revoked).valid).toBe(false);
  const noIssuer: TrustContext = { ...control, explicitPins: control.explicitPins.filter(pin => pin.keyId !== cert.authority.issuerKeyId) };
  expect(verifyBlobIndexChain(f.workspace, noIssuer).ok).toBe(false); // Positive issuer admission remains mandatory.
  expect(verifyBlobIndexChain(f.workspace, control).ok).toBe(true); // Removing only operator refusal restores the unchanged actual math.
  if (hasRow) {
    const renewed = await prepareBlobIndexAuthorityOwner(f.workspace, { passphrase: PASS }); expect(renewed.childKeyId).not.toBe(cert.authority.childKeyId);
    storeEncryptedBlob(f.workspace, Buffer.from("owner can replace the explicitly blacklisted child"));
    expect(verifyBlobIndexChain(f.workspace, f.trust).ok).toBe(true); expect(verifyBlobIndexChain(f.workspace, revoked).ok).toBe(false);
  }
});
