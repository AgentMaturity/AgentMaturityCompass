---
"agent-maturity-compass": patch
---

Studio's Vault surface (and `amc run`) no longer reports a false "payload authentication failed" while the vault is locked. Payloads whose key the locked vault holds are reported through the same "not evaluated" wording as `amc verify`: the surface reads pending, never failed and never success, and names how to unlock (`AMC_VAULT_PASSPHRASE`, `AMC_VAULT_PASSPHRASE_FILE`, or your terminal).
