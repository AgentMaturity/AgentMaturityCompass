---
"agent-maturity-compass": patch
---

`amc up` in a terminal no longer offers to generate a passphrase for a workspace that already has a vault. It asks for that vault's passphrase, checks it against the vault before using or remembering it, and offers the passphrase bare `amc` saved in `.amc/local-vault-passphrase` when that one opens the vault. A remembered passphrase that no longer opens the vault is reported and not used.

`amc connect hooks install --provider claude-code --mode control` warns when Claude Code's settings (an enabled plugin, another call-changing hook, hooks disabled) will refuse the session registration, and names observe mode. `amc login status` suggests observe mode for Claude Code.
