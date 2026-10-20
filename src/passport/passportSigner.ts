import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import { readFileSync } from "node:fs";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { passportSignatureSchema, type PassportJson } from "./passportSchema.js";

export function signPassportJson(workspace: string, passport: PassportJson): {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: SignatureEnvelope;
} {
  return passportSignatureSchema.parse(signSerializedPayloadWithAuditor(workspace, canonicalize(passport)));
}

export function verifyPassportDigestSignature(params: {
  workspace?: string;
  digestHex: string;
  signature: ReturnType<typeof signPassportJson>;
  publicKeyPem?: string;
}): boolean {
  const trustedKeys = params.publicKeyPem
    ? [params.publicKeyPem]
    : params.workspace
      ? getPublicKeyHistory(params.workspace, "auditor")
      : [];
  if (params.signature.envelope !== undefined) {
    try {
      if (params.signature.signature !== params.signature.envelope.sigB64) {
        return false;
      }
      return verifySignatureEnvelope(params.digestHex, params.signature.envelope, {
        trustedPublicKeys: trustedKeys,
        requireTrustedKey: true
      });
    } catch {
      return false;
    }
  }
  if (trustedKeys.length > 0) {
    return verifyHexDigestAny(params.digestHex, params.signature.signature, trustedKeys);
  }
  return false;
}

export function digestFile(path: string): string {
  return sha256Hex(readFileSync(path));
}
