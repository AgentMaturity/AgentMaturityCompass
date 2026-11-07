---
"agent-maturity-compass": patch
---

The macOS confined shell now denies AMC's own home (`~/.config/amc` or `AMC_HOME`), the credentials file named by `AMC_CREDENTIALS_FILE`, the user `~/.env` layer and `AMC_VAULT_REMEMBER_FILE`, in addition to the legacy `~/.amc` spelling, so a confined command cannot read provider credentials or the vault passphrase store.
