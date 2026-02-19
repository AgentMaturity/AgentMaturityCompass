# AMC Studio Verification Report

**Date:** 2026-02-19  
**Status:** ✅ ALL CHECKS PASS — No fixes required

## 1. Studio Server (`node dist/cli.js up`)

- **URL:** `http://localhost:3212` (configurable via `AMC_STUDIO_PORT` env var)
- **Result:** Server starts, responds with HTTP 401 (authentication required) — correct behavior
- The vault passphrase prompt appears on startup (interactive); in production, use `AMC_VAULT_PASSPHRASE_FILE` secret

## 2. Source Review (`src/studio/`)

No issues found. Files:
- `studioServer.ts` — Full HTTP API server with RBAC, SSE, audit logging
- `studioSupervisor.ts` — Manages startup, default port 3212
- `studioState.ts`, `signatures.ts`, `openapi.ts`, `connectWizard.ts`

## 3. `node dist/cli.js doctor`

- **Result:** PASS (all runtime checks green)
- Minor warnings: Docker not installed (optional for sandbox), missing `OPENAI_API_KEY` (optional)

## 4. `npm pack --dry-run`

- **Result:** 1993 files, 1.4 MB packed / 7.6 MB unpacked
- `dist/**` files correctly included

## 5. `package.json` Fields

| Field | Value | Status |
|-------|-------|--------|
| `bin.amc` | `dist/cli.js` | ✅ |
| `main` | `dist/index.js` | ✅ |
| `files` | `["dist/**", "README.md", "LICENSE"]` | ✅ |
| `engines.node` | `>=20` | ✅ |
| `type` | `module` | ✅ |

## 6. Deployment Files

### `Dockerfile`
- Multi-stage build (build → runtime)
- Base: `node:20-bookworm-slim`
- Non-root user (10001:10001), read-only FS compatible
- Healthcheck via `node dist/cli.js studio healthcheck`
- Exposes ports: 3210, 3211, 3212, 3213, 4173

### `deploy/compose/docker-compose.yml`
- Two services: `amc-notary` (port 4343) + `amc-studio` (ports 3210-3212)
- Docker secrets for vault passphrase, owner credentials, notary auth
- Named volumes, healthchecks, `read_only: true`, `cap_drop: ALL`
- Valid compose v3.9 format

## 7. Build & Tests

- `npm run build`: ✅ Clean (no errors)
- `npm test`: ✅ **1072/1072 passed, 0 failed** (76 test files, 17.3s)

## 8. Summary

The AMC Studio is fully functional. No code changes were needed. The studio serves its API on **http://localhost:3212** by default.
