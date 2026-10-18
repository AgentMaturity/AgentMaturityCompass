import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalSigningKey, derToP1363, signingKeyId, verifyCanonical, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
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
      const p1363 = derToP1363(der);
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
    const ecSig = sign("sha256", message, { key: ec.privateKey, dsaEncoding: "ieee-p1363" });
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
    const p1363 = sign("sha256", data, { key: key.privateKey, dsaEncoding: "ieee-p1363" });
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
