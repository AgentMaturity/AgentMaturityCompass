/** Actual local blob-index snapshot. Public admission remains independent of the workspace/keyset. */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { canonicalize, assertNoDuplicateJsonKeys } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { admitKey } from "../trust/admission.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { blobIndexRowSchema, blobIndexSignatureSchema, type BlobIndexRow } from "../storage/blobs/blobSchema.js";
import { boundProviderKey } from "./keyset.js";
import { assertKeyNotRevoked } from "./keyRevocations.js";
import { getPurposeKeyHistory } from "./signingKeys.js";
import { signingKeyId, verifyWithKey } from "./algorithmPolicy.js";
import { BLOB_AUTHORITY_CURRENT, blobAuthorityArchive, blobAuthorityIssuer, verifyBlobIndexAuthority, type SignedBlobIndexAuthority } from "./blobIndexAuthority.js";
export const blobIndexPaths = (workspace: string) => ({ index: join(workspace, ".amc/blobs/index.jsonl"), signature: join(workspace, ".amc/blobs/index.jsonl.sig") });
// The common lock lives in metadata, keeping the existing .amc/blobs payload directory file-only.
export const withBlobIndexLock = <T>(workspace: string, operation: () => T): T => withControlFileLock({ root: join(resolve(workspace), ".amc"), name: "blob-index", operation });
const readOptional = (path: string): Buffer | null => existsSync(path) ? readFileSync(path) : null;
export function snapshotBlobIndex(workspace: string) {
  const paths = blobIndexPaths(workspace), indexBytes = readOptional(paths.index), sidecarBytes = readOptional(paths.signature);
  const rows = (indexBytes?.toString("utf8") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const row = blobIndexRowSchema.parse(JSON.parse(line)); if (row.v === 2) assertNoDuplicateJsonKeys(line); return row; });
  return { indexBytes, sidecarBytes, rows, signature: sidecarBytes === null ? null : blobIndexSignatureSchema.parse(JSON.parse(sidecarBytes.toString("utf8"))) };
}
export type BlobIndexSnapshot = ReturnType<typeof snapshotBlobIndex>;
export function blobRowHash(row: BlobIndexRow): string {
  return sha256Hex(canonicalize({ v: row.v, ts: row.ts, blobId: row.blobId, keyVersion: row.keyVersion, path: row.path,
    payloadSha256: row.payloadSha256, encryptedBytes: row.encryptedBytes, prev: row.prev,
    ...(row.v === 2 ? { authoritySha256: row.authoritySha256 } : {}) }));
}
export function blobPrefix(snapshot: BlobIndexSnapshot) {
  let prev = "";
  for (const row of snapshot.rows) { if (row.prev !== prev || blobRowHash(row) !== row.hash) throw new Error("blob index hash chain invalid"); prev = row.hash; }
  return { count: snapshot.rows.length, head: prev };
}
export function sameBlobSnapshot(a: BlobIndexSnapshot, b: BlobIndexSnapshot): boolean {
  const same = (x: Buffer | null, y: Buffer | null) => x === null ? y === null : y !== null && x.equals(y);
  return same(a.indexBytes, b.indexBytes) && same(a.sidecarBytes, b.sidecarBytes);
}
export interface BlobAuthorityGrant { sha256: string; bytes: Buffer; signed: SignedBlobIndexAuthority; issuerPublicKeyPem: string }
export interface BlobAuthorityState { chain: BlobAuthorityGrant[]; current: BlobAuthorityGrant; binding: NonNullable<ReturnType<typeof boundProviderKey>> }
/** Math/committed state only, internal writer/owner input; never substitutes for public issuer admission. */
export function readBlobAuthorityState(workspace: string): BlobAuthorityState | null {
  const binding = boundProviderKey(workspace, "artifact-seal"), pointer = readContainedOrNull(workspace, BLOB_AUTHORITY_CURRENT, 64 * 1024);
  if (binding === null) { if (pointer !== null) throw new Error("unbound blob authority pointer is present"); return null; }
  const expected = binding.binding.blobIndexAuthoritySha256;
  if (expected === undefined || pointer === null || sha256Hex(pointer) !== expected) throw new Error("artifact provider has no committed blob-index authority");
  const chain: BlobAuthorityGrant[] = [], seen = new Set<string>(); let bytes: Buffer | null = pointer;
  while (bytes !== null) {
    const digest = sha256Hex(bytes); if (seen.has(digest)) throw new Error("blob authority archive cycle"); seen.add(digest);
    const canonical = readContainedOrNull(workspace, blobAuthorityArchive(digest), 64 * 1024);
    if (canonical === null || !canonical.equals(bytes)) throw new Error("blob authority archive missing or changed");
    const parsed = JSON.parse(bytes.toString("utf8")) as { authority?: { issuerKeyId?: unknown } };
    const issuer = typeof parsed.authority?.issuerKeyId === "string" ? readContainedOrNull(workspace, blobAuthorityIssuer(parsed.authority.issuerKeyId), 64 * 1024)?.toString("utf8") : null;
    if (!issuer) throw new Error("blob authority issuer missing");
    const signed = verifyBlobIndexAuthority(bytes, issuer);
    assertKeyNotRevoked(workspace, true, signed.authority.issuerKeyId, "artifact-seal");
    if (signed.authority.workspaceId !== workspaceIdFromDirectory(workspace)) throw new Error("blob authority belongs to another workspace");
    chain.unshift({ sha256: digest, bytes, signed, issuerPublicKeyPem: issuer });
    const previous = signed.authority.previousAuthoritySha256;
    bytes = previous === null ? null : readContainedOrNull(workspace, blobAuthorityArchive(previous), 64 * 1024);
    if (previous !== null && (bytes === null || sha256Hex(bytes) !== previous)) throw new Error("blob authority predecessor missing or changed");
  }
  const children = new Set<string>();
  for (const [index, grant] of chain.entries()) {
    const body = grant.signed.authority, prior = chain[index - 1];
    if (body.epoch !== index + 1 || body.previousAuthoritySha256 !== (prior?.sha256 ?? null)
      || (prior && body.start.count < prior.signed.authority.start.count) || children.has(body.childKeyId)
      || chain.some(other => other.signed.authority.issuerKeyId === body.childKeyId)) throw new Error("blob authority epoch/child sequence invalid");
    children.add(body.childKeyId);
  }
  const current = chain.at(-1)!;
  if (current.sha256 !== expected || current.signed.authority.issuerKeyId !== binding.binding.keyId
    || signingKeyId(binding.publicKeyPem) !== binding.binding.keyId) throw new Error("blob authority is not its committed issuer");
  return { chain, current, binding };
}
export function blobAuthorityAtRow(state: BlobAuthorityState, position: number): BlobAuthorityGrant | null {
  return state.chain.filter(grant => grant.signed.authority.start.count < position).at(-1) ?? null;
}
/** Complete actual prefix, including zero-row epoch starts and the one current head sidecar. */
export function verifyBlobAuthorityIndex(workspace: string, state: BlobAuthorityState, snapshot: BlobIndexSnapshot): void {
  blobPrefix(snapshot);
  for (const grant of state.chain) {
    const start = grant.signed.authority.start;
    if (start.count > snapshot.rows.length || start.head !== (start.count === 0 ? "" : snapshot.rows[start.count - 1]!.hash)) throw new Error("blob authority cutover prefix invalid");
  }
  for (const [index, row] of snapshot.rows.entries()) {
    const grant = blobAuthorityAtRow(state, index + 1);
    if (grant === null) { if (row.v !== 1) throw new Error("blob provider prefix contains an authority row before cutover"); continue; }
    const body = grant.signed.authority;
    if (row.v !== 2 || row.authoritySha256 !== grant.sha256 || row.ts < Date.parse(body.notBefore) || row.ts >= Date.parse(body.notAfter)) throw new Error("blob row authority/time invalid");
  }
  const last = snapshot.rows.at(-1), sig = snapshot.signature;
  if (last === undefined) { if (sig !== null) throw new Error("empty blob index has an orphan signature"); return; }
  if (sig === null || sig.lastHash !== last.hash) throw new Error("blob index head signature missing or changed");
  const grant = blobAuthorityAtRow(state, snapshot.rows.length);
  if (grant === null) {
    if (sig.v !== 1 || !getPurposeKeyHistory(workspace, "artifact-seal").some(pem => verifyWithKey(Buffer.from(last.hash, "hex"), pem, Buffer.from(sig.signature, "base64")))) throw new Error("legacy blob prefix signature invalid");
  } else if (sig.v !== 2 || last.v !== 2 || sig.authoritySha256 !== grant.sha256 || sig.authoritySha256 !== last.authoritySha256
    || sig.ts !== last.ts || !verifyWithKey(Buffer.from(last.hash, "hex"), grant.signed.authority.childPublicKeyPem, Buffer.from(sig.signature, "base64"))) throw new Error("blob child head signature invalid");
}
/** Every boundary, even an empty epoch, needs independent artifact issuer admission. */
export function admitBlobAuthorityIndex(state: BlobAuthorityState, snapshot: BlobIndexSnapshot, trust: TrustContext = loadTrustContext()): void {
  const check = (grant: BlobAuthorityGrant, claimedSignedAt: string | number) => {
    const admission = admitKey({ publicKeyPem: grant.issuerPublicKeyPem, purpose: "artifact-seal", context: trust,
      signature: `blob-index:${grant.sha256}`, claimedSignedAt: typeof claimedSignedAt === "number" ? new Date(claimedSignedAt) : claimedSignedAt });
    if (admission.status !== "admitted") throw new Error(`blob authority issuer ${admission.status}`);
    // The issuer certificate supplies positive authority; an explicit child blacklist can only refuse it.
    const child = admitKey({ publicKeyPem: grant.signed.authority.childPublicKeyPem, purpose: "artifact-seal", context: trust,
      signature: `blob-index-child:${grant.sha256}`, claimedSignedAt: typeof claimedSignedAt === "number" ? new Date(claimedSignedAt) : claimedSignedAt });
    if (child.status === "distrusted" || child.status === "revoked") throw new Error(`blob authority child ${child.status}`);
  };
  for (const grant of state.chain) check(grant, grant.signed.authority.notBefore);
  for (const [index, row] of snapshot.rows.entries()) { const grant = blobAuthorityAtRow(state, index + 1); if (grant) check(grant, row.ts); }
}
