/**
 * Signing algorithm policy (P2-08), documented in docs/KEY_PROVIDERS.md. Two algorithms and one encoding each:
 *
 * - `ed25519` (preferred): pure Ed25519 over exactly the bytes AMC signs (a 32-byte digest or a domain-separated payload).
 * - `ecdsa-p256-sha256` (fallback where Ed25519 is unavailable, e.g. Azure Key Vault or HSM-protected Google keys):
 *   ECDSA over P-256 with SHA-256 of the same bytes, encoded as IEEE P1363 (r then s, 32 bytes each) with low S. Providers
 *   that answer in DER are converted by derToP1363 and every provider answer is brought to low S (lowS) before it is
 *   checked; a DER or high-S signature is never accepted by a verifier.
 *
 * Anything else (other curves, RSA, DER, high S, an unreduced Ed25519 S, an algorithm that is not the key's own) is
 * refused. A key's identity comes from its DER SPKI bytes (signingKeyIdentity), never from how its PEM is spelled.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";

export const SIGNING_ALGORITHMS = ["ed25519", "ecdsa-p256-sha256"] as const;
export type SigningAlgorithm = (typeof SIGNING_ALGORITHMS)[number];

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
/** The order of the Ed25519 base point: a signature's S must be below it. */
const ED25519_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

function algorithmOf(key: KeyObject): SigningAlgorithm | null {
  if (key.asymmetricKeyType === "ed25519") return "ed25519";
  return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1" ? "ecdsa-p256-sha256" : null;
}

const bigBE = (bytes: Uint8Array) => BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);

/** The DER inside exactly one `PUBLIC KEY` PEM block (any line breaks or surrounding whitespace); null for anything else. */
function derOfPem(text: string): Buffer | null {
  const match = /^-----BEGIN PUBLIC KEY-----([A-Za-z0-9+/=\s]+)-----END PUBLIC KEY-----$/.exec(text.trim());
  const body = match?.[1]!.replace(/\s+/g, "") ?? "";
  const der = Buffer.from(body, "base64");
  return match !== null && body.length > 0 && der.toString("base64") === body ? der : null;
}

/**
 * A key's one identity, from its DER SubjectPublicKeyInfo bytes: the algorithm, the DER, the canonical PEM rendered from
 * that DER (64-character base64 lines, LF) and keyId = sha256 of that PEM (the id every P1-08 key set, history and trust
 * list already uses). Any PEM spelling (CRLF, other line widths, surrounding whitespace) or the DER itself gives the
 * same identity; a private key, a certificate, another key type or curve gives none.
 */
export function signingKeyIdentity(publicKey: string | Uint8Array): { algorithm: SigningAlgorithm; der: Buffer; pem: string; keyId: string } | null {
  try {
    const input = typeof publicKey === "string" ? derOfPem(publicKey) : Buffer.from(publicKey);
    if (input === null) return null;
    const key = createPublicKey({ key: input, format: "der", type: "spki" });
    const algorithm = algorithmOf(key);
    if (algorithm === null) return null;
    const der = key.export({ format: "der", type: "spki" });
    const pem = `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----\n`;
    return { algorithm, der, pem, keyId: sha256Hex(Buffer.from(pem, "utf8")) };
  } catch {
    return null;
  }
}

/** The algorithm and canonical SPKI PEM of an Ed25519 or P-256 public key (PEM or DER); null for anything else. */
export function canonicalSigningKey(publicKey: string | Uint8Array): { algorithm: SigningAlgorithm; pem: string } | null {
  const identity = signingKeyIdentity(publicKey);
  return identity === null ? null : { algorithm: identity.algorithm, pem: identity.pem };
}

/** AMC key id of an Ed25519 or P-256 key (see signingKeyIdentity); equals ed25519KeyId for Ed25519 keys. */
export function signingKeyId(publicKey: string | Uint8Array): string | null {
  return signingKeyIdentity(publicKey)?.keyId ?? null;
}

/**
 * Whether a signature is in its algorithm's one accepted encoding: 64 bytes; Ed25519 with S below the group order;
 * ECDSA P-256 as r then s with 0 < r < n and 0 < s <= n/2 (low S), so (r, n - s) is never a second valid encoding.
 */
function canonicalEncoding(algorithm: SigningAlgorithm, signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  if (algorithm === "ed25519") return bigBE(Buffer.from(signature.subarray(32)).reverse()) < ED25519_ORDER;
  const r = bigBE(signature.subarray(0, 32));
  const s = bigBE(signature.subarray(32));
  return r > 0n && r < P256_ORDER && s > 0n && s <= P256_ORDER / 2n;
}

/**
 * True only when `algorithm` is the key's own, the signature is in that algorithm's one canonical encoding and it
 * verifies. The caller names the algorithm it pinned for the key; it never comes from the signature.
 */
export function verifyCanonical(algorithm: SigningAlgorithm, message: Uint8Array, publicKeyPem: string, signature: Uint8Array): boolean {
  try {
    const identity = signingKeyIdentity(publicKeyPem);
    if (identity?.algorithm !== algorithm || !canonicalEncoding(algorithm, signature)) return false;
    const key = createPublicKey({ key: identity.der, format: "der", type: "spki" });
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

/** An ECDSA P-256 P1363 signature with s replaced by n - s when s is high: the same signature in its canonical form. */
export function lowS(signature: Uint8Array): Buffer {
  const bytes = Buffer.from(signature);
  if (bytes.length !== 64) return bytes;
  const s = bigBE(bytes.subarray(32));
  if (s <= P256_ORDER / 2n) return bytes;
  return Buffer.concat([bytes.subarray(0, 32), Buffer.from((P256_ORDER - s).toString(16).padStart(64, "0"), "hex")]);
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
