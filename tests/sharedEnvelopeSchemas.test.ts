import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { benchSignatureSchema } from "../src/bench/benchSchema.js";
import { backupManifestSigSchema } from "../src/ops/backup/backupSchema.js";
import { standardBundleSignatureSchema } from "../src/standard/standardSchema.js";
import { orgSignatureSchema } from "../src/org/orgSchema.js";
import { transparencySealSignatureSchema } from "../src/transparency/logSchema.js";
import { merkleProofSignatureSchema } from "../src/transparency/proofSchema.js";
import { passportSignatureSchema } from "../src/passport/passportSchema.js";
import { binderSignatureSchema } from "../src/audit/binderSchema.js";
import { promptPackSignatureSchema } from "../src/prompt/promptPackSchema.js";
import { verifySignatureEnvelope } from "../src/crypto/signing/signatureEnvelope.js";
import type { SignatureEnvelope } from "../src/crypto/signing/signerTypes.js";
import { lowS, signingKeyId } from "../src/keys/algorithmPolicy.js";

const digest = "ab".repeat(32);
const time = 1792454400000;
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = pair.publicKey.export({ format: "pem", type: "spki" }).toString();
const signature = lowS(sign("sha256", Buffer.from(digest, "hex"), { key: pair.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
const envelope: SignatureEnvelope = { v: 1, alg: "ecdsa-p256-sha256", pubkeyB64: Buffer.from(pem).toString("base64"),
  fingerprint: signingKeyId(pem)!, sigB64: signature, signedTs: time,
  // Synthetic metadata checks round-trip preservation; it is not evidence of a real provider or hardware.
  signer: { type: "NOTARY", attestationLevel: "SOFTWARE", attestationBasis: "provider-metadata", notaryFingerprint: signingKeyId(pem)! } };
const wrapper = (value: SignatureEnvelope) => ({ digestSha256: digest, signature: value.sigB64, signedTs: time, signer: "auditor" as const, envelope: value });
const schemas = [
  ["bench", benchSignatureSchema], ["backup", backupManifestSigSchema], ["standard", standardBundleSignatureSchema],
  ["org", orgSignatureSchema], ["transparency seal", transparencySealSignatureSchema], ["merkle proof", merkleProofSignatureSchema],
  ["passport", passportSignatureSchema], ["binder", binderSignatureSchema], ["prompt pack", promptPackSignatureSchema]
] as const;

// The parsers own shape/metadata preservation. Only verifySignatureEnvelope is credited with crypto acceptance below.
describe.each(schemas)("shared envelope parser: %s", (_name, schema) => {
  it("retains a real P-256 envelope and its basis, then verifies it", () => {
    const parsed = schema.parse(wrapper(envelope));
    expect(parsed.envelope).toEqual(envelope);
    expect(parsed.envelope?.signer.attestationBasis).toBe("provider-metadata");
    expect(verifySignatureEnvelope(digest, parsed.envelope!, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(true);
    expect(schema.safeParse(wrapper({ ...envelope, alg: "rsa-sha256" } as never)).success).toBe(false);
  });

  it("does not mistake parse success for crypto admission: DER and an incorrect algorithm label fail verification", () => {
    const der = sign("sha256", Buffer.from(digest, "hex"), { key: pair.privateKey, dsaEncoding: "der" }).toString("base64");
    for (const invalid of [{ ...envelope, sigB64: der }, { ...envelope, alg: "ed25519" as const }]) {
      const parsed = schema.parse(wrapper(invalid)); // Shape permits both named algorithms; crypto binds the label to the key.
      expect(verifySignatureEnvelope(digest, parsed.envelope!, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(false);
    }
  });

  it("keeps an old valid Ed25519 envelope's properties and serialized bytes, including absent basis", () => {
    const oldPair = generateKeyPairSync("ed25519");
    const oldPem = oldPair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const oldEnvelope: SignatureEnvelope = { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(oldPem).toString("base64"),
      fingerprint: signingKeyId(oldPem)!, sigB64: sign(null, Buffer.from(digest, "hex"), oldPair.privateKey).toString("base64"), signedTs: time,
      signer: { type: "NOTARY", attestationLevel: "HARDWARE", notaryFingerprint: signingKeyId(oldPem)! } };
    const old = wrapper(oldEnvelope);
    const before = JSON.stringify(old);
    const parsed = schema.parse(JSON.parse(before));
    expect(JSON.stringify(parsed)).toBe(before);
    expect(Object.hasOwn(parsed.envelope!.signer, "attestationBasis")).toBe(false);
    expect(verifySignatureEnvelope(digest, parsed.envelope!, { trustedPublicKeys: [oldPem], requireTrustedKey: true })).toBe(true);
    const { envelope: _absent, ...legacyRaw } = old;
    expect(JSON.stringify(schema.parse(legacyRaw))).toBe(JSON.stringify(legacyRaw));
    expect(Object.hasOwn(schema.parse(legacyRaw), "envelope")).toBe(false);
  });
});
