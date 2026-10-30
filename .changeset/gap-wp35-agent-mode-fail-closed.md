---
"agent-maturity-compass": patch
---

Agent mode fails closed and can no longer be left by the agent itself (DXA-49). A `.amc/mode.json` that exists but cannot be read, does not parse or names no known mode is now agent mode; only a missing file (a workspace that never entered agent mode) reads as owner. `amc mode owner` from agent mode prompts for the vault passphrase, ignores `AMC_VAULT_PASSPHRASE`, and refuses a wrong passphrase or a workspace without a vault. `mode.json` is written 0600.
