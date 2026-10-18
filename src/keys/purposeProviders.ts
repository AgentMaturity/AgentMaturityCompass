/**
 * Purpose keys held by key providers (P2-08). `keys.refs.<purpose>` in amc.config.yaml names a provider key;
 * `amc keys rotate --purpose <p>` binds it: the provider proves possession, then one key-set generation records the
 * binding and pins `keys/<purpose>-provider.pub`, under the same anti-rollback marks as every P1-08 key set.
 *
 * From then on the purpose signs only through the provider (signWithPurposeKey). getSigningKey refuses it with
 * KEY_PROVIDER_HELD: the vault never stands in, whether the provider is down, the config changed or the binding was
 * rolled back. The ledger-row purpose is the exception for its hot path: the vault's ledger-row key keeps signing rows
 * as a delegate, while the provider key signs a delegation for it of at most 24 hours (renewed by the same command).
 */
import { join } from "node:path";
import { assertOwnerMode } from "../mode/mode.js";
import { writeContained } from "../utils/containedFs.js";
import { unlockedPayloadForKeyChange, vaultPaths } from "../vault/vault.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";
import type { KeyPurpose } from "../trust/keyPurposes.js";
import type { SigningAlgorithm } from "./algorithmPolicy.js";
import { encodeDelegation, issueDelegation, MAX_DELEGATION_HOURS } from "./delegation.js";
import { assertKeyNotRevoked } from "./keyRevocations.js";
import { assertKeysetComplete, boundProviderKey, commitKeyset, type ProviderBinding } from "./keyset.js";
import { configuredRef, keyPolicy, loadKeysConfig } from "./keysConfig.js";
import { attempt, checkedDescription, KeyProviderError, signChecked, type KeyDescription, type KeyProvider, type KeyProviderId } from "./provider.js";
import { awsKmsProvider } from "./providers/awsKms.js";
import { azureKeyVaultProvider } from "./providers/azureKeyVault.js";
import { fileKeyProvider } from "./providers/file.js";
import { gcpKmsProvider } from "./providers/gcpKms.js";
import { pkcs11Provider } from "./providers/pkcs11.js";
import { popBytes } from "./purposeKeys.js";
import { assertLocal, DELEGATION_REL, getSigningPublicKeyPem } from "./signingKeys.js";

/**
 * Purposes a provider key can be bound to in this release. ponytail: ledger-row only, whose hot path keeps a vault
 * delegate. Every other purpose still has synchronous signers that take a vault key (getSigningKey); bound, they would
 * all refuse, among them the transparency log's seal for artifact-seal. Add a purpose once its signers call
 * signWithPurposeKey; keys.refs for any other purpose already refuses its vault key (fail closed).
 */
export const BINDABLE_PURPOSES: readonly LocalPurpose[] = ["ledger-row"];

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

/** The key that signs `purpose`: the vault, or the bound provider key behind the configured ref. `override` replaces the provider (tests). */
async function purposeSigner(workspace: string, purpose: LocalPurpose, override?: KeyProvider): Promise<{ provider: KeyProvider; description: KeyDescription }> {
  const config = loadKeysConfig(workspace);
  const bound = boundProviderKey(workspace, purpose);
  const ref = configuredRef(config, purpose);
  if (bound === null) {
    if (ref !== null) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the key set binds no ${ref.provider} key to ${purpose} yet; run amc keys rotate --purpose ${purpose}`);
    const vault = loadKeyProvider(workspace, "file");
    return { provider: vault, description: checkedDescription(await attempt("file", "describe", () => vault.describe({ provider: "file", id: purpose })), keyPolicy(config)) };
  }
  if (ref === null || ref.provider !== bound.binding.provider) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", bound.binding.provider, `keys.refs.${purpose} must name the ${bound.binding.provider} key the key set binds`);
  }
  assertKeyNotRevoked(workspace, true, bound.binding.keyId, purpose);
  const provider = override ?? loadKeyProvider(workspace, ref.provider);
  const description = checkedDescription(await attempt(ref.provider, "describe", () => provider.describe(ref)), keyPolicy(config));
  if (description.keyId !== bound.binding.keyId) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, `the provider's ${purpose} key is not the key the key set binds`);
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
  unlockedPayloadForKeyChange(workspace, passphrase);
  const config = loadKeysConfig(workspace);
  const ref = configuredRef(config, local);
  if (ref === null || ref.provider === "file") throw new Error(`keys.refs.${local} names no provider key; nothing to bind`);
  const provider = opts.provider ?? loadKeyProvider(workspace, ref.provider);
  const description = checkedDescription(await attempt(ref.provider, "describe", () => provider.describe(ref)), keyPolicy(config));
  if (description.exportable) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", ref.provider, "an exportable key is never bound");
  assertKeyNotRevoked(workspace, true, description.keyId, local);
  const now = opts.now ?? new Date();
  // Possession before the key set names the key: the provider signs this purpose's proof under the described key.
  await signChecked(provider, description, popBytes({ keyId: description.keyId, purpose: local, issuedAt: now.toISOString() }));
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("this workspace has no key set to bind a provider key into");
  const binding: ProviderBinding = { provider: ref.provider, keyId: description.keyId, algorithm: description.algorithm, protection: description.protection, protectionBasis: description.protectionBasis };
  const generation = keyset.providers?.[local]?.keyId === description.keyId ? keyset.generation : commitKeyset(workspace, {
    keys: keyset.keys,
    writes: [{ path: join(vaultPaths(workspace).keysDir, `${local}-provider.pub`), bytes: description.publicKeyPem, mode: 0o644 }],
    providers: { ...keyset.providers, [local]: binding }
  }).generation;
  let delegation: BindResult["delegation"] = null;
  if (local === "ledger-row") {
    const signed = await issueDelegation(provider, description, { delegatePublicKeyPem: getSigningPublicKeyPem(workspace, "ledger-row"), notBefore: now, hours: MAX_DELEGATION_HOURS, maxEvents: LEDGER_DELEGATION_MAX_EVENTS });
    writeContained(workspace, DELEGATION_REL, encodeDelegation(signed), 0o644);
    delegation = { notBefore: signed.delegation.notBefore, notAfter: signed.delegation.notAfter, maxEvents: signed.delegation.maxEvents };
  }
  return { purpose: local, generation, ...binding, delegation };
}
