/** Internal raw-retention authority gates; no async owner/log writer or provider loading import. */
import { assertKeysetComplete, boundProviderKey } from "../../keys/keyset.js";
import { getSigningKey, getSigningPublicKeyPem, assertSigningKeyUsable, assertVaultMaySign } from "../../keys/signingKeys.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../../keys/purposePublication.js";
import type { PurposeSignature } from "../../keys/purposeProviders.js";
import { canonicalSigningKey } from "../../keys/algorithmPolicy.js";
import { keyPolicy, loadKeysConfig } from "../../keys/keysConfig.js";
import { KeyProviderError, type KeyProviderId } from "../../keys/provider.js";
import { publicKeyFromPrivate } from "../../crypto/keyHistoryEnvelope.js";
import { canonicalize } from "../../utils/json.js";
import { vaultStatus } from "../../vault/vault.js";

export function captureRetentionAuthority(workspace: string, asynchronous: boolean) {
  const legacyNoSign = !asynchronous && process.env.AMC_NO_SIGN === "1";
  if (legacyNoSign) { getSigningKey(workspace, "artifact-seal"); return { legacyNoSign, captured: null, holder: null, publicKey: null, algorithm: null }; }
  if (!asynchronous) getSigningKey(workspace, "artifact-seal"); // A blocking private-key API refuses held/configured providers before effects.
  // Warm the actual vault/history before any final gate. Configured-but-unbound file fallback refuses here.
  const captured = capturePurposePublication(workspace, "artifact-seal"), bound = boundProviderKey(workspace, "artifact-seal");
  const holder: KeyProviderId = bound?.binding.provider ?? "file", publicKey = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal");
  const algorithm = canonicalSigningKey(publicKey)?.algorithm;
  if (!algorithm) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the retention key has no supported signing identity");
  assertSigningKeyUsable(workspace, "artifact-seal", publicKey, holder);
  return { legacyNoSign, captured, holder, publicKey, algorithm };
}
export function assertRetentionAuthorityCurrent(workspace: string, authority: ReturnType<typeof captureRetentionAuthority>, signed?: PurposeSignature): void {
  if (authority.legacyNoSign) return; // Retained sync ephemeral/unlocked no-sign compatibility, never a checked provider claim.
  const { captured, holder, publicKey, algorithm } = authority;
  if (!captured || !holder || !publicKey || !algorithm) throw new Error("retention captured authority is incomplete");
  if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset)
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the committed purpose authority changed while signing was prepared");
  const bound = boundProviderKey(workspace, "artifact-seal");
  if ((bound?.binding.provider ?? "file") !== holder || (bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "artifact-seal")) !== publicKey)
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the committed retention holder or public key changed");
  const policy = keyPolicy(loadKeysConfig(workspace));
  if (!policy.allowed.includes(algorithm) || (holder === "file" && policy.requireNonExportable))
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, "the current key policy refuses the prepared signature");
  assertSigningKeyUsable(workspace, "artifact-seal", publicKey, holder);
  if (holder === "file") {
    // Preparation warmed this exact complete generation. Refuse a lock; never auto-unlock/migrate in a final gate.
    if (!vaultStatus(workspace).unlocked) throw new Error("Vault locked; unlock before preparing retention");
    assertVaultMaySign(workspace, "artifact-seal");
    if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== publicKey)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the warmed retention vault key changed");
  }
  if (signed !== undefined) assertPurposePublicationCurrent(workspace, captured, signed);
}
