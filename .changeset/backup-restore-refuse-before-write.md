---
"agent-maturity-compass": patch
---

`amc backup restore` decides every refusal before it writes (P2-06-D4). A restore with `--force` into another tenant's initialised workspace used to extract over it and only then fail on the key set's anti-rollback check (`FORK_DETECTED`), leaving that workspace's `.amc` changed. Now a target that holds a workspace must hold the backup's own (the same key set), and the backup's key set must pass this machine's committed and adopted marks for the target path, before anything is written; otherwise the restore is refused with the target untouched. The restore is then staged next to the target on the same filesystem, verified and sealed there, and moved into place by rename, so a later failure (an audit row that cannot be signed, say) leaves no partial workspace. Over the same workspace, the replaced entries are kept in `<target>/.amc-pre-restore-*`, which the command prints and the result returns as `replacedTo`.
