// Supporting pure protocol oracles only. These are not a substitute for actual owner commit/writer integration tests.
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { expect, test } from "vitest";
import { canonicalize } from "../../src/utils/json.js";
import { signingKeyId, verifyWithKey, lowS } from "../../src/keys/algorithmPolicy.js";
import { blobAuthoritySigningBytes, blobAuthorityDigest, blobChildBytes, blobChildEnvelopeSchema, encodeBlobIndexAuthority,
  issueBlobIndexAuthority, openBlobChild, parseBlobIndexAuthority, verifyBlobIndexAuthority } from "../../src/keys/blobIndexAuthority.js";
import { encryptVaultPayload, decryptVaultPayload } from "../../src/vault/vaultCrypto.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, type FakeKind } from "./providerFakes.js";
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
async function issued(kind: FakeKind = "p256") {
  const issuerKey = fakeKey(kind), arn = AWS_ARN("owned-blob-authority-codec"), fake = awsFake({ [arn]: issuerKey }), provider = awsKmsProvider(fake.call);
  const description = await provider.describe({ provider: "aws-kms", id: arn }), child = generateKeyPairSync("ed25519");
  const childPublicKeyPem = child.publicKey.export({ format: "pem", type: "spki" }).toString(), privateKeyPem = child.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const authority = { type: "amc.blob-index-authority" as const, version: 1 as const, workspaceId: "owned-workspace", purpose: "artifact-seal" as const,
    operation: "blob-index" as const, epoch: 1, previousAuthoritySha256: null, start: { count: 0, head: "" }, childKeyId: signingKeyId(childPublicKeyPem)!, childPublicKeyPem,
    issuerKeyId: description.keyId, notBefore: "2026-10-21T00:00:00.000Z", notAfter: "2026-10-22T00:00:00.000Z" };
  const signed = await issueBlobIndexAuthority(provider, description, authority), bytes = encodeBlobIndexAuthority(signed);
  return { issuerKey, fake, description, authority, signed, bytes, privateKeyPem };
}
test.each(["ed25519", "p256"] as const)("exact blob certificate domain and actual %s provider signature verify", async kind => {
  const f = await issued(kind), message = blobAuthoritySigningBytes(f.authority);
  expect(message.subarray(0, 28)).toEqual(Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"));
  expect(verifyWithKey(message, f.description.publicKeyPem, Buffer.from(f.signed.signature, "base64"))).toBe(true);
  expect(verifyBlobIndexAuthority(f.bytes, f.description.publicKeyPem)).toEqual(f.signed); expect(parseBlobIndexAuthority(f.bytes)).toEqual(f.signed);
  expect(f.fake.requests.find(row => row.operation === "Sign")?.input).toMatchObject({ MessageType: "RAW", Message: message });
  expect(blobAuthorityDigest(f.signed)).toMatch(/^[0-9a-f]{64}$/);
});
test.each(["unknown-field", "unknown-version", "wrong-purpose", "wrong-operation", "child-id", "foreign-child", "too-long", "empty-window", "bad-time", "epoch-predecessor"])("blob authority refuses %s with a valid original control", async mutation => {
  const f = await issued(), candidate = structuredClone(f.signed) as unknown as { authority: Record<string, unknown> };
  if (mutation === "unknown-field") candidate.authority.extra = true;
  else if (mutation === "unknown-version") candidate.authority.version = 2;
  else if (mutation === "wrong-purpose") candidate.authority.purpose = "ledger-row";
  else if (mutation === "wrong-operation") candidate.authority.operation = "receipt";
  else if (mutation === "child-id") candidate.authority.childKeyId = "f".repeat(64);
  else if (mutation === "foreign-child") candidate.authority.childPublicKeyPem = f.description.publicKeyPem;
  else if (mutation === "too-long") candidate.authority.notAfter = "2026-10-23T00:00:00.000Z";
  else if (mutation === "empty-window") candidate.authority.notAfter = f.authority.notBefore;
  else if (mutation === "bad-time") candidate.authority.notBefore = "2026-10-21T00:00:00Z";
  else candidate.authority.epoch = 2;
  // The owned issuer really signs the invalid body; rejection cannot be supplied only by stale signature math.
  const message = Buffer.concat([Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(candidate.authority))]);
  const signature = lowS(sign("sha256", message, { key: f.issuerKey.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
  expect(verifyWithKey(message, f.description.publicKeyPem, Buffer.from(signature, "base64"))).toBe(true);
  expect(() => verifyBlobIndexAuthority(Buffer.from(canonicalize({ ...candidate, signature })), f.description.publicKeyPem)).toThrow();
  expect(verifyBlobIndexAuthority(f.bytes, f.description.publicKeyPem)).toEqual(f.signed);
});
test("canonical P256 blob certificate rejects native DER, high-S, algorithm relabel and another domain despite raw math controls", async () => {
  const f = await issued(), message = blobAuthoritySigningBytes(f.authority), raw = Buffer.from(f.signed.signature, "base64");
  const der = sign("sha256", message, f.issuerKey.privateKey); expect(verify("sha256", message, f.issuerKey.publicKey, der)).toBe(true);
  const s = BigInt("0x" + raw.subarray(32).toString("hex")), high = Buffer.concat([raw.subarray(0, 32), Buffer.from((N - s).toString(16).padStart(64, "0"), "hex")]);
  expect(verify("sha256", message, { key: f.issuerKey.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
  for (const signature of [der, high]) expect(() => verifyBlobIndexAuthority(Buffer.from(canonicalize({ ...f.signed, signature: signature.toString("base64") })), f.description.publicKeyPem)).toThrow();
  for (const algorithm of ["ed25519", "rsa-sha256"]) expect(() => verifyBlobIndexAuthority(Buffer.from(canonicalize({ ...f.signed, algorithm })), f.description.publicKeyPem)).toThrow();
  const wrongDomain = Buffer.concat([Buffer.from("AMC_KEY_DELEGATION_V1\0", "ascii"), Buffer.from(canonicalize(f.authority))]);
  const wrong = lowS(sign("sha256", wrongDomain, { key: f.issuerKey.privateKey, dsaEncoding: "ieee-p1363" }));
  expect(verify("sha256", wrongDomain, { key: f.issuerKey.publicKey, dsaEncoding: "ieee-p1363" }, wrong)).toBe(true);
  expect(() => verifyBlobIndexAuthority(Buffer.from(canonicalize({ ...f.signed, signature: wrong.toString("base64") })), f.description.publicKeyPem)).toThrow();
});
test("certificate JSON has one byte spelling and the sealed child derives only its exact certified private key", async () => {
  const f = await issued(), plain = blobChildBytes(f.signed, f.privateKeyPem), envelope = encryptVaultPayload(plain, "owned-child-passphrase");
  const validated = blobChildEnvelopeSchema.parse(envelope), opened = openBlobChild(decryptVaultPayload(validated, "owned-child-passphrase"), f.signed);
  expect(opened.asymmetricKeyType).toBe("ed25519"); expect(opened.export({ format: "pem", type: "pkcs8" }).toString()).toBe(f.privateKeyPem);
  expect(() => openBlobChild(plain, { ...f.signed, authority: { ...f.authority, epoch: 2 } })).toThrow();
  expect(() => openBlobChild(Buffer.from(canonicalize({ ...JSON.parse(plain.toString()), extra: true })), f.signed)).toThrow();
  expect(() => blobChildEnvelopeSchema.parse({ ...envelope, kdf: { ...envelope.kdf, iterations: 1 } })).toThrow();
  expect(() => parseBlobIndexAuthority(Buffer.concat([f.bytes, Buffer.from("\n")]))).toThrow();
});


test("a genuine Ed issuer cannot certify itself as the distinct blob child", async () => {
  const f = await issued("ed25519"), authority = { ...f.authority, childPublicKeyPem: f.description.publicKeyPem, childKeyId: f.description.keyId };
  const message = Buffer.concat([Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(authority))]);
  const signature = sign(null, message, f.issuerKey.privateKey).toString("base64");
  expect(verifyWithKey(message, f.description.publicKeyPem, Buffer.from(signature, "base64"))).toBe(true);
  expect(() => verifyBlobIndexAuthority(Buffer.from(canonicalize({ authority, algorithm: "ed25519", signature })), f.description.publicKeyPem)).toThrow();
  expect(verifyBlobIndexAuthority(f.bytes, f.description.publicKeyPem)).toEqual(f.signed);
});
