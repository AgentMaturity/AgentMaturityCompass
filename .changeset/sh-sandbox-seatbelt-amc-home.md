---
"agent-maturity-compass": patch
---

Seatbelt prevents a confined command from renaming or removing writable ancestors of a denied path.

The macOS confined shell now denies AMC's own home (`AMC_HOME`, and always `~/.config/amc`, where the vault passphrase file store kept its entries before it moved under `AMC_HOME`), the remembered vault passphrase file wherever the vault resolves it, the credentials file named by `AMC_CREDENTIALS_FILE`, every AMC secret file a `_FILE` variable names (`AMC_VAULT_PASSPHRASE_FILE`, the bootstrap password files, the session signing key, the notary auth secret, the Postgres URL) and the user `~/.env` layer, in addition to the legacy `~/.amc` spelling; a credential store selected with `--credentials-home`/`--credentials-file` (`agent-loop`, `amc acp`) or the SDK's `credentialsHome`/`credentialsFile` is denied once AMC opens it. The Linux confined shell, which mounts no host path outside the workspace and the runtime roots, now masks the same paths and the home credential stores when they lie inside the workspace (a workspace in the home directory, a passphrase file kept in the project). A confined command cannot read provider credentials, the vault passphrase or its store.
