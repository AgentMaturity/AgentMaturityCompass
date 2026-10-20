import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { canonicalize } from "../utils/json.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";
import { assertKeysetComplete, boundProviderKey } from "./keyset.js";
import { keyPolicy, loadKeysConfig } from "./keysConfig.js";
import { KeyProviderError } from "./provider.js";
import type { PurposeSignature } from "./purposeProviders.js";
import { assertSigningKeyUsable, getSigningKey } from "./signingKeys.js";

/** Internal producer snapshot; captures committed authority, never an editable ref as a new signer. */
export interface PurposePublication { readonly purpose: LocalPurpose; readonly keyset: string }
export function capturePurposePublication(workspace: string, purpose: LocalPurpose): PurposePublication {
  // Preserve the normal locked/no-fallback gate and v1 vault migration before the generation snapshot.
  if (boundProviderKey(workspace, purpose) === null) getSigningKey(workspace, purpose);
  const keyset = assertKeysetComplete(workspace);
  if (keyset === null) throw new Error("purpose publication needs a committed key set");
  return Object.freeze({ purpose, keyset: canonicalize(keyset) });
}

/** Reuse after a producer's await, immediately before synchronous publication/return; never describes remotely again. */
export function assertPurposePublicationCurrent(workspace: string, captured: PurposePublication, signed: PurposeSignature): void {
  const current = assertKeysetComplete(workspace);
  if (current === null || canonicalize(current) !== captured.keyset) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", signed.provider, "the committed purpose authority changed while signing was prepared");
  }
  const policy = keyPolicy(loadKeysConfig(workspace));
  if (!policy.allowed.includes(signed.algorithm) || (signed.provider === "file" && policy.requireNonExportable)) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", signed.provider, "the current key policy refuses the prepared signature");
  }
  assertSigningKeyUsable(workspace, captured.purpose, signed.publicKeyPem, signed.provider);
  if (signed.provider === "file" && publicKeyFromPrivate(getSigningKey(workspace, captured.purpose)) !== signed.publicKeyPem) {
    throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", "file", "the vault purpose key changed while signing was prepared");
  }
}
