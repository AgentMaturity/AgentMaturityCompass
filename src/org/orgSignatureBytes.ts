import { orgSignatureSchema } from "./orgSchema.js";
import { signingPurposeForKind, type SignKind } from "../crypto/signing/signerTypes.js";
import { describePolicySigner } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { getPublicKeyPem } from "../crypto/keys.js";
import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { sha256Hex } from "../utils/hash.js";

/** Explicit-kind same-read verifier for migrated consumers; never changes the trust.yaml/bootstrap facade. */
export function verifyAuditorSignatureBytes(workspace: string, kind: SignKind, bytes: Uint8Array, sidecar: Uint8Array): {
  valid: boolean; reason: string | null;
} {
  try {
    const signed = orgSignatureSchema.parse(JSON.parse(Buffer.from(sidecar).toString("utf8"))), digest = sha256Hex(Buffer.from(bytes));
    if (signed.digestSha256 !== digest) return { valid: false, reason: "digest mismatch" };
    assertKeysetComplete(workspace);
    const purpose = signingPurposeForKind(kind), keys: string[] = [];
    if (signed.envelope?.signer.type === "NOTARY") {
      // A label does not turn an ordinary role/purpose signature into a notary signature.
      const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
      keys.push(...(history?.entries.filter(entry => entry.source === "notary").map(entry => entry.publicKeyPem) ?? []));
      try {
        const current = describePolicySigner(workspace, kind);
        if (current.mode === "NOTARY" && history?.entries.some(entry => entry.publicKeyPem === current.publicKeyPem)) keys.push(current.publicKeyPem);
      } catch { /* Authenticated historical notary candidates do not depend on today's selected route. */ }
    } else {
      keys.push(...getPurposeKeyHistory(workspace, purpose));
      if (keysetDeclared(workspace) && boundProviderKey(workspace, purpose) === null) {
        const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
        keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
      }
    }
    const valid = signed.envelope === undefined
      ? keys.some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64")))
      : signed.signature === signed.envelope.sigB64 && verifySignatureEnvelope(digest, signed.envelope, { trustedPublicKeys: keys, requireTrustedKey: true });
    return { valid, reason: valid ? null : "signature verification failed" };
  } catch { return { valid: false, reason: "invalid file signature" }; }
}
