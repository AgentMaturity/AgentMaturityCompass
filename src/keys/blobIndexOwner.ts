/** Internal artifact/blob owner preparation. Not the normal binder or a root SDK signing facade. */
import { generateKeyPairSync } from "node:crypto";
import { join, resolve } from "node:path";
import { assertOwnerMode } from "../mode/mode.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { canonicalize } from "../utils/json.js";
import { getPurposeKeyHistory } from "./signingKeys.js";
import { signingKeyId, verifyWithKey } from "./algorithmPolicy.js";
import { prepareArtifactBlobOwnerPlan } from "./purposeProviders.js";
import { ArtifactBlobAnchoringError } from "./artifactBlobAnchors.js";
import { assertKeysetComplete, commitKeyset, type KeysetWrite } from "./keyset.js";
import { readReceiptAuthorityState } from "./receiptAuthorityState.js";
import { getBlobIndexChildKey, unlockedPayloadForKeyChange } from "../vault/vault.js";
import { encryptVaultPayload } from "../vault/vaultCrypto.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { requirePreparedBlobMetadata } from "../storage/blobs/blobIndexPublication.js";
import { readBlobKeyMaterial } from "../storage/blobs/blobKeys.js";
import { blobPrefix, readBlobAuthorityState, sameBlobSnapshot, snapshotBlobIndex, verifyBlobAuthorityIndex, withBlobIndexLock } from "./blobIndexState.js";
import { BLOB_AUTHORITY_CURRENT, BLOB_CHILD_FILE, BLOB_AUTHORITY_MAX_HOURS, blobAuthorityArchive, blobAuthorityDigest, blobAuthorityIssuer,
  blobChildBytes, encodeBlobIndexAuthority, issueBlobIndexAuthority } from "./blobIndexAuthority.js";

export class BlobAuthorityCommittedError extends Error {
  readonly committed = true;
  constructor(readonly generation: number, readonly phase: "child-open" | "anchor", cause: unknown) {
    super("blob-index authority committed but finalization did not complete; inspect the committed generation before retrying", { cause }); this.name = "BlobAuthorityCommittedError";
  }
}
type BlobOwnerOptions = Omit<NonNullable<Parameters<typeof prepareArtifactBlobOwnerPlan>[1]>, "delegation"> & { hours?: number };
/** Internal owner integration; depends on the separately reviewed fixed artifact-owner anchor module. */
export async function prepareBlobIndexAuthorityOwner(workspace: string, opts: BlobOwnerOptions = {}) {
  const root = resolve(workspace); assertOwnerMode(root, "keys rotate");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("blob authority is unavailable in no-sign mode");
  const { hours = BLOB_AUTHORITY_MAX_HOURS, ...ownerOptions } = opts;
  if (!(Number.isFinite(hours) && hours > 0 && hours <= BLOB_AUTHORITY_MAX_HOURS)) throw new Error("blob authority needs 0 < hours <= 24");
  const passphrase = ownerOptions.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("blob authority preparation requires the vault passphrase");
  unlockedPayloadForKeyChange(root, passphrase);
  const prior = readBlobAuthorityState(root), snapshot = snapshotBlobIndex(root), start = blobPrefix(snapshot), metadata = requirePreparedBlobMetadata(root);
  const encryptionKey = readBlobKeyMaterial(root, metadata.metadata.keyVersion); // fail before provider requests if encryption prerequisites are unavailable
  if (prior !== null) verifyBlobAuthorityIndex(root, prior, snapshot);
  else {
    if (snapshot.rows.some(row => row.v !== 1)) throw new Error("unbound blob prefix contains a provider row");
    const sig = snapshot.signature;
    if (start.count === 0 ? sig !== null : sig === null || sig.v !== 1 || sig.lastHash !== start.head
      || !getPurposeKeyHistory(root, "artifact-seal").some(pem => verifyWithKey(Buffer.from(start.head, "hex"), pem, Buffer.from(sig.signature, "base64")))) {
      throw new Error("blob prefix is not authenticated by exact artifact purpose; imported role-only migration is unsupported");
    }
  }
  const child = generateKeyPairSync("ed25519"), childPublicKeyPem = child.publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPem = child.privateKey.export({ format: "pem", type: "pkcs8" }).toString(), childKeyId = signingKeyId(childPublicKeyPem)!;
  const plan = await prepareArtifactBlobOwnerPlan(root, ownerOptions);
  if (prior?.chain.some(grant => grant.signed.authority.childKeyId === plan.description.keyId))
    throw new Error("a prior blob operation child cannot become the artifact provider issuer");
  const receipt = readReceiptAuthorityState(root);
  if (canonicalize(assertKeysetComplete(root)) !== canonicalize(plan.keyset)) throw new Error("the captured owner generation changed before blob certificate preparation");
  if (receipt?.chain.some(grant => grant.signed.authority.childKeyId === plan.description.keyId))
    throw new Error("a receipt operation child cannot become the artifact provider issuer");
  const used = [...Object.values(plan.keyset.keys), ...Object.values(plan.keyset.providers ?? {}).map(binding => binding!.keyId),
    ...(prior?.chain.flatMap(grant => [grant.signed.authority.childKeyId, grant.signed.authority.issuerKeyId]) ?? []),
    ...(receipt?.chain.flatMap(grant => [grant.signed.authority.childKeyId, grant.signed.authority.issuerKeyId]) ?? []), plan.description.keyId];
  if (used.includes(childKeyId)) throw new Error("blob child is not a fresh distinct operation key");
  const signed = await issueBlobIndexAuthority(plan.provider, plan.description, { type: "amc.blob-index-authority", version: 1,
    workspaceId: workspaceIdFromDirectory(root), purpose: "artifact-seal", operation: "blob-index", epoch: (prior?.current.signed.authority.epoch ?? 0) + 1,
    previousAuthoritySha256: prior?.current.sha256 ?? null, start, childKeyId, childPublicKeyPem, issuerKeyId: plan.description.keyId,
    notBefore: plan.now.toISOString(), notAfter: new Date(plan.now.getTime() + hours * 3_600_000).toISOString() });
  const bytes = encodeBlobIndexAuthority(signed), digest = blobAuthorityDigest(signed);
  const sealed = JSON.stringify(encryptVaultPayload(blobChildBytes(signed, privateKeyPem), passphrase), null, 2);
  const fixed = (path: string, value: string | Buffer, mode = 0o644): KeysetWrite => ({ path: join(root, path), bytes: value, mode });
  const immutable = [fixed(blobAuthorityArchive(digest), bytes), fixed(blobAuthorityIssuer(plan.description.keyId), plan.description.publicKeyPem)];
  const immutablePreimages = immutable.map(write => {
    const current = readContainedOrNull(root, write.path.slice(root.length + 1), 64 * 1024);
    if (current !== null && !current.equals(Buffer.from(write.bytes))) throw new Error("immutable blob authority/issuer path already names different bytes");
    return current;
  });
  const writes = [fixed(".amc/keys/artifact-seal-provider.pub", plan.description.publicKeyPem), ...immutable,
    fixed(BLOB_AUTHORITY_CURRENT, bytes), fixed(BLOB_CHILD_FILE, sealed, 0o600), ...plan.historyWrites, ...plan.rotationWrites];
  const committed = plan.locked(() => withBlobIndexLock(root, () => plan.withAnchorBoundary(() => {
    plan.recheck();
    const current = readBlobAuthorityState(root), currentMetadata = requirePreparedBlobMetadata(root), now = Date.now();
    if ((current?.current.sha256 ?? null) !== (prior?.current.sha256 ?? null) || !sameBlobSnapshot(snapshot, snapshotBlobIndex(root))
      || !metadata.body.equals(currentMetadata.body) || !metadata.sidecar.equals(currentMetadata.sidecar)) throw new Error("blob authority cutover input changed while signing was prepared; retry");
    if (!readBlobKeyMaterial(root, metadata.metadata.keyVersion).equals(encryptionKey)) throw new Error("blob encryption key changed while authority was prepared; retry");
    for (const [index, write] of immutable.entries()) {
      const currentBytes = readContainedOrNull(root, write.path.slice(root.length + 1), 64 * 1024), expected = immutablePreimages[index]!;
      if (expected === null ? currentBytes !== null : currentBytes === null || !currentBytes.equals(expected)) throw new Error("immutable blob authority path changed while publication was prepared; retry");
    }
    if (now < Date.parse(signed.authority.notBefore) || now >= Date.parse(signed.authority.notAfter)) throw new Error("prepared blob authority is outside its final publication window");
    return commitKeyset(root, { expectedGeneration: plan.keyset.generation, keys: plan.keyset.keys, writes, statements: plan.rotationDigests,
      providers: { ...plan.keyset.providers, "artifact-seal": { ...plan.binding, blobIndexAuthoritySha256: digest } } });
  })));
  // Warm the actual fixed child outside every lock; hot append never performs remote Sign or a renewal.
  try { getBlobIndexChildKey(root); } catch (cause) { throw new BlobAuthorityCommittedError(committed.generation, "child-open", cause); }
  // No lock is retained here. Actual new-holder transparency signing happens only after the generation is committed.
  try { await plan.anchor({ generation: committed.generation, keyset: committed }); } catch (cause) {
    if (cause instanceof ArtifactBlobAnchoringError) throw cause; // retain exact phase, completed targets, entry hash, pending state and native cause
    throw new BlobAuthorityCommittedError(committed.generation, "anchor", cause);
  }
  return { generation: committed.generation, authoritySha256: digest, childKeyId, issuerKeyId: plan.description.keyId,
    epoch: signed.authority.epoch, notBefore: signed.authority.notBefore, notAfter: signed.authority.notAfter };
}
