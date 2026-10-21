/**
 * Purpose keys held by key providers (P2-08). `keys.refs.<purpose>` in amc.config.yaml names a provider key;
 * `amc keys rotate --purpose <p>` binds it (owner mode, vault passphrase, and a config whose signature verifies): the
 * provider proves possession, then one key-set generation records the binding (provider, ref, key id) and pins
 * `keys/<purpose>-provider.pub`, under the same anti-rollback marks as every P1-08 key set. Signing then reaches the key
 * by the ref the key set records; the editable config never picks a key, it can only make a signer refuse.
 *
 * From then on the purpose signs only through the provider (signWithPurposeKey). getSigningKey refuses it with
 * KEY_PROVIDER_HELD: the vault never stands in, whether the provider is down, the config changed or the binding was
 * rolled back. The ledger-row purpose is the exception for its hot path: the vault's ledger-row key keeps signing rows
 * as a delegate, while the provider key signs a delegation for it of at most 24 hours (renewed by the same command).
 */
import { join } from "node:path";
import { assertOwnerMode } from "../mode/mode.js";
import { publicKeyFromPrivate, sealKeyHistory } from "../crypto/keyHistoryEnvelope.js";
import { buildKeyHistoryEntry } from "../crypto/keyHistoryChain.js";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { getVaultPurposeKeyPem, markWrittenHistories, purposeKeyPaths, unlockedPayloadForKeyChange, vaultPaths, vaultStatus } from "../vault/vault.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import { signingKeyId, verifyWithKey, type SigningAlgorithm } from "./algorithmPolicy.js";
import { encodeDelegation, issueDelegation, MAX_DELEGATION_HOURS } from "./delegation.js";
import { assertKeysetComplete, boundProviderKey, commitKeyset, keysetIdentity, type ProviderBinding, type Keyset } from "./keyset.js";
import { CONFIG_REL, configuredRef, keyPolicy, loadKeysConfig, parseKeysSection, type KeysConfig } from "./keysConfig.js";
import { attempt, checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider, type KeyProviderId, type KeyRef } from "./provider.js";
import { awsKmsProvider } from "./providers/awsKms.js";
import { azureKeyVaultProvider } from "./providers/azureKeyVault.js";
import { fileKeyProvider } from "./providers/file.js";
import { gcpKmsProvider } from "./providers/gcpKms.js";
import { pkcs11Provider } from "./providers/pkcs11.js";
import { popBytes, prepareProviderPurposeRotation, prepareArtifactBlobPurposeRotation, prepareReceiptPurposeRotation, assertProviderPurposeRotationCurrent, anchorProviderPurposeRotation } from "./purposeKeys.js";
import type { RotationReason } from "./rotationStatement.js";
import { keyRevocationLocation } from "./keyRevocations.js";
import { encodeSignedRevocationList, readAnchoredRevocationList, readStagedRevocationList } from "./revocationList.js";
import { revocationListSigningBytes, signRevocationListWithProvider, type RevocationListV1, type SignedRevocationList } from "./revocationList.js";
import { assertKeyUsableNow, assertLocal, assertSigningKeyUsable, DELEGATION_REL, getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem, readHistory } from "./signingKeys.js";
import { logHistoryRevisions, preflightHistoryLog } from "./anchors.js";
import { captureArtifactBlobAnchorBoundary, type ArtifactBlobAnchorBoundary } from "./artifactBlobAnchors.js";
import { captureReceiptOwnerBoundary, type ReceiptOwnerBoundary } from "./receiptOwnerAnchors.js";
import { captureDelegationScope, publishDelegationBoundary } from "./delegationBoundary.js";
import { readOperationalDelegationState, delegationArchiveRel, delegationIssuerRel } from "./operationalDelegationState.js";

/**
 * Ledger rows use a vault delegate; session runtime uses the async purpose signer. Session history is signed by the
 * unchanged vault session anchor and admits only session issuers. Other purposes retain their current refusal until
 * their actual synchronous callers migrate; artifact-seal still has hot-path consumers outside this scoped blob-index stage.
 */
const BINDABLE_PURPOSES: readonly LocalPurpose[] = ["ledger-row", "session"];

// ponytail: one fixed row cap per 24-hour delegation; make it a keys setting when a deployment's event rate needs another.
const LEDGER_DELEGATION_MAX_EVENTS = 1_000_000;

const FACTORIES: Record<KeyProviderId, (workspace: string) => KeyProvider> = {
  file: fileKeyProvider, "aws-kms": () => awsKmsProvider(), "gcp-kms": () => gcpKmsProvider(), "azure-kv": () => azureKeyVaultProvider(), pkcs11: () => pkcs11Provider()
};
const instances = new Map<string, KeyProvider>();

/** One provider instance per process (per workspace for the vault), so key descriptions are fetched once. */
export function loadKeyProvider(workspace: string, id: KeyProviderId): KeyProvider {
  const key = id === "file" ? `file:${workspace}` : id;
  const provider = instances.get(key) ?? FACTORIES[id](workspace);
  instances.set(key, provider);
  return provider;
}

const SIG_REL = `${CONFIG_REL}.sig`;

/**
 * The keys section of an amc.config.yaml whose signature (`amc verify --sign-config`) verifies under the config-signature
 * key history, from one read: the bytes verified are the bytes parsed. Picking a provider key needs this; an unsigned or
 * changed config only refuses.
 */
function signedKeysConfig(workspace: string, provider: KeyProviderId): KeysConfig {
  const bytes = readContainedOrNull(workspace, CONFIG_REL, 1024 * 1024);
  const sig = readContainedOrNull(workspace, SIG_REL, 64 * 1024);
  let verified = false;
  if (bytes !== null && sig !== null) {
    try {
      const record = JSON.parse(sig.toString("utf8")) as { configSha256?: unknown; signature?: unknown };
      const digest = sha256Hex(bytes);
      verified = record.configSha256 === digest && typeof record.signature === "string"
        && getPurposeKeyHistory(workspace, "config-signature").some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(record.signature as string, "base64")));
    } catch { /* an unreadable signature verifies nothing */ }
  }
  if (!verified) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", provider, "a provider key is picked only from an amc.config.yaml whose signature verifies; sign it with amc verify --sign-config");
  return parseKeysSection(bytes);
}

/** How to reach a bound key: the ref recorded in the key set when it was bound. */
function boundRef(binding: ProviderBinding): KeyRef {
  return { provider: binding.provider, id: binding.id, ...(binding.version === undefined ? {} : { version: binding.version }) };
}
const sameRef = (a: KeyRef, b: KeyRef) => a.provider === b.provider && a.id === b.id && a.version === b.version;

function pinnedDescription(value: KeyDescription, config: KeysConfig): KeyDescription {
  return Object.freeze(checkedDescription({ ...value, ref: Object.freeze({ ...value.ref }) }, keyPolicy(config)));
}

/** Exact mutable owner inputs. Validation reads the anchored list and any in-flight list before comparing their bytes. */
function providerBindingPreparationState(workspace: string): string {
  const location = keyRevocationLocation(workspace), list = readAnchoredRevocationList(location), pending = readStagedRevocationList(location);
  if (list === null) throw new Error("the workspace key revocation list is missing; restore it before binding");
  const digest = (bytes: Buffer | null) => bytes === null ? null : sha256Hex(bytes);
  return canonicalize({ keyset: keysetIdentity(workspace), vault: digest(readContainedOrNull(workspace, ".amc/vault.amcvault", 256 * 1024 * 1024)), revocations: digest(encodeSignedRevocationList(list)),
    pendingRevocations: pending === null ? null : digest(encodeSignedRevocationList(pending)),
    config: digest(readContainedOrNull(workspace, CONFIG_REL, 1024 * 1024)), signature: digest(readContainedOrNull(workspace, SIG_REL, 64 * 1024)) });
}

/** No remote work: authorize the same captured key/ref against the current committed state and policy. */
function assertPurposeSignerCurrent(workspace: string, purpose: LocalPurpose, description: KeyDescription, expected: KeyRef | null): void {
  checkedDescription(description, keyPolicy(loadKeysConfig(workspace)));
  const current = boundProviderKey(workspace, purpose);
  if (expected === null) {
    if (current !== null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the purpose became provider-held while signing");
    // The normal vault gate preserves lock/revocation error identity and refuses a newly configured provider.
    if (publicKeyFromPrivate(getSigningKey(workspace, purpose)) !== description.publicKeyPem) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the vault purpose key changed while signing");
    }
    return;
  }
  if (current === null || !sameRef(boundRef(current.binding), expected) || current.binding.keyId !== description.keyId
    || current.binding.algorithm !== description.algorithm || current.publicKeyPem !== description.publicKeyPem) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", expected.provider, "the committed purpose key or ref changed while signing");
  }
  assertSigningKeyUsable(workspace, purpose, description.publicKeyPem, expected.provider);
}

/**
 * The key that signs `purpose`: the vault, or the bound provider key, reached by the ref the key set records (never by
 * the editable config). `override` replaces the provider instance (tests) and must be the bound provider.
 */
async function purposeSigner(workspace: string, purpose: LocalPurpose, override?: KeyProvider): Promise<{ provider: KeyProvider; description: KeyDescription; recheck: () => void }> {
  const bound = boundProviderKey(workspace, purpose);
  const config = loadKeysConfig(workspace);
  if (bound === null) {
    const configured = configuredRef(config, purpose);
    if (configured !== null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", configured.provider, `the key set binds no ${configured.provider} key to ${purpose} yet; run amc keys rotate --purpose ${purpose}`);
    const vault = loadKeyProvider(workspace, "file");
    const ref: KeyRef = { provider: "file", id: purpose };
    const description = pinnedDescription(await attempt("file", "describe", () => vault.describe({ ...ref })), config);
    if (!sameRef(description.ref, ref)) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the described key ref is not the requested purpose ref");
    const recheck = () => assertPurposeSignerCurrent(workspace, purpose, description, null);
    recheck();
    return { provider: vault, description, recheck };
  }
  const ref = Object.freeze(boundRef(bound.binding));
  if (override !== undefined && override.id !== ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the key set binds a ${ref.provider} key to ${purpose}; no other provider signs for it`);
  // The vault's gate, from AMC's own state, before the provider is asked anything: binding, revocation, distrust.
  assertSigningKeyUsable(workspace, purpose, bound.publicKeyPem, ref.provider);
  const provider = override ?? loadKeyProvider(workspace, ref.provider);
  const description = pinnedDescription(await attempt(ref.provider, "describe", () => provider.describe({ ...ref })), config);
  // The key the provider presents, identified by its own bytes (never its reported id), must be the bound key.
  if (!sameRef(description.ref, ref) || signingKeyId(description.publicKeyPem) !== bound.binding.keyId) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the provider's ${purpose} key is not the key the key set binds`);
  }
  const recheck = () => assertPurposeSignerCurrent(workspace, purpose, description, ref);
  recheck();
  return { provider, description, recheck };
}

export interface PurposeSignature { provider: KeyProviderId; algorithm: SigningAlgorithm; keyId: string; publicKeyPem: string; signature: Buffer }

/** Preparation for the async owner revocation flow; no staging or publication occurs while the provider is awaited. */
export async function signPurposeRevocationList(workspace: string, list: RevocationListV1, opts: { provider?: KeyProvider } = {}): Promise<{ signed: SignedRevocationList; description: KeyDescription; provider: KeyProviderId }> {
  const { provider, description, recheck } = await purposeSigner(workspace, "revocation-list", opts.provider);
  const signatureVersion = provider.id === "aws-kms" && revocationListSigningBytes(list).length > 4096 ? 2 : 1;
  const signed = await signRevocationListWithProvider(list, provider, description, { signatureVersion });
  recheck();
  return { signed, description, provider: description.ref.provider };
}

/** Signs `message` with the purpose's key wherever it lives; the signature is checked against that key before it is returned. */
export async function signWithPurposeKey(workspace: string, purpose: KeyPurpose, message: Uint8Array, opts: { provider?: KeyProvider } = {}): Promise<PurposeSignature> {
  const bytes = Buffer.from(message);
  const { provider, description, recheck } = await purposeSigner(workspace, assertLocal(purpose), opts.provider);
  const signature = await signChecked(provider, description, bytes);
  recheck();
  return { provider: description.ref.provider, algorithm: description.algorithm, keyId: description.keyId, publicKeyPem: description.publicKeyPem, signature };
}

/** `amc keys export-public` for any purpose: the public key, its key id and a proof of possession signed where the key lives. */
export async function exportPurposePublicKey(workspace: string, purpose: KeyPurpose, opts: { provider?: KeyProvider } = {}): Promise<{
  purpose: LocalPurpose; provider: KeyProviderId; algorithm: SigningAlgorithm; keyId: string; publicKeyPem: string; proofOfPossession: { issuedAt: string; signature: string };
}> {
  const local = assertLocal(purpose);
  const { provider, description, recheck } = await purposeSigner(workspace, local, opts.provider);
  const issuedAt = new Date().toISOString();
  const signature = await signChecked(provider, description, popBytes({ keyId: description.keyId, purpose: local, issuedAt }));
  recheck();
  return { purpose: local, provider: description.ref.provider, algorithm: description.algorithm, keyId: description.keyId, publicKeyPem: description.publicKeyPem,
    proofOfPossession: { issuedAt, signature: signature.toString("base64") } };
}

export interface BindResult extends ProviderBinding {
  purpose: LocalPurpose;
  generation: number;
  delegation: { notBefore: string; notAfter: string; maxEvents: number } | null;
}

type ProviderOwnerOptions = NonNullable<Parameters<typeof bindPurposeProviderKey>[2]>;
/** Shared existing authority preparation; no writes or publication lock is retained across its awaits. */
async function prepareProviderOwnerPlan(workspace: string, local: LocalPurpose, opts: ProviderOwnerOptions, artifactBoundary?: ArtifactBlobAnchorBoundary, receiptBoundary?: ReceiptOwnerBoundary) {
  if (receiptBoundary !== undefined && (local !== "receipt" || artifactBoundary !== undefined)) throw new Error("receipt owner boundary is purpose-specific");
  const passphrase = opts.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("Binding a provider key requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  const payload = unlockedPayloadForKeyChange(workspace, passphrase);
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("this workspace has no key set to bind a provider key into");
  if (local === "session") preflightHistoryLog(workspace);
  const current = keyset.providers?.[local];
  const oldProvider = boundProviderKey(workspace, local);
  const previousPublicKeyPem = oldProvider?.publicKeyPem ?? publicKeyFromPrivate(payload.keys[local]!.privateKeyPem);
  const preparedState = providerBindingPreparationState(workspace);
  const locked = <T>(operation: () => T): T => withControlFileLock({ root: vaultPaths(workspace).keysDir, name: "key-revocations", operation });
  const unsigned = loadKeysConfig(workspace);
  const named = configuredRef(unsigned, local);
  if (named === null || named.provider === "file") throw new Error(`keys.refs.${local} names no provider key; nothing to bind`);
  // Renewing the bound key needs nothing from the config. Picking a key (the first, or another) needs it signed.
  const renewing = current !== undefined && sameRef(boundRef(current), named);
  const selected = renewing ? boundRef(current) : configuredRef(signedKeysConfig(workspace, named.provider), local);
  if (selected === null || selected.provider === "file") throw new Error(`keys.refs.${local} names no provider key; nothing to bind`);
  const ref = Object.freeze({ ...selected, provider: selected.provider });
  if (opts.provider !== undefined && opts.provider.id !== ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `keys.refs.${local} names a ${ref.provider} key`);
  // Fail an unsupported legacy cutover before even describing or signing with the selected provider.
  if (local === "ledger-row" && oldProvider === null) captureDelegationScope(workspace, null, publicKeyFromPrivate(payload.keys["ledger-row"]!.privateKeyPem));
  const provider = opts.provider ?? loadKeyProvider(workspace, ref.provider);
  const description = pinnedDescription(await attempt(ref.provider, "describe", () => provider.describe({ ...ref })), unsigned);
  if (!sameRef(description.ref, ref)) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the described key ref is not the selected signed-config ref");
  if (description.exportable) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "an exportable key is never bound");
  const keyId = signingKeyId(description.publicKeyPem)!;
  // Renewing: the full gate on the bound key. Binding a new key: revocation and distrust (no key set names it yet).
  if (renewing) {
    if (keyId !== current.keyId) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the provider no longer holds the bound key");
    assertSigningKeyUsable(workspace, local, description.publicKeyPem, ref.provider);
  } else {
    assertKeyUsableNow(workspace, local, keyId, ref.provider);
  }
  const now = new Date(opts.now?.getTime() ?? Date.now());
  // Possession before the key set names the key: the provider signs this purpose's proof under the described key.
  await signChecked(provider, description, popBytes({ keyId: description.keyId, purpose: local, issuedAt: now.toISOString() }));
  let previousHolder: { privateKeyPem: string } | { provider: KeyProvider; description: KeyDescription } = { privateKeyPem: payload.keys[local]!.privateKeyPem };
  if (oldProvider !== null && oldProvider.binding.keyId !== description.keyId) {
    const oldRef = Object.freeze(boundRef(oldProvider.binding));
    const oldHolder = opts.previousProvider ?? (provider.id === oldRef.provider ? provider : loadKeyProvider(workspace, oldRef.provider));
    if (oldHolder.id !== oldRef.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", oldRef.provider, "the previous holder belongs to another provider");
    assertKeyUsableNow(workspace, local, oldProvider.binding.keyId, oldRef.provider);
    const oldDescription = pinnedDescription(await attempt(oldRef.provider, "describe", () => oldHolder.describe({ ...oldRef })), unsigned);
    if (!sameRef(oldDescription.ref, oldRef) || oldDescription.keyId !== oldProvider.binding.keyId
      || oldDescription.algorithm !== oldProvider.binding.algorithm || oldDescription.publicKeyPem !== oldProvider.publicKeyPem) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", oldRef.provider, "the previous provider key is not the committed purpose issuer");
    }
    previousHolder = { provider: oldHolder, description: oldDescription };
  } else if (oldProvider === null) {
    assertKeyUsableNow(workspace, local, signingKeyId(previousPublicKeyPem)!, "file");
  }
  const rotationInput = { workspace, previousPublicKeyPem, previous: previousHolder, next: { provider, description }, reason: opts.reason, overlapDays: opts.overlapDays, now };
  const rotation = receiptBoundary !== undefined ? await prepareReceiptPurposeRotation(rotationInput, receiptBoundary)
    : artifactBoundary === undefined ? await prepareProviderPurposeRotation({ ...rotationInput, purpose: local })
    : await prepareArtifactBlobPurposeRotation(rotationInput, artifactBoundary);
  const rotationWrites = rotation === null ? [] : [{ path: rotation.path, bytes: rotation.bytes, mode: 0o644 }];
  const rotationDigests = rotation === null ? [] : [rotation.sha256];
  const binding: ProviderBinding = { provider: ref.provider, id: ref.id, ...(ref.version === undefined ? {} : { version: ref.version }), keyId: description.keyId,
    algorithm: description.algorithm, protection: description.protection, protectionBasis: description.protectionBasis };
  const recheck = () => {
    assertOwnerMode(workspace, "keys rotate");
    if (process.env.AMC_NO_SIGN === "1") throw new Error("Provider key rotation is unavailable in no-sign mode");
    // A late vault lock is an owner-admission failure; do not silently reopen it during final publication.
    if (!vaultStatus(workspace).unlocked) throw new Error("the vault was locked while binding was prepared");
    if (publicKeyFromPrivate(getVaultPurposeKeyPem(workspace, local)) !== publicKeyFromPrivate(payload.keys[local]!.privateKeyPem)) throw new Error("the vault owner key changed while binding was prepared");
    if (providerBindingPreparationState(workspace) !== preparedState) throw new Error("the key set, revocations or signed config changed while binding was prepared; retry binding");
    assertProviderPurposeRotationCurrent(workspace, rotation);
    checkedDescription(description, keyPolicy(loadKeysConfig(workspace)));
    assertKeyUsableNow(workspace, local, keyId, ref.provider);
    if (!renewing && !sameRef(configuredRef(signedKeysConfig(workspace, ref.provider), local) ?? { provider: "file", id: local }, ref)) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the selected signed-config key changed while binding was prepared");
    }
    if (oldProvider !== null) {
      const active = boundProviderKey(workspace, local);
      if (active === null || canonicalize(active.binding) !== canonicalize(oldProvider.binding) || active.publicKeyPem !== previousPublicKeyPem) throw new Error("the previous active purpose binding changed while signing");
      assertKeyUsableNow(workspace, local, oldProvider.binding.keyId, oldProvider.binding.provider);
      if ("provider" in previousHolder) checkedDescription(previousHolder.description, keyPolicy(loadKeysConfig(workspace)));
    } else {
      if (boundProviderKey(workspace, local) !== null) throw new Error("the purpose became provider-held while signing");
      assertKeyUsableNow(workspace, local, signingKeyId(previousPublicKeyPem)!, "file");
    }
    if (receiptBoundary !== undefined) receiptBoundary.assertPreparedCurrent();
    else if (artifactBoundary !== undefined) artifactBoundary.assertPreparedCurrent(); else if (rotation) preflightHistoryLog(workspace);
  };
  return { passphrase, payload, keyset, current, oldProvider, previousPublicKeyPem, locked, provider, ref, description, now,
    rotation, rotationWrites, rotationDigests, binding, recheck };
}

/** Internal exact artifact/blob owner plan. Normal binding remains disabled; no private payload or general-purpose override escapes. */
export async function prepareArtifactBlobOwnerPlan(workspace: string, opts: ProviderOwnerOptions = {}) {
  if (opts.reason === "key-compromise") throw new Error("provider key-compromise rotation is not supported yet; pinned-root P1-08 authorization is required");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Provider key rotation is unavailable in no-sign mode");
  assertOwnerMode(workspace, "keys rotate");
  const passphrase = opts.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("Binding a provider key requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  const payload = unlockedPayloadForKeyChange(workspace, passphrase), privateKeyPem = payload.keys["artifact-seal"]!.privateKeyPem;
  const anchor = publicKeyFromPrivate(privateKeyPem), historyPath = purposeKeyPaths(workspace, "artifact-seal").historyFile;
  if (getSigningPublicKeyPem(workspace, "artifact-seal") !== anchor) throw new Error("the unlocked vault artifact key differs from its committed public key");
  const prior = readHistory(workspace, "artifact-seal", anchor), historyBytes = readContainedOrNull(workspace, ".amc/keys/artifact-seal_history.json", 1024 * 1024);
  if (prior === null || historyBytes === null || canonicalize(JSON.parse(historyBytes.toString("utf8"))) !== canonicalize(prior)) throw new Error("artifact key history is not authenticated; explicitly migrate reviewed history before binding");
  assertKeyUsableNow(workspace, "artifact-seal", signingKeyId(anchor)!, "file");
  const boundary = captureArtifactBlobAnchorBoundary(workspace); // fixed strict preflight before any candidate/previous provider await
  const plan = await prepareProviderOwnerPlan(workspace, "artifact-seal", opts, boundary);
  let entries = prior.entries;
  for (const pem of [plan.previousPublicKeyPem, plan.description.publicKeyPem]) if (!entries.some(entry => entry.publicKeyPem === pem)) {
    entries = [...entries, buildKeyHistoryEntry(pem, entries, "imported")];
  }
  const envelope = sealKeyHistory("artifact-seal", entries, privateKeyPem, prior.revision + 1);
  const historyWrites = [{ path: historyPath, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 }];
  const recheck = () => {
    plan.recheck();
    const currentBytes = readContainedOrNull(workspace, ".amc/keys/artifact-seal_history.json", 1024 * 1024), current = readHistory(workspace, "artifact-seal", anchor);
    if (currentBytes === null || !currentBytes.equals(historyBytes) || current === null || canonicalize(current) !== canonicalize(prior)) throw new Error("artifact key history changed while owner signing was prepared; retry");
    assertKeyUsableNow(workspace, "artifact-seal", signingKeyId(anchor)!, "file");
  };
  return { keyset: plan.keyset, binding: plan.binding, provider: plan.provider, description: plan.description,
    now: plan.now, rotationWrites: plan.rotationWrites, rotationDigests: plan.rotationDigests, historyWrites,
    recheck, locked: plan.locked, withAnchorBoundary: <T>(operation: () => T): T => boundary.withAnchorBoundary(operation),
    anchor: async (committed: { generation: number; keyset: Keyset }) => {
      markWrittenHistories(workspace, historyWrites);
      await boundary.complete({ ...committed, rotation: plan.rotation, historyWrites });
    } };
}

/** Internal receipt-token owner plan consumed by the actual SQL authority publisher; normal binder stays disabled. */
export async function prepareReceiptAuthorityOwnerPlan(workspace: string, opts: ProviderOwnerOptions = {}) {
  if (opts.reason === "key-compromise") throw new Error("provider key-compromise rotation requires independent pinned-root handling");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("receipt authority is unavailable in no-sign mode");
  assertOwnerMode(workspace, "keys rotate");
  const passphrase = opts.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("receipt authority requires the vault passphrase");
  const payload = unlockedPayloadForKeyChange(workspace, passphrase), privateKeyPem = payload.keys.receipt!.privateKeyPem;
  const anchor = publicKeyFromPrivate(privateKeyPem), prior = readHistory(workspace, "receipt", anchor);
  const original = readContainedOrNull(workspace, ".amc/keys/receipt_history.json", 1024 * 1024);
  if (getSigningPublicKeyPem(workspace, "receipt") !== anchor || prior === null || original === null || canonicalize(JSON.parse(original.toString("utf8"))) !== canonicalize(prior)) throw new Error("receipt exact history is not authenticated");
  assertKeyUsableNow(workspace, "receipt", signingKeyId(anchor)!, "file");
  const boundary = captureReceiptOwnerBoundary(workspace);
  const plan = await prepareProviderOwnerPlan(workspace, "receipt", opts, undefined, boundary);
  let entries = prior.entries;
  for (const pem of [plan.previousPublicKeyPem, plan.description.publicKeyPem]) if (!entries.some(entry => entry.publicKeyPem === pem)) entries = [...entries, buildKeyHistoryEntry(pem, entries, "imported")];
  const envelope = sealKeyHistory("receipt", entries, privateKeyPem, prior.revision + 1);
  const historyWrites = [{ path: purposeKeyPaths(workspace, "receipt").historyFile, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 }];
  const recheck = () => {
    plan.recheck(); const current = readContainedOrNull(workspace, ".amc/keys/receipt_history.json", 1024 * 1024);
    if (current === null || !current.equals(original) || canonicalize(readHistory(workspace, "receipt", anchor)) !== canonicalize(prior)) throw new Error("receipt history changed while signing");
    assertKeyUsableNow(workspace, "receipt", signingKeyId(anchor)!, "file");
  };
  return { keyset: plan.keyset, binding: plan.binding, provider: plan.provider, description: plan.description, now: plan.now,
    rotationWrites: plan.rotationWrites, rotationDigests: plan.rotationDigests, historyWrites, recheck, locked: plan.locked,
    withAnchorBoundary: <T>(operation: () => T): T => boundary.withAnchorBoundary(operation),
    anchor: async (committed: { generation: number; keyset: Keyset }) => { markWrittenHistories(workspace, historyWrites); await boundary.complete({ ...committed, rotation: plan.rotation, historyWrites }); } };
}

/**
 * `amc keys rotate --purpose <p>` when keys.refs names a provider key (owner mode, vault passphrase): binds that key in a
 * new key-set generation after it proves possession. Session public/history writes commit together. For ledger-row it
 * also signs a fresh delegation for the vault's ledger-row key, valid from `now` for at most 24 hours.
 */
export async function bindPurposeProviderKey(workspace: string, purpose: KeyPurpose, opts: { passphrase?: string; provider?: KeyProvider; now?: Date;
  previousProvider?: KeyProvider; reason?: RotationReason; overlapDays?: number; delegation?: { hours?: number; maxEvents?: number } } = {}): Promise<BindResult> {
  const local = assertLocal(purpose);
  // No implicit downgrade: proof of possession/delegation is not the pinned-root authority P1-08 requires here.
  if (opts.reason === "key-compromise") throw new Error("provider key-compromise rotation is not supported yet; pinned-root P1-08 authorization is required");
  if (process.env.AMC_NO_SIGN === "1") throw new Error("Provider key rotation is unavailable in no-sign mode");
  // Owner API: narrow the normal 24-hour/1M-row lease for shorter-lived or lower-volume installations.
  const hours = opts.delegation?.hours ?? MAX_DELEGATION_HOURS;
  const maxEvents = opts.delegation?.maxEvents ?? LEDGER_DELEGATION_MAX_EVENTS;
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_DELEGATION_HOURS
    || !Number.isSafeInteger(maxEvents) || maxEvents <= 0 || maxEvents > LEDGER_DELEGATION_MAX_EVENTS) throw new Error("delegation needs 0 < hours <= 24 and 0 < maxEvents <= 1000000");
  assertOwnerMode(workspace, "keys rotate");
  if (!BINDABLE_PURPOSES.includes(local)) {
    throw new Error(`a provider key cannot be bound to ${local} yet: its synchronous signers still need a vault key (only ${BINDABLE_PURPOSES.join(", ")} can be bound). `
      + `Remove keys.refs.${local} to sign it with the vault again; while it is set, ${local} signing refuses.`);
  }
  const { payload, keyset, current, oldProvider, locked, provider, ref, description, now, rotation, rotationWrites, rotationDigests, binding, recheck }
    = await prepareProviderOwnerPlan(workspace, local, opts);
  if (local === "session") {
    const privateKeyPem = payload.keys.session!.privateKeyPem;
    const anchor = publicKeyFromPrivate(privateKeyPem);
    if (getSigningPublicKeyPem(workspace, local) !== anchor) throw new Error("the unlocked vault session key differs from its committed public key");
    const prior = readHistory(workspace, "session", anchor);
    if (prior === null) throw new Error("session key history is not authenticated; explicitly migrate reviewed history before binding");
    const entries = prior.entries.some(entry => entry.publicKeyPem === description.publicKeyPem)
      ? prior.entries : [...prior.entries, buildKeyHistoryEntry(description.publicKeyPem, prior.entries, "imported")];
    // Session is its own exact purpose and role; no monitor, auditor, or lease admission changes.
    const envelope = sealKeyHistory("session", entries, privateKeyPem, prior.revision + 1);
    const writes = [
      { path: join(vaultPaths(workspace).keysDir, "session-provider.pub"), bytes: description.publicKeyPem, mode: 0o644 },
      { path: purposeKeyPaths(workspace, "session").historyFile, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 },
      ...rotationWrites
    ];
    const committed = locked(() => {
      recheck();
      assertKeyUsableNow(workspace, local, payload.keys.session!.keyId, "file");
      return commitKeyset(workspace, { expectedGeneration: keyset.generation, keys: keyset.keys, writes, statements: rotationDigests,
        providers: { ...keyset.providers, session: binding } });
    });
    logHistoryRevisions(workspace, markWrittenHistories(workspace, writes));
    anchorProviderPurposeRotation(workspace, rotation);
    return { purpose: local, generation: committed.generation, ...binding, delegation: null };
  }
  const previous = current?.delegationSha256 ? readOperationalDelegationState(workspace)!.current : null;
  const delegatePublicKeyPem = publicKeyFromPrivate(payload.keys["ledger-row"]!.privateKeyPem);
  const scope = captureDelegationScope(workspace, previous, delegatePublicKeyPem);
  const signed = await issueDelegation(provider, description, { delegatePublicKeyPem, notBefore: now, hours, maxEvents, scope });
  const bytes = encodeDelegation(signed);
  const digest = sha256Hex(bytes);
  binding.delegationSha256 = digest;
  const old = readContainedOrNull(workspace, DELEGATION_REL, 64 * 1024);
  const writes = [
    { path: join(vaultPaths(workspace).keysDir, `${local}-provider.pub`), bytes: description.publicKeyPem, mode: 0o644 },
    { path: join(workspace, ".amc", delegationIssuerRel(description.keyId)), bytes: description.publicKeyPem, mode: 0o644 },
    { path: join(workspace, ".amc", delegationArchiveRel(digest)), bytes, mode: 0o644 },
    { path: join(workspace, DELEGATION_REL), bytes, mode: 0o644 },
    ...(oldProvider === null || oldProvider.binding.keyId === description.keyId ? [] : [{
      path: join(workspace, ".amc", delegationIssuerRel(oldProvider.binding.keyId)), bytes: oldProvider.publicKeyPem, mode: 0o644 }]),
    ...(old === null ? [] : [{ path: join(workspace, ".amc", delegationArchiveRel(sha256Hex(old))), bytes: old, mode: 0o644 }]),
    ...rotationWrites
  ];
  // Renewals advance a generation too: old pointer bytes can never remain usable under an unchanged mark.
  const generation = locked(() => publishDelegationBoundary(workspace, keyset.generation, scope, previous, () => {
    recheck();
    const finalNow = Date.now();
    if (finalNow < Date.parse(signed.delegation.notBefore) || finalNow >= Date.parse(signed.delegation.notAfter)) {
      throw new KeyProviderError("KEY_DELEGATION_INVALID", ref.provider, "the prepared delegation is outside its window at publication; prepare a current grant");
    }
    assertKeyUsableNow(workspace, local, signed.delegation.delegateKeyId, "file");
    return commitKeyset(workspace, { expectedGeneration: keyset.generation, keys: keyset.keys, writes, statements: rotationDigests, providers: { ...keyset.providers, [local]: binding } }).generation;
  }, delegatePublicKeyPem));
  anchorProviderPurposeRotation(workspace, rotation);
  return { purpose: local, generation, ...binding,
    delegation: { notBefore: signed.delegation.notBefore, notAfter: signed.delegation.notAfter, maxEvents: signed.delegation.maxEvents } };
}
