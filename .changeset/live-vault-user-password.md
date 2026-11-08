---
"agent-maturity-compass": minor
---

Console accounts can be managed without a terminal, `amc user init` no longer wipes accounts by accident, and passwords can be reset.

- New `amc user password <username> [--password-file <path>]` sets a new password for an existing account (same user id, status and roles) and revokes every signed-in session of that user.
- `amc user init` and `amc user add` take `--password-file <path>` (the file's trimmed contents; an empty file is refused). Without the option and without a terminal they fail with "No terminal for the password prompt: pass --password-file <path> (a private file holding the password)." instead of failing inside the prompt. A password is never accepted as an argument.
- `amc user init` refuses when `.amc/users.yaml` exists: "users.yaml already exists; pass --force to replace every account, or use amc user add". `--force` replaces the file and every account in it, as `user init` did before.

freeze-exception: LIVE-VAULT — console users must be able to reset a password without a new username
