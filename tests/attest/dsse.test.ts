import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, test } from "vitest";
import { ed25519Signer, INTOTO_PAYLOAD_TYPE, pae, signDsse, verifyDsse, type DsseEnvelope } from "../../src/attest/dsse.js";

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  return { privatePem, publicPem, signer: ed25519Signer(privatePem) };
}

const payload = Buffer.from('{"_type":"https://in-toto.io/Statement/v1"}', "utf8");

describe("DSSE v1.0 pre-authentication encoding", () => {
  test("matches the DSSE protocol's worked example byte for byte", () => {
    // DSSE v1.0 protocol.md: PAE("http://example.com/HelloWorld", "hello world").
    expect(pae("http://example.com/HelloWorld", Buffer.from("hello world")).toString("latin1"))
      .toBe("DSSEv1 29 http://example.com/HelloWorld 11 hello world");
  });

  test("counts bytes, not characters, and keeps the payload bytes as they are", () => {
    const multibyte = Buffer.from("héllo", "utf8");
    const expected = Buffer.concat([Buffer.from("DSSEv1 28 application/vnd.in-toto+json 6 ", "ascii"), multibyte]);
    expect(pae(INTOTO_PAYLOAD_TYPE, multibyte).equals(expected)).toBe(true);
  });
});

describe("DSSE sign and verify", () => {
  test("an envelope signed over the PAE verifies with the signer's key and returns the payload", () => {
    const { publicPem, signer } = keyPair();
    const envelope = signDsse(INTOTO_PAYLOAD_TYPE, payload, signer);
    expect(envelope.payloadType).toBe(INTOTO_PAYLOAD_TYPE);
    expect(envelope.signatures).toEqual([{ keyid: signer.keyid, sig: expect.any(String) }]);
    const verified = verifyDsse(envelope, INTOTO_PAYLOAD_TYPE, new Map([[signer.keyid, publicPem]]));
    expect(verified).toEqual({ ok: true, payload, keyid: signer.keyid });
  });

  test("a signature over the raw payload instead of the PAE is refused", () => {
    const { privatePem, publicPem, signer } = keyPair();
    const raw: DsseEnvelope = { payloadType: INTOTO_PAYLOAD_TYPE, payload: payload.toString("base64"),
      signatures: [{ keyid: signer.keyid, sig: sign(null, payload, privatePem).toString("base64") }] };
    expect(verifyDsse(raw, INTOTO_PAYLOAD_TYPE, new Map([[signer.keyid, publicPem]]))).toMatchObject({ ok: false });
  });

  test("a changed payloadType breaks the signature, and an unexpected one is refused", () => {
    const { publicPem, signer } = keyPair();
    const keys = new Map([[signer.keyid, publicPem]]);
    const envelope = signDsse(INTOTO_PAYLOAD_TYPE, payload, signer);
    expect(verifyDsse({ ...envelope, payloadType: "application/json" }, "application/json", keys)).toMatchObject({ ok: false, error: expect.stringContaining("signature") });
    const otherType = signDsse("application/json", payload, signer);
    expect(verifyDsse(otherType, INTOTO_PAYLOAD_TYPE, keys)).toMatchObject({ ok: false, error: expect.stringContaining("payloadType") });
  });

  test("a changed payload byte, an unknown key id, extra fields and non-canonical base64 are refused", () => {
    const { publicPem, signer } = keyPair();
    const keys = new Map([[signer.keyid, publicPem]]);
    const envelope = signDsse(INTOTO_PAYLOAD_TYPE, payload, signer);
    const tampered = Buffer.from(payload);
    tampered[3] ^= 1;
    expect(verifyDsse({ ...envelope, payload: tampered.toString("base64") }, INTOTO_PAYLOAD_TYPE, keys)).toMatchObject({ ok: false });
    expect(verifyDsse(envelope, INTOTO_PAYLOAD_TYPE, new Map([["0".repeat(64), publicPem]]))).toMatchObject({ ok: false, error: expect.stringContaining("not a key") });
    expect(verifyDsse({ ...envelope, extra: 1 }, INTOTO_PAYLOAD_TYPE, keys)).toMatchObject({ ok: false });
    expect(verifyDsse({ ...envelope, payload: envelope.payload.replace(/=+$/, "") }, INTOTO_PAYLOAD_TYPE, keys)).toMatchObject({ ok: false });
    expect(verifyDsse({ ...envelope, signatures: [...envelope.signatures, ...envelope.signatures] }, INTOTO_PAYLOAD_TYPE, keys)).toMatchObject({ ok: false });
  });

  test("the key id is the AMC fingerprint: sha256 of the canonical SPKI PEM derived from the private key", () => {
    const { publicPem, signer } = keyPair();
    expect(signer.publicKeyPem).toBe(publicPem);
    expect(signer.keyid).toBe(createHash("sha256").update(publicPem).digest("hex"));
  });
});
