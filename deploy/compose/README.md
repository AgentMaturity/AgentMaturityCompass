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

Set `AMC_TLS_HOST` in `.env` to the exact hostname or IP address clients will use (default `localhost`). Do not include a scheme, port or path. Caddy needs this identity to issue its internal certificate; a hostless listener with certificate automation disabled cannot complete TLS handshakes.

```bash
cd deploy/compose
cp .env.example .env
docker compose -f docker-compose.tls.yml up -d --build
```

Endpoints:
- HTTPS console/API: `https://<AMC_TLS_HOST>:8443/console`
- Notary (internal to this TLS stack): `http://amc-notary:4343`

Caddy retains only `NET_BIND_SERVICE`, required by the official image's executable and port 443; Studio and notary still drop all capabilities. The proxy creates a private local CA in its persistent `caddy_data` volume. Certificate issuance stays enabled, HTTP redirects are disabled because this stack does not publish port 80, and automatic trust-store installation is disabled.

Export only the public CA certificate and explicitly trust it in each client that uses this deployment:

```bash
docker compose -f docker-compose.tls.yml cp caddy:/data/caddy/pki/authorities/local/root.crt ./amc-local-ca.crt
curl --cacert ./amc-local-ca.crt "https://localhost:8443/readyz"
```

Use the configured hostname in the client URL. Keep the CA private keys inside the volume; do not export the whole `/data` directory or disable certificate verification. This is local/private PKI, not a publicly trusted certificate. See [Caddy's local HTTPS guidance](https://caddyserver.com/docs/automatic-https#local-https).

## Notary listener and readiness

The TLS stack explicitly starts notary with `--bind 0.0.0.0` so Studio can reach it on the internal Compose network. No notary host port is published. The override applies only to this process; local `amc notary start` retains the saved listen address, initially `127.0.0.1`. A saved Unix socket and a TCP `--bind` override are rejected together.

Studio waits for the notary's bounded `/readyz` healthcheck to report `READY`, including signer, log and auth-secret initialization. Readiness alone does not prove Studio holds the matching secret or can obtain a valid signature. The shared image smoke runs Studio with notary disabled.

The separate [2026-09-08 optional-stack acceptance](../../AMC_OS/RESEARCH/2026-09-08-dsh-pi/optional-notary-tls-acceptance/README.md) exercised the actual Linux ARM containers with notary enabled: policy-bound `MERKLE_ROOT` signing, independent signature verification, missing/wrong authentication and checksum/replay refusal, identity persistence and fresh signing after restart, and trusted TLS Studio access with anonymous refusal. Its exact source, immutable images and configuration hashes are recorded. The probe used an isolated internal network, unique disposable volumes, and the local `localhost` CA; it does not claim public deployment, other platforms, hardware attestation or external-provider connectivity.

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

## Optional standalone API alongside Studio

Add `-f docker-compose.studio-api.yml` after `-f docker-compose.tls.yml` to both `config` and `up` commands. The overlay retains Studio and notary, adds the production API image, and mounts `Caddyfile.studio-api`. Studio `/api/v1/*` stays on Studio; the legacy `/api/*` namespace goes to the separate API on internal port 3220. No API host port is published.

The API shares the workspace read-only for industry-pack entitlements. License issuance remains refused unless its existing administrator token is explicitly configured by the operator. Quickscore is self-reporting, not signed evidence; the badge is a labelled placeholder. `/__amc/proxy-health` identifies the proxy, `/api/health` checks the standalone API, and `/readyz` checks Studio readiness. Proxy or API health does not prove a governed Studio turn.

The API image target is additive; the default Docker target remains Studio. Use both Compose files consistently for lifecycle and rollback commands. Roll back to previously recorded immutable images while retaining workspace and Caddy volumes; do not use `down -v`. Qualify rollback on a disposable deployment before public use.
