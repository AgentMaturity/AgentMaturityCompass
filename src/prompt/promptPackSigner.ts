import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { promptPackSignatureSchema, type PromptPack, type PromptPackSignature } from "./promptPackSchema.js";

export function signPromptPack(workspace: string, pack: PromptPack): PromptPackSignature {
  const signed = signSerializedPayloadWithAuditor(workspace, canonicalize(pack));
  return promptPackSignatureSchema.parse(signed);
}

export function digestPromptPack(pack: PromptPack): string {
  return sha256Hex(Buffer.from(canonicalize(pack), "utf8"));
}

export function verifyPromptPackDigestSignature(params: {
  workspace?: string;
  digestHex: string;
  signature: PromptPackSignature;
  publicKeyPem?: string;
}): boolean {
  const trustedKeys = params.publicKeyPem
    ? [params.publicKeyPem]
    : params.workspace
      ? getPublicKeyHistory(params.workspace, "auditor")
      : [];
  if (params.signature.envelope) {
    try {
      if (params.signature.signature !== params.signature.envelope.sigB64) {
        return false;
      }
      if (
        verifySignatureEnvelope(params.digestHex, params.signature.envelope, {
          trustedPublicKeys: trustedKeys,
          requireTrustedKey: true
        })
      ) {
        return true;
      }
    } catch {
      // fallback below
    }
  }
  if (trustedKeys.length > 0) {
    return verifyHexDigestAny(params.digestHex, params.signature.signature, trustedKeys);
  }
  return false;
}
