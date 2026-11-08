---
"agent-maturity-compass": minor
---

Every `amc` command now reads `AMC_VAULT_PASSPHRASE_FILE` when `AMC_VAULT_PASSPHRASE` is unset (the variable wins), so a cron job or a plain host can verify and sign with the vault passphrase kept in a file. The file must be a regular file you own with mode 0600 or 0400 (not a symlink); any other file is refused with one line on stderr and the vault stays locked. Its value unlocks the vault in that process only: it never enters the environment or a child process, and it is never printed. While it is set, the remembered passphrase store is not read. `amc up`, `amc mcp` and the hook forwarder do not read it; `amc bootstrap`, `amc host bootstrap`, `amc studio start` and `amc doctor` keep reading it as before. Kubernetes secret volumes and Compose secrets not owned by the container user fail the ownership and mode checks, so in those containers keep the `sh -c 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc …'` form (docs/VAULT.md).
