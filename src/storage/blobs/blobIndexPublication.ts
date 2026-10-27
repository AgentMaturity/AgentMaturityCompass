/** Blob-only local publication. Provider Sign never occurs in this module or its short final lock. */
import { sign } from "node:crypto";
import { resolve } from "node:path";
import { canonicalize } from "../../utils/json.js";
import { readContainedOrNull } from "../../utils/containedFs.js";
import { sha256Hex } from "../../utils/hash.js";
import { keyPolicy, loadKeysConfig } from "../../keys/keysConfig.js";
import { checkedDescription } from "../../keys/provider.js";
import { assertKeysetComplete } from "../../keys/keyset.js";
import { assertKeyUsableNow, assertSigningKeyUsable, getPurposeKeyHistory } from "../../keys/signingKeys.js";
import { getBlobIndexChildKey } from "../../vault/vault.js";
import { verifyWithKey } from "../../keys/algorithmPolicy.js";
import { blobPrefix, blobRowHash, readBlobAuthorityState, snapshotBlobIndex, verifyBlobAuthorityIndex, type BlobAuthorityState } from "../../keys/blobIndexState.js";
import { blobKeyCurrentSchema, blobKeyCurrentSigSchema, blobIndexRowSchema, blobIndexSignatureSchema, type BlobIndexRow } from "./blobSchema.js";
import { readBlobKeyMaterial } from "./blobKeys.js";

/** Same-read exact config-purpose prerequisite; rare metadata authoring is a separate async startup stage. */
export function requirePreparedBlobMetadata(workspace: string) {
  const body = readContainedOrNull(workspace, ".amc/blob-keys/current.json", 64 * 1024), sidecar = readContainedOrNull(workspace, ".amc/blob-keys/current.json.sig", 64 * 1024);
  if (body === null || sidecar === null) throw new Error("signed blob-key metadata must be prepared before a provider-bound store is opened");
  const metadata = blobKeyCurrentSchema.parse(JSON.parse(body.toString("utf8"))), signature = blobKeyCurrentSigSchema.parse(JSON.parse(sidecar.toString("utf8")));
  if (metadata.keyVersion === 0 || signature.digestSha256 !== sha256Hex(body) || !getPurposeKeyHistory(workspace, "config-signature")
    .some(pem => verifyWithKey(Buffer.from(signature.digestSha256, "hex"), pem, Buffer.from(signature.signature, "base64")))) throw new Error("blob-key metadata is not authenticated for config-signature");
  return { metadata, body, sidecar };
}
function currentAuthority(workspace: string, state: BlobAuthorityState): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("provider-bound blobs are unavailable in no-sign mode");
  const binding = state.binding.binding, body = state.current.signed.authority, now = Date.now();
  checkedDescription({ ref: { provider: binding.provider, id: binding.id, ...(binding.version === undefined ? {} : { version: binding.version }) },
    algorithm: binding.algorithm, publicKeyPem: state.binding.publicKeyPem, keyId: binding.keyId, protection: binding.protection,
    protectionBasis: binding.protectionBasis, exportable: false }, keyPolicy(loadKeysConfig(workspace)));
  assertSigningKeyUsable(workspace, "artifact-seal", state.binding.publicKeyPem, binding.provider);
  assertKeyUsableNow(workspace, "artifact-seal", body.childKeyId, binding.provider);
  if (now < Date.parse(body.notBefore) || now >= Date.parse(body.notAfter)) throw new Error("blob-index authority expired or not yet valid; prepare a current child before writing");
}
export interface PreparedBlobAppend {
  workspace: string; state: BlobAuthorityState; keyset: string; config: string;
  metadata: ReturnType<typeof requirePreparedBlobMetadata>;
}
export function prepareBlobAppend(workspace: string): PreparedBlobAppend | null {
  const root = resolve(workspace), state = readBlobAuthorityState(root); if (state === null) return null;
  currentAuthority(root, state);
  const metadata = requirePreparedBlobMetadata(root); getBlobIndexChildKey(root); // warm outside the publication lock
  const keyset = canonicalize(assertKeysetComplete(root));
  return { workspace: root, state, metadata, keyset, config: canonicalize(loadKeysConfig(root)) };
}
/** Called only under the shared blob-index lock, before payload/index/sidecar writes. No initialization or remote I/O. */
export function finishBlobAppend(plan: PreparedBlobAppend, row: Omit<BlobIndexRow, "v" | "prev" | "hash">, encryptionKey: Buffer) {
  const current = readBlobAuthorityState(plan.workspace);
  if (current === null || current.current.sha256 !== plan.state.current.sha256 || canonicalize(current.binding.binding) !== canonicalize(plan.state.binding.binding)
    || canonicalize(assertKeysetComplete(plan.workspace)) !== plan.keyset || canonicalize(loadKeysConfig(plan.workspace)) !== plan.config) throw new Error("blob-index authority changed while write was prepared; retry");
  currentAuthority(plan.workspace, current);
  // Local signing occurs under the common lock: chain to the actual current valid head, including another legitimate append.
  const snapshot = snapshotBlobIndex(plan.workspace); verifyBlobAuthorityIndex(plan.workspace, current, snapshot);
  const metadata = requirePreparedBlobMetadata(plan.workspace);
  if (!metadata.body.equals(plan.metadata.body) || !metadata.sidecar.equals(plan.metadata.sidecar)) throw new Error("blob-key metadata changed while write was prepared; retry");
  const child = getBlobIndexChildKey(plan.workspace); // rechecks the live vault/session and committed ciphertext, including cached keys
  if (!readBlobKeyMaterial(plan.workspace, row.keyVersion).equals(encryptionKey)) throw new Error("blob encryption key changed while write was prepared; retry");
  const unsigned = { v: 2 as const, ...row, prev: blobPrefix(snapshot).head, authoritySha256: current.current.sha256 };
  const full = blobIndexRowSchema.parse({ ...unsigned, hash: blobRowHash({ ...unsigned, hash: "0".repeat(64) }) });
  const signature = blobIndexSignatureSchema.parse({ v: 2, ts: full.ts, lastHash: full.hash,
    signature: sign(null, Buffer.from(full.hash, "hex"), child).toString("base64"), signer: "auditor", authoritySha256: current.current.sha256 });
  return { row: full, signature, indexBytes: snapshot.indexBytes };
}
export class BlobPublicationIncompleteError extends Error {
  readonly published: readonly string[];
  constructor(published: readonly string[], cause: unknown) {
    super("blob publication incomplete; inspect the published payload/index before retrying", { cause }); this.name = "BlobPublicationIncompleteError"; this.published = [...published];
  }
}
