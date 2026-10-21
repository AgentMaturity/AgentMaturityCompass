/** Exact artifact-seal/blob-index grant. This is not a ledger delegation or a general artifact signing key. */
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonicalize, isCanonicalSignatureBase64, isExactIsoTime, parseCanonicalJson } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalSigningKey, SIGNING_ALGORITHMS, signingKeyId, verifyCanonical } from "./algorithmPolicy.js";
import { signChecked, type KeyDescription, type KeyProvider } from "./provider.js";

export const BLOB_AUTHORITY_MAX_HOURS = 24;
const hex = z.string().regex(/^[0-9a-f]{64}$/), time = z.iso.datetime().refine(isExactIsoTime);
const prefix = z.strictObject({ count: z.number().int().nonnegative().safe(), head: z.union([hex, z.literal("")]) })
  .refine(value => value.count === 0 ? value.head === "" : value.head !== "");
const authoritySchema = z.strictObject({ type: z.literal("amc.blob-index-authority"), version: z.literal(1),
  workspaceId: z.string().min(1).max(256), purpose: z.literal("artifact-seal"), operation: z.literal("blob-index"),
  epoch: z.number().int().positive().safe(), previousAuthoritySha256: hex.nullable(), start: prefix,
  childKeyId: hex, childPublicKeyPem: z.string().min(1).max(4096), issuerKeyId: hex, notBefore: time, notAfter: time });
const signedSchema = z.strictObject({ authority: authoritySchema, algorithm: z.enum(SIGNING_ALGORITHMS),
  signature: z.string().refine(isCanonicalSignatureBase64) });
export type BlobIndexAuthority = z.infer<typeof authoritySchema>;
export type SignedBlobIndexAuthority = z.infer<typeof signedSchema>;
export const BLOB_AUTHORITY_CURRENT = ".amc/keys/blob-index-authorities/current.json";
export const BLOB_CHILD_FILE = ".amc/keys/blob-index-child.amcvault";
export const blobAuthorityArchive = (digest: string) => `.amc/keys/blob-index-authorities/${hex.parse(digest)}.json`;
export const blobAuthorityIssuer = (keyId: string) => `.amc/keys/blob-index-issuers/${hex.parse(keyId)}.pub`;
export const blobAuthorityDigest = (signed: SignedBlobIndexAuthority) => sha256Hex(encodeBlobIndexAuthority(signed));
export const blobAuthoritySigningBytes = (body: BlobIndexAuthority) => Buffer.concat([
  Buffer.from("AMC_BLOB_INDEX_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(authoritySchema.parse(body)), "utf8")]);
export function encodeBlobIndexAuthority(signed: SignedBlobIndexAuthority): Buffer { return Buffer.from(canonicalize(signedSchema.parse(signed)), "utf8"); }
export function parseBlobIndexAuthority(bytes: Buffer): SignedBlobIndexAuthority { return signedSchema.parse(parseCanonicalJson(bytes)); }
function assertBody(authority: BlobIndexAuthority): void {
  const child = canonicalSigningKey(authority.childPublicKeyPem), from = Date.parse(authority.notBefore), to = Date.parse(authority.notAfter);
  if (child?.algorithm !== "ed25519" || child.pem !== authority.childPublicKeyPem || signingKeyId(child.pem) !== authority.childKeyId || authority.childKeyId === authority.issuerKeyId) throw new Error("blob authority child identity invalid");
  if (!(to > from && to - from <= BLOB_AUTHORITY_MAX_HOURS * 3_600_000)) throw new Error("blob authority window invalid");
  if ((authority.epoch === 1) !== (authority.previousAuthoritySha256 === null)) throw new Error("blob authority predecessor invalid");
}
export async function issueBlobIndexAuthority(provider: KeyProvider, issuer: KeyDescription, body: BlobIndexAuthority): Promise<SignedBlobIndexAuthority> {
  const authority = authoritySchema.parse(body); assertBody(authority);
  if (authority.issuerKeyId !== issuer.keyId) throw new Error("blob authority issuer identity invalid");
  return { authority, algorithm: issuer.algorithm, signature: (await signChecked(provider, issuer, blobAuthoritySigningBytes(authority))).toString("base64") };
}
/** Math/format only. Public callers must separately admit the issuer, including grants that have no rows. */
export function verifyBlobIndexAuthority(bytes: Buffer, issuerPublicKeyPem: string): SignedBlobIndexAuthority {
  const signed = parseBlobIndexAuthority(bytes), issuer = canonicalSigningKey(issuerPublicKeyPem); assertBody(signed.authority);
  if (issuer === null || signingKeyId(issuer.pem) !== signed.authority.issuerKeyId || issuer.algorithm !== signed.algorithm
    || !verifyCanonical(issuer.algorithm, blobAuthoritySigningBytes(signed.authority), issuer.pem, Buffer.from(signed.signature, "base64"))) throw new Error("blob authority issuer signature invalid");
  return signed;
}
const childSchema = z.strictObject({ type: z.literal("amc.blob-index-child"), version: z.literal(1), workspaceId: z.string().min(1).max(256),
  epoch: z.number().int().positive().safe(), authoritySha256: hex, privateKeyPem: z.string().min(1).max(4096) });
export function blobChildBytes(signed: SignedBlobIndexAuthority, privateKeyPem: string): Buffer {
  const value = { type: "amc.blob-index-child" as const, version: 1 as const, workspaceId: signed.authority.workspaceId,
    epoch: signed.authority.epoch, authoritySha256: blobAuthorityDigest(signed), privateKeyPem };
  openBlobChild(Buffer.from(canonicalize(value)), signed); return Buffer.from(canonicalize(value));
}
export function openBlobChild(bytes: Buffer, signed: SignedBlobIndexAuthority): KeyObject {
  const child = childSchema.parse(parseCanonicalJson(bytes)), key = createPrivateKey(child.privateKeyPem);
  const privatePem = key.export({ format: "pem", type: "pkcs8" }).toString(), publicPem = createPublicKey(key).export({ format: "pem", type: "spki" }).toString();
  if (key.asymmetricKeyType !== "ed25519" || privatePem !== child.privateKeyPem || publicPem !== signed.authority.childPublicKeyPem
    || signingKeyId(publicPem) !== signed.authority.childKeyId || child.workspaceId !== signed.authority.workspaceId
    || child.epoch !== signed.authority.epoch || child.authoritySha256 !== blobAuthorityDigest(signed)) throw new Error("sealed blob child does not match its authority");
  return key;
}

/** Bound decryption accepts only this existing codec's fixed parameters, before PBKDF2 consumes untrusted fields. */
const b64 = (length: number) => z.string().refine(text => { const bytes = Buffer.from(text, "base64"); return bytes.length === length && bytes.toString("base64") === text; });
export const blobChildEnvelopeSchema = z.strictObject({ v: z.literal(1),
  kdf: z.strictObject({ name: z.literal("pbkdf2-sha256"), iterations: z.literal(210_000), keyLen: z.literal(32), digest: z.literal("sha256"), saltB64: b64(16) }),
  cipher: z.strictObject({ name: z.literal("aes-256-gcm"), ivB64: b64(12), authTagB64: b64(16), ciphertextB64: z.string().min(4).max(16_384)
    .refine(text => Buffer.from(text, "base64").toString("base64") === text) }) });
