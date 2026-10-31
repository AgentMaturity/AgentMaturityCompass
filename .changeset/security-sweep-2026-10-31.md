---
"agent-maturity-compass": patch
---

Security sweep fixes (2026-10-31).

- The `grep` and `glob` tools, `fs.read`, `fs.write`, `fs.edit` and the `bash` working directory now refuse `.amc` and `.git` under any spelling (`.AMC`, `.Amc`, `.GIT`, also as a nested segment). On a case-insensitive volume (the macOS and Windows default) those spellings open the protected directories, and a model-chosen search path could read the Studio admin token or `.git/config`. Protection is now decided by file identity (the device and inode of the workspace's `.amc` and `.git`), so a directory reached under another name is refused too, and, as a second lock, by folded name: segments with trailing dots or spaces, `:` (NTFS streams) or an 8.3 short-name pattern (`~1`) are refused. The toolhub's protected-path floor decides by identity as well, and its deny globs compare case-insensitively.
- An experiment baseline or candidate configuration named through `.AMC/...` is refused like `.amc/...`: the check now compares on-disk names.
