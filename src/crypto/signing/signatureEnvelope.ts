import { z } from "zod";
import { verify } from "node:crypto";
import type { SignatureEnvelope } from "./signerTypes.js";
import { sha256Hex } from "../../utils/hash.js";

export const signatureEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("ed25519"),
  pubkeyB64: z.string().min(1),
  fingerprint: z.string().length(64),
  sigB64: z.string().min(1),
  signedTs: z.number().int(),
  signer: z.object({
    type: z.enum(["VAULT", "NOTARY"]),
    attestationLevel: z.enum(["SOFTWARE", "HARDWARE"]),
    notaryFingerprint: z.string().length(64).optional()
  })
});

function normalizePem(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

export interface VerifySignatureEnvelopeOptions {
  trustedPublicKeys?: string[];
  requireTrustedKey?: boolean;
  maxSignedTsSkewMs?: number;
  nowTs?: number;
}

export function verifySignatureEnvelope(
  digestHex: string,
  envelope: SignatureEnvelope,
  options: VerifySignatureEnvelopeOptions = {}
): boolean {
  try {
    const parsed = signatureEnvelopeSchema.parse(envelope);
    const pubPem = Buffer.from(parsed.pubkeyB64, "base64").toString("utf8");
    const computedFingerprint = sha256Hex(Buffer.from(pubPem, "utf8"));
    if (computedFingerprint !== parsed.fingerprint) {
      return false;
    }
    if (parsed.signer.type === "NOTARY" && parsed.signer.notaryFingerprint && parsed.signer.notaryFingerprint !== parsed.fingerprint) {
      return false;
    }
    if (typeof options.maxSignedTsSkewMs === "number" && options.maxSignedTsSkewMs >= 0) {
      const now = options.nowTs ?? Date.now();
      if (Math.abs(now - parsed.signedTs) > options.maxSignedTsSkewMs) {
        return false;
      }
    }
    const trusted = (options.trustedPublicKeys ?? []).map(normalizePem);
    if (trusted.length > 0 && !trusted.includes(normalizePem(pubPem))) {
      return false;
    }
    if ((options.requireTrustedKey ?? false) && trusted.length === 0) {
      return false;
    }
    return verify(
      null,
      Buffer.from(digestHex, "hex"),
      pubPem,
      Buffer.from(parsed.sigB64, "base64")
    );
  } catch {
    return false;
  }
}
