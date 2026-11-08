# Run AMC with Docker Compose (single host)

Status in D-03 vocabulary: **documented; not qualified**. A deployment is "qualified within scope S, versions V, window W" only with the receipts and agreed recovery targets [TOPOLOGY.md](TOPOLOGY.md) describes; no Compose deployment has them. What was run, and where, is listed under [What was run](#what-was-run). Recovery cadence, RPO and RTO are Sid's to agree in [RECOVERY_TARGETS.md](RECOVERY_TARGETS.md); this runbook does not set them.

Stacks, all built from the root `Dockerfile` `studio` target:

| Stack | File | Use |
|---|---|---|
| TLS | `deploy/compose/docker-compose.tls.yml` | The single-host stack for live users: Caddy terminates TLS on `AMC_TLS_PORT` (default 8443) with a private CA (`tls internal`), Studio and the notary stay on the internal network. Named volumes `amc_data`, `amc_state`, `amc_control_checkpoints`, `amc_notary_data`, `caddy_data`. |
| HTTP | `deploy/compose/docker-compose.yml` | Loopback or a private network only: ports publish on `AMC_PUBLISH_ADDRESS` (default `127.0.0.1`). Volumes `amc_data`, `amc_state`, `amc_control_checkpoints`, scoped to the Compose project (`<project>_amc_data`, ...). |
| Source | `docker/docker-compose.yml` | The same Studio for a source checkout, with the one-shot `verify` profile. Service `amc-studio`. |

Every command below runs in `deploy/compose` (the `docker/` stack: in the repository root, with `-f docker/docker-compose.yml`). Keep three volumes together through every backup, upgrade and rollback: the workspace (`/data/amc`), the state volume (`/home/amc/.config/amc/state`: this machine's anti-rollback marks and key-set recovery copies) and the signed-control checkpoint volume (`/workspace`, `AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints`). Never run `docker compose down -v`: it deletes them.

## Install

1. `cp .env.example .env`, then set in `.env`:
    - `AMC_TLS_HOST` (TLS stack): the exact hostname or IP clients use, without scheme, port or path.
    - `AMC_STUDIO_IMAGE`: leave `amc-studio:local` for the first build; it names the image every later upgrade and rollback switches.
    - `AMC_EXTRA_ORIGINS`: any further browser origins (`scheme://host[:port]`, no path), for example a LAN address. The stack's own origin is always admitted.
    - `AMC_PUBLISH_ADDRESS` (HTTP stack): keep `127.0.0.1` unless clients on other machines must reach it; the CIDR gate is not a bind restriction.
2. Create the secret files under `secrets/` from the `.example` templates, each with your own value, readable by uid 10001 and nobody else you do not trust: `amc_vault_passphrase.txt`, `amc_owner_username.txt`, `amc_owner_password.txt`, `amc_backup_passphrase.txt`, and for the TLS stack `amc_notary_passphrase.txt` and `amc_notary_auth_secret.txt`. Compose refuses to start while one is missing.
3. Build and start: `docker compose -f docker-compose.tls.yml up -d --build` (HTTP: `docker compose up -d --build`). The image's build step needs about 4 GB of free memory for `tsc`. Record the image you run: `docker image inspect --format '{{.Id}}' amc-studio:local`.
4. Wait for `docker inspect --format '{{.State.Health.Status}}' amc-studio` to read `healthy` (HTTP: `docker compose ps studio`). The healthcheck probes `/healthz` and `/readyz` every 30 s after a 120 s start period.
5. TLS: export only the public CA certificate and trust it in each client: `docker compose -f docker-compose.tls.yml cp caddy:/data/caddy/pki/authorities/local/root.crt ./amc-local-ca.crt`, then `curl --cacert ./amc-local-ca.crt https://<AMC_TLS_HOST>:<AMC_TLS_PORT>/readyz`.
6. Pin the monitor key before anyone relies on a verdict: `docker compose -f docker-compose.tls.yml exec amc-studio sha256sum /data/amc/.amc/keys/monitor_ed25519.pub`, keep the value outside the host, put it in `.env` as `AMC_EXPECTED_MONITOR_FINGERPRINT=<sha256>` and run `up -d --no-build` again. Until it is set, native-task verdicts are unanchored and do not count as verified.
7. Pair and sign in: the containers run in LAN mode, so `/auth/login` answers 403 until the browser claims a one-time pairing code. Mint one with `docker compose -f docker-compose.tls.yml exec -w /data/amc amc-studio sh -c 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc pair create --ttl 10m'`, enter it on the pairing page, then sign in as the owner. Every device pairs once.

Sizing: the two `deploy/compose` Studio services are limited to 2 CPUs and 2 GB of memory with a 512 MB reservation, because the backup and verify commands you run inside the container share its cgroup. The Helm chart's values (1 CPU, 2 Gi limit, 200m and 512 Mi requests) are a cluster value with a scheduler. Measured values are listed under [What was run](#what-was-run).

## Backup

`amc backup create` writes a signed bundle encrypted with `AMC_BACKUP_PASSPHRASE_FILE` (the `amc_backup_passphrase` secret). It runs inside the Studio container, in the workspace, with the vault passphrase exported from its file inside `sh -c`, and writes to `/tmp`, a tmpfs, so a bundle never lands inside the next bundle and never stays on the volume it protects. `docker compose cp` cannot read a tmpfs, so the same command streams the bundle to your machine and deletes it:

TLS stack:

1. Create the bundle, stream it out and remove it, in one command (the CLI's own messages go to stderr):

    ```bash
    docker compose -f docker-compose.tls.yml exec -T -w /data/amc amc-studio sh -c 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc backup create --out /tmp/amc-backup.amcbackup >&2 && cat /tmp/amc-backup.amcbackup; status=$?; rm -f /tmp/amc-backup.amcbackup; exit $status' > ./amc-$(date -u +%Y%m%dT%H%M%SZ).amcbackup
    ```

    A non-zero exit means no usable bundle: delete the output file and read the message.
2. On the operator's machine, with `AMC_BACKUP_PASSPHRASE_FILE` pointing at a copy of the backup passphrase: `amc backup verify ./amc-<ts>.amcbackup --pubkey <recorded artifact-seal.pub>`. Record `/data/amc/.amc/keys/artifact-seal.pub` (the key that signs the bundle; `auditor_ed25519.pub` holds the same key) once, at install, from a source other than a backup.

HTTP stack: the same commands with `-f docker-compose.yml` and service `studio`. Source stack: `-f docker/docker-compose.yml` and service `amc-studio`.

The state and checkpoint volumes are not in the bundle. Archive them through the same service, which uses each stack's real volume names, and keep the archive with the bundle. Stop Studio for it, so the copy is exact: on a running Studio GNU tar exits 1 when a file changes while it is read.

```bash
docker compose -f docker-compose.tls.yml stop amc-studio
docker compose -f docker-compose.tls.yml run --rm --no-deps -T --entrypoint tar amc-studio \
  -czf - -C / home/amc/.config/amc/state workspace/control-checkpoints > ./amc-volumes-$(date -u +%Y%m%dT%H%M%SZ).tgz
docker compose -f docker-compose.tls.yml start amc-studio
```

`/tmp` is a tmpfs of at most half the container's memory by default. For a workspace larger than that, an owner-signed ops-policy change that adds `.amc/backups` to `backups.excludePaths`, followed by `--out /data/amc/.amc/backups/<file>`, is the alternative; copy the bundle off the host the same way.

## Upgrade (N-1 to N)

1. Record the current image: `grep AMC_STUDIO_IMAGE .env` and `docker image inspect --format '{{.Id}}' <that value>`. Keep that image: `docker image prune` deletes an untagged rollback image.
2. Back up as above, and archive the two volumes.
3. Build the new image from the new checkout: `docker build --target studio -t amc-studio:<git sha> .` (repository root), then `docker image inspect --format '{{.Id}}' amc-studio:<git sha>`.
4. Set `AMC_STUDIO_IMAGE=amc-studio:<git sha>` (or the image id) in `.env`. Change it there, never as a one-shot prefix on the command line: the next `up -d` would revert it.
5. `docker compose -f docker-compose.tls.yml up -d --no-build`. The volumes stay; only the containers are replaced. Studio has 40 s (`stop_grace_period`) to drain and seal its session.
6. Verify:
    - `curl --cacert ./amc-local-ca.crt https://<AMC_TLS_HOST>:<AMC_TLS_PORT>/readyz` answers 200.
    - `docker compose -f docker-compose.tls.yml exec -w /data/amc amc-studio sh -c 'AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc doctor --strict --json'`.
    - `amc verify all --json --expect-monitor <sha256>` in the same way. While Studio runs, its own gateway session is open, so the verdict is a verified prefix that names that session; a complete-ledger verdict needs Studio stopped.
    - One governed turn: `NODE_EXTRA_CA_CERTS=./amc-local-ca.crt node scripts/deploy/governed-turn-probe.mjs --base-url https://<AMC_TLS_HOST>:<AMC_TLS_PORT> --username-file secrets/amc_owner_username.txt --password-file secrets/amc_owner_password.txt --pairing-code-file <file with a fresh pairing code> --ready-timeout-ms 60000`. It exits 0 on `verified` or `verified-prefix`.

## Upgrade from 1.1.1

The 1.1.1 HTTP stack (`git show v1.1.1:deploy/compose/docker-compose.yml`) ran service `studio` **as root** from `/app` (`node dist/cli.js`), with the workspace in the project volume `amc_data` (`<project>_amc_data`; from `deploy/compose` the default project is `compose`, so `compose_amc_data`; confirm with `docker volume ls --filter label=com.docker.compose.volume=amc_data`). The 2.0.0 image runs as uid 10001 on a read-only root and cannot read a root-owned volume. The 1.1.1 TLS stack already ran the root `Dockerfile` as uid 10001 with the global volumes `amc_data` and `amc_notary_data`; skip step 3 there.

1. On the running **1.1.1** stack, record the monitor fingerprint (`docker compose exec studio sha256sum /data/amc/.amc/keys/monitor_ed25519.pub`) and take the signed backup 1.1.1 requires (it refuses without a backup passphrase), feeding the backup passphrase on stdin so it never reaches argv:

    ```bash
    docker compose exec -T -w /data/amc studio sh -c 'read -r AMC_BACKUP_PASSPHRASE; export AMC_BACKUP_PASSPHRASE; AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" node /app/dist/cli.js backup create --out /tmp/amc-1.1.1.amcbackup >&2 && cat /tmp/amc-1.1.1.amcbackup; status=$?; rm -f /tmp/amc-1.1.1.amcbackup; exit $status' < ./backup-passphrase.txt > ./amc-1.1.1-$(date -u +%Y%m%dT%H%M%SZ).amcbackup
    ```

    Never run `amc verify --repair` on 1.1.1. Read [docs/releases/2.0.0.md](../../releases/2.0.0.md), "Migration from 1.1.1", and [docs/MIGRATION_RUNBOOK.md](../../MIGRATION_RUNBOOK.md) before the next step: once 2.0.0 unlocks the vault, 1.1.1 cannot read it.
2. `docker compose down` (never `down -v`).
3. HTTP stack only, once: `docker run --rm -v compose_amc_data:/data/amc alpine:3.20 chown -R 10001:10001 /data/amc` (use your project's volume name).
4. Check out 2.0.0, create the new secret file `secrets/amc_backup_passphrase.txt`, set `AMC_BOOTSTRAP=0` in `.env` (the workspace exists), and start the 2.0.0 stack: `docker compose up -d --build`. The state and checkpoint volumes are created empty.
5. Follow the release notes' migration steps (key history migration, the monitor pin as `AMC_EXPECTED_MONITOR_FINGERPRINT`), then verify as in [Upgrade](#upgrade-n-1-to-n) step 6.

These steps are documented and were not run: no 1.1.1 Compose stack was available for the 2026-11-08 run.

## Rollback

1. Set `AMC_STUDIO_IMAGE=<previous image>` in `.env` and run `docker compose -f docker-compose.tls.yml up -d --no-build`. The volumes stay; never `down -v`.
2. Across a ledger migration the older image refuses the newer ledger (`ledger schema version <n> is newer than this AMC; restore the pre-upgrade backup or upgrade AMC`, the P2-09 downgrade guard, as in [ROLLBACK.md](ROLLBACK.md) step 2) and never becomes healthy. That is the designed outcome, not a fault.
3. To go back anyway, restore the pre-upgrade backup with the older image:
    1. `docker compose -f docker-compose.tls.yml stop amc-studio`.
    2. Restore into a fresh directory, never with `--force` over the live workspace. The bundle goes in on stdin, so the container user needs no access to your files; only the public key is mounted:

        ```bash
        docker compose -f docker-compose.tls.yml run --rm --no-deps -T -v "$PWD/artifact-seal.pub":/in/artifact-seal.pub:ro --entrypoint sh amc-studio \
          -c 'cat > /tmp/restore.amcbackup && cd /data/amc && AMC_VAULT_PASSPHRASE="$(cat "$AMC_VAULT_PASSPHRASE_FILE")" amc backup restore /tmp/restore.amcbackup --to /data/amc/.restore --pubkey /in/artifact-seal.pub' < ./amc-<ts>.amcbackup
        ```

    3. Swap the workspace's `.amc` for the restored one, as [ROLLBACK.md](ROLLBACK.md) step 3 does: `docker compose -f docker-compose.tls.yml run --rm --no-deps --entrypoint sh amc-studio -c 'cd /data/amc && mv .amc .amc.rolled-back && mv .restore/.amc .amc'`.
    4. Restore the two volumes from their archive: `docker compose -f docker-compose.tls.yml run --rm --no-deps -T --entrypoint tar amc-studio -xzf - -C / < ./amc-volumes-<ts>.tgz`.
    5. `docker compose -f docker-compose.tls.yml up -d --no-build`, then verify as in [Upgrade](#upgrade-n-1-to-n) step 6.

Restoring the state volume rolls this machine's anti-rollback marks back to the backup time: re-apply every revocation and key set accepted after the backup ([docs/KEY_LIFECYCLE.md](../../KEY_LIFECYCLE.md)). A rollback never restores what the newer version wrote: ledger rows written after the backup are gone, and a vault that a 2.0.0 unlock converted to version 2 stays version 2 ([docs/releases/2.0.0.md](../../releases/2.0.0.md)).

The rehearsal for this procedure is `scripts/deploy/compose-rehearsal.mjs`: it runs image A, then B, then A again on one Compose project through `AMC_STUDIO_IMAGE`, with READY, a pairing code and one governed turn per phase, and records a stop at the downgrade guard as the documented outcome. It never runs `down -v`; `--cleanup` removes only the volumes of the project it created.

## TLS for a public hostname

Documented; not run; not qualified. The TLS stack issues its certificate from Caddy's private CA. For a public hostname, edit `Caddyfile` in one of two ways:

- An operator certificate: bind-mount it (for example `./certs:/certs:ro` on the `caddy` service) and replace `tls internal` with `tls /certs/<host>.crt /certs/<host>.key`.
- ACME: remove `tls internal`, publish port 80 as well as 443 (`"80:80"` on `caddy`), and point the public DNS name at the host.

Three statements an operator must accept:

1. The certificate key must be readable by the uid Caddy runs as (root in the official image) with mode 0600: the service drops every capability, so even root in the container has no `DAC_OVERRIDE` to read a file it does not own.
2. Studio admits a client only when its address, taken from `X-Forwarded-For` (`AMC_TRUSTED_PROXY_HOPS=1`), is inside `AMC_ALLOWED_CIDRS`; the default is the private ranges and loopback. A public audience needs the operator to list its client ranges there, keeping `127.0.0.1/32` for the in-container healthcheck. `0.0.0.0/0` is not recommended. Widening it is the operator's security decision.
3. LAN pairing still applies: every device claims a pairing code before it can sign in.

## A4 Forge

A4 Forge's generated Compose overlay targets the HTTP stack's `studio` service and pins its image by tag, so it bypasses `AMC_STUDIO_IMAGE` and does not apply to the TLS stack. The generated Helm plan's `helm upgrade -f values.a4-<releaseId>.yaml` line must be run with `--reuse-values` added, or the release loses `image.digest` and the monitor pin. Both are A4 follow-ups, stated here as limits.

## What was run

On 2026-11-08, in a colima VM (linux/arm64, Docker 29.5.2, 4 vCPUs, 6 GB) on a shared macOS arm64 host whose load average stayed between 24 and 36. One image was built from this repository (`docker build --target studio`, 262 s, `sha256:6ea064c8...`); every Compose run used it.

- Container smoke (`scripts/container-smoke.mjs`, Studio in this layout: state and checkpoint volumes, no tmpfs home): 19 of 19 checks passed. READY 12 s after start; a signed firewall control and `high-water.json` survived the restart; both cold verifiers held. `docker stats`: 216.8 MiB after READY, 422.6 MiB at 143% CPU while the firewall command ran in Studio's cgroup.
- Rehearsal, HTTP stack, A = B = that image: all three phases passed; each governed turn returned `verified-prefix`.
- Rehearsal, HTTP stack, A = an older build (`amc-studio:drill-held`, `sha256:27c085d4...`), B = that image, then A again: all three phases passed with the containers replaced (READY 9.0, 12.1 and 9.0 s after each `up`); each governed turn returned `verified-prefix` naming only the running session, so every graceful stop had sealed the previous one. The downgrade guard did not trigger: the two builds share the ledger schema.
- TLS stack (`caddy:2.8@sha256:226d1f05...`, pulled once, anonymously, that day): the notary was healthy after about 5 s and Studio after about 15 s; `/readyz` through Caddy with the exported CA answered 200 READY. After the monitor pin: pairing, sign-in and one governed turn through Caddy (`verified-prefix`; the native-task GETs answered 200). `amc firewall enable`, then `docker compose restart amc-studio`: the control was still enabled and trusted, checkpointed under `/workspace/control-checkpoints`. `docker stats` after READY: Studio 187 MiB, notary 161 MiB, Caddy 12 MiB; during a backup Studio peaked at 351 MiB and 129% CPU.
- Backup, on a fresh TLS stack: the streamed `amc backup create` wrote a 247,641-byte bundle and left nothing in `/tmp`; `amc backup verify --pubkey artifact-seal.pub` on the host passed (trusted). The first attempt, `amc backup create` followed by `docker compose cp` from `/tmp`, failed because `docker cp` cannot read a tmpfs; that is why step 1 streams the bundle. The volume archive held both volumes; taken while Studio ran, tar exited 1 because a file changed during the read, hence the stop before it.
- Rollback restore, same version, on that stack: Studio stopped, `amc backup restore` from stdin into `/data/amc/.restore` (exit 0; the only warning was the missing seal of the session open at backup time), the `.amc` swap, the volume archive restored, Studio healthy again after about 20 s, and a governed turn `verified-prefix`.
- Healthcheck: 3 min 20 s after that stack first started (Studio recreated at the pin and after the restore), `docker inspect` read `healthy` with a failing streak of 0; of the last five probes one failed, during the post-restore start period, and none exceeded its timeout.

Not run: the upgrade from 1.1.1, TLS for a public hostname, the Helm stdin backup, a downgrade across a ledger migration (no older build with an older schema was available), and any amd64 host.
