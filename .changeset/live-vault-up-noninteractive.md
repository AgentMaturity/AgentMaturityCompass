---
"agent-maturity-compass": patch
---

A non-interactive `amc up` with no vault and no `AMC_VAULT_PASSPHRASE` still generates a passphrase into the remembered store (never printed), and now says that your own terminal (same user, same `AMC_HOME`) unlocks from that store. On a CI runner (`CI` or `GITHUB_ACTIONS` set), whose store does not outlive the job, it refuses with the "Vault passphrase required in non-interactive shells" error instead of sealing a vault nobody can open again. With `AMC_VAULT_REMEMBER=0` it no longer prints "generated one" and then fails: it refuses with the same error, and with a vault present it says remembering is disabled instead of naming stores it does not read. The error's Option 2 now reads "first-time setup in a terminal (remembers a generated passphrase): amc setup".
