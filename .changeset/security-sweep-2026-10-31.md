---
"agent-maturity-compass": patch
---

Security sweep fixes (2026-10-31).

- The `grep` and `glob` tools, `fs.read`, `fs.write`, `fs.edit` and the `bash` working directory now refuse `.amc` and `.git` under any spelling (`.AMC`, `.Amc`, `.GIT`, also as a nested segment). On a case-insensitive volume (the macOS and Windows default) those spellings open the protected directories, and a model-chosen search path could read the Studio admin token or `.git/config`. The toolhub's protected-path floor and its deny globs compare case-insensitively too.
- An experiment baseline or candidate configuration named through `.AMC/...` is refused like `.amc/...`: the check now compares on-disk names.
