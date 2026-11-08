---
"agent-maturity-compass": patch
---

The vault passphrase `amc up` remembered (macOS Keychain item `amc-vault` or `$AMC_HOME/vault-credentials.json`) now unlocks the vault only for an interactive operator: stdin a terminal, the workspace not in agent mode, and none of the agent markers set (`AMC_LEASE`, `AMC_TOKEN`, `AMC_EVALUATED_AGENT`, `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CODEX_SANDBOX`, `CODEX_SANDBOX_NETWORK_DISABLED`, `CODEX_CI`, `CODEX_THREAD_ID`, `CODEX_TOOL_CALL_ID`, `GEMINI_CLI`, `PI_CODING_AGENT`). A coding agent, hook or cron job running as the same OS user no longer gets operator signing from it. An operator whose terminal carries a marker sees one stderr line naming it.

- Governance commands (the owner-only set plus `user`, `trust`, `firewall`, `policy`, `tools`, `keys`, `identity`, `sso`, `scim`, `ops sign`, `studio lan`, `connect hooks install|remove`, `lease issue`, `gateway`, `ticket issue`, `workorder`, `notary sign`) whose vault was opened from the remembered store ask `Sign <command> with the vault passphrase remembered in <location>?` first (default No). No locks the vault again and holds for the rest of the command. Export `AMC_VAULT_PASSPHRASE` to skip the question. The question is asked on stderr, so piped or redirected output stays clean, and reads under those names that sign nothing (`keys list`, `firewall status`, `tools list`, `policy controls`, `policy test`, `connect hooks health` and similar) and `amc down` do not ask.
- `amc up` refuses the remembered store in a shell that carries an agent marker and says to export `AMC_VAULT_PASSPHRASE` deliberately.
- `amc vault unlock`, and every command that unlocks the vault itself, refuses in a shell without a terminal with `Vault passphrase needed: export AMC_VAULT_PASSPHRASE for this shell, or re-run this command from your terminal.` instead of failing inside the prompt.
- `amc doctor`'s vault check says why the remembered passphrase is not used in the current shell.
