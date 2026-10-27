import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { getSigningKey } from "../../src/keys/purposeKeys.js";
import { addPublicKeyToHistory, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { lowS, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { signChecked } from "../../src/keys/provider.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { signTrustList } from "../../src/trust/trustList.js";
import { testKey, trustList } from "../trust/trustFixtures.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { checkpointLedger, checkpointsDir, ledgerTimeline, readCheckpointChain } from "../../src/time/checkpoint.js";
import { loadTrustContext, withPins, type TrustContext } from "../../src/trust/trustContext.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { AWS_ARN, awsFake, fakeKey, publicPem, type FakeKey } from "./providerFakes.js";

const sdk = vi.hoisted(() => ({ call: null as KmsCall | null, afterSign: null as (() => Promise<void>) | null }));
// Wrap the existing SDK factory; all describe/sign behavior still uses the real AWS provider implementation.
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const real = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...real, awsKmsProvider: (call?: KmsCall) => real.awsKmsProvider(call ?? (async (...args) => {
    if (!sdk.call) throw new Error("owned checkpoint fake SDK missing");
    const answer = await sdk.call(...args);
    if (args[0] === "Sign" && sdk.afterSign) {
      const change = sdk.afterSign; sdk.afterSign = null; await change();
    }
    return answer;
  })) };
});
const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => {
  sdk.afterSign = null; sdk.call = null;
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-provider-checkpoint-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const ledger = openLedger(root);
  try {
    ledger.startSession({ sessionId: "seed", runtime: "unknown", binaryPath: "checkpoint-test", binarySha256: "a".repeat(64) });
    ledger.appendEvidence({ sessionId: "seed", runtime: "unknown", eventType: "audit", meta: {} });
  } finally { ledger.close(); }
  configure(root);
  return root;
}
function configure(root: string, id?: string) {
  const path = join(root, ".amc", "amc.config.yaml"), value = YAML.parse(readFileSync(path, "utf8"));
  value.time = { required: false, tsa: [{ name: "untrusted-fixture", url: "https://tsa.invalid/", anchorIds: ["no-fixture-anchor"] }] };
  if (id) value.keys = { refs: { "ledger-row": { provider: "aws-kms", id } } };
  writeFileSync(path, YAML.stringify(value)); signAmcConfig(root);
}
function trust(root: string, ...keyIds: string[]): TrustContext {
  return withPins(loadTrustContext({ amcHome: join(root, "empty-operator-home"), env: {} }),
    keyIds.map(keyId => ({ keyId, purposes: ["ledger-row"] as const, origin: "owned fixture operator provider pin" })));
}
async function bound(root: string, key = fakeKey("p256")) {
  const id = AWS_ARN(randomUUID()), nextId = AWS_ARN(randomUUID()), next = fakeKey("ed25519");
  const fake = awsFake({ [id]: key, [nextId]: next });
  sdk.call = fake.call;
  const provider = awsKmsProvider(fake.call);
  configure(root, id);
  const first = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider });
  return { id, nextId, next, key, fake, provider, first, trust: trust(root, first.keyId) };
}
const filePath = (root: string, sequence: number) => join(checkpointsDir(root), `${sequence}.json`);
const load = (root: string, sequence: number) => JSON.parse(readFileSync(filePath(root, sequence), "utf8"));
const store = (root: string, sequence: number, file: unknown) => writeFileSync(filePath(root, sequence), JSON.stringify(file, null, 2) + "\n");
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

describe("operational provider checkpoint routing and epoch admission", () => {
  it("explicit unbound monitor-role import does not add checkpoint signing authority", async () => {
    const root = workspace();
    await checkpointLedger(root, trust(root));
    const original = load(root, 1), imported = fakeKey("ed25519"), pem = publicPem(imported);
    addPublicKeyToHistory(root, "monitor", pem, "imported");
    expect(readCheckpointChain(root, trust(root))).toHaveLength(1);
    const signature = signHexDigest(original.sha256, imported.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    expect(verifyHexDigestAny(original.sha256, signature, [pem])).toBe(true);
    try {
      store(root, 1, { ...original, signature });
      expect(() => readCheckpointChain(root, trust(root))).toThrow(/signature invalid for its authorized epoch/);
    } finally { store(root, 1, original); }
    expect(readCheckpointChain(root, trust(root))).toHaveLength(1);
  });
  it("keeps unbound Ed25519 checkpoint signature and JSON byte shape", async () => {
    const root = workspace();
    expect((await checkpointLedger(root, trust(root))).status).toBe("pending");
    const file = load(root, 1);
    const signature = sign(null, Buffer.from(file.sha256, "hex"), getSigningKey(root, "ledger-row")).toString("base64");
    expect(readFileSync(filePath(root, 1), "utf8")).toBe(JSON.stringify({ checkpoint: file.checkpoint, sha256: file.sha256, signature }, null, 2) + "\n");
    expect(readCheckpointChain(root)).toHaveLength(1);
  });

  it("uses the actual P256 provider over exact digest bytes and requires independent issuer admission", async () => {
    const root = workspace(), fixture = await bound(root);
    const before = fixture.fake.requests.filter(row => row.operation === "Sign").length;
    expect((await checkpointLedger(root, fixture.trust)).status).toBe("pending");
    const file = load(root, 1), signature = Buffer.from(file.signature, "base64");
    expect(file.providerKeyId).toBe(fixture.first.keyId);
    expect(fixture.fake.requests.filter(row => row.operation === "Sign").length).toBe(before + 1);
    const request = fixture.fake.requests.filter(row => row.operation === "Sign").at(-1)!;
    expect(Buffer.from(request.input.Message as Uint8Array)).toEqual(Buffer.from(file.sha256, "hex"));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(file.sha256, "hex"), publicPem(fixture.key), signature)).toBe(true);
    expect(readCheckpointChain(root, fixture.trust)).toHaveLength(1);
    expect(ledgerTimeline(root, [], { anchors: [], trust: fixture.trust }).checkpoints[0]!.status).toBe("pending");
    expect(() => readCheckpointChain(root, trust(root))).toThrow(/issuer.*not-pinned/);
    expect(() => ledgerTimeline(root, [], { anchors: [], trust: trust(root) })).toThrow(/issuer.*not-pinned/);
  });

  it("refuses high-S, DER, wrong-key, and missing provider identity without normalizing an unchecked artifact", async () => {
    const root = workspace(), fixture = await bound(root);
    await checkpointLedger(root, fixture.trust);
    const original = load(root, 1), digest = Buffer.from(original.sha256, "hex"), pem = publicPem(fixture.key);
    const canonical = Buffer.from(original.signature, "base64");
    const high = Buffer.from(canonical);
    const s = BigInt("0x" + canonical.subarray(32).toString("hex"));
    Buffer.from((N - s).toString(16).padStart(64, "0"), "hex").copy(high, 32);
    expect(verify("sha256", digest, { key: pem, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
    const der = sign("sha256", digest, fixture.key.privateKey);
    expect(verify("sha256", digest, pem, der)).toBe(true);
    const other = fakeKey("p256");
    const wrong = lowS(sign("sha256", digest, { key: other.privateKey, dsaEncoding: "ieee-p1363" }));
    expect(verifyCanonical("ecdsa-p256-sha256", digest, publicPem(other), wrong)).toBe(true);
    for (const signature of [high, der, wrong]) {
      store(root, 1, { ...original, signature: signature.toString("base64") });
      expect(() => readCheckpointChain(root, fixture.trust)).toThrow(/signature invalid/);
    }
    const { providerKeyId: _removed, ...withoutId } = original;
    store(root, 1, withoutId);
    expect(() => readCheckpointChain(root, fixture.trust)).toThrow(/provider key id missing/);
  });

  it("pins a same-key legacy checkpoint prefix and refuses removal of the new provider marker", async () => {
    const root = workspace();
    await checkpointLedger(root, trust(root));
    const legacy = readFileSync(filePath(root, 1));
    const privateKey = createPrivateKey(getSigningKey(root, "ledger-row"));
    const key: FakeKey = { kind: "ed25519", privateKey, publicKey: createPublicKey(privateKey) };
    const fixture = await bound(root, key);
    await checkpointLedger(root, fixture.trust);
    expect(readFileSync(filePath(root, 1))).toEqual(legacy);
    expect(readCheckpointChain(root, fixture.trust)).toHaveLength(2);
    const file = load(root, 2);
    expect(verify(null, Buffer.from(file.sha256, "hex"), key.publicKey, Buffer.from(file.signature, "base64"))).toBe(true);
    delete file.providerKeyId; store(root, 2, file);
    expect(() => readCheckpointChain(root, fixture.trust)).toThrow(/provider key id missing/);
    rmSync(checkpointsDir(root), { recursive: true });
    expect(() => readCheckpointChain(root, fixture.trust)).toThrow(/checkpoint cutoff missing/);
  });

  it("retains old authorized checkpoint epochs and refuses a retired issuer on the next epoch", async () => {
    const root = workspace(), fixture = await bound(root);
    await checkpointLedger(root, fixture.trust);
    const firstBytes = readFileSync(filePath(root, 1));
    configure(root, fixture.nextId);
    const second = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: fixture.provider });
    const operator = trust(root, fixture.first.keyId, second.keyId);
    await checkpointLedger(root, operator);
    expect(readCheckpointChain(root, operator)).toHaveLength(2);
    expect(readFileSync(filePath(root, 1))).toEqual(firstBytes);
    const file = load(root, 2), digest = Buffer.from(file.sha256, "hex");
    const retired = lowS(sign("sha256", digest, { key: fixture.key.privateKey, dsaEncoding: "ieee-p1363" }));
    expect(verifyCanonical("ecdsa-p256-sha256", digest, publicPem(fixture.key), retired)).toBe(true);
    store(root, 2, { ...file, signature: retired.toString("base64"), providerKeyId: fixture.first.keyId });
    expect(() => readCheckpointChain(root, operator)).toThrow(/provider key id missing or mismatched|authorized epoch/);
  });

  it("refuses a grant changed during remote signing before publishing a checkpoint", async () => {
    const root = workspace(), fixture = await bound(root);
    sdk.afterSign = async () => { await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: fixture.provider }); };
    await expect(checkpointLedger(root, fixture.trust)).rejects.toThrow(/delegation changed while.*signed/);
    expect(existsSync(filePath(root, 1))).toBe(false);
  });

  it("refuses a future checkpoint claim under a real signed trust list that admits the cutover and current issuer", async () => {
    const root = workspace(), fixture = await bound(root), issuer = publicPem(fixture.key), authority = testKey();
    const asOf = new Date(Date.now() + 60_000), validFrom = new Date(asOf.getTime() - 3_600_000).toISOString();
    const validTo = new Date(asOf.getTime() + 86_400_000).toISOString(), path = join(root, "owned-time-admission-list.json");
    const signed = signTrustList(trustList([{
      keyId: fixture.first.keyId, algorithm: "ecdsa-p256-sha256", publicKeyPem: issuer, purposes: ["ledger-row"],
      subject: "owned checkpoint issuer", validFrom, validTo, source: "operator"
    }], { listId: `owned-checkpoint-time-${randomUUID()}`, issuedAt: validFrom, expiresAt: validTo }), authority.privateKeyPem);
    writeFileSync(path, JSON.stringify(signed));
    const operator = loadTrustContext({ amcHome: join(root, "owned-time-operator-home"), env: {}, now: asOf,
      trustLists: [path], trustRoots: [authority.keyId] });
    expect(operator.explicitPins).toEqual([]); expect(operator.lists).toHaveLength(1);
    // Empty epoch admission proves the independently signed list admits the actual cutover before any artifact exists.
    expect(readCheckpointChain(root, operator)).toEqual([]);
    await checkpointLedger(root, operator);
    const original = load(root, 1); expect(readCheckpointChain(root, operator)).toHaveLength(1);
    const checkpoint = { ...original.checkpoint, claimedAt: new Date(asOf.getTime() + 60_000).toISOString() };
    const digest = sha256Hex(canonicalize(checkpoint)), description = await fixture.provider.describe({ provider: "aws-kms", id: fixture.id });
    const signature = await signChecked(fixture.provider, description, Buffer.from(digest, "hex"));
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(digest, "hex"), issuer, signature)).toBe(true);
    expect(original.providerKeyId).toBe(fixture.first.keyId);
    store(root, 1, { ...original, checkpoint, sha256: digest, signature: signature.toString("base64") });
    expect(() => readCheckpointChain(root, operator)).toThrow(/checkpoint 1: provider issuer not-yet-valid/);
    store(root, 1, original); expect(readCheckpointChain(root, operator)).toHaveLength(1);
  });

  it("refuses a retired provider signature even when the checkpoint marker names the active provider", async () => {
    const root = workspace(), fixture = await bound(root); await checkpointLedger(root, fixture.trust);
    const legacy = readFileSync(filePath(root, 1)); configure(root, fixture.nextId);
    const active = await bindPurposeProviderKey(root, "ledger-row", { passphrase: PASS, provider: fixture.provider });
    const operator = trust(root, fixture.first.keyId, active.keyId); await checkpointLedger(root, operator);
    const original = load(root, 2); expect(original.providerKeyId).toBe(active.keyId); expect(readCheckpointChain(root, operator)).toHaveLength(2);
    const digest = Buffer.from(original.sha256, "hex"), retired = await fixture.provider.describe({ provider: "aws-kms", id: fixture.id });
    const signature = await signChecked(fixture.provider, retired, digest);
    expect(verifyCanonical("ecdsa-p256-sha256", digest, publicPem(fixture.key), signature)).toBe(true);
    expect(verifyCanonical("ed25519", digest, publicPem(fixture.next), signature)).toBe(false);
    // Keep the active marker intact: this negative can only be caught by authorized-epoch signature checking.
    store(root, 2, { ...original, signature: signature.toString("base64") });
    expect(() => readCheckpointChain(root, operator)).toThrow(/checkpoint 2: signature invalid for its authorized epoch/);
    expect(readFileSync(filePath(root, 1))).toEqual(legacy);
    store(root, 2, original); expect(readCheckpointChain(root, operator)).toHaveLength(2);
  });

  it("refuses provider checkpoints in default public read and timeline under an empty operator home", async () => {
    const home = mkdtempSync(join(tmpdir(), "amc-checkpoint-default-operator-")); roots.push(home);
    vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", "");
    // Select the empty operator home before workspace creation, retaining its genuine keyset/history machine marks.
    const root = workspace(), fixture = await bound(root);
    const operator = loadTrustContext({}); expect(operator.explicitPins).toEqual([]); expect(operator.lists).toEqual([]);
    await checkpointLedger(root, fixture.trust);
    const original = load(root, 1);
    expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(original.sha256, "hex"), publicPem(fixture.key), Buffer.from(original.signature, "base64"))).toBe(true);
    expect(readCheckpointChain(root, fixture.trust)).toHaveLength(1);
    expect(ledgerTimeline(root, [], { anchors: [], trust: fixture.trust }).checkpoints[0]!.status).toBe("pending");
    expect(() => readCheckpointChain(root)).toThrow(/issuer.*not-pinned/);
    expect(() => ledgerTimeline(root, [], { anchors: [] })).toThrow(/issuer.*not-pinned/);
    // Public refusal does not mutate the actual valid checkpoint or turn its workspace key into an operator pin.
    expect(load(root, 1)).toEqual(original); expect(loadTrustContext({}).explicitPins).toEqual([]);
    expect(readCheckpointChain(root, fixture.trust)).toHaveLength(1);
  });
});

