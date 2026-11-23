---
"agent-maturity-compass": patch
---

Security fix: `amc session rewind` can no longer be tricked, by a folder swapped for a link, into writing or deleting a file outside the workspace. Before, another program that swapped a folder on the file's path for a link at the right moment, after the rewind's last check, could send the write or the removal to the link's target. The rewind now enters the folder that holds the file, checks that it is the planned folder and not a link, and only then writes, renames or removes the file by its bare name inside that folder, so a later swap has no effect on where the change lands. Missing folders are made one at a time the same way. The rewind is refused on Windows, where this check is not available; `--dry-run` still works there.
