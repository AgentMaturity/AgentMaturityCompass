# Wave 4 Deployment & Infrastructure Readiness Audit (Agent 12)

Date: 2026-02-22
Repository: AMC (Agent Maturity Compass)

## Executive Summary

AMC already has strong production-oriented foundations:
- Multi-stage Docker build, non-root runtime, and container health check exist.
- Runtime config uses schema validation (`zod`) for core deployment env vars.
- Studio and Notary have both `/healthz` and `/readyz` endpoints.
- Graceful shutdown for Studio/Gateway/API paths is implemented.
- Helm chart already includes deployment/service/ingress/PDB/network policy templates.

Main gaps found:
- Committed plaintext compose secret files (now sanitized to placeholders).
- Docker build context previously included secret paths and unnecessary large directories (now tightened).
- No standalone raw Kubernetes manifests in `deploy/k8s/` (now added).
- No HPA in Helm chart.
- Host-mode readiness endpoint returned `READY` even when underlying workspaces were not ready (now fixed).
- Reproducibility is good but not strict: mutable Docker base tag remains.

## Scope vs Requested Checks

| Check | Status | Notes |
|---|---|---|
| 1. Docker/container support | PASS (with hardening) | `Dockerfile` + `.dockerignore` + multi-stage build present; `.dockerignore` hardened in this audit. |
| 2. Hardcoded secrets / localhost / dev-only defaults | PARTIAL | Plaintext compose secret defaults existed; sanitized to placeholders. Localhost defaults remain in code/docs by design for local mode. |
| 3. Env var handling docs + startup validation | PARTIAL | Core runtime env vars validated via schema; startup file-secret checks improved in entrypoint. Feature-specific env vars remain validated lazily and documented across multiple docs. |
| 4. Kubernetes manifests coverage | PASS (after changes) | Added `deploy/k8s/` with deployment/service/ingress/HPA/PDB + config/secret/pvc. |
| 5. SIGTERM graceful handling | PASS | Signal handlers and orderly server shutdown are implemented. |
| 6. Health checks | PASS (after one fix) | `/healthz` and `/readyz` exist; host-mode readiness status bug fixed. |
| 7. Zero-downtime migration safety | PARTIAL | Migrations are idempotent/transactional, but run in-app at startup with SQLite constraints; multi-replica rollout safety is limited. |
| 8. Build reproducibility | PARTIAL | `npm ci` + lockfile are good; base image tag is still mutable (not digest-pinned). |

## Evidence Highlights

### 1) Docker / Containerization
- Multi-stage Docker build: `Dockerfile`.
- Non-root runtime user and healthcheck: `Dockerfile`.
- Container process model uses `exec`: `docker/entrypoint.sh`.
- `.dockerignore` now excludes secret path and large non-build directories.

### 2) Secrets / Production-breaking Defaults
- Previously committed plaintext defaults in `deploy/compose/secrets/*`.
- Updated these files to explicit placeholder values (`change-me-*`) to avoid shipping usable defaults.
- Localhost defaults are common in local-focused modules (`src/config/envSchema.ts`, `src/gateway/config.ts`, `src/notary/notaryConfigStore.ts`); safe when overridden via deployment env.

### 3) Env Var Validation and Documentation
- Runtime schema validation: `src/config/envSchema.ts`, `src/config/loadConfig.ts`.
- Bootstrap hard requirements enforced in CLI/bootstrap flow: `src/cli.ts`, `src/bootstrap/bootstrap.ts`, `src/workspaces/hostBootstrap.ts`.
- Added early file-secret validation in container startup: `docker/entrypoint.sh`.
- Gap: env vars used in feature modules (e.g., backup/notary/provider credentials) are not all centrally documented/validated at one startup gate.

### 4) Kubernetes Artifacts
- Existing Helm resources include deployment/service/ingress/PDB.
- Missing raw manifest set under `deploy/k8s/` was added in this audit.
- HPA absent in Helm templates (`deploy/helm/amc/templates/`), but present in new raw manifests.

### 5) SIGTERM / Graceful Shutdown
- Studio shutdown path handles SIGINT/SIGTERM and closes API/gateway/dashboard/metrics: `src/cli.ts`, `src/studio/studioSupervisor.ts`.
- Studio API server tracks sockets and drains in-flight requests on close: `src/studio/studioServer.ts`.
- Gateway close path shuts down HTTP and proxy servers: `src/gateway/server.ts`.

### 6) Health Checks
- Studio endpoints: `/healthz`, `/readyz` in `src/studio/studioServer.ts`.
- Notary endpoints: `/healthz`, `/readyz` in `src/notary/notaryServer.ts`.
- Host-mode readiness bug fixed: `src/workspaces/workspaceRouter.ts` now returns `503 NOT_READY` when any workspace is unready.

### 7) Database Migrations / Rollout Safety
- Migrations are versioned, idempotent, and wrapped in transactions: `src/ledger/ledger.ts`.
- Migration state reconciliation for legacy partials exists: `src/ledger/ledger.ts`.
- Runtime still executes migrations in-app at startup, and SQLite workspace model limits true horizontal zero-downtime behavior across replicas.

### 8) Build Reproducibility
- `package-lock.json` + `npm ci` supports deterministic dependency resolution.
- Docker base image still uses mutable tag (`node:20-bookworm-slim`) instead of digest pinning.
- Added explicit `STOPSIGNAL SIGTERM` for orchestration clarity.

## Changes Applied In This Audit

1. Hardened Docker context handling
- Updated `.dockerignore` to exclude:
  - `deploy/compose/secrets`
  - large non-build folders (`docs`, `examples`, `tests`, `website`, `whitepaper`, `security-audit`)
  - local metadata folders (`.claude`, `.changeset`, `.openclaw`)

2. Improved container runtime safety checks
- Updated `docker/entrypoint.sh` to fail fast if required secret files are missing/unreadable (especially for bootstrap and notary-enabled bootstrap).

3. Docker runtime signal behavior clarity
- Added `STOPSIGNAL SIGTERM` in `Dockerfile`.

4. Secret hygiene for compose defaults
- Replaced committed secret file contents in `deploy/compose/secrets/*` with explicit placeholders.

5. Added raw Kubernetes manifests
- Created `deploy/k8s/` with:
  - `configmap.yaml`
  - `secret.yaml`
  - `pvc.yaml`
  - `deployment.yaml`
  - `service.yaml`
  - `ingress.yaml`
  - `hpa.yaml`
  - `pdb.yaml`
  - `kustomization.yaml`
  - `README.md`

6. Fixed host-mode readiness behavior
- Updated `src/workspaces/workspaceRouter.ts` so host `/readyz` reflects real readiness and returns `503` when any workspace is not ready.

## Remaining Recommendations

1. Pin Docker base images by digest for strict reproducibility.
2. Add a centralized "deployment env contract" doc generated from code (single source of truth for required/optional env vars).
3. For scale-out deployments, externalize mutable state (SQLite/filesystem) before enabling multi-replica autoscaling.
4. Add Helm HPA template (not just raw k8s manifest) if autoscaling is an intended supported path.
