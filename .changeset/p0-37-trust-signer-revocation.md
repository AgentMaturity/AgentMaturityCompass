---
"agent-maturity-compass": patch
---

Revoking the artifact-seal key that still signs `.amc/trust.yaml` no longer half-applies. Before the key revocation list is staged, `amc keys revoke` checks trust.yaml under the pre-revocation state; when it verifies and the key being revoked signs it, a `superseded` or `unspecified` revocation re-signs its bytes unchanged with the current artifact-seal key, so policy signing keeps working. A `key-compromise` revocation never re-signs content the compromised key signed: trust.yaml stays refused (`reason: "signer-compromised"`) for the operator to review. A trust.yaml that does not verify is not re-signed and stays refused; the revocation still completes, and its output's `trustConfig` names the reason and the recovery command. No trust.yaml state can block a revocation: the revocation's own transparency append seals with the vault when the trust config is refused.

New `amc trust resign --confirm` (owner mode, unlocked vault) prints trust.yaml's sha256 and effective config, then re-signs exactly those bytes in place with the current artifact-seal key, keeping NOTARY settings. The content must verify under its recorded signer from key history (a retired or revoked signer is accepted for this re-sign only). A signer revoked as key-compromise also needs `--accept-compromised-signer`; a signer the operator trust context distrusts, and content that does not verify, are refused.

freeze-exception: P0-37 — `amc trust resign`, the in-place re-sign of trust.yaml after its signer key was rotated out or revoked (key rotation/revocation item)
