# LAUNCH RUNBOOK (CODE-VALIDATED)

This runbook is aligned to the current CLI surfaces in `src/cli.ts` and deployment assets under `deploy/`.

## Scope and Preconditions

- Node.js `>=20` (from `package.json`)
- Build/test gate is green:

```bash
npm ci
npm test
npm run build
```

## 1) Local Go-Live (single workspace)

```bash
npm i -g agent-maturity-compass
amc setup --demo
amc up
amc doctor --json
amc verify all --json
```

Health checks:

```bash
curl -fsS http://127.0.0.1:3212/healthz
curl -fsS http://127.0.0.1:3212/readyz
```

Notes:
- Default API port `3212` is defined in runtime/env config.
- `amc up` readiness preflight fails closed when required trust checks fail.

## 2) Docker Compose Deployment

```bash
cd deploy/compose
cp .env.example .env
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3212/readyz
```

TLS variant:

```bash
docker compose -f docker-compose.tls.yml up -d --build
```

Reference: `deploy/compose/README.md`.

## 3) Helm Deployment

```bash
helm lint deploy/helm/amc
helm template amc deploy/helm/amc > /tmp/amc-rendered.yaml
helm upgrade --install amc deploy/helm/amc
```

Post-deploy checks:
- service/ingress health (`/healthz`, `/readyz`)
- PVC binding
- securityContext + NetworkPolicy rendering as expected

## 4) Notary Trust Boundary (recommended for production)

```bash
amc notary init
amc notary start
amc trust enable-notary --base-url http://127.0.0.1:4343 --pin /path/to/notary.pub --require SOFTWARE
amc trust status
```

Notary server exposes `/healthz` and `/readyz`.

## 5) Identity + SCIM

```bash
amc identity init --host-dir /path/to/host
amc identity provider add oidc --host-dir /path/to/host --id okta --issuer <issuer> --client-id <id> --client-secret-file <file> --redirect-uri <uri>
amc identity mapping add --host-dir /path/to/host --group amc-ws-default-owner --workspace default --roles OWNER,AUDITOR
amc scim token create --host-dir /path/to/host --name idp-scim --out /secure/scim-token.txt
```

## 6) Backup / Restore Drill (required before prod cutover)

```bash
amc backup create --out .amc/backups/drill.amcbackup
amc backup verify .amc/backups/drill.amcbackup
amc backup restore .amc/backups/drill.amcbackup --to /tmp/amc-restore --force
AMC_WORKSPACE_DIR=/tmp/amc-restore amc verify all --json
```

## 7) Retention + Maintenance Baseline

```bash
amc retention status
amc retention run --dry-run
amc retention run
amc retention verify

amc maintenance stats
amc maintenance vacuum
amc maintenance rotate-logs
amc maintenance prune-cache
```

## 8) Metrics + Runtime Observability

```bash
amc metrics status
curl -fsS http://127.0.0.1:9464/metrics
```

Minimum operational telemetry:
- request rate/latency
- lease issuance and auth failures
- retention/archive/blob/db size trends
- transparency root/merkle root progression

## Day 0 / Day 7 / Day 30 Cadence

### Day 0
- `setup` + `up`
- `doctor --json`, `verify all --json`, `e2e smoke --mode local --json`
- Enable backup schedule + metrics scraping

### Day 7
- Retention/maintenance run
- Verify backup freshness + restore drill sample
- Review forecast/advisory deltas and outstanding risks

### Day 30
- Full verify-all gate and release verification
- Re-run deployment smoke path (compose/helm template)
- Rotate high-risk credentials (notary/identity/scim) per policy

## Evidence Pointers (source of truth)

- CLI command registration: `src/cli.ts`
- Studio readiness/health endpoints: `src/studio/studioServer.ts`
- Default Studio ports + metrics wiring: `src/studio/studioSupervisor.ts`, `src/config/envSchema.ts`
- Notary readiness endpoints/default port: `src/notary/notaryServer.ts`, `src/notary/notaryConfigSchema.ts`
- Deployment assets: `deploy/compose/`, `deploy/helm/amc/`
