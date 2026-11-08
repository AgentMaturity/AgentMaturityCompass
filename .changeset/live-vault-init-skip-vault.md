---
"agent-maturity-compass": patch
---

`amc init --skip-vault` no longer seals the vault with `skip-vault-<timestamp>`, a passphrase anyone could recover from the vault file's modification time. With `AMC_VAULT_PASSPHRASE` unset it now generates a random passphrase (the same `amc-local-…` form `amc init --minimal` uses), remembers it for your user in the remembered store and prints only where: "Vault passphrase generated and remembered in <location>; your own terminal unlocks from it (export AMC_VAULT_PASSPHRASE elsewhere)." With `AMC_VAULT_REMEMBER=0` it refuses before writing anything. `amc init --minimal` keeps printing its one-time export line and, under GitHub Actions, prints `::add-mask::` for the value first so the job log masks it.
