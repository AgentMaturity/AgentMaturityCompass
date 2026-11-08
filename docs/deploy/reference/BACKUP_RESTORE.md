# Back up and restore the reference deployment

Backups are signed by the workspace auditor key and encrypted with `AMC_BACKUP_PASSPHRASE_FILE`. SQLite files are captured as consistent snapshots, so a backup can run while Studio writes (P2-09).

1. Create a backup while the workload runs: `amc backup create --out <file>` in the Studio pod. Copy it off the volume. (check BR-1) The chart has no values key for the backup passphrase: feed it on stdin into a file in `/tmp` and delete it in the same command, so it never reaches argv, a values file or the volume:

    ```bash
    kubectl -n <ns> exec -i deploy/<fullname> -c amc-studio -- sh -c 'umask 077; cat > /tmp/amc-backup-pass; cd /data/amc && AMC_BACKUP_PASSPHRASE_FILE=/tmp/amc-backup-pass AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc backup create --out /tmp/amc-backup.amcbackup >&2 && cat /tmp/amc-backup.amcbackup; status=$?; rm -f /tmp/amc-backup-pass /tmp/amc-backup.amcbackup; exit $status' < ./backup-passphrase.txt > ./amc-<ts>.amcbackup
    ```

    The bundle does not contain the signed-control checkpoints, which chart 0.4.1 keeps on the state claim (`<amcHomeState.mountPath>/control-checkpoints`, by default `/home/amc/.config/amc/state/control-checkpoints`). Archive them with the bundle:

    ```bash
    kubectl -n <ns> exec deploy/<fullname> -c amc-studio -- tar -czf - -C /home/amc/.config/amc/state control-checkpoints > ./amc-control-checkpoints-<ts>.tgz
    ```

    The bundle and this archive must come from one moment: make no firewall, guardrail, legal-hold or compiled-control change from the start of the bundle to the end of the archive, and take both again if one was made. Keep the two files together; a restore needs both.

    These Helm forms are documented and were not run (no cluster in the 2026-11-08 run); the Compose forms in [COMPOSE.md](COMPOSE.md#backup) were.
2. Verify it where it will be restored: `amc backup verify <file> --pubkey <auditor.pub> --json` with the passphrase file set. The auditor key must be pinned from a source other than the backup itself. (check BR-1)
3. Restore into a new namespace and volume: a pod with the same image, the `amc-bootstrap` Secret copied in, and `amc backup restore <file> --to <new dir> --pubkey <auditor.pub>`. Read `<new dir>/.amc/RESTORE_WARNING.txt`; seals missing on sessions that were open at backup time are expected, anything else is not. Before Studio first starts on the new claims, put the checkpoint archive on the new state claim from a pod that mounts it (`kubectl -n <new ns> exec -i <pod> -- tar -xzf - -C /home/amc/.config/amc/state < ./amc-control-checkpoints-<ts>.tgz`), and serve the restored workspace from the source's path (`/data/amc`): checkpoints are filed under the workspace path. A bundle restored without its checkpoint archive leaves every signed control the workspace ever published failing closed (`uncommitted journal revision <n> exists without a checkpoint`). (check BR-1)
4. Confirm the restored chain is a prefix of the source chain and `PRAGMA integrity_check` returns `ok`. (check BR-1)
5. Measure recovery: one backup cadence after a backup, delete the volume, restore, and record RPO and RTO against [RECOVERY_TARGETS.md](RECOVERY_TARGETS.md). (check BR-2)
6. Expect refusals with an error and no partial workspace: a backup with one flipped byte, a restore without the backup key, and a restore with `--force` into another tenant's workspace. (check BR-3)

Volume usage: alert on `amc_db_size_bytes` ([MONITORING.md](MONITORING.md)). Evidence that fails verification after a restore: [docs/runbooks/evidence-corruption.md](../../runbooks/evidence-corruption.md).
