import { describePolicySigner, assertPolicySignerCurrent } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete, boundProviderKey } from "../keys/keyset.js";
import { keyPolicy, loadKeysConfig } from "../keys/keysConfig.js";
import { assertSigningKeyUsable, getSigningKey } from "../keys/signingKeys.js";
import { publicKeyFromPrivate } from "../crypto/keyHistoryEnvelope.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { vaultStatus } from "../vault/vault.js";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
/** Actual BENCH_IMPORTED log suffix only. No BUNDLE/bench-policy prerequisite is invented. */
export function captureBenchImportLogAuthority(workspace: string, options: OrgPairsOptions) {
  const actor = options.beforePublish, inputs = options.assertInputsCurrent; actor?.(); inputs?.();
  const signers = [describePolicySigner(workspace, "TRANSPARENCY_ROOT"), describePolicySigner(workspace, "MERKLE_ROOT")];
  const local = signers.some(row => row.mode === "VAULT"), purpose = local ? capturePurposePublication(workspace, "artifact-seal") : null;
  const holder = local ? boundProviderKey(workspace, "artifact-seal")?.binding.provider ?? "file" : null;
  const keyset = canonicalize(assertKeysetComplete(workspace)), trust = canonicalize(loadTrustConfig(workspace));
  const current = () => { actor?.(); inputs?.();
    for (const signer of signers) assertPolicySignerCurrent(workspace, signer);
    if (canonicalize(assertKeysetComplete(workspace)) !== keyset || canonicalize(loadTrustConfig(workspace)) !== trust)
      throw new Error("original bench import log authority changed");
    if (purpose !== null && holder !== null) { const policy = keyPolicy(loadKeysConfig(workspace));
      for (const signer of signers.filter(row => row.mode === "VAULT")) {
        if (!policy.allowed.includes(signer.algorithm) || (holder === "file" && policy.requireNonExportable)) throw new Error("current purpose policy refuses bench import logging");
        assertSigningKeyUsable(workspace, "artifact-seal", signer.publicKeyPem, holder);
        if (holder === "file") { if (!vaultStatus(workspace).unlocked) throw new Error("vault locked; unlock required for bench import logging");
          if (publicKeyFromPrivate(getSigningKey(workspace, "artifact-seal")) !== signer.publicKeyPem) throw new Error("original bench import log key changed"); }
      }
    }
  }; current(); return current;
}
