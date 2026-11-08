---
"agent-maturity-compass": patch
---

`.amc/local-vault-passphrase` (the passphrase bare `amc` and `amc monitor start` keep for a vault they created) is no longer loaded by a process in agent mode or carrying an agent marker. Bare `amc`, `amc run` and `amc init` then score unsigned and say why; `amc monitor start` refuses with `Vault passphrase needed: the monitor does not read .amc/local-vault-passphrase under the agent marker <NAME>; export AMC_VAULT_PASSPHRASE.` Bare `amc` signs only with `AMC_VAULT_PASSPHRASE`, the operator-gated remembered passphrase, or that file; a vault unlocked any other way in the process is no longer taken as the operator's intent to sign.
