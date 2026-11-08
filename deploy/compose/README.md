# AMC Compose Deployment

Both HTTP and TLS builds use the root Dockerfile `studio` target. Every AMC service mounts a named volume at `/home/amc/.config/amc/state` (`<AMC home>/state`), next to the workspace volume, so this machine's anti-rollback marks and key-set recovery copies survive a restart (P1-08, `docs/KEY_LIFECYCLE.md`). Studio also mounts a third volume, `amc_control_checkpoints`, at `/workspace` with `AMC_CONTROL_CHECKPOINT_DIR=/workspace/control-checkpoints`: the signed firewall, guardrail, legal-hold and compiled-control journals checkpoint there, outside the `/data/amc` workspace. The workspace, state and checkpoint volumes are backed up and rolled back together; never mount the state or checkpoint volume into the workspace. The image owns the 0700 home `/home/amc`, so no service mounts a tmpfs there. The old `deploy/compose/Dockerfile` was removed. See the [source container guide](../../docker/README.md) for build, non-root volume ownership, and Linux qualification requirements.

## Prerequisites

- Docker + Docker Compose plugin
- Secret files created under `deploy/compose/secrets/`:
  - `amc_vault_passphrase.txt`
  - `amc_owner_username.txt`
  - `amc_owner_password.txt`
  - `amc_notary_passphrase.txt`
  - `amc_notary_auth_secret.txt`
  - `amc_backup_passphrase.txt` (encrypts `amc backup create` bundles made inside the Studio container; both `deploy/compose` stacks need it)
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

The separate [2026-09-08 optional-stack acceptance](../../docs/OPTIONAL_NOTARY_TLS_ACCEPTANCE.md) exercised the actual Linux ARM containers with notary enabled: policy-bound `MERKLE_ROOT` signing, independent signature verification, missing/wrong authentication and checksum/replay refusal, identity persistence and fresh signing after restart, and trusted TLS Studio access with anonymous refusal. Its exact source, immutable images and configuration hashes are recorded. The probe used an isolated internal network, unique disposable volumes, and the local `localhost` CA; it does not claim public deployment, other platforms, hardware attestation or external-provider connectivity.

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

0. HTTP stack only: set `AMC_PUBLISH_ADDRESS=0.0.0.0` in `.env`. By default the HTTP stack publishes its ports on `127.0.0.1` only; `AMC_ALLOWED_CIDRS` filters requests but does not restrict which interfaces the ports are published on. The TLS stack already publishes `8443` on every interface.
1. Ensure host firewall allows inbound to `3212` (or `8443` for TLS).
2. Keep pairing enabled (`AMC_LAN_MODE=true`).
3. Open Console URL from phone and pair before login.
4. Add the origin you open the console from to `AMC_EXTRA_ORIGINS` in `.env` (for example `AMC_EXTRA_ORIGINS=http://192.168.1.20:3212`; comma-separated, `scheme://host[:port]`, no path, no trailing slash) and run `docker compose up -d` again. Otherwise native and A4 routes answer `403 NATIVE_HOST_DENIED`. The defaults (`http://localhost:<AMC_STUDIO_PORT>` and `http://127.0.0.1:<AMC_STUDIO_PORT>` on the HTTP stack, `https://<AMC_TLS_HOST>:<AMC_TLS_PORT>` on the TLS stack) stay admitted. An entry with a path is not validated at startup and turns native routes into errors, so check the value before you restart.

## Security Notes

- Do not expose AMC Studio publicly without TLS and RBAC.
- Keep `AMC_QUERY_LEASE_CARRIER_ENABLED=false` except local development.
- Keep notary auth and passphrase in Docker secrets only.
- Never store secrets directly in compose YAML; use Docker secrets files.

## Optional standalone API alongside Studio

Add `-f docker-compose.studio-api.yml` after `-f docker-compose.tls.yml` to both `config` and `up` commands. The overlay retains Studio and notary, adds the production API image, and mounts `Caddyfile.studio-api`. Studio `/api/v1/*` stays on Studio; the legacy `/api/*` namespace goes to the separate API on internal port 3220. No API host port is published.

The overlay mounts the workspace read-only; the API reads no workspace state for Industry Packs, which are free (`/api/industry-packs/access` returns the free record). Legacy licence issuance remains refused unless its existing administrator token is explicitly configured by the operator. Quickscore is self-reporting, not signed evidence; the badge is a labelled placeholder. `/__amc/proxy-health` identifies the proxy, `/api/health` checks the standalone API, and `/readyz` checks Studio readiness. Proxy or API health does not prove a governed Studio turn.

The API image target is additive; the default Docker target remains Studio. Use both Compose files consistently for lifecycle and rollback commands. Roll back to previously recorded immutable images while retaining workspace and Caddy volumes; do not use `down -v`. Qualify rollback on a disposable deployment before public use.

## A4 Forge releases (preview)

With `AMC_A4_PREVIEW=1`, an A4 project's Activate stage signs an agent package and records the release; AMC never runs these commands. In v1 a deployment is a same-host restart with a pinned image: the Compose overlay restarts this hosted Studio, the one that built the agent, whose data volume holds the agent's resources. A deployment receipt is recordable only for an agent built in this hosted Studio; an agent built elsewhere has no v1 deployment path (`DEPLOYMENT_NOT_SAME_HOST`), and installing a package into another workspace is P2-40. The package under `a4-releases/<projectId>/<releaseId>/` is the signed provenance record of what the workspace held at the release, not an installable. Back up `a4-releases/` and `a4-projects/` with the data volume: list both in the ops policy's `backups.includePaths` before proposing a release.

The package's `deploy/` directory holds the prepared overlay `docker-compose.a4-<releaseId>.yml` and `deploy/plan.json`, which lists the steps, the receipt form and the known gaps and is signed `a4-deployment-plan`. Run the steps from this directory on the host that runs the Studio:

```bash
docker compose -f docker-compose.yml cp studio:/data/amc/a4-releases/<projectId>/<releaseId>/deploy/docker-compose.a4-<releaseId>.yml ./
# Write the lease token (shown once by AMC) to ./secrets/amc_a4_lease_<releaseId>.txt with mode 0600; never commit it.
docker compose -f docker-compose.yml exec studio amc doctor --strict --json
docker compose -f docker-compose.yml -f docker-compose.a4-<releaseId>.yml up -d
sha256sum docker-compose.a4-<releaseId>.yml
```

The overlay has these known limits:

- The image is pinned by tag (`IMAGE_TAG_ONLY`, a WAITING item, never a blocker): AMC's bootstrap report records no digest of the image the Studio runs.
- Decision D-03 keeps Compose documented, but it is not qualified: its CI qualification is pending (`TOPOLOGY_NOT_QUALIFIED`, a WAITING item, never a blocker).
- The overlay sets `AMC_A4_PREVIEW=1`.
- It moves the signed-journal checkpoint root to its own named volume at `/workspace`, outside the `/data/amc` workspace.
- It mounts the lease token file as a Compose secret. Nothing in the Studio reads it; it is for the agent's gateway client.

Record what happened with `POST /api/v1/a4/projects/<projectId>/releases/<releaseId>/deployments` (owner): the release's `packageDigest`, the `overlayDigest` above, the `restartedAt` time, the lease id, the `destinationRef` and `operatorStated.status`. That receipt is the operator's statement. AMC's own check is `POST …/releases/<releaseId>/verify`. It runs token-less against the receipt's destination over TLS and establishes reachability only: release identity at the destination is not evaluated until P2-40. A destination that resolves to a private address is refused, and nothing is recorded. The two results stay in separate columns.

To roll back, an owner previews the rollback and project approvers other than the confirming owner decide its DEPLOY engine request. Confirming it restores the Enforce snapshot of the release that ran in production when this one was built (the newest release with a succeeded production deploy row that was not rolled back), revokes the release's leases and returns the commands. The commands copy that release's overlay out and run `docker compose -f docker-compose.yml -f docker-compose.a4-<thatReleaseId>.yml up -d`, or the base file alone when no release ran in production. Never use `down -v`. Record the rollback row afterwards.
