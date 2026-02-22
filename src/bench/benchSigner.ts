import { readFileSync } from "node:fs";
import { signSerializedPayloadWithAuditor } from "../org/orgSigner.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import { benchSignatureSchema, type BenchArtifact } from "./benchSchema.js";

export function signBenchJson(workspace: string, bench: BenchArtifact): {
  digestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
  envelope?: {
    v: 1;
    alg: "ed25519";
    pubkeyB64: string;
    fingerprint: string;
    sigB64: string;
    signedTs: number;
    signer: {
      type: "VAULT" | "NOTARY";
      attestationLevel: "SOFTWARE" | "HARDWARE";
      notaryFingerprint?: string;
    };
  };
} {
  return benchSignatureSchema.parse(signSerializedPayloadWithAuditor(workspace, JSON.stringify(bench)));
}

export function verifyBenchDigestSignature(params: {
  workspace?: string;
  digestHex: string;
  signature: ReturnType<typeof signBenchJson>;
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
      // fallback to legacy key verification below
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
