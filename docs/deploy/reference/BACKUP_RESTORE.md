# Back up and restore the reference deployment

Backups are signed by the workspace auditor key and encrypted with `AMC_BACKUP_PASSPHRASE_FILE`. SQLite files are captured as consistent snapshots, so a backup can run while Studio writes (P2-09).

1. Create a backup while the workload runs: `amc backup create --out <file>` in the Studio pod. Copy it off the volume. (check BR-1)
2. Verify it where it will be restored: `amc backup verify <file> --pubkey <auditor.pub> --json` with the passphrase file set. The auditor key must be pinned from a source other than the backup itself. (check BR-1)
3. Restore into a new namespace and volume: a pod with the same image, the `amc-bootstrap` Secret copied in, and `amc backup restore <file> --to <new dir> --pubkey <auditor.pub>`. Read `<new dir>/.amc/RESTORE_WARNING.txt`; seals missing on sessions that were open at backup time are expected, anything else is not. (check BR-1)
4. Confirm the restored chain is a prefix of the source chain and `PRAGMA integrity_check` returns `ok`. (check BR-1)
5. Measure recovery: one backup cadence after a backup, delete the volume, restore, and record RPO and RTO against [RECOVERY_TARGETS.md](RECOVERY_TARGETS.md). (check BR-2)
6. Expect refusals with an error and no partial workspace: a backup with one flipped byte, a restore without the backup key, and a restore with `--force` into another tenant's workspace. (check BR-3)

Volume usage: alert on `amc_db_size_bytes` ([MONITORING.md](MONITORING.md)). Evidence that fails verification after a restore: [docs/runbooks/evidence-corruption.md](../../runbooks/evidence-corruption.md).
