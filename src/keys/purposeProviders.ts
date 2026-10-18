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
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { readContainedOrNull, writeContained } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { unlockedPayloadForKeyChange, vaultPaths } from "../vault/vault.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import { signingKeyId, verifyWithKey, type SigningAlgorithm } from "./algorithmPolicy.js";
import { encodeDelegation, issueDelegation, MAX_DELEGATION_HOURS } from "./delegation.js";
import { assertKeysetComplete, boundProviderKey, commitKeyset, type ProviderBinding } from "./keyset.js";
import { CONFIG_REL, configuredRef, keyPolicy, loadKeysConfig, parseKeysSection, type KeysConfig } from "./keysConfig.js";
import { attempt, checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider, type KeyProviderId, type KeyRef } from "./provider.js";
import { awsKmsProvider } from "./providers/awsKms.js";
import { azureKeyVaultProvider } from "./providers/azureKeyVault.js";
import { fileKeyProvider } from "./providers/file.js";
import { gcpKmsProvider } from "./providers/gcpKms.js";
import { pkcs11Provider } from "./providers/pkcs11.js";
import { popBytes } from "./purposeKeys.js";
import { assertKeyUsableNow, assertLocal, assertSigningKeyUsable, DELEGATION_REL, getPurposeKeyHistory } from "./signingKeys.js";

/**
 * Purposes a provider key can be bound to in this release. ponytail: ledger-row only, whose hot path keeps a vault
 * delegate. Every other purpose still has synchronous signers that take a vault key (getSigningKey); bound, they would
 * all refuse, among them the transparency log's seal for artifact-seal. Add a purpose once its signers call
 * signWithPurposeKey; keys.refs for any other purpose already refuses its vault key (fail closed).
 */
const BINDABLE_PURPOSES: readonly LocalPurpose[] = ["ledger-row"];

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

/**
 * The key that signs `purpose`: the vault, or the bound provider key, reached by the ref the key set records (never by
 * the editable config). `override` replaces the provider instance (tests) and must be the bound provider.
 */
async function purposeSigner(workspace: string, purpose: LocalPurpose, override?: KeyProvider): Promise<{ provider: KeyProvider; description: KeyDescription }> {
  const bound = boundProviderKey(workspace, purpose);
  const config = loadKeysConfig(workspace);
  if (bound === null) {
    const configured = configuredRef(config, purpose);
    if (configured !== null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", configured.provider, `the key set binds no ${configured.provider} key to ${purpose} yet; run amc keys rotate --purpose ${purpose}`);
    const vault = loadKeyProvider(workspace, "file");
    const description = checkedDescription(await attempt("file", "describe", () => vault.describe({ provider: "file", id: purpose })), keyPolicy(config));
    assertSigningKeyUsable(workspace, purpose, description.publicKeyPem, "file");
    return { provider: vault, description };
  }
  const ref = boundRef(bound.binding);
  if (override !== undefined && override.id !== ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the key set binds a ${ref.provider} key to ${purpose}; no other provider signs for it`);
  // The vault's gate, from AMC's own state, before the provider is asked anything: binding, revocation, distrust.
  assertSigningKeyUsable(workspace, purpose, bound.publicKeyPem, ref.provider);
  const provider = override ?? loadKeyProvider(workspace, ref.provider);
  const description = checkedDescription(await attempt(ref.provider, "describe", () => provider.describe(ref)), keyPolicy(config));
  // The key the provider presents, identified by its own bytes (never its reported id), must be the bound key.
  if (signingKeyId(description.publicKeyPem) !== bound.binding.keyId) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the provider's ${purpose} key is not the key the key set binds`);
  }
  return { provider, description };
}

export interface PurposeSignature { provider: KeyProviderId; algorithm: SigningAlgorithm; keyId: string; publicKeyPem: string; signature: Buffer }

/** Signs `message` with the purpose's key wherever it lives; the signature is checked against that key before it is returned. */
export async function signWithPurposeKey(workspace: string, purpose: KeyPurpose, message: Uint8Array, opts: { provider?: KeyProvider } = {}): Promise<PurposeSignature> {
  const { provider, description } = await purposeSigner(workspace, assertLocal(purpose), opts.provider);
  const signature = await signChecked(provider, description, message);
  return { provider: provider.id, algorithm: description.algorithm, keyId: description.keyId, publicKeyPem: description.publicKeyPem, signature };
}

/** `amc keys export-public` for any purpose: the public key, its key id and a proof of possession signed where the key lives. */
export async function exportPurposePublicKey(workspace: string, purpose: KeyPurpose, opts: { provider?: KeyProvider } = {}): Promise<{
  purpose: LocalPurpose; provider: KeyProviderId; algorithm: SigningAlgorithm; keyId: string; publicKeyPem: string; proofOfPossession: { issuedAt: string; signature: string };
}> {
  const local = assertLocal(purpose);
  const { provider, description } = await purposeSigner(workspace, local, opts.provider);
  const issuedAt = new Date().toISOString();
  const signature = await signChecked(provider, description, popBytes({ keyId: description.keyId, purpose: local, issuedAt }));
  return { purpose: local, provider: provider.id, algorithm: description.algorithm, keyId: description.keyId, publicKeyPem: description.publicKeyPem,
    proofOfPossession: { issuedAt, signature: signature.toString("base64") } };
}

export interface BindResult extends ProviderBinding {
  purpose: LocalPurpose;
  generation: number;
  delegation: { notBefore: string; notAfter: string; maxEvents: number } | null;
}

/**
 * `amc keys rotate --purpose <p>` when keys.refs names a provider key (owner mode, vault passphrase): binds that key in a
 * new key-set generation after it proves possession, or keeps the generation when it is already bound. For ledger-row it
 * also signs a fresh delegation for the vault's ledger-row key, valid from `now` for 24 hours.
 */
export async function bindPurposeProviderKey(workspace: string, purpose: KeyPurpose, opts: { passphrase?: string; provider?: KeyProvider; now?: Date } = {}): Promise<BindResult> {
  const local = assertLocal(purpose);
  assertOwnerMode(workspace, "keys rotate");
  if (!BINDABLE_PURPOSES.includes(local)) {
    throw new Error(`a provider key cannot be bound to ${local} yet: its synchronous signers still need a vault key (only ${BINDABLE_PURPOSES.join(", ")} can be bound). `
      + `Remove keys.refs.${local} to sign it with the vault again; while it is set, ${local} signing refuses.`);
  }
  const passphrase = opts.passphrase ?? process.env.AMC_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("Binding a provider key requires the vault passphrase (AMC_VAULT_PASSPHRASE or interactive input).");
  const payload = unlockedPayloadForKeyChange(workspace, passphrase);
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("this workspace has no key set to bind a provider key into");
  const current = keyset.providers?.[local];
  const unsigned = loadKeysConfig(workspace);
  const named = configuredRef(unsigned, local);
  if (named === null || named.provider === "file") throw new Error(`keys.refs.${local} names no provider key; nothing to bind`);
  // Renewing the bound key needs nothing from the config. Picking a key (the first, or another) needs it signed.
  const renewing = current !== undefined && sameRef(boundRef(current), named);
  const ref = renewing ? boundRef(current) : configuredRef(signedKeysConfig(workspace, named.provider), local);
  if (ref === null || ref.provider === "file") throw new Error(`keys.refs.${local} names no provider key; nothing to bind`);
  if (opts.provider !== undefined && opts.provider.id !== ref.provider) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `keys.refs.${local} names a ${ref.provider} key`);
  const provider = opts.provider ?? loadKeyProvider(workspace, ref.provider);
  const description = checkedDescription(await attempt(ref.provider, "describe", () => provider.describe(ref)), keyPolicy(unsigned));
  if (description.exportable) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "an exportable key is never bound");
  const keyId = signingKeyId(description.publicKeyPem)!;
  // Renewing: the full gate on the bound key. Binding a new key: revocation and distrust (no key set names it yet).
  if (renewing) {
    if (keyId !== current.keyId) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "the provider no longer holds the bound key");
    assertSigningKeyUsable(workspace, local, description.publicKeyPem, ref.provider);
  } else {
    assertKeyUsableNow(workspace, local, keyId, ref.provider);
  }
  const now = opts.now ?? new Date();
  // Possession before the key set names the key: the provider signs this purpose's proof under the described key.
  await signChecked(provider, description, popBytes({ keyId: description.keyId, purpose: local, issuedAt: now.toISOString() }));
  const binding: ProviderBinding = { provider: ref.provider, id: ref.id, ...(ref.version === undefined ? {} : { version: ref.version }), keyId: description.keyId,
    algorithm: description.algorithm, protection: description.protection, protectionBasis: description.protectionBasis };
  const generation = renewing ? keyset.generation : commitKeyset(workspace, {
    keys: keyset.keys,
    writes: [{ path: join(vaultPaths(workspace).keysDir, `${local}-provider.pub`), bytes: description.publicKeyPem, mode: 0o644 }],
    providers: { ...keyset.providers, [local]: binding }
  }).generation;
  let delegation: BindResult["delegation"] = null;
  if (local === "ledger-row") {
    // The delegate is the key the vault serves for ledger-row, read from the unlocked vault itself.
    const delegatePublicKeyPem = publicKeyFromPrivate(payload.keys["ledger-row"]!.privateKeyPem);
    const signed = await issueDelegation(provider, description, { delegatePublicKeyPem, notBefore: now, hours: MAX_DELEGATION_HOURS, maxEvents: LEDGER_DELEGATION_MAX_EVENTS });
    writeContained(workspace, DELEGATION_REL, encodeDelegation(signed), 0o644);
    delegation = { notBefore: signed.delegation.notBefore, notAfter: signed.delegation.notAfter, maxEvents: signed.delegation.maxEvents };
  }
  return { purpose: local, generation, ...binding, delegation };
}
