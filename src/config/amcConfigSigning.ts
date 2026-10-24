import { join } from "node:path";
import { vaultStatus } from "../vault/vault.js";
import { assertOwnerMode } from "../mode/mode.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { sha256Hex } from "../utils/hash.js";
import { boundProviderKey, commitKeyset } from "../keys/keyset.js";
import { configuredRef, loadKeysConfig, parseKeysSection } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { withAmcConfigPublicationLock } from "./configPublicationLock.js";
import { assertConfigPublicationCurrent, captureConfigPublication, configPairWrites, configSignatureBytes, MAX_CONFIG_BYTES } from "./configPublication.js";

/** Current committed purpose authority signs an exact snapshot; a new ref alone never picks the signer. */
export async function saveSignedAmcConfig(workspace: string, candidate?: Uint8Array): Promise<string> {
  assertOwnerMode(workspace, "keys commit");
  const owned = candidate === undefined ? undefined : Buffer.from(candidate);
  // The unchanged vault gate performs the existing owner-passphrase v1 migration before the generation snapshot.
  // A bound remote purpose never takes this branch; an unbound configured ref still refuses here.
  if (boundProviderKey(workspace, "config-signature") === null) getSigningKey(workspace, "config-signature");
  const captured = captureConfigPublication(workspace);
  const bytes = owned ?? captured.config;
  if (bytes === null || bytes.length > MAX_CONFIG_BYTES) throw new Error("amc.config.yaml is missing or exceeds 1 MiB");
  const policy = parseKeysSection(bytes);
  const digest = sha256Hex(bytes), signed = await signWithPurposeKey(workspace, "config-signature", Buffer.from(digest, "hex"));
  const sidecar = configSignatureBytes(digest, signed.signature);
  return withAmcConfigPublicationLock(workspace, () => {
    assertOwnerMode(workspace, "keys commit");
    assertConfigPublicationCurrent(workspace, captured);
    // Recheck after the await at the publication boundary; no second remote describe is needed.
    assertSigningKeyUsable(workspace, "config-signature", signed.publicKeyPem, signed.provider);
    const current = loadKeysConfig(workspace);
    for (const config of [current, policy]) {
      if (!config.algorithmPolicy.allowed.includes(signed.algorithm) || (config.requireNonExportable && signed.provider === "file")) {
        throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", signed.provider, "the current or candidate policy refuses this config signer");
      }
    }
    if (signed.provider === "file" && !vaultStatus(workspace).unlocked) throw new Error("🔐 Vault locked. Run `amc vault unlock` first, or `amc setup` for first-time setup. Use --no-sign to skip signing where supported.");
    if (signed.provider === "file" && publicKeyFromPrivate(getSigningKey(workspace, "config-signature")) !== signed.publicKeyPem) {
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the vault config signer changed while signing");
    }
    // Do not make this normal save a first-bind bypass: configured refs remain normal runtime refusals.
    if (signed.provider === "file" && configuredRef(policy, "config-signature") !== null) {
      throw new KeyProviderError("KEY_PROVIDER_HELD", "file", "use amc keys rotate --purpose config-signature --config-candidate <file> to select a provider backing key");
    }
    commitKeyset(workspace, { keys: captured.keyset.keys, expectedGeneration: captured.keyset.generation, writes: configPairWrites(workspace, bytes, sidecar) });
    return join(workspace, ".amc", "amc.config.yaml.sig");
  });
}

/** Additive async API for the real `amc verify --sign-config` caller. The synchronous API stays unchanged. */
export async function signAmcConfigAsync(workspace: string): Promise<string> {
  return saveSignedAmcConfig(workspace);
}
