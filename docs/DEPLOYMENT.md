# Deployment

AMC Studio can run as a production service with persistence, TLS, and hardened defaults.

## Docker (Compose)

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

## LAN Access

- Keep LAN mode enabled and pairing required.
- Restrict clients with `AMC_ALLOWED_CIDRS`.
- Never expose Studio directly to public internet without TLS and RBAC.
