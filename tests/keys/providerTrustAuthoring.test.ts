// Proposed destination: tests/keys/providerTrustAuthoring.test.ts. Static only; not executed by reviewer.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { signTrustList, signTrustListWithProvider, verifySignedTrustList } from "../../src/trust/trustList.js";
import { addRootRotationSignature, addRootRotationSignatureWithProvider, applyTrustRootRotation, signRootRotation,
  type RootRotationStatement } from "../../src/trust/rootRotation.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { KeyProviderError, type KeyProvider } from "../../src/keys/provider.js";
import { lowS, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { AWS_ARN, awsFake, fakeKey, publicPem, type FakeKind } from "./providerFakes.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const NOW = new Date("2026-10-20T00:00:00.000Z");
function highS(signature: Uint8Array): Buffer {
  const canonical = lowS(signature), order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const s = BigInt(`0x${canonical.subarray(32).toString("hex")}`);
  return Buffer.concat([canonical.subarray(0, 32), Buffer.from((order - s).toString(16).padStart(64, "0"), "hex")]);
}
async function holder(kind: FakeKind, label: string) {
  const key = fakeKey(kind), ref = { provider: "aws-kms" as const, id: AWS_ARN(label) };
  const fake = awsFake({ [ref.id]: key }), native = awsKmsProvider(fake.call);
  // Force the valid alternate high-S form at the existing provider boundary; signChecked must normalize it.
  const provider: KeyProvider = kind === "p256" ? { ...native, sign: async (ref, bytes) => highS(await native.sign(ref, bytes)) } : native;
  const description = await provider.describe(ref);
  return { key, ref, fake, provider, description, pem: publicPem(key) };
}
const signedRequests = (fake: ReturnType<typeof awsFake>) => fake.requests.filter(row => row.operation === "Sign");

describe("external provider authoring preserves v1 trust statements", () => {
  test.each(["ed25519", "p256"] as const)("%s trust-list root signs exact tagged bytes; the verifier independently enforces pins", async kind => {
    const root = await holder(kind, "trust-root"), list = trustList([listEntry(testKey())]);
    const signed = await signTrustListWithProvider(list, root.provider, root.description);
    const bytes = Buffer.concat([Buffer.from("AMC_TRUST_LIST_V1\0", "ascii"), Buffer.from(canonicalize(list))]);
    expect(Buffer.from(signedRequests(root.fake)[0]!.input.Message as Uint8Array)).toEqual(bytes);
    expect(signedRequests(root.fake)[0]!.input.MessageType).toBe("RAW");
    expect(signed.signatures[0]).toMatchObject({ keyId: root.description.keyId, publicKeyPem: root.pem });
    const signature = Buffer.from(signed.signatures[0]!.signature, "base64");
    expect(verifyWithKey(bytes, root.pem, signature)).toBe(true);
    if (kind === "p256") expect(signature).toEqual(lowS(signature));
    expect(verifySignedTrustList(signed, { pinnedRootKeyIds: [root.description.keyId], now: NOW })).toEqual(list);
    expect(() => verifySignedTrustList(signed, { pinnedRootKeyIds: [], now: NOW })).toThrow(/pinned/);
    expect(() => verifySignedTrustList({ ...signed, list: { ...list, sequence: 2 } }, { pinnedRootKeyIds: [root.description.keyId], now: NOW })).toThrow(/does not verify/);
    if (kind === "ed25519") {
      const privatePem = root.key.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      expect(canonicalize(signed)).toBe(canonicalize(signTrustList(list, privatePem)));
    }
  });

  test("a fabricated key id or a signature under another described key refuses before any result is returned", async () => {
    const root = await holder("p256", "pinned-root"), list = trustList([]);
    await expect(signTrustListWithProvider(list, root.provider, { ...root.description, keyId: "0".repeat(64) })).rejects.toBeInstanceOf(KeyProviderError);
    expect(signedRequests(root.fake)).toHaveLength(0);
    const other = await holder("p256", "other-root");
    const wrongSigner: KeyProvider = { ...root.provider, sign: (_ref, bytes) => other.provider.sign(other.ref, bytes) };
    await expect(signTrustListWithProvider(list, wrongSigner, root.description)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
  });

  test.each(["ed25519", "p256"] as const)("%s AWS root refuses a valid v1 trust list above 4096 signing bytes without hashing or a Sign request", async kind => {
    const root = await holder(kind, "large-list"), list = trustList([listEntry(testKey(), { subject: "x".repeat(5000) })]);
    expect(Buffer.byteLength("AMC_TRUST_LIST_V1\0" + canonicalize(list))).toBeGreaterThan(4096);
    await expect(signTrustListWithProvider(list, root.provider, root.description)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(signedRequests(root.fake)).toHaveLength(0);
  });

  test("root-set holders co-sign through providers; independent current pins and both thresholds remain required", async () => {
    const a = await holder("p256", "current-root"), c = await holder("p256", "new-root"), b = testKey(), d = testKey();
    const statement: RootRotationStatement = { type: "amc.root-rotation", version: 1, rootSetId: "external-roots", sequence: 1,
      previousSha256: null, previousRoots: [a.description.keyId, b.keyId], previousThreshold: 2,
      newRoots: [c.description.keyId, d.keyId], newThreshold: 2, newRootPublicKeyPems: [c.pem, d.publicKeyPem],
      allowDecrease: false, issuedAt: NOW.toISOString() };
    const seed = signRootRotation(statement, { current: [b.privateKeyPem], next: [d.privateKeyPem] });
    const currentSigned = await addRootRotationSignatureWithProvider(seed, "current", a.provider, a.description);
    const complete = await addRootRotationSignatureWithProvider(currentSigned, "new", c.provider, c.description);
    const exact = Buffer.from("amc.root-rotation/v1\0" + canonicalize(statement));
    for (const h of [a, c]) expect(Buffer.from(signedRequests(h.fake)[0]!.input.Message as Uint8Array)).toEqual(exact);
    const home = mkdtempSync(join(tmpdir(), "amc-provider-root-")); homes.push(home); mkdirSync(join(home, "trust"));
    const rootsPath = join(home, "trust", "trust-roots.json");
    writeFileSync(rootsPath, JSON.stringify({ type: "amc.trust-roots", version: 1, rootSetId: "external-roots", roots: statement.previousRoots, threshold: 2 }));
    const apply = (bytes: Buffer) => applyTrustRootRotation({ amcHome: home, statement: bytes, currentRootPublicKeyPems: [a.pem, b.publicKeyPem] });
    expect(() => apply(seed)).toThrow(/current root set/);
    expect(() => apply(currentSigned)).toThrow(/prove possession/);
    expect(apply(complete)).toMatchObject({ roots: statement.newRoots, threshold: 2 });
    expect(JSON.parse(readFileSync(rootsPath, "utf8")).roots).toEqual(statement.newRoots);
  });

  test("Ed25519 root-row provider authoring is byte-identical to the existing holder API, and role mismatch never signs", async () => {
    const a = await holder("ed25519", "holder"), b = testKey(), c = testKey(), d = testKey();
    const statement: RootRotationStatement = { type: "amc.root-rotation", version: 1, rootSetId: "external-roots", sequence: 1,
      previousSha256: null, previousRoots: [a.description.keyId, b.keyId], previousThreshold: 2,
      newRoots: [c.keyId, d.keyId], newThreshold: 2, newRootPublicKeyPems: [c.publicKeyPem, d.publicKeyPem],
      allowDecrease: false, issuedAt: NOW.toISOString() };
    const seed = signRootRotation(statement, { current: [], next: [] });
    const actual = await addRootRotationSignatureWithProvider(seed, "current", a.provider, a.description);
    const privatePem = a.key.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(actual).toEqual(addRootRotationSignature(seed, "current", privatePem));
    const before = signedRequests(a.fake).length;
    await expect(addRootRotationSignatureWithProvider(seed, "new", a.provider, a.description)).rejects.toThrow(/not a key/);
    expect(signedRequests(a.fake)).toHaveLength(before);
  });

  test("a valid large root-set rotation is refused by AWS without changing its v1 preimage", async () => {
    const holderKey = await holder("ed25519", "large-root-set"), peer = testKey(), next = Array.from({ length: 64 }, () => testKey());
    const statement: RootRotationStatement = { type: "amc.root-rotation", version: 1, rootSetId: "external-roots", sequence: 1,
      previousSha256: null, previousRoots: [holderKey.description.keyId, peer.keyId], previousThreshold: 2,
      newRoots: next.map(key => key.keyId), newThreshold: 2, newRootPublicKeyPems: next.map(key => key.publicKeyPem),
      allowDecrease: false, issuedAt: NOW.toISOString() };
    const seed = signRootRotation(statement, { current: [], next: [] });
    expect(Buffer.byteLength("amc.root-rotation/v1\0" + canonicalize(statement))).toBeGreaterThan(4096);
    await expect(addRootRotationSignatureWithProvider(seed, "current", holderKey.provider, holderKey.description)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(signedRequests(holderKey.fake)).toHaveLength(0);
  });
});
