---
"agent-maturity-compass": patch
---

Helm chart: select a P2-08 KeyProvider and switch on P2-09 ledger field encryption (P2-06 D5). Both are off by default, so an existing install renders exactly as before.

- `keyProvider.provider` (`file`, `aws-kms`, `gcp-kms`, `azure-kv`, `pkcs11`) with `keyProvider.credentialSecret` mounts the provider's credential from a Secret created out of band and names it with the provider's own variable (`GOOGLE_APPLICATION_CREDENTIALS`, `AWS_SHARED_CREDENTIALS_FILE`, `AZURE_CLIENT_CERTIFICATE_PATH`, `AMC_PKCS11_PIN_FILE`). `keyProvider.env` takes non-secret settings, limited by the schema to six names. The schema refuses `pkcs11` without a PIN Secret, a Secret name without a key (or the reverse), and a credential for the `file` provider. Purpose-key binding stays in the workspace's signed `keys` config and `amc keys rotate`.
- `ledgerEncryption.enabled=true` runs `files/ledger-encryption.sh` before Studio: it refuses unless the signed ops policy verifies, turns `ledgerEncryptionEnabled` on and re-signs, and creates the first data key wrapped at `keyProvider.provider`/`ledgerEncryption.keyRef` with `amc evidence-stores encrypt`. A failure stops the container before Studio.
- Fix: `amc evidence-stores encrypt` with the file provider failed with "Vault locked" in a fresh CLI process even with `AMC_VAULT_PASSPHRASE` set, because creating the vault wrap key needs an unlocked session. The file provider now opens the vault from `AMC_VAULT_PASSPHRASE` before creating it, as signing does; without a passphrase it still refuses.
- The P2-06 INS-1 check installs with the file provider and ledger encryption on, and verifies them in the running workspace after a governed turn.
