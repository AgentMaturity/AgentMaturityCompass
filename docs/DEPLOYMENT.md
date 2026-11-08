# Deployment

AMC Studio can run as a production service with persistence, TLS, and hardened defaults.

## Running AMC for live users

Every path below is documented and none is qualified. In D-03's vocabulary a deployment is "qualified within scope S, versions V, window W" only with the receipts and agreed recovery targets that [docs/deploy/reference/TOPOLOGY.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/TOPOLOGY.md) describes; no deployment has them yet.

| Audience | Path | Status |
|---|---|---|
| Single host | Compose TLS stack (`deploy/compose/docker-compose.tls.yml`): Caddy with a private CA, named volumes `amc_data`, `amc_state`, `amc_control_checkpoints`, `amc_notary_data` and `caddy_data`, the image pinned by `AMC_STUDIO_IMAGE` in `.env` | documented; not qualified; run end to end on 2026-11-08 on linux/arm64 ([COMPOSE.md, What was run](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/COMPOSE.md#what-was-run)) |
| Cluster | Helm chart 0.4.1 (`deploy/helm/amc`) with `image.digest` and `image.requireDigest=true`, claims `<release>-amc` and `<release>-amc-state` | documented; not qualified ([TOPOLOGY.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/TOPOLOGY.md)) |
| Loopback or private network | Compose HTTP stack (`deploy/compose/docker-compose.yml`), ports published on `AMC_PUBLISH_ADDRESS` (default `127.0.0.1`) | documented; not qualified |
| Not for Studio | Railway, Vercel | standalone API only; not qualified |

Helm: install, upgrade, roll back and back up with the reference runbooks: [INSTALL.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/INSTALL.md), [UPGRADE.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/UPGRADE.md), [ROLLBACK.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/ROLLBACK.md) and [BACKUP_RESTORE.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/BACKUP_RESTORE.md).

Compose: [COMPOSE.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/COMPOSE.md) holds the same procedures for a single host: install, backup, upgrade from the previous release and from 1.1.1, rollback with the restore, and the rehearsal script that exercised them.

Recovery cadence, RPO and RTO live in [RECOVERY_TARGETS.md](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/RECOVERY_TARGETS.md); Sid agrees them, and until then no deployment states them.

A public hostname changes the TLS certificate, the client address ranges Studio admits and nothing about per-device pairing: [COMPOSE.md, TLS for a public hostname](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/deploy/reference/COMPOSE.md#tls-for-a-public-hostname) (documented; not run).

## Docker (Compose)

Source images use the root Dockerfile with explicit `studio` and `runner` targets. Review the [container runtime requirements](#container-runtime-requirements) before starting Compose.

1. Create secret files:
   - `deploy/compose/secrets/amc_vault_passphrase.txt`
   - `deploy/compose/secrets/amc_owner_username.txt`
   - `deploy/compose/secrets/amc_owner_password.txt`
   - `deploy/compose/secrets/amc_backup_passphrase.txt`
2. Start local deployment:

```bash
cd deploy/compose
cp .env.example .env
docker compose up -d --build
```

3. Open Console:
   - `http://<host>:3212/console`

### Container runtime requirements

Supply your own values in the four secret files above; `.example` files are templates. These files are excluded from the image build and mounted only at runtime. Keep the vault secret and data volume together across restarts.

Images run as UID/GID 10001. New named volumes inherit the image directory ownership; host bind mounts must already be writable by that user, and mounted secret files must be readable by it. Existing volumes owned by another UID require an operator-managed ownership adjustment. The entrypoint does not run as root or change host permissions.

Studio bootstraps an empty workspace by default and stops if bootstrap fails. Use `AMC_BOOTSTRAP=0` only for an already initialized workspace. The image owns the 0700 home; on the read-only root filesystem the state volume (`/home/amc/.config/amc/state`) and the checkpoint volume (`/workspace`, with `AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints`) are the only writable paths besides `/data/amc` and `/tmp`. The Compose definitions include these settings. LAN pairing and authentication remain enabled.

Container qualification is tracked separately from source and package checks. Before publishing an image, run `scripts/container-smoke.mjs` against both built targets on a Linux Docker engine. It checks startup, authentication, restart persistence, native SQLite and signed keyless tool evidence. A successful result applies only to the tested architecture; real-provider operation, registry publication and the optional TLS/notary stack require their own checks. The repository's `docker/README.md` contains the full build commands and image-artifact details.

## Docker + TLS (Caddy)

```bash
cd deploy/compose
docker compose -f docker-compose.tls.yml up -d --build
```

Open:
- `https://<host>:8443/console`

## Kubernetes (Helm)

Chart 0.4.1, like every chart since 0.2.0, renders no Secret by default and refuses `replicaCount` other than 1 (the workspace has a single writer). Create the `amc-bootstrap` Secret first, from files only you can read, then install:

```bash
node scripts/deploy/deploy-pack-check.mjs   # helm lint, renders and kubeconform when installed
kubectl create namespace amc-system
kubectl -n amc-system create secret generic amc-bootstrap \
  --from-file=vaultPassphrase=./vault-passphrase.txt \
  --from-file=ownerUsername=./owner-username.txt \
  --from-file=ownerPassword=./owner-password.txt
helm upgrade --install amc deploy/helm/amc --namespace amc-system --atomic --wait --reuse-values \
  --set image.repository=<registry>/amc-studio --set image.digest=sha256:<64 hex> --set image.requireDigest=true
```

Then pin the monitor key and run `helm test` as [Verify Runtime](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/KUBERNETES_HELM_DEPLOYMENT.md#verify-runtime) describes: the test needs a one-time pairing code, and in a running deployment its verdict is a verified prefix (`verified-prefix`): the ledger verifies while Studio runs, the running gateway's own session is named as open, and a container replaced without a graceful stop leaves an interrupted session that the next start seals with a marker within about 10 minutes.

Full operator guide, including the notary keys, the chart-created Secret option and upgrading from chart 0.1.0: [`docs/KUBERNETES_HELM_DEPLOYMENT.md`](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/KUBERNETES_HELM_DEPLOYMENT.md).

Example values profiles:

```bash
helm template amc deploy/helm/amc -f deploy/helm/amc/examples/values-internal-only.yaml
helm template amc deploy/helm/amc -f deploy/helm/amc/examples/values-ingress-tls.yaml
helm template amc deploy/helm/amc -f deploy/helm/amc/examples/values-persistent-bootstrap.yaml
```

## Bootstrap for Empty Volumes

AMC supports deterministic bootstrap:

```bash
AMC_BOOTSTRAP=1 \
AMC_VAULT_PASSPHRASE_FILE=/run/secrets/amc_vault_passphrase \
AMC_BOOTSTRAP_OWNER_USERNAME_FILE=/run/secrets/amc_owner_username \
AMC_BOOTSTRAP_OWNER_PASSWORD_FILE=/run/secrets/amc_owner_password \
amc bootstrap --workspace /data/amc
```

Bootstrap creates and signs required configs, initializes transparency + Merkle state, and writes:
- `.amc/bootstrap/bootstrap_<ts>.json`

## Healthchecks

- Liveness: `/healthz`
- Readiness: `/readyz`
- Container probe: the image's HEALTHCHECK, and the compose Studio services' `healthcheck`, probe `/healthz` and `/readyz` over HTTP with a bounded in-process timeout (8 s per request; interval 30 s, timeout 10 s, start period 120 s, 5 retries). It covers the entrypoint's single-workspace `amc studio start`; a container running `amc host` (multi-workspace mode) is not probed by it.
- CLI probe for operators: `amc studio healthcheck`

## Terraform Helm Release

```bash
cd deploy/terraform/helm-release
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Create the `amc-bootstrap` Kubernetes secret outside Terraform so bootstrap passphrases and owner credentials do not land in Terraform state.

## LAN Access

- Keep LAN mode enabled and pairing required.
- Restrict clients with `AMC_ALLOWED_CIDRS`.
- Never expose Studio directly to public internet without TLS and RBAC.

## Studio and standalone API together

The TLS stack can serve both existing surfaces from one origin:

```bash
cd deploy/compose
docker compose -f docker-compose.tls.yml -f docker-compose.studio-api.yml config
docker compose -f docker-compose.tls.yml -f docker-compose.studio-api.yml up -d --build
```

Use the secret-file configuration and `AMC_TLS_HOST` in the Compose guide. Caddy uses a private CA; explicitly trust its public certificate in clients. This is not a public deployment qualification.

Studio owns `/console`, `/api/v1/*`, native Studio API routes and gateway traffic. The standalone API owns `/api/health`, `/api/quickscore`, `/api/badge/*` and `/api/industry-packs/*`. Its internal port 3220 avoids Studio ToolHub's port 3213. Studio authentication and RBAC remain in force. Legacy quickscore remains unauthenticated self-reporting, marked `evidenceVerified: false`; it does not produce an evidence-verified maturity assessment. The badge remains a placeholder, identified by its response header.

For a Node host, `pnpm build` includes the compiled standalone API. Run `PORT=3220 pnpm api:start:production` alongside Studio. The production API requires runtime dependencies, neither TypeScript source nor `tsx`. Existing Railway and Vercel configurations serve only the standalone API. They stay documented but unqualified (decision D-03): neither serves Studio or the gateway, so neither can pass the post-deploy verifier in [`DEPLOYMENT_CONFIRMATION_RUNBOOK.md`](https://github.com/AgentMaturity/AgentMaturityCompass/blob/main/docs/DEPLOYMENT_CONFIRMATION_RUNBOOK.md).

Qualify installed packages, containers, TLS, restart and rollback on the chosen host before exposure. Hosting identity and required key-rotation proof remain operator prerequisites. These commands are instructions, not evidence of an executed deployment.
