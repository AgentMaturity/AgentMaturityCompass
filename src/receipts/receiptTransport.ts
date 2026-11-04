/** Tagged receipt proof transport. No legacy fallback after a present tag/proof. */
import { sign, type KeyObject } from "node:crypto";
import { z } from "zod";
import { canonicalize, parseCanonicalJson } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalSigningKey, signingKeyId, verifyWithKey } from "../keys/algorithmPolicy.js";
import { assertReceiptTime, encodeReceiptAuthority, parseReceiptAuthority, receiptAuthorityDigest, verifyReceiptAuthority, type SignedReceiptAuthority } from "../keys/receiptAuthority.js";
import { buildReceiptPayload, parseReceiptPayload } from "./receiptPayload.js";
import type { MintReceiptInput } from "./receipt.js";

export const RECEIPT_TRANSPORT_TAG = "amc-receipt-delegated-v1";
const proofSchema = z.strictObject({ version: z.literal(1), authority: z.unknown(), issuerPublicKeyPem: z.string().min(1).max(4096) });
const receiptChildSigningBytes = (sha256: string, payload: Buffer) => {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("receipt authority digest invalid");
  return Buffer.concat([Buffer.from("AMC_LEDGER_RECEIPT_V1\0", "ascii"), Buffer.from(sha256, "hex"), payload]);
};
const decode = (value: string) => { const bytes = Buffer.from(value, "base64url"); if (!value || bytes.toString("base64url") !== value) throw new Error("noncanonical receipt transport encoding"); return bytes; };
export function parseReceiptTransport(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== RECEIPT_TRANSPORT_TAG) throw new Error("invalid delegated receipt format");
  if (parts[2]!.length !== 86 || parts[3]!.length > 21_846) throw new Error("invalid delegated receipt bounds");
  const payloadBytes = decode(parts[1]!), signature = decode(parts[2]!), proofBytes = decode(parts[3]!);
  if (signature.length !== 64 || proofBytes.length > 16_384) throw new Error("invalid delegated receipt bounds");
  const proof = proofSchema.parse(parseCanonicalJson(proofBytes));
  const bytes = Buffer.from(canonicalize(proof.authority)), signed = parseReceiptAuthority(bytes);
  return { payload: parseReceiptPayload(payloadBytes), payloadB64: parts[1]!, signatureB64: parts[2]!, payloadBytes, signature, signed, authorityBytes: bytes, issuerPublicKeyPem: proof.issuerPublicKeyPem };
}
/** Supplied keys are certificate issuer candidates. A carried child or locator PEM never pins itself. */
export function verifyReceiptTransport(token: string, issuerCandidates: readonly string[]) {
  const parsed = parseReceiptTransport(token), body = parsed.signed.authority;
  const issuer = issuerCandidates.find(pem => signingKeyId(pem) === body.issuerKeyId);
  if (issuer === undefined || canonicalSigningKey(issuer)?.pem !== parsed.issuerPublicKeyPem) throw new Error("receipt authority issuer is not a supplied receipt key");
  verifyReceiptAuthority(parsed.authorityBytes, parsed.issuerPublicKeyPem); assertReceiptTime(parsed.signed, parsed.payload.ts);
  if (!verifyWithKey(receiptChildSigningBytes(receiptAuthorityDigest(parsed.signed), parsed.payloadBytes), body.childPublicKeyPem, parsed.signature)) throw new Error("receipt child signature verification failed");
  return parsed;
}
/** Internal caller has already checked current committed authority and holds the actual SQL transaction. */
export function mintDelegatedReceipt(input: Omit<MintReceiptInput, "privateKeyPem">, signed: SignedReceiptAuthority, issuerPublicKeyPem: string, child: KeyObject) {
  const payload = buildReceiptPayload(input), bytes = Buffer.from(canonicalize(payload), "utf8"), digest = receiptAuthorityDigest(signed);
  assertReceiptTime(signed, payload.ts);
  const signature = sign(null, receiptChildSigningBytes(digest, bytes), child);
  if (!verifyWithKey(receiptChildSigningBytes(digest, bytes), signed.authority.childPublicKeyPem, signature)) throw new Error("receipt child response does not verify");
  const proof = Buffer.from(canonicalize({ version: 1, authority: JSON.parse(encodeReceiptAuthority(signed).toString("utf8")), issuerPublicKeyPem }));
  const receipt = `${RECEIPT_TRANSPORT_TAG}.${bytes.toString("base64url")}.${signature.toString("base64url")}.${proof.toString("base64url")}`;
  return { payload, receipt, receiptSha256: sha256Hex(Buffer.from(receipt, "utf8")) };
}
