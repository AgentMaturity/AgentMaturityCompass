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

    These Helm forms ran on a throwaway kind cluster on 2026-11-09 ([What was run](#what-was-run)); the Compose forms are in [COMPOSE.md](COMPOSE.md#backup).
2. Verify it where it will be restored: `amc backup verify <file> --pubkey <auditor.pub> --json` with the passphrase file set. The auditor key must be pinned from a source other than the backup itself. (check BR-1)
3. Restore into a new namespace and volume: a pod with the same image, the `amc-bootstrap` Secret copied in, and `amc backup restore <file> --to <new dir> --pubkey <auditor.pub>`. Read `<new dir>/.amc/RESTORE_WARNING.txt`; seals missing on sessions that were open at backup time are expected, anything else is not. Before Studio first starts on the new claims, put the checkpoint archive on the new state claim from a pod that mounts it (`kubectl -n <new ns> exec -i <pod> -- tar -xzf - -C /home/amc/.config/amc/state < ./amc-control-checkpoints-<ts>.tgz`), and serve the restored workspace from the source's path (`/data/amc`): checkpoints are filed under the workspace path. A bundle restored without its checkpoint archive leaves every signed control the workspace ever published failing closed (`uncommitted journal revision <n> exists without a checkpoint`). (check BR-1)
4. Confirm the restored chain is a prefix of the source chain and `PRAGMA integrity_check` returns `ok`. (check BR-1)
5. Measure recovery: one backup cadence after a backup, delete the volume, restore, and record RPO and RTO against [RECOVERY_TARGETS.md](RECOVERY_TARGETS.md). (check BR-2)
6. Expect refusals with an error and no partial workspace: a backup with one flipped byte, a restore without the backup key, and a restore with `--force` into another tenant's workspace. (check BR-3)

Volume usage: alert on `amc_db_size_bytes` ([MONITORING.md](MONITORING.md)). Evidence that fails verification after a restore: [docs/runbooks/evidence-corruption.md](../../runbooks/evidence-corruption.md).

## What was run

On 2026-11-09, on a throwaway kind cluster (kind v0.33.0, node image `kindest/node` v1.37.0, helm v4.3.0, kubectl v1.37.1) in a colima VM (linux/arm64, Docker 29.5.2, 4 vCPUs, 6 GB) on a shared macOS arm64 host. The image was a build of the follow-up branch (`amc-studio:fu1109`), loaded with `kind load docker-image` and deployed by digest (`scripts/deploy/kind-image-digest.mjs`, `image.requireDigest=true`), with the chart's defaults otherwise (`runAsUser` 10001, `fsGroup` 10001, read-only root, the bootstrap secrets as a projected volume at `/run/secrets`).

- Install: `helm upgrade --install --atomic --wait` succeeded in 15 s. The pod bootstrapped from the projected secret volume: `/run/secrets/amc_vault_passphrase` is a symlink through `..data` to a root-owned file (group 10001, mode 0644) on a read-only tmpfs whose directory mode is 3777. This build reads that file as `AMC_VAULT_PASSPHRASE_FILE` for every command ([VAULT.md](../../VAULT.md)), so `amc firewall enable --mode observe`, run with `kubectl exec` and no passphrase in the environment, published revision 1 with its checkpoint under `/home/amc/.config/amc/state/control-checkpoints`.
- Step 1, as written, while Studio ran: the stdin backup wrote a 225,389-byte bundle in 2 s and left `/tmp` empty; the checkpoint archive held the revision-1 checkpoint and the trust pin.
- Step 2: `amc backup verify --pubkey <artifact-seal.pub> --json` on the host: ok, trusted. The source was then moved to firewall revision 2.
- Step 3, into a new namespace: the `amc-bootstrap` Secret copied in; the chart's two claims (`amc-amc`, `amc-amc-state`) created first, labelled for adoption by the release; a pod with the same image mounting both claims ran `amc backup restore --to /data/amc/.restore --pubkey` (exit 0; one `INFO:` note naming the gateway session open at backup time, no `RESTORE_WARNING.txt`), moved the restored `.amc` to `/data/amc`, and unpacked the checkpoint archive onto the state claim with the `tar -xzf -` line above; that pod was deleted and the chart installed with `bootstrap.enabled=false` (12 s, the claims adopted). On the restored workspace `amc firewall status --json` read `integrity: trusted`, revision 1, mode `observe`, and `amc verify` passed, naming the restored session and the new Studio's gateway session as open.
- The same restore into a third namespace without the checkpoint archive (the negative control): the firewall read `integrity: invalid`, `Signed runtime-firewall-policy uncommitted journal revision 1 exists without a checkpoint`, as step 3 says.

Not run: steps 4 to 6 (the prefix and `PRAGMA integrity_check` comparison, the RPO and RTO measurement, the refusal cases), `helm test`, and any multi-node, cloud or amd64 cluster. The cluster was deleted after the run.

