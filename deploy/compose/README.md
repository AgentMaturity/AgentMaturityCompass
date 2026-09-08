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

## Notary listener and readiness

The TLS stack explicitly starts notary with `--bind 0.0.0.0` so Studio can reach it on the internal Compose network. No notary host port is published. The override applies only to this process; local `amc notary start` retains the saved listen address, initially `127.0.0.1`. A saved Unix socket and a TCP `--bind` override are rejected together.

Studio waits for the notary's bounded `/readyz` healthcheck to report `READY`, including signer, log and auth-secret initialization. Readiness alone does not prove Studio holds the matching secret or can obtain a valid signature. The shared image smoke runs Studio with notary disabled. Actual authenticated signing, wrong-secret refusal, restart persistence and TLS access remain separate acceptance requirements; the source correction has not yet been verified in a Linux container.

## Notary Mode (Fail-Closed Signing Boundary)

Set these in `.env` to require the separate software notary during bootstrap:

```bash
AMC_ENABLE_NOTARY=1
AMC_NOTARY_BASE_URL=http://amc-notary:4343
AMC_NOTARY_REQUIRED_ATTESTATION=SOFTWARE
```

When `AMC_ENABLE_NOTARY=1`, bootstrap writes and signs `.amc/trust.yaml` in `NOTARY` mode and stores the Studio→Notary auth secret in vault (`vault:notary/auth`). If notary is unavailable or fingerprint checks fail, Studio `/readyz` returns `503`.

`SOFTWARE` does not claim hardware key protection. Requiring `HARDWARE` also requires a compatible external signer and its attestation; changing the environment setting alone does not provide it.

## Phone/LAN Access

1. Ensure host firewall allows inbound to `3212` (or `8443` for TLS).
2. Keep pairing enabled (`AMC_LAN_MODE=true`).
3. Open Console URL from phone and pair before login.

## Security Notes

- Do not expose AMC Studio publicly without TLS and RBAC.
- Keep `AMC_QUERY_LEASE_CARRIER_ENABLED=false` except local development.
- Keep notary auth and passphrase in Docker secrets only.
- Never store secrets directly in compose YAML; use Docker secrets files.
