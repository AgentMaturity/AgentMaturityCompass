/**
 * Signing algorithm policy (P2-08), documented in docs/KEY_PROVIDERS.md. Two algorithms and one encoding each:
 *
 * - `ed25519` (preferred): pure Ed25519 over exactly the bytes AMC signs (a 32-byte digest or a domain-separated payload).
 * - `ecdsa-p256-sha256` (fallback where Ed25519 is unavailable, e.g. Azure Key Vault or HSM-protected Google keys):
 *   ECDSA over P-256 with SHA-256 of the same bytes, encoded as IEEE P1363 (r then s, 32 bytes each). Providers that
 *   answer in DER are converted by derToP1363; a DER signature is never accepted by a verifier.
 *
 * Anything else (other curves, RSA, DER, an algorithm that is not the key's own) is refused.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";

export const SIGNING_ALGORITHMS = ["ed25519", "ecdsa-p256-sha256"] as const;
export type SigningAlgorithm = (typeof SIGNING_ALGORITHMS)[number];

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

function algorithmOf(key: KeyObject): SigningAlgorithm | null {
  if (key.asymmetricKeyType === "ed25519") return "ed25519";
  return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1" ? "ecdsa-p256-sha256" : null;
}

/** The algorithm and canonical SPKI PEM (Node's export) of an Ed25519 or P-256 public key; null for anything else. */
export function canonicalSigningKey(publicKeyPem: string): { algorithm: SigningAlgorithm; pem: string } | null {
  if (!publicKeyPem.trimStart().startsWith("-----BEGIN PUBLIC KEY-----")) return null;
  try {
    const key = createPublicKey(publicKeyPem);
    const algorithm = algorithmOf(key);
    return algorithm === null ? null : { algorithm, pem: key.export({ format: "pem", type: "spki" }).toString() };
  } catch {
    return null;
  }
}

/** AMC key id: sha256 of the canonical PEM text. Equals ed25519KeyId for Ed25519 keys; null for unsupported keys. */
export function signingKeyId(publicKeyPem: string): string | null {
  const canonical = canonicalSigningKey(publicKeyPem);
  return canonical === null ? null : sha256Hex(Buffer.from(canonical.pem, "utf8"));
}

/** True only when `algorithm` is the key's own and the signature verifies in that algorithm's canonical encoding. */
export function verifyCanonical(algorithm: SigningAlgorithm, message: Uint8Array, publicKeyPem: string, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    if (algorithmOf(key) !== algorithm || signature.length !== 64) return false;
    return algorithm === "ed25519"
      ? verify(null, message, key, signature)
      : verify("sha256", message, { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    return false;
  }
}

/** verifyCanonical in the key's own algorithm (Ed25519 or P-256); false for any other key. */
export function verifyWithKey(message: Uint8Array, publicKeyPem: string, signature: Uint8Array): boolean {
  const canonical = canonicalSigningKey(publicKeyPem);
  return canonical !== null && verifyCanonical(canonical.algorithm, message, publicKeyPem, signature);
}

function encodingError(): never {
  throw new Error("not a strict DER ECDSA P-256 signature");
}

/**
 * Strict DER `SEQUENCE { INTEGER r, INTEGER s }` to P1363: short-form lengths, minimal positive integers, 0 < r, s < n,
 * no trailing bytes. Anything else throws.
 */
export function derToP1363(der: Uint8Array): Buffer {
  const bytes = Buffer.from(der);
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) encodingError();
  let offset = 2;
  const integer = (): Buffer => {
    const length = bytes[offset + 1];
    if (bytes[offset] !== 0x02 || length === undefined || length < 1 || length > 33 || offset + 2 + length > bytes.length) encodingError();
    const body = bytes.subarray(offset + 2, offset + 2 + length);
    if ((body[0]! & 0x80) !== 0 || (length > 1 && body[0] === 0 && (body[1]! & 0x80) === 0)) encodingError();
    offset += 2 + length;
    const value = body[0] === 0 ? body.subarray(1) : body;
    const n = value.length === 0 ? 0n : BigInt(`0x${value.toString("hex")}`);
    if (value.length > 32 || n === 0n || n >= P256_ORDER) encodingError();
    return Buffer.concat([Buffer.alloc(32 - value.length), value]);
  };
  const r = integer();
  const s = integer();
  if (offset !== bytes.length) encodingError();
  return Buffer.concat([r, s]);
}
