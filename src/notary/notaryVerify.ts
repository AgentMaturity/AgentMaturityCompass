import { verifyWithKey } from "../keys/algorithmPolicy.js";
import { sha256Hex } from "../utils/hash.js";
import { notaryAttestResponseSchema, notarySignResponseSchema } from "./notaryApiTypes.js";
import { canonicalize } from "../utils/json.js";

export function verifyNotarySignResponse(payload: unknown, expectedPayload: Buffer): {
  ok: boolean;
  error: string | null;
  parsed: ReturnType<typeof notarySignResponseSchema.parse> | null;
} {
  try {
    const parsed = notarySignResponseSchema.parse(payload);
    const sha = sha256Hex(expectedPayload);
    if (sha !== parsed.payloadSha256) {
      return { ok: false, error: "notary payload digest mismatch", parsed };
    }
    const ok = verifyWithKey(expectedPayload, parsed.pubkeyPem, Buffer.from(parsed.signatureB64, "base64"));
    if (!ok) {
      return { ok: false, error: "notary signature invalid", parsed };
    }
    if (sha256Hex(Buffer.from(parsed.pubkeyPem, "utf8")) !== parsed.pubkeyFingerprint) {
      return { ok: false, error: "notary pubkey fingerprint mismatch", parsed };
    }
    return { ok: true, error: null, parsed };
  } catch (error) {
    return { ok: false, error: String(error), parsed: null };
  }
}

export function verifyNotaryAttestResponse(payload: unknown): {
  ok: boolean;
  error: string | null;
  parsed: ReturnType<typeof notaryAttestResponseSchema.parse> | null;
} {
  try {
    const parsed = notaryAttestResponseSchema.parse(payload);
    const ok = verifyWithKey(
      Buffer.from(canonicalize(parsed.attestation), "utf8"),
      parsed.pubkeyPem,
      Buffer.from(parsed.signatureB64, "base64")
    );
    if (!ok) {
      return { ok: false, error: "notary attestation signature invalid", parsed };
    }
    if (sha256Hex(Buffer.from(parsed.pubkeyPem, "utf8")) !== parsed.pubkeyFingerprint) {
      return { ok: false, error: "notary attestation fingerprint mismatch", parsed };
    }
    return { ok: true, error: null, parsed };
  } catch (error) {
    return { ok: false, error: String(error), parsed: null };
  }
}
