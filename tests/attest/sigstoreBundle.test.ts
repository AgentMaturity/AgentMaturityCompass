import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import { ed25519Signer, INTOTO_PAYLOAD_TYPE, pae, signDsse, verifyDsse } from "../../src/attest/dsse.js";
import {
  envelopeFromSigstoreBundle,
  loadSigstoreKeyless,
  SIGSTORE_BUNDLE_V03_MEDIA_TYPE,
  sigstoreSigner,
  signStatementKeyless,
  toSigstoreBundle,
  type KeylessBackend
} from "../../src/attest/sigstoreBundle.js";

const signer = ed25519Signer(generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString());
const payload = Buffer.from('{"_type":"https://in-toto.io/Statement/v1"}', "utf8");

describe("Sigstore bundle v0.3 around a key-based DSSE envelope", () => {
  test("wraps the envelope with a public-key hint equal to the key id, no log entries and no network material", () => {
    const envelope = signDsse(INTOTO_PAYLOAD_TYPE, payload, signer);
    const bundle = toSigstoreBundle(envelope);
    // The protobuf JSON form @sigstore/bundle emits: empty repeated fields omitted, its member order.
    expect(JSON.stringify(bundle)).toBe(JSON.stringify({
      mediaType: SIGSTORE_BUNDLE_V03_MEDIA_TYPE,
      verificationMaterial: { publicKey: { hint: signer.keyid }, timestampVerificationData: {} },
      dsseEnvelope: { payload: envelope.payload, payloadType: envelope.payloadType, signatures: [{ sig: envelope.signatures[0]!.sig, keyid: signer.keyid }] }
    }));
    expect(SIGSTORE_BUNDLE_V03_MEDIA_TYPE).toBe("application/vnd.dev.sigstore.bundle.v0.3+json");
  });

  test("the envelope read back verifies offline with the pinned public key alone", () => {
    const bundle = JSON.parse(JSON.stringify(toSigstoreBundle(signDsse(INTOTO_PAYLOAD_TYPE, payload, signer)))) as unknown;
    const envelope = envelopeFromSigstoreBundle(bundle);
    expect(verifyDsse(envelope, INTOTO_PAYLOAD_TYPE, new Map([[signer.keyid, signer.publicKeyPem]]))).toMatchObject({ ok: true, payload });
  });

  test("a hint that differs from the signature's key id, another media type, unknown fields and certificate material are refused", () => {
    const bundle = toSigstoreBundle(signDsse(INTOTO_PAYLOAD_TYPE, payload, signer));
    expect(() => envelopeFromSigstoreBundle({ ...bundle, verificationMaterial: { ...bundle.verificationMaterial, publicKey: { hint: "f".repeat(64) } } })).toThrow(/hint/);
    expect(() => envelopeFromSigstoreBundle({ ...bundle, mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.2" })).toThrow(/media type/);
    expect(() => envelopeFromSigstoreBundle({ ...bundle, extra: true })).toThrow();
    expect(() => envelopeFromSigstoreBundle({ ...bundle, verificationMaterial: { certificate: { rawBytes: "AA==" }, tlogEntries: [], timestampVerificationData: { rfc3161Timestamps: [] } } }))
      .toThrow(/keyless/);
    expect(() => envelopeFromSigstoreBundle({ ...bundle, verificationMaterial: { ...bundle.verificationMaterial, tlogEntries: [{ logIndex: "1" }] } })).toThrow(/no log entries/);
    expect(() => envelopeFromSigstoreBundle({ ...bundle, verificationMaterial: { publicKey: bundle.verificationMaterial.publicKey,
      timestampVerificationData: { rfc3161Timestamps: [{ signedTimestamp: "AA==" }] } } })).toThrow(/no timestamps/);
    // The equivalent spelling with empty arrays is the same bundle.
    expect(() => envelopeFromSigstoreBundle({ ...bundle, verificationMaterial: { publicKey: bundle.verificationMaterial.publicKey, tlogEntries: [],
      timestampVerificationData: { rfc3161Timestamps: [] } } })).not.toThrow();
  });

  test("sigstoreSigner implements @sigstore/sign's Signer over AMC's key: a public key with the key id as its hint", async () => {
    const message = pae(INTOTO_PAYLOAD_TYPE, payload);
    const signature = await sigstoreSigner(signer).sign(message);
    expect(signature.key).toEqual({ $case: "publicKey", publicKey: signer.publicKeyPem, hint: signer.keyid });
    expect(signature.signature.equals(signer.sign(message))).toBe(true);
  });
});

describe("keyless signing seam (opt-in, network-bound; mocked here, never contacts Sigstore)", () => {
  test("a keyless bundle names its identity basis and is returned as the backend produced it", async () => {
    const produced = { mediaType: SIGSTORE_BUNDLE_V03_MEDIA_TYPE, verificationMaterial: { certificate: { rawBytes: "AA==" } } };
    const backend: KeylessBackend = { signDsse: vi.fn(async () => ({ bundle: produced, identity: "https://github.com/acme/agent/.github/workflows/attest.yml@refs/heads/main" })) };
    const result = await signStatementKeyless(payload, backend);
    expect(backend.signDsse).toHaveBeenCalledWith(INTOTO_PAYLOAD_TYPE, payload);
    expect(result).toEqual({ bundle: produced, identityBasis: "keyless: Fulcio certificate for https://github.com/acme/agent/.github/workflows/attest.yml@refs/heads/main, logged in Rekor" });
  });

  test("without @sigstore/sign installed the loader refuses before any network call", async () => {
    const importer = vi.fn(async () => { throw new Error("Cannot find package '@sigstore/sign'"); });
    await expect(loadSigstoreKeyless({ importer })).rejects.toThrow(/@sigstore\/sign.*dependency review/);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
