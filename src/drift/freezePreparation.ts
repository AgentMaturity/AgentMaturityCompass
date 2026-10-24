import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
/** Internal freeze raw32 preparation. Actual signing and initialization precede the shared publication lock; final local gates remain mandatory. */
import { getSigningKey, signHexDigest } from "../crypto/keys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { canonicalSigningKey } from "../keys/algorithmPolicy.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { KeyProviderError } from "../keys/provider.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { assertSigningKeyUsable, assertVaultMaySign } from "../keys/signingKeys.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";

export interface PreparedFreezeSignature { readonly signature: string; assertCurrent(): void }

/** Retained real private-key API, including its historical no-sign ephemeral result. Never labelled checked. */
export function prepareFreezeSignature(workspace: string, digest: string): PreparedFreezeSignature {
  const key = getSigningKey(workspace, "artifact-seal");
  const ephemeral = process.env.AMC_NO_SIGN === "1" && !vaultStatus(workspace).unlocked;
  if (ephemeral) return { signature: signHexDigest(digest, key), assertCurrent: () => { assertVaultMaySign(workspace, "artifact-seal"); } };
  const captured = capturePurposePublication(workspace, "artifact-seal"), publicKey = publicKeyFromPrivate(key);
  const algorithm = canonicalSigningKey(publicKey)?.algorithm;
  if (!algorithm) throw new Error("freeze key has no supported signing identity");
  const signature = signHexDigest(digest, key);
  return { signature, assertCurrent() {
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the committed freeze authority changed while signing was prepared");
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (!policy.allowed.includes(algorithm) || policy.requireNonExportable)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the current key policy refuses the prepared freeze signature");
    assertSigningKeyUsable(workspace, "artifact-seal", publicKey, "file");
    // No final-gate environment-assisted unlock. Preparation already warmed this actual generation.
    if (!vaultStatus(workspace).unlocked) throw new Error("Vault locked; unlock before preparing freeze publication");
    assertVaultMaySign(workspace, "artifact-seal");
    if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== publicKey)
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the prepared freeze vault key changed");
  } };
}

export async function prepareFreezeSignatureAsync(workspace: string, digest: string, beforeSign?: () => void): Promise<PreparedFreezeSignature> {
  const negative = beforeSign; negative?.();
  const captured = capturePurposePublication(workspace, "artifact-seal"), original = captureRunHashAuthority(workspace, false);
  const assertPreparing = () => { negative?.(); original(); };
  const { signWithPurposeKey } = await import("../keys/purposeProviders.js");
  assertPreparing();
  const signed = await signWithPurposeKey(workspace, "artifact-seal", Buffer.from(digest, "hex"), { beforeSign: assertPreparing });
  return { signature: signed.signature.toString("base64"), assertCurrent() {
    if (signed.provider === "file" && !vaultStatus(workspace).unlocked)
      throw new Error("Vault locked; unlock before preparing freeze publication");
    original(); assertPurposePublicationCurrent(workspace, captured, signed);
  } };
}
