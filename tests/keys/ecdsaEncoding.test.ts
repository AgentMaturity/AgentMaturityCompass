import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalSigningKey, derToP1363, lowS, signingKeyId, signingKeyIdentity, verifyCanonical, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { encodeDelegation, issueDelegation, verifyDelegation } from "../../src/keys/delegation.js";
import { checkedDescription, signChecked, type KeyProvider } from "../../src/keys/provider.js";
import { verifySignature as verifierPackageVerify } from "../../packages/verifier/src/bytes.js";
import { verifyHexDigest } from "../../src/crypto/keys.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { sha256Hex } from "../../src/utils/hash.js";

const p256 = () => {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey: pair.privateKey, pem: pair.publicKey.export({ format: "pem", type: "spki" }).toString() };
};
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const hex32 = (value: bigint) => Buffer.from(value.toString(16).padStart(64, "0"), "hex");
/** DER INTEGER content for a positive value: minimal, with a 0x00 only before a high bit. */
const derInt = (bytes: Buffer) => {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const body = bytes.subarray(start);
  return Buffer.concat([Buffer.from([0x02, body.length + (body[0]! & 0x80 ? 1 : 0)]), body[0]! & 0x80 ? Buffer.from([0]) : Buffer.alloc(0), body]);
};
const derSig = (r: Buffer, s: Buffer) => {
  const content = Buffer.concat([derInt(r), derInt(s)]);
  return Buffer.concat([Buffer.from([0x30, content.length]), content]);
};

describe("algorithm policy: ECDSA P-256 in IEEE P1363 only (P2-08)", () => {
  it("converts DER with a high-bit r or s (leading 0x00) and with a short r or s (left-padded)", () => {
    const high = hex32(N - 5n);
    const short = Buffer.from("00".repeat(3) + "7f".repeat(29), "hex");
    expect(derToP1363(derSig(high, short))).toEqual(Buffer.concat([high, short]));
    expect(derToP1363(derSig(short, high))).toEqual(Buffer.concat([short, high]));
    // A one-byte integer.
    expect(derToP1363(derSig(hex32(1n), hex32(2n)))).toEqual(Buffer.concat([hex32(1n), hex32(2n)]));
  });

  it("refuses malformed DER: wrong tags, lengths, trailing bytes, non-minimal, negative, zero and out-of-range integers", () => {
    const good = derSig(hex32(7n), hex32(9n));
    const bad: Buffer[] = [
      Buffer.from([0x31, ...good.subarray(1)]), // not a SEQUENCE
      Buffer.from([0x30, good[1]! + 1, ...good.subarray(2)]), // sequence length too long
      Buffer.concat([good, Buffer.from([0])]), // trailing byte
      Buffer.from([0x30, 0x81, good[1]!, ...good.subarray(2)]), // long-form length for a short body
      Buffer.from([0x30, 0x06, 0x02, 0x01, 0x07, 0x03, 0x01, 0x09]), // second element is not an INTEGER
      Buffer.from([0x30, 0x07, 0x02, 0x02, 0x00, 0x07, 0x02, 0x01, 0x09]), // non-minimal r (0x00 before a clear high bit)
      Buffer.from([0x30, 0x06, 0x02, 0x01, 0x87, 0x02, 0x01, 0x09]), // negative r
      Buffer.from([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x09]), // r = 0
      derSig(hex32(N), hex32(9n)), // r = n
      Buffer.from([0x30, 0x03, 0x02, 0x01, 0x07]), // s missing
      Buffer.alloc(0)
    ];
    for (const der of bad) expect(() => derToP1363(der), der.toString("hex")).toThrow(/DER/);
  });

  it("a real DER signature converts to P1363 that verifies; the DER form itself is refused", () => {
    const key = p256();
    const message = Buffer.from("amc-p2-08", "utf8");
    for (let i = 0; i < 64; i++) {
      const der = sign("sha256", Buffer.concat([message, Buffer.from([i])]), key.privateKey);
      // The canonical form is P1363 with low S (P2-08 review); half of Node's signatures have a high S.
      const p1363 = lowS(derToP1363(der));
      expect(p1363).toHaveLength(64);
      expect(verifyCanonical("ecdsa-p256-sha256", Buffer.concat([message, Buffer.from([i])]), key.pem, p1363)).toBe(true);
      expect(verifyCanonical("ecdsa-p256-sha256", Buffer.concat([message, Buffer.from([i])]), key.pem, der)).toBe(false);
    }
  });

  it("refuses an algorithm that is not the key's own, and keys other than Ed25519 and P-256", () => {
    const ec = p256();
    const ed = generateKeyPairSync("ed25519");
    const edPem = ed.publicKey.export({ format: "pem", type: "spki" }).toString();
    const message = Buffer.from("m");
    const edSig = sign(null, message, ed.privateKey);
    const ecSig = lowS(sign("sha256", message, { key: ec.privateKey, dsaEncoding: "ieee-p1363" }));
    expect(verifyCanonical("ed25519", message, edPem, edSig)).toBe(true);
    expect(verifyCanonical("ecdsa-p256-sha256", message, edPem, edSig)).toBe(false);
    expect(verifyCanonical("ed25519", message, ec.pem, ecSig)).toBe(false);
    expect(verifyWithKey(message, ec.pem, ecSig)).toBe(true);
    const p384 = generateKeyPairSync("ec", { namedCurve: "P-384" }).publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(canonicalSigningKey(p384)).toBeNull();
    expect(canonicalSigningKey(ec.pem)).toEqual({ algorithm: "ecdsa-p256-sha256", pem: ec.pem });
    expect(signingKeyId(edPem)).toBe(ed25519KeyId(edPem));
    expect(signingKeyId(ec.pem)).toBe(sha256Hex(Buffer.from(ec.pem, "utf8")));
  });

  it("digest signatures and envelopes accept ECDSA P-256 in P1363 and refuse the DER encoding", () => {
    const key = p256();
    const digestHex = createHash("sha256").update("artifact").digest("hex");
    const data = Buffer.from(digestHex, "hex");
    const p1363 = lowS(sign("sha256", data, { key: key.privateKey, dsaEncoding: "ieee-p1363" }));
    const der = sign("sha256", data, key.privateKey);
    expect(verifyHexDigest(digestHex, p1363.toString("base64"), key.pem)).toBe(true);
    // Node verifies a DER signature under an EC key with a null algorithm: verifyHexDigest must not.
    expect(verifyHexDigest(digestHex, der.toString("base64"), key.pem)).toBe(false);
    const envelope = (signature: Buffer, alg: "ed25519" | "ecdsa-p256-sha256") => ({
      v: 1 as const, alg, pubkeyB64: Buffer.from(key.pem).toString("base64"), fingerprint: sha256Hex(Buffer.from(key.pem, "utf8")),
      sigB64: signature.toString("base64"), signedTs: Date.now(), signer: { type: "VAULT" as const, attestationLevel: "SOFTWARE" as const }
    });
    expect(verifySignatureEnvelope(digestHex, envelope(p1363, "ecdsa-p256-sha256"))).toBe(true);
    expect(verifySignatureEnvelope(digestHex, envelope(der, "ecdsa-p256-sha256"))).toBe(false);
    // The envelope's alg must be the key's algorithm.
    expect(verifySignatureEnvelope(digestHex, envelope(p1363, "ed25519"))).toBe(false);
  });
});

// --- P2-08 review: one identity per key, one encoding per signature, the algorithm from the key ---
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const big = (bytes: Buffer) => BigInt(`0x${bytes.toString("hex") || "0"}`);
const le32 = (value: bigint) => Buffer.from(value.toString(16).padStart(64, "0"), "hex").reverse();
/** The two s values of one ECDSA signature: (r, s) and (r, n - s), low-S first. */
function bothS(p1363: Buffer): { low: Buffer; high: Buffer } {
  const r = p1363.subarray(0, 32);
  const s = big(p1363.subarray(32));
  const other = N - s;
  const [low, high] = s <= N / 2n ? [s, other] : [other, s];
  return { low: Buffer.concat([r, hex32(low)]), high: Buffer.concat([r, hex32(high)]) };
}
const rewrap = (pem: string, width: number) => {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return `-----BEGIN PUBLIC KEY-----\n${body.match(new RegExp(`.{1,${width}}`, "g"))!.join("\n")}\n-----END PUBLIC KEY-----\n`;
};

describe("one identity per key (P2-08 review: identity-canonicalization)", () => {
  it("derives the id from the key's DER SPKI bytes: PEM, CRLF, re-wrapped, padded and DER encodings share one id", () => {
    for (const pair of [generateKeyPairSync("ed25519"), generateKeyPairSync("ec", { namedCurve: "P-256" })]) {
      const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
      const der = pair.publicKey.export({ format: "der", type: "spki" });
      const variants: Array<string | Buffer> = [pem, pem.replace(/\n/g, "\r\n"), `\n  ${pem}\n\n`, rewrap(pem, 76), rewrap(pem, 40), der];
      expect(new Set(variants.map(variant => signingKeyId(variant))).size).toBe(1);
      expect(signingKeyId(der)).toBe(sha256Hex(Buffer.from(pem, "utf8")));
      expect(signingKeyIdentity(rewrap(pem, 76))).toMatchObject({ pem, der });
    }
    const a = p256().pem;
    const b = p256().pem;
    expect(signingKeyId(a)).not.toBe(signingKeyId(b));
    // A private key, a non-SPKI header or text after an SPKI header that is not a key has no id.
    const priv = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    expect(signingKeyId(priv)).toBeNull();
    expect(signingKeyId(a.replace(/PUBLIC KEY/g, "EC PUBLIC KEY"))).toBeNull();
    expect(signingKeyId(Buffer.from("not a key"))).toBeNull();
  });

  it("refuses a provider description whose key id is not the id of its key bytes", () => {
    const key = p256();
    const description = { ref: { provider: "aws-kms" as const, id: "arn:aws:kms:eu-west-1:111122223333:key/x" }, algorithm: "ecdsa-p256-sha256" as const, publicKeyPem: key.pem,
      keyId: signingKeyId(key.pem)!, protection: "hsm" as const, protectionBasis: "provider-metadata" as const, exportable: false };
    const policy = { allowed: ["ed25519", "ecdsa-p256-sha256"] as const, requireNonExportable: false };
    expect(checkedDescription(description, policy)).toBe(description);
    for (const keyId of [signingKeyId(p256().pem)!, sha256Hex(Buffer.from(key.pem.replace(/\n/g, "\r\n"), "utf8")), sha256Hex(key.privateKey.export({ format: "der", type: "pkcs8" }))]) {
      expect(() => checkedDescription({ ...description, keyId }, policy)).toThrow(/key id/);
    }
    // A provider that reports a non-canonical PEM of the right key is refused too: the description must carry the one encoding.
    expect(() => checkedDescription({ ...description, publicKeyPem: key.pem.replace(/\n/g, "\r\n") }, policy)).toThrow(/canonical/);
  });
});

describe("one encoding per signature, the algorithm from the key (P2-08 review: signature-malleability)", () => {
  it("refuses the high-S twin of a valid ECDSA P-256 signature everywhere AMC verifies", () => {
    const key = p256();
    const digestHex = createHash("sha256").update("malleable").digest("hex");
    const data = Buffer.from(digestHex, "hex");
    const { low, high } = bothS(sign("sha256", data, { key: key.privateKey, dsaEncoding: "ieee-p1363" }));
    expect(verifyCanonical("ecdsa-p256-sha256", data, key.pem, low)).toBe(true);
    expect(verifyCanonical("ecdsa-p256-sha256", data, key.pem, high)).toBe(false);
    expect(verifyWithKey(data, key.pem, high)).toBe(false);
    expect(verifyHexDigest(digestHex, low.toString("base64"), key.pem)).toBe(true);
    expect(verifyHexDigest(digestHex, high.toString("base64"), key.pem)).toBe(false);
    expect(verifierPackageVerify(data, key.pem, low)).toBe(true);
    expect(verifierPackageVerify(data, key.pem, high)).toBe(false);
    const envelope = { v: 1 as const, alg: "ecdsa-p256-sha256" as const, pubkeyB64: Buffer.from(key.pem).toString("base64"), fingerprint: sha256Hex(Buffer.from(key.pem, "utf8")),
      sigB64: high.toString("base64"), signedTs: Date.now(), signer: { type: "VAULT" as const, attestationLevel: "SOFTWARE" as const } };
    expect(verifySignatureEnvelope(digestHex, envelope)).toBe(false);
    // r or s of zero, or at least n, never verifies.
    expect(verifyCanonical("ecdsa-p256-sha256", data, key.pem, Buffer.concat([low.subarray(0, 32), hex32(N)]))).toBe(false);
  });

  it("refuses an Ed25519 signature whose S is not reduced below L", () => {
    const pair = generateKeyPairSync("ed25519");
    const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const message = Buffer.from("m");
    const signature = sign(null, message, pair.privateKey);
    const s = big(Buffer.from(signature.subarray(32)).reverse());
    const unreduced = Buffer.concat([signature.subarray(0, 32), le32(s + L)]);
    expect(verifyCanonical("ed25519", message, pem, signature)).toBe(true);
    expect(verifyCanonical("ed25519", message, pem, unreduced)).toBe(false);
    expect(verifierPackageVerify(message, pem, unreduced)).toBe(false);
  });

  it("canonicalizes a provider's high-S ECDSA answer to low-S before checking and returning it", async () => {
    const key = p256();
    const description = { ref: { provider: "azure-kv" as const, id: "https://amc-test.vault.azure.net/keys/k" }, algorithm: "ecdsa-p256-sha256" as const, publicKeyPem: key.pem,
      keyId: signingKeyId(key.pem)!, protection: "hsm" as const, protectionBasis: "provider-metadata" as const, exportable: false };
    const message = Buffer.from("provider answer");
    const highS: KeyProvider = { id: "azure-kv", describe: async () => description,
      sign: async () => bothS(sign("sha256", message, { key: key.privateKey, dsaEncoding: "ieee-p1363" })).high };
    const signature = await signChecked(highS, description, message);
    expect(big(signature.subarray(32)) <= N / 2n).toBe(true);
    expect(verifyCanonical("ecdsa-p256-sha256", message, key.pem, signature)).toBe(true);
  });

  it("takes the algorithm from the key: a description or a statement naming another algorithm is refused", async () => {
    const key = p256();
    const description = { ref: { provider: "aws-kms" as const, id: "arn:aws:kms:eu-west-1:111122223333:key/x" }, algorithm: "ed25519" as const, publicKeyPem: key.pem,
      keyId: signingKeyId(key.pem)!, protection: "hsm" as const, protectionBasis: "provider-metadata" as const, exportable: false };
    const provider: KeyProvider = { id: "aws-kms", describe: async () => description, sign: async (_ref, m) => sign("sha256", m, { key: key.privateKey, dsaEncoding: "ieee-p1363" }) };
    await expect(signChecked(provider, description, Buffer.from("m"))).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    // A delegation whose algorithm field disagrees with its issuer key is refused even though the signature verifies.
    const issuer = { ...description, algorithm: "ecdsa-p256-sha256" as const };
    const delegate = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
    const signed = await issueDelegation(provider, issuer, { delegatePublicKeyPem: delegate, notBefore: new Date("2026-10-18T00:00:00.000Z"), hours: 1, maxEvents: 1 });
    const relabelled = encodeDelegation({ ...signed, algorithm: "ed25519" });
    expect(verifyDelegation(relabelled, { issuerPublicKeyPems: [key.pem], at: new Date("2026-10-18T00:30:00.000Z") })).toEqual({ valid: false, reason: expect.stringMatching(/algorithm/) });
    expect(verifyDelegation(encodeDelegation(signed), { issuerPublicKeyPems: [key.pem], at: new Date("2026-10-18T00:30:00.000Z") })).toMatchObject({ valid: true });
  });
});
