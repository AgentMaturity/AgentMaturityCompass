---
"agent-maturity-compass": patch
---

The console sign-in step `amc up` prints no longer sends a shell without a terminal into a locked vault: it says to export `AMC_VAULT_PASSPHRASE` (or set `AMC_VAULT_PASSPHRASE_FILE`) first, then run `amc user init --username <you> --password-file <file>`. Without a terminal the remembered passphrase is not used, so `--password-file` alone met `Vault locked`. docs/VAULT.md and docs/CONSOLE.md say the same.
