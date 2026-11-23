---
"agent-maturity-compass": patch
---

Security fix: `amc session rewind` can no longer be tricked, by a folder swapped for a link, into writing or deleting a file outside the workspace. Before, another program that swapped a folder on the file's path for a link at the right moment, after the rewind's last check, could send the write or the removal to the link's target. The rewind now enters the folder that holds the file, checks that it is the planned folder and not a link, and only then writes, renames or removes the file by its bare name inside that folder, so a later link swap has no effect on where the change lands. Missing folders are made one at a time the same way. A folder that is itself moved away and replaced is noticed up to the last check before each change; a move in the moment between that check and the change is narrowed, not ruled out. If AMC cannot return to the folder it was started in, the rewind stops, records what it did and says that some files may have changed.

Rewind no longer runs on Windows: it is refused there before the confirmation question, because this check has not been verified on Windows. `--dry-run` still works there.
