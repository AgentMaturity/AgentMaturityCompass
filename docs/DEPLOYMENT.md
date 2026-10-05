# Deployment

AMC Studio can run as a production service with persistence, TLS, and hardened defaults.

## Docker (Compose)

Source images use the root Dockerfile with explicit `studio` and `runner` targets. Review the [container runtime requirements](#container-runtime-requirements) before starting Compose.

1. Create secret files:
   - `deploy/compose/secrets/amc_vault_passphrase.txt`
   - `deploy/compose/secrets/amc_owner_username.txt`
   - `deploy/compose/secrets/amc_owner_password.txt`
2. Start local deployment:

```bash
cd deploy/compose
cp .env.example .env
docker compose up -d --build
```

3. Open Console:
   - `http://<host>:3212/console`

### Container runtime requirements

Supply your own values in the three secret files above; `.example` files are templates. These files are excluded from the image build and mounted only at runtime. Keep the vault secret and data volume together across restarts.

Images run as UID/GID 10001. New named volumes inherit the image directory ownership; host bind mounts must already be writable by that user, and mounted secret files must be readable by it. Existing volumes owned by another UID require an operator-managed ownership adjustment. The entrypoint does not run as root or change host permissions.

Studio bootstraps an empty workspace by default and stops if bootstrap fails. Use `AMC_BOOTSTRAP=0` only for an already initialized workspace. A read-only root filesystem also needs writable data, temporary storage and home mounts; the Compose definitions include these settings. LAN pairing and authentication remain enabled.

Container qualification is tracked separately from source and package checks. Before publishing an image, run `scripts/container-smoke.mjs` against both built targets on a Linux Docker engine. It checks startup, authentication, restart persistence, native SQLite and signed keyless tool evidence. A successful result applies only to the tested architecture; real-provider operation, registry publication and the optional TLS/notary stack require their own checks. The repository's `docker/README.md` contains the full build commands and image-artifact details.

## Docker + TLS (Caddy)

```bash
cd deploy/compose
docker compose -f docker-compose.tls.yml up -d --build
```

Open:
- `https://<host>:8443/console`

## Kubernetes (Helm)

```bash
helm lint deploy/helm/amc
helm template amc deploy/helm/amc
helm install amc deploy/helm/amc
```

Full operator guide: `docs/KUBERNETES_HELM_DEPLOYMENT.md`.

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
- CLI probe: `amc studio healthcheck`

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

For a Node host, `pnpm build` includes the compiled standalone API. Run `PORT=3220 pnpm api:start:production` alongside Studio. The production API requires runtime dependencies, neither TypeScript source nor `tsx`. Existing Railway and Vercel configurations serve only the standalone API.

Qualify installed packages, containers, TLS, restart and rollback on the chosen host before exposure. Hosting identity and required key-rotation proof remain operator prerequisites. These commands are instructions, not evidence of an executed deployment.
