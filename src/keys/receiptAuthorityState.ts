/** Committed receipt authority. Reading math never admits a workspace key to a public trust context. */
import { join, resolve } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { admitKey } from "../trust/admission.js";
import type { TrustContext } from "../trust/trustContext.js";
import { assertKeysetComplete, boundProviderKey, keysetFileRel } from "./keyset.js";
import { RECEIPT_AUTHORITY_CURRENT, receiptAuthorityArchive, receiptAuthorityIssuer, RECEIPT_STREAMS, verifyReceiptAuthority, type SignedReceiptAuthority, type ReceiptStream } from "./receiptAuthority.js";
export const withReceiptAuthorityLock = <T>(workspace: string, operation: () => T): T => withControlFileLock({ root: join(resolve(workspace), ".amc"), name: "receipt-authority", operation });
export interface ReceiptAuthorityGrant { sha256: string; bytes: Buffer; signed: SignedReceiptAuthority; issuerPublicKeyPem: string }
export interface ReceiptAuthorityState { chain: ReceiptAuthorityGrant[]; current: ReceiptAuthorityGrant; binding: NonNullable<ReturnType<typeof boundProviderKey>> }
export function readReceiptAuthorityState(workspace: string): ReceiptAuthorityState | null {
  const binding = boundProviderKey(workspace, "receipt"), pointer = readContainedOrNull(workspace, RECEIPT_AUTHORITY_CURRENT, 64 * 1024);
  if (binding === null) { if (pointer !== null) throw new Error("unbound receipt authority pointer is present"); return null; }
  const keyset = assertKeysetComplete(workspace)!, expected = binding.binding.receiptAuthoritySha256;
  if (expected === undefined || pointer === null || sha256Hex(pointer) !== expected) throw new Error("receipt provider has no committed token authority");
  const pinned = (path: string): Buffer => {
    const bytes = readContainedOrNull(workspace, path, 64 * 1024), rel = path.slice(".amc/".length); keysetFileRel(rel);
    if (bytes === null || keyset.files[rel] !== sha256Hex(bytes)) throw new Error("receipt authority archive is missing or unpinned"); return bytes;
  };
  const reversed: ReceiptAuthorityGrant[] = [], seen = new Set<string>(); let bytes = pointer;
  for (;;) {
    const sha256 = sha256Hex(bytes); if (seen.has(sha256)) throw new Error("receipt authority archive cycle"); seen.add(sha256);
    if (!pinned(receiptAuthorityArchive(sha256)).equals(bytes)) throw new Error("receipt authority archive changed");
    const raw = JSON.parse(bytes.toString("utf8")) as { authority?: { issuerKeyId?: unknown } };
    const id = raw.authority?.issuerKeyId;
    if (typeof id !== "string") throw new Error("receipt authority issuer missing");
    const issuerPublicKeyPem = pinned(receiptAuthorityIssuer(id)).toString("utf8"), signed = verifyReceiptAuthority(bytes, issuerPublicKeyPem);
    if (signed.authority.workspaceId !== workspaceIdFromDirectory(workspace)) throw new Error("receipt authority belongs to another workspace");
    reversed.push({ sha256, bytes, signed, issuerPublicKeyPem });
    if (signed.authority.previousAuthoritySha256 === null) break;
    bytes = pinned(receiptAuthorityArchive(signed.authority.previousAuthoritySha256));
    if (sha256Hex(bytes) !== signed.authority.previousAuthoritySha256) throw new Error("receipt authority predecessor changed");
  }
  const chain = reversed.reverse(), children = new Set<string>();
  for (const [index, grant] of chain.entries()) {
    const body = grant.signed.authority, prior = chain[index - 1];
    if (body.epoch !== index + 1 || body.previousAuthoritySha256 !== (prior?.sha256 ?? null) || children.has(body.childKeyId)
      || chain.some(row => row.signed.authority.issuerKeyId === body.childKeyId)) throw new Error("receipt authority epoch or child sequence invalid");
    for (const stream of RECEIPT_STREAMS) if (prior && body.starts[stream].count < prior.signed.authority.starts[stream].count) throw new Error("receipt cutover moved backwards");
    children.add(body.childKeyId);
  }
  const current = chain.at(-1)!;
  if (current.sha256 !== expected || current.signed.authority.issuerKeyId !== binding.binding.keyId || current.issuerPublicKeyPem !== binding.publicKeyPem) throw new Error("receipt authority is not its committed issuer");
  return { chain, current, binding };
}
export const receiptAuthorityAt = (state: ReceiptAuthorityState, stream: ReceiptStream, position: number) => state.chain.filter(grant => grant.signed.authority.starts[stream].count < position).at(-1) ?? null;
/** Child is never independently admitted; only explicit negative decisions apply to it. */
export function admitReceiptGrant(grant: ReceiptAuthorityGrant, trust: TrustContext, claimedAt: number | string): void {
  const claimedSignedAt = typeof claimedAt === "number" ? new Date(claimedAt) : claimedAt;
  const issuer = admitKey({ publicKeyPem: grant.issuerPublicKeyPem, purpose: "receipt", context: trust, claimedSignedAt, signature: `receipt-authority:${grant.sha256}` });
  if (issuer.status !== "admitted") throw new Error(`receipt authority issuer ${issuer.status}`);
  const child = admitKey({ publicKeyPem: grant.signed.authority.childPublicKeyPem, purpose: "receipt", context: trust, claimedSignedAt, signature: `receipt-child:${grant.sha256}` });
  if (child.status === "distrusted" || child.status === "revoked") throw new Error(`receipt authority child ${child.status}`);
}
