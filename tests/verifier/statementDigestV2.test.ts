// Proposed destination: tests/verifier/statementDigestV2.test.ts. Additive successor to frozen v1 evidence.
import { createHash, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { verifyArtifact, validateRecord } from "../../packages/verifier/src/index.js";
import { signTrustList, signTrustListWithProvider, verifySignedTrustList } from "../../src/trust/trustList.js";
import { signRootRotation, addRootRotationSignatureWithProvider, applyTrustRootRotation, type RootRotationStatement } from "../../src/trust/rootRotation.js";
import { addRotationSignature, signRotationStatement, encodeRotationStatement, verifyRotationStatement, type KeyRotationStatementV1 } from "../../src/keys/rotationStatement.js";
import { signRevocationListWithProvider, readStagedRevocationList, nextRevocationList } from "../../src/keys/revocationList.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { canonicalize } from "../../src/utils/json.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { AWS_ARN, awsFake, fakeKey, type FakeKind } from "../keys/providerFakes.js";
import { listEntry, testKey, trustList } from "../trust/trustFixtures.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const NOW = new Date("2026-10-20T00:00:00.000Z");
const legacy = (tag: string, body: unknown) => Buffer.from(tag + "\0" + canonicalize(body));
// Independent construction: hash the COMPLETE original tagged payload, then sign the digest under a distinct v2 tag.
const digestMessage = (v1: string, v2: string, body: unknown) => Buffer.concat([Buffer.from(v2 + "\0"), createHash("sha256").update(legacy(v1, body)).digest()]);
function signature(message: Buffer, kind: FakeKind, key: KeyObject, der = false): string {
  return (kind === "ed25519" ? sign(null, message, key) : der ? sign("sha256", message, key)
    : lowS(sign("sha256", message, { key, dsaEncoding: "ieee-p1363" }))).toString("base64");
}
function highS(encoded: string): string {
  const bytes = Buffer.from(encoded, "base64"), n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const s = BigInt(`0x${bytes.subarray(32).toString("hex")}`);
  return Buffer.concat([bytes.subarray(0, 32), Buffer.from((n - s).toString(16).padStart(64, "0"), "hex")]).toString("base64");
}
async function holder(kind: FakeKind, name: string) {
  const key = fakeKey(kind), ref = { provider: "aws-kms" as const, id: AWS_ARN(name) }, fake = awsFake({ [AWS_ARN(name)]: key });
  const provider = awsKmsProvider(fake.call), description = await provider.describe(ref);
  return { kind, key, fake, provider, description };
}
function fresh(): string { const root = mkdtempSync(join(tmpdir(), "amc-statement-v2-")); roots.push(root); return root; }

describe("explicit digest-v2 statement envelopes preserve v1 and never mix preimages", () => {
  test.each(["ed25519", "p256"] as const)("%s AWS root signs a large trust list in v2; both verifiers bind the discriminator and full tagged digest", async kind => {
    const root = await holder(kind, "large-v2-root"), list = trustList([listEntry(testKey(), { subject: "large owned list " + "x".repeat(5000) })]);
    // Existing API default remains v1: the old safe-refusal contract is preserved.
    await expect(signTrustListWithProvider(list, root.provider, root.description)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    const signed = await signTrustListWithProvider(list, root.provider, root.description, { signatureVersion: 2 });
    expect(signed.signatureVersion).toBe(2);
    const message = digestMessage("AMC_TRUST_LIST_V1", "AMC_TRUST_LIST_V2_DIGEST", list), request = root.fake.requests.find(row => row.operation === "Sign")!;
    expect(Buffer.from(request.input.Message as Uint8Array)).toEqual(message); expect(message.length).toBeLessThan(4096);
    expect(request.input.MessageType).toBe("RAW");
    const opts = { trustLists: [], trustRoots: [root.description.keyId], asOf: NOW };
    const main = (value: unknown) => verifySignedTrustList(value, { pinnedRootKeyIds: [root.description.keyId], now: NOW });
    const portable = (value: unknown) => verifyArtifact(Buffer.from(canonicalize(value)), opts);
    expect(main(signed)).toEqual(list); expect(validateRecord("trust-list", signed)).toEqual({ ok: true });
    expect(portable(signed).integrity.status).toBe("pass"); expect(portable(signed).issuerAdmission.status).toBe("pass");
    const { signatureVersion: _version, ...withoutVersion } = signed;
    const bad = [withoutVersion, { ...signed, signatureVersion: 1 }, { ...signed, signatureVersion: 3 }, { ...signed, signatureVersion: "2" },
      { ...signed, list: { ...list, sequence: 2 } },
      { ...signed, signatureVersion: 3, signatures: [{ ...signed.signatures[0]!, signature: signature(legacy("AMC_TRUST_LIST_V1", list), kind, root.key.privateKey) }] },
      { ...signed, signatureVersion: 1, signatures: [{ ...signed.signatures[0]!, signature: signature(legacy("AMC_TRUST_LIST_V1", list), kind, root.key.privateKey) }] },
      { ...signed, signatures: [{ ...signed.signatures[0]!, signatureVersion: 2 }] },
      { ...signed, signatures: [{ ...signed.signatures[0]!, signature: signature(legacy("AMC_TRUST_LIST_V1", list), kind, root.key.privateKey) }] },
      // Hashing only canonical JSON, or signing the bare hash, must never become the v2 protocol by accident.
      { ...signed, signatures: [{ ...signed.signatures[0]!, signature: signature(Buffer.concat([Buffer.from("AMC_TRUST_LIST_V2_DIGEST\0"), createHash("sha256").update(canonicalize(list)).digest()]), kind, root.key.privateKey) }] },
      { ...signed, signatures: [{ ...signed.signatures[0]!, signature: signature(createHash("sha256").update(legacy("AMC_TRUST_LIST_V1", list)).digest(), kind, root.key.privateKey) }] }];
    if (kind === "p256") bad.push({ ...signed, signatures: [{ ...signed.signatures[0]!, signature: highS(signed.signatures[0]!.signature) }] },
      { ...signed, signatures: [{ ...signed.signatures[0]!, signature: signature(message, kind, root.key.privateKey, true) }] });
    for (const value of bad) { expect(() => main(value)).toThrow(); expect(portable(value).integrity.status).toBe("fail"); }
    expect(() => verifySignedTrustList(signed, { pinnedRootKeyIds: [], now: NOW })).toThrow(/pinned/);
    expect(verifyArtifact(Buffer.from(canonicalize(signed)), { ...opts, trustRoots: [] }).issuerAdmission.status).toBe("fail");
  });

  test("large mixed-holder root rotation uses one v2 envelope in main apply and standalone verification", async () => {
    const a = await holder("p256", "root-current"), b = testKey(), next = Array.from({ length: 64 }, () => testKey());
    const statement: RootRotationStatement = { type: "amc.root-rotation", version: 1, rootSetId: "large-v2-roots", sequence: 1, previousSha256: null,
      previousRoots: [a.description.keyId, b.keyId], previousThreshold: 2, newRoots: next.map(key => key.keyId), newThreshold: 2,
      newRootPublicKeyPems: next.map(key => key.publicKeyPem), allowDecrease: false, issuedAt: NOW.toISOString() };
    expect(legacy("amc.root-rotation/v1", statement).length).toBeGreaterThan(4096);
    const seed = signRootRotation(statement, { current: [b.privateKeyPem], next: next.slice(0, 2).map(key => key.privateKeyPem) }, { signatureVersion: 2 });
    const complete = await addRootRotationSignatureWithProvider(seed, "current", a.provider, a.description);
    const message = digestMessage("amc.root-rotation/v1", "amc.root-rotation/v2-digest", statement);
    expect(Buffer.from(a.fake.requests.find(row => row.operation === "Sign")!.input.Message as Uint8Array)).toEqual(message);
    const list = trustList([], { rootThreshold: 2 });
    const byA = await signTrustListWithProvider(list, a.provider, a.description, { signatureVersion: 2 }), byB = signTrustList(list, b.privateKeyPem, { signatureVersion: 2 });
    const options = { asOf: NOW, trustRoots: statement.previousRoots, rootThreshold: 2,
      trustLists: [{ signatureVersion: 2, list, signatures: [...byA.signatures, ...byB.signatures] }] };
    function apply(value: unknown) {
      const home = fresh(); mkdirSync(join(home, "trust"));
      writeFileSync(join(home, "trust", "trust-roots.json"), JSON.stringify({ type: "amc.trust-roots", version: 1, rootSetId: statement.rootSetId, roots: statement.previousRoots, threshold: 2 }));
      return applyTrustRootRotation({ amcHome: home, statement: Buffer.from(canonicalize(value)), currentRootPublicKeyPems: [a.description.publicKeyPem, b.publicKeyPem] });
    }
    const good = JSON.parse(complete.toString());
    expect(apply(good)).toMatchObject({ roots: statement.newRoots, threshold: 2 });
    expect(verifyArtifact(complete, options).integrity.status).toBe("pass"); expect(verifyArtifact(complete, options).issuerAdmission.status).toBe("pass");
    const { signatureVersion: _version, ...withoutVersion } = good;
    const rowIndex = good.signatures.findIndex((row: { keyId: string }) => row.keyId === a.description.keyId);
    const mixed = good.signatures.map((row: { signature: string }, index: number) => index === rowIndex
      ? { ...row, signature: signature(legacy("amc.root-rotation/v1", statement), "p256", a.key.privateKey) } : row);
    const legacyRows = good.signatures.map((row: { keyId: string; signature: string }) => ({ ...row,
      signature: row.keyId === a.description.keyId ? signature(legacy("amc.root-rotation/v1", statement), "p256", a.key.privateKey)
        : sign(null, legacy("amc.root-rotation/v1", statement), row.keyId === b.keyId ? b.privateKeyPem : next.find(key => key.keyId === row.keyId)!.privateKeyPem).toString("base64") }));
    const legacyWire = { ...withoutVersion, signatures: legacyRows };
    expect(apply(legacyWire)).toMatchObject({ roots: statement.newRoots });
    expect(verifyArtifact(Buffer.from(canonicalize(legacyWire)), options).integrity.status).toBe("pass");
    for (const bad of [withoutVersion, { ...good, signatureVersion: 3 }, { ...good, signatures: mixed },
      { ...good, signatureVersion: 3, signatures: legacyRows },
      { ...good, signatures: good.signatures.filter((row: { by: string }) => row.by !== "current") }]) {
      expect(() => apply(bad)).toThrow(); expect(verifyArtifact(Buffer.from(canonicalize(bad)), options).integrity.status === "fail" || verifyArtifact(Buffer.from(canonicalize(bad)), options).issuerAdmission.status === "fail").toBe(true);
    }
    // Changing modes on a partially signed envelope would invalidate the other holder's row: reject before signing.
    await expect(addRootRotationSignatureWithProvider(seed, "current", a.provider, a.description, { signatureVersion: 1 })).rejects.toThrow(/mix signature versions/);
  });

  test.each(["ed25519", "p256"] as const)("%s large revocation list v2 is checked by the actual main bytes reader and standalone verifier", async kind => {
    const signer = await holder(kind, "revoker-v2"), list = nextRevocationList("keys:large-v2", null, [0, 1].map(n => ({
      id: `retired-${n}`, kind: "key" as const, reason: "x".repeat(3000), revokedAt: NOW.toISOString() })), 0);
    const signed = await signRevocationListWithProvider(list, signer.provider, signer.description, { signatureVersion: 2 });
    const message = digestMessage("AMC_REVOCATION_LIST_V1", "AMC_REVOCATION_LIST_V2_DIGEST", list);
    expect(Buffer.from(signer.fake.requests.find(row => row.operation === "Sign")!.input.Message as Uint8Array)).toEqual(message);
    const workspace = fresh(), rel = "revocations.json", location = { workspace, rel, listId: list.listId, trustedPublicKeyPems: [signer.description.publicKeyPem] };
    const root = testKey(), authority = trustList([listEntry({ ...root, publicKeyPem: signer.description.publicKeyPem, keyId: signer.description.keyId },
      { algorithm: signer.description.algorithm, purposes: ["revocation-list"] })]);
    const options = { asOf: NOW, trustRoots: [root.keyId], trustLists: [signTrustList(authority, root.privateKeyPem, { signatureVersion: 2 })] };
    const check = (value: unknown) => { writeFileSync(join(workspace, rel + ".pending"), canonicalize(value)); return () => readStagedRevocationList(location); };
    expect(check(signed)()).toEqual(signed); expect(verifyArtifact(Buffer.from(canonicalize(signed)), options).integrity.status).toBe("pass");
    const { signatureVersion: _version, ...withoutVersion } = signed;
    for (const bad of [withoutVersion, { ...signed, signatureVersion: 3 }, { ...signed, list: { ...list, sequence: 2 } },
      { ...signed, signatureVersion: 3, signature: { ...signed.signature, signature: signature(legacy("AMC_REVOCATION_LIST_V1", list), kind, signer.key.privateKey) } },
      { ...signed, signature: { ...signed.signature, signature: signature(legacy("AMC_REVOCATION_LIST_V1", list), kind, signer.key.privateKey) } }]) {
      expect(check(bad)).toThrow(); expect(verifyArtifact(Buffer.from(canonicalize(bad)), options).integrity.status).toBe("fail");
    }
  });

  test("key-rotation codecs preserve explicit v2 across previous and next holder additions and both verifiers", () => {
    const previous = testKey(), next = testKey(), statement: KeyRotationStatementV1 = { type: "amc.key-rotation", version: 1,
      workspaceId: "owned-v2", purpose: "artifact-seal", sequence: 1, previousStatementSha256: null, previousKeyId: previous.keyId,
      nextKeyId: next.keyId, nextPublicKeyPem: next.publicKeyPem, reason: "scheduled", overlap: null, issuedAt: NOW.toISOString() };
    const signed = signRotationStatement(statement, { next: next.privateKeyPem, previous: previous.privateKeyPem }, { signatureVersion: 2 });
    const opts = { expected: { workspaceId: statement.workspaceId, purpose: statement.purpose }, trustedCurrentPublicKeyPem: previous.publicKeyPem, previous: null };
    const root = testKey(), authority = signTrustList(trustList([listEntry(previous)]), root.privateKeyPem, { signatureVersion: 2 });
    const options = { asOf: NOW, trustRoots: [root.keyId], trustLists: [authority] };
    expect(verifyRotationStatement(encodeRotationStatement(signed), opts).valid).toBe(true);
    expect(verifyArtifact(encodeRotationStatement(signed), options).integrity.status).toBe("pass");
    const { signatureVersion: _version, ...withoutVersion } = signed;
    expect(verifyRotationStatement(Buffer.from(canonicalize(withoutVersion)), opts).valid).toBe(false);
    expect(verifyArtifact(Buffer.from(canonicalize(withoutVersion)), options).integrity.status).toBe("fail");
    const legacySigned = signRotationStatement(statement, { next: next.privateKeyPem, previous: previous.privateKeyPem });
    const unknownVersion = { ...legacySigned, signatureVersion: 3 };
    expect(verifyRotationStatement(Buffer.from(canonicalize(unknownVersion)), opts).valid).toBe(false);
    expect(verifyArtifact(Buffer.from(canonicalize(unknownVersion)), options).integrity.status).toBe("fail");
  });

  test("rotation authoring refuses unknown envelope modes before adding any signature", () => {
    const previous = testKey(), next = testKey();
    const statement: KeyRotationStatementV1 = { type: "amc.key-rotation", version: 1, workspaceId: "owned-unknown-wire", purpose: "artifact-seal",
      sequence: 1, previousStatementSha256: null, previousKeyId: previous.keyId, nextKeyId: next.keyId, nextPublicKeyPem: next.publicKeyPem,
      reason: "scheduled", overlap: null, issuedAt: NOW.toISOString() };
    const signed = signRotationStatement(statement, { next: next.privateKeyPem });
    for (const signatureVersion of [1, 3, "2", null]) {
      expect(() => Reflect.apply(addRotationSignature, undefined, [{ ...signed, signatureVersion }, "previous", previous.privateKeyPem])).toThrow();
    }
  });
});
