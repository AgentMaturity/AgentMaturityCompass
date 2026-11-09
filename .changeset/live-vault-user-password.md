---
"agent-maturity-compass": minor
---

Console accounts can be managed without a terminal, `amc user init` no longer wipes accounts by accident, and passwords can be reset.

- New `amc user password <username> [--password-file <path>]` sets a new password for an existing account (same user id, status and roles) and ends every session signed in with the old password: `users.yaml` records when the password changed and each session token carries the value it was minted under, so a login that checked the old password while the reset ran, or a session record the command could not mark revoked (one Studio owns while the command runs as another OS user), no longer verifies either. Sessions of other users stay signed in.
- `amc user init` and `amc user add` take `--password-file <path>` (the file's trimmed contents; an empty file is refused). Without the option and without a terminal they fail with "No terminal for the password prompt: pass --password-file <path> (a private file holding the password)." instead of failing inside the prompt. A password is never accepted as an argument.
- `amc user init` refuses when `.amc/users.yaml` exists: "users.yaml already exists; pass --force to replace every account, or use amc user add". `--force` replaces the file and every account in it, as `user init` did before.

freeze-exception: LIVE-VAULT — console users must be able to reset a password without a new username
