---
"agent-maturity-compass": patch
---

`amc setup` in a folder without a workspace no longer seals the vault with a generated passphrase it then forgets (which left a vault nobody could open after the command exited). With `AMC_VAULT_PASSPHRASE` unset it now generates a random passphrase, remembers it for your user in the remembered store and prints only where ("Vault passphrase generated and remembered in <location>."). With `AMC_VAULT_REMEMBER=0` it refuses before creating anything and asks you to export `AMC_VAULT_PASSPHRASE`.
