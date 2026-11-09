---
"agent-maturity-compass": patch
---

`amc doctor` has a new `amc-gitignore` check for a workspace inside a git work tree. It fails when a `.amc` secret (`local-vault-passphrase`, `studio/admin.token`, `studio/sessions`, `auth/api-keys.json`, `license.key`, `blobs/unvaulted.key`, `bridge/pairing-codes.json`) is committed (fix: `git rm --cached <file> && git commit`, then rotate it) or is not git-ignored (fix: `amc up` writes `.amc/.gitignore` once, or add the lines to it). Outside a git repository it is informational. `amc doctor-fix` now writes a missing `.amc/.gitignore` (never under `--dry-run`, never over an existing one).
