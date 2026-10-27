import { getPurposeKeyHistory } from "./signingKeys.js";
import { signingKeyId, verifyWithKey } from "./algorithmPolicy.js";
import { keysetDeclared } from "./keyset.js";
import { assertKeyNotRevoked } from "./keyRevocations.js";
import { builtInDistrust } from "../trust/builtInDistrust.js";
import { distrustAt } from "../trust/admissionRule.js";
import type { LocalPurpose } from "../vault/vaultPayload.js";

/** Internal current-credential rule. Each trusted caller supplies its literal purpose, never request data. */
export function verifyCurrentPurposeCredentialSignature(workspace: string, purpose: LocalPurpose, payloadBytes: Uint8Array, signature: Uint8Array): boolean {
  try {
    const required = keysetDeclared(workspace), now = Date.now(), distrust = builtInDistrust();
    const matching = getPurposeKeyHistory(workspace, purpose).filter(publicKeyPem => verifyWithKey(payloadBytes, publicKeyPem, signature));
    // Preserve unlabelled wire bytes. ECDSA can have multiple actual matches; a refused one cannot move to another.
    return matching.length > 0 && matching.every(publicKeyPem => {
      const keyId = signingKeyId(publicKeyPem);
      if (keyId === null) return false;
      try {
        assertKeyNotRevoked(workspace, required, keyId, purpose);
        return distrustAt(distrust, keyId, now) === undefined;
      } catch { return false; }
    });
  } catch { return false; }
}
