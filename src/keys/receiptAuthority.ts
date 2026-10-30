/** Receipt-token authority only. Neither a raw digest signer nor a ledger/blob delegation. */
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonicalize, isCanonicalSignatureBase64, isExactIsoTime, parseCanonicalJson } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalSigningKey, SIGNING_ALGORITHMS, signingKeyId, verifyCanonical } from "./algorithmPolicy.js";
import { signChecked, type KeyDescription, type KeyProvider } from "./provider.js";

export const RECEIPT_AUTHORITY_MAX_HOURS = 24;
export const RECEIPT_AUTHORITY_CURRENT = ".amc/keys/receipt-authorities/current.json";
export const RECEIPT_CHILD_FILE = ".amc/keys/receipt-child.amcvault";
export const RECEIPT_AUTHORITY_META = "amcReceiptAuthority";
export const RECEIPT_STREAMS = ["sqlite-evidence", "sqlite-outcome"] as const;
export type ReceiptStream = typeof RECEIPT_STREAMS[number];
const hex = z.string().regex(/^[0-9a-f]{64}$/), time = z.iso.datetime().refine(isExactIsoTime);
const prefix = (genesis: string) => z.strictObject({ count: z.number().int().nonnegative().safe(), head: z.union([hex, z.literal(genesis)]) })
  .refine(value => value.count === 0 ? value.head === genesis : value.head !== genesis);
const bodySchema = z.strictObject({ type: z.literal("amc.receipt-authority"), version: z.literal(1), workspaceId: z.string().min(1).max(256),
  purpose: z.literal("receipt"), operation: z.literal("ledger-receipt-token"), epoch: z.number().int().positive().safe(), previousAuthoritySha256: hex.nullable(),
  starts: z.strictObject({ "sqlite-evidence": prefix("GENESIS"), "sqlite-outcome": prefix("GENESIS_OUTCOME") }),
  childKeyId: hex, childPublicKeyPem: z.string().min(1).max(4096), issuerKeyId: hex, notBefore: time, notAfter: time });
const signedSchema = z.strictObject({ authority: bodySchema, algorithm: z.enum(SIGNING_ALGORITHMS), signature: z.string().refine(isCanonicalSignatureBase64) });
export const receiptAuthorityMarkerSchema = z.strictObject({ sha256: hex, epoch: z.number().int().positive().safe() });
export type ReceiptAuthority = z.infer<typeof bodySchema>;
export type SignedReceiptAuthority = z.infer<typeof signedSchema>;
export const receiptAuthorityArchive = (digest: string) => `.amc/keys/receipt-authorities/${hex.parse(digest)}.json`;
export const receiptAuthorityIssuer = (keyId: string) => `.amc/keys/receipt-issuers/${hex.parse(keyId)}.pub`;
export const encodeReceiptAuthority = (signed: SignedReceiptAuthority) => Buffer.from(canonicalize(signedSchema.parse(signed)), "utf8");
export const receiptAuthorityDigest = (signed: SignedReceiptAuthority) => sha256Hex(encodeReceiptAuthority(signed));
export const parseReceiptAuthority = (bytes: Buffer) => signedSchema.parse(parseCanonicalJson(bytes));
export const receiptAuthoritySigningBytes = (body: ReceiptAuthority) => Buffer.concat([Buffer.from("AMC_RECEIPT_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(bodySchema.parse(body)), "utf8")]);
function bodyValid(body: ReceiptAuthority): void {
  const child = canonicalSigningKey(body.childPublicKeyPem), from = Date.parse(body.notBefore), to = Date.parse(body.notAfter);
  if (child?.algorithm !== "ed25519" || child.pem !== body.childPublicKeyPem || signingKeyId(child.pem) !== body.childKeyId || body.childKeyId === body.issuerKeyId) throw new Error("receipt authority child identity invalid");
  if (!(to > from && to - from <= RECEIPT_AUTHORITY_MAX_HOURS * 3_600_000) || (body.epoch === 1) !== (body.previousAuthoritySha256 === null)) throw new Error("receipt authority window or predecessor invalid");
  if (receiptAuthoritySigningBytes(body).length > 4096) throw new Error("receipt authority exceeds its fixed signing bound");
}
export async function issueReceiptAuthority(provider: KeyProvider, issuer: KeyDescription, input: ReceiptAuthority): Promise<SignedReceiptAuthority> {
  const authority = bodySchema.parse(input); bodyValid(authority);
  if (authority.issuerKeyId !== issuer.keyId) throw new Error("receipt authority issuer identity invalid");
  return { authority, algorithm: issuer.algorithm, signature: (await signChecked(provider, issuer, receiptAuthoritySigningBytes(authority))).toString("base64") };
}
/** Format and math only; public admission is a separate caller-owned decision. */
export function verifyReceiptAuthority(bytes: Buffer, issuerPem: string): SignedReceiptAuthority {
  const signed = parseReceiptAuthority(bytes), issuer = canonicalSigningKey(issuerPem); bodyValid(signed.authority);
  if (issuer === null || issuer.pem !== issuerPem || signingKeyId(issuerPem) !== signed.authority.issuerKeyId || issuer.algorithm !== signed.algorithm
    || !verifyCanonical(issuer.algorithm, receiptAuthoritySigningBytes(signed.authority), issuerPem, Buffer.from(signed.signature, "base64"))) throw new Error("receipt authority issuer signature invalid");
  return signed;
}
export function assertReceiptTime(signed: SignedReceiptAuthority, ts: number): void {
  if (!Number.isFinite(ts) || ts < Date.parse(signed.authority.notBefore) || ts >= Date.parse(signed.authority.notAfter)) throw new Error("receipt authority is outside its half-open window");
}
const childSchema = z.strictObject({ type: z.literal("amc.receipt-child"), version: z.literal(1), workspaceId: z.string().min(1).max(256), epoch: z.number().int().positive().safe(), authoritySha256: hex, privateKeyPem: z.string().min(1).max(4096) });
export function receiptChildBytes(signed: SignedReceiptAuthority, privateKeyPem: string): Buffer {
  const bytes = Buffer.from(canonicalize({ type: "amc.receipt-child", version: 1, workspaceId: signed.authority.workspaceId, epoch: signed.authority.epoch, authoritySha256: receiptAuthorityDigest(signed), privateKeyPem }));
  openReceiptChild(bytes, signed); return bytes;
}
export function openReceiptChild(bytes: Buffer, signed: SignedReceiptAuthority): KeyObject {
  const child = childSchema.parse(parseCanonicalJson(bytes)), key = createPrivateKey(child.privateKeyPem), pem = createPublicKey(key).export({ format: "pem", type: "spki" }).toString();
  if (key.asymmetricKeyType !== "ed25519" || key.export({ format: "pem", type: "pkcs8" }).toString() !== child.privateKeyPem || pem !== signed.authority.childPublicKeyPem
    || child.workspaceId !== signed.authority.workspaceId || child.epoch !== signed.authority.epoch || child.authoritySha256 !== receiptAuthorityDigest(signed)) throw new Error("sealed receipt child does not match its authority");
  return key;
}
const b64 = (size: number) => z.string().refine(text => { const b = Buffer.from(text, "base64"); return b.length === size && b.toString("base64") === text; });
export const receiptChildEnvelopeSchema = z.strictObject({ v: z.literal(1),
  kdf: z.strictObject({ name: z.literal("pbkdf2-sha256"), iterations: z.literal(210_000), keyLen: z.literal(32), digest: z.literal("sha256"), saltB64: b64(16) }),
  cipher: z.strictObject({ name: z.literal("aes-256-gcm"), ivB64: b64(12), authTagB64: b64(16), ciphertextB64: z.string().min(4).max(16_384).refine(text => Buffer.from(text, "base64").toString("base64") === text) }) });
