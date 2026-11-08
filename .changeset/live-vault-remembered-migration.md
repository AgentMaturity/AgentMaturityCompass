---
"agent-maturity-compass": patch
---

A vault passphrase `amc up` remembered in `~/.config/amc/vault-credentials.json` before the file store moved to `$AMC_HOME/vault-credentials.json` is no longer lost when `AMC_HOME` is set: the first read for that workspace moves its entry into the AMC home file (0600) and removes it from the old file (deleting the old file when it empties). Only the workspace being read is moved, never with `AMC_VAULT_REMEMBER_FILE` set, and `amc vault forget` removes an entry from the old file too, so it cannot come back.
