/**
 * DSSE v1.0 (Dead Simple Signing Envelope): the signature covers the pre-authentication encoding (PAE) of the payload
 * type and the payload bytes, never the payload alone, so a signature for one payload type cannot be replayed as
 * another. AMC signs with Ed25519; a signature's `keyid` is the AMC key id, sha256 of the canonical SPKI PEM.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";

export const INTOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";

export interface DsseEnvelope {
  payloadType: string;
  payload: string;
  signatures: Array<{ keyid: string; sig: string }>;
}

export interface DsseSigner {
  keyid: string;
  publicKeyPem: string;
  sign(message: Buffer): Buffer;
}

/** PAE(type, body) = "DSSEv1" SP LEN(type) SP type SP LEN(body) SP body, lengths in bytes as ASCII decimal. */
export function pae(payloadType: string, payload: Uint8Array): Buffer {
  const type = Buffer.from(payloadType, "utf8");
  return Buffer.concat([Buffer.from(`DSSEv1 ${type.length} `, "ascii"), type, Buffer.from(` ${payload.length} `, "ascii"), Buffer.from(payload)]);
}

/** An Ed25519 signer whose public key and key id are derived from the private key itself. */
export function ed25519Signer(privateKeyPem: string): DsseSigner {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("DSSE signing in AMC uses Ed25519 keys only");
  const publicKeyPem = createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
  return { keyid: sha256Hex(publicKeyPem), publicKeyPem, sign: message => sign(null, message, privateKey) };
}

export function signDsse(payloadType: string, payload: Uint8Array, signer: DsseSigner): DsseEnvelope {
  return { payloadType, payload: Buffer.from(payload).toString("base64"),
    signatures: [{ keyid: signer.keyid, sig: signer.sign(pae(payloadType, payload)).toString("base64") }] };
}

/** Standard base64 in its one canonical spelling (padded, zero trailing bits); null otherwise. */
export function canonicalBase64(text: unknown): Buffer | null {
  if (typeof text !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return null;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : null;
}

const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();

export type DsseVerification = { ok: true; payload: Buffer; keyid: string } | { ok: false; error: string };

/**
 * Verifies an envelope with exactly one signature against keys the caller already trusts (`keyid` to public PEM). The
 * envelope's own key id only selects among those keys; it never supplies one.
 */
export function verifyDsse(envelope: unknown, expectedPayloadType: string, trustedKeys: ReadonlyMap<string, string>): DsseVerification {
  if (!exactKeys(envelope, ["payloadType", "payload", "signatures"]) || typeof envelope.payloadType !== "string" || !Array.isArray(envelope.signatures)) {
    return { ok: false, error: "not a DSSE envelope (payloadType, payload, signatures and nothing else)" };
  }
  if (envelope.payloadType !== expectedPayloadType) return { ok: false, error: `payloadType is ${envelope.payloadType}, not ${expectedPayloadType}` };
  const payload = canonicalBase64(envelope.payload);
  if (payload === null) return { ok: false, error: "payload is not canonical base64" };
  const [signature, ...more] = envelope.signatures as unknown[];
  if (more.length > 0 || !exactKeys(signature, ["keyid", "sig"])) return { ok: false, error: "an AMC envelope carries exactly one signature { keyid, sig }" };
  const sig = canonicalBase64(signature.sig);
  const keyid = typeof signature.keyid === "string" ? signature.keyid : "";
  const publicKeyPem = trustedKeys.get(keyid);
  if (publicKeyPem === undefined) return { ok: false, error: `keyid ${keyid} is not a key the verifier trusts` };
  let valid = false;
  try { valid = sig !== null && verify(null, pae(envelope.payloadType, payload), publicKeyPem, sig); } catch { valid = false; }
  return valid ? { ok: true, payload, keyid } : { ok: false, error: "the signature does not verify over the DSSE PAE" };
}
