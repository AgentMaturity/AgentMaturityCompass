# AMC Compose Deployment

Both HTTP and TLS builds use the root Dockerfile `studio` target. The old `deploy/compose/Dockerfile` was removed. See the [source container guide](../../docker/README.md) for build, non-root volume ownership, and Linux qualification requirements.

## Prerequisites

- Docker + Docker Compose plugin
- Secret files created under `deploy/compose/secrets/`:
  - `amc_vault_passphrase.txt`
  - `amc_owner_username.txt`
  - `amc_owner_password.txt`
  - `amc_notary_passphrase.txt`
  - `amc_notary_auth_secret.txt`
- Replace all `change-me-*` placeholder values before first deployment.

## Local/Private Deployment (HTTP)

```bash
cd deploy/compose
cp .env.example .env
docker compose up -d --build
```

Endpoints:
- Studio API + Console: `http://<host>:3212/console`
- Gateway: `http://<host>:3210`
- Proxy: `http://<host>:3211`

## TLS Deployment (Caddy, local CA/internal cert)

```bash
cd deploy/compose
cp .env.example .env
docker compose -f docker-compose.tls.yml up -d --build
```

Endpoints:
- HTTPS console/API: `https://<host>:8443/console`
- Notary (internal to this TLS stack): `http://amc-notary:4343`

## Notary qualification limit

The source container repair does not qualify TLS/notary operation. The existing fresh notary configuration binds `127.0.0.1`; the peer Studio URL `http://amc-notary:4343` therefore needs an explicit notary network/listen configuration before it is reachable across containers. The shared image smoke runs Studio with notary disabled. Do not treat that receipt as acceptance of the TLS/notary stack.

## Notary Mode (Fail-Closed Signing Boundary)

Set these in `.env` to force hardware-trust boundary mode during bootstrap:

```bash
AMC_ENABLE_NOTARY=1
AMC_NOTARY_BASE_URL=http://amc-notary:4343
AMC_NOTARY_REQUIRED_ATTESTATION=SOFTWARE
```

When `AMC_ENABLE_NOTARY=1`, bootstrap writes and signs `.amc/trust.yaml` in `NOTARY` mode and stores the Studio→Notary auth secret in vault (`vault:notary/auth`). If notary is unavailable or fingerprint checks fail, Studio `/readyz` returns `503`.

## Phone/LAN Access

1. Ensure host firewall allows inbound to `3212` (or `8443` for TLS).
2. Keep pairing enabled (`AMC_LAN_MODE=true`).
3. Open Console URL from phone and pair before login.

## Security Notes

- Do not expose AMC Studio publicly without TLS and RBAC.
- Keep `AMC_QUERY_LEASE_CARRIER_ENABLED=false` except local development.
- Keep notary auth and passphrase in Docker secrets only.
- Never store secrets directly in compose YAML; use Docker secrets files.
