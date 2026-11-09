import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import { VAULT_LOCKED_NO_SIGN_MESSAGE } from "../vault/vaultLockedError.js";
import { canonicalSigningKey } from "./algorithmPolicy.js";
import { assertKeysetComplete, boundProviderKey } from "./keyset.js";
import { keyPolicy, loadKeysConfig } from "./keysConfig.js";
import { KeyProviderError } from "./provider.js";
import { capturePurposePublication } from "./purposePublication.js";
import { assertSigningKeyUsable, getSigningPublicKeyPem } from "./signingKeys.js";

/**
 * The config-signature authority a signed config writer starts with (the action policy, the tools config): the original
 * holder and key, captured once, with `assertCurrent` to re-check before publishing that the key set, the algorithm
 * policy and the holder still allow it. No private getter or invented checked signature in resumed gates. `what` names
 * the config in refusals ("action-policy config", "tools config").
 */
export function captureConfigSignatureAuthority(workspace: string, what: string) {
  const captured = capturePurposePublication(workspace, "config-signature"), bound = boundProviderKey(workspace, "config-signature");
  const holder = bound?.binding.provider ?? "file", publicKeyPem = bound?.publicKeyPem ?? getSigningPublicKeyPem(workspace, "config-signature");
  const algorithm = canonicalSigningKey(publicKeyPem)?.algorithm;
  if (algorithm === undefined) throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, `the original ${what} signer is unsupported`);
  const assertCurrent = () => {
    const policy = keyPolicy(loadKeysConfig(workspace));
    if (canonicalize(assertKeysetComplete(workspace)) !== captured.keyset || !policy.allowed.includes(algorithm)
      || (holder === "file" && policy.requireNonExportable))
      throw new KeyProviderError("KEY_PROVIDER_KEY_REFUSED", holder, `the original ${what} authority changed or is refused`);
    assertSigningKeyUsable(workspace, "config-signature", publicKeyPem, holder);
    if (holder === "file" && !vaultStatus(workspace).unlocked)
      throw new Error(VAULT_LOCKED_NO_SIGN_MESSAGE);
  };
  assertCurrent(); return { captured, publicKeyPem, assertCurrent };
}
