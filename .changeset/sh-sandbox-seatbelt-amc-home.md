---
"agent-maturity-compass": patch
---

The macOS confined shell now denies AMC's own home (`~/.config/amc` or `AMC_HOME`), the credentials file named by `AMC_CREDENTIALS_FILE`, the user `~/.env` layer and `AMC_VAULT_REMEMBER_FILE`, in addition to the legacy `~/.amc` spelling; the default `~/.config/amc` stays denied when `AMC_HOME` points elsewhere (the vault passphrase file store defaults there), and a credential store selected with `--credentials-home`/`--credentials-file` or the SDK's `credentialsHome`/`credentialsFile` is denied once the session opens it. A confined command cannot read provider credentials or the vault passphrase store.
