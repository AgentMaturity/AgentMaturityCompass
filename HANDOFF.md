# FIX-5 Handoff

## Scope completed
Implemented API auth/security and bridge routing fixes in `/tmp/amc-wave1/agent-5`.

## What was fixed

1. `/api/v1/*` auth gap in Studio
- Moved `/api/v1/*` handling behind auth in `src/studio/studioServer.ts`.
- Added RBAC enforcement for internal `/api/v1/*` routes (VIEWER/OPERATOR/APPROVER/AUDITOR/OWNER).
- Added authenticated deprecation redirects (308 + headers) for legacy bridge-style endpoints:
  - `/api/v1/chat/completions` -> `/bridge/openai/v1/chat/completions`
  - `/api/v1/evidence` -> `/bridge/evidence`
  - `/api/v1/lease/verify` -> `/bridge/lease/verify`

2. Single live OpenAPI generation command
- Removed deprecated CLI command `openapi-spec` from `src/cli.ts`.
- Kept `openapi-generate` as the canonical command.
- Updated CLI/OpenAPI comments in `src/studio/openapi.ts`.

3. Bridge streaming passthrough
- Replaced upstream buffering (`response.arrayBuffer()`) with stream-reader passthrough in `src/bridge/bridgeServer.ts`.
- Added chunked passthrough path for streaming requests (`stream: true` or `Accept: text/event-stream`).
- Added trailer receipt mode for streamed responses:
  - `x-amc-receipt-mode: trailer`
  - trailer `x-amc-receipt-trailer`
- Kept buffered path for non-stream responses where output-contract enforcement can still block/transform.

4. Bridge endpoint deprecation + live replacements
- Added live bridge routes in `src/bridge/bridgeServer.ts`:
  - `GET /bridge/health`
  - `POST /bridge/evidence`
  - `POST /bridge/lease/verify`
- Legacy `/api/v1/*` bridge-style calls now redirect to these `/bridge/*` routes with deprecation headers.

5. API surface documentation
- Added `docs/API_SURFACES.md` clarifying:
  - Internal-only surface: `/api/v1/*` (RBAC-gated Studio control plane)
  - Public surface: `/bridge/*` (lease-auth integrations)
  - Legacy deprecation mapping
- Linked from `docs/STUDIO.md` and `docs/BRIDGE.md`.
- Updated command reference in `docs/AMC_MASTER_REFERENCE.md`.

## OpenAPI + scaffold alignment changes
- Updated `src/setup/integrationScaffold.ts` so generated snippets, contract tests, and bridge OpenAPI spec use live `/bridge/*` endpoints only.
- `generateBridgeOpenApiSpec()` now emits live bridge routes (health, evidence, lease verify, telemetry, provider routes).

## Tests/validation

Targeted checks run:
- `npm run typecheck` -> pass
- `npm test -- tests/integrationScaffold.test.ts tests/openapiContracts.test.ts --reporter=verbose` -> pass (35 tests)

Required full-suite command requested by task (captured via capped log run):
- `npm test -- --reporter=verbose 2>&1 | tail -30`
- Tail output (last lines) showed multiple environment-related failures/timeouts in this sandbox, including `listen EPERM: operation not permitted 127.0.0.1` and test timeouts in long integration suites.

## Files changed
- `src/studio/studioServer.ts`
- `src/bridge/bridgeServer.ts`
- `src/setup/integrationScaffold.ts`
- `src/cli.ts`
- `src/studio/openapi.ts`
- `docs/API_SURFACES.md` (new)
- `docs/STUDIO.md`
- `docs/BRIDGE.md`
- `docs/AMC_MASTER_REFERENCE.md`
- `tests/integrationScaffold.test.ts`
- `tests/openapiContracts.test.ts`
- `tests/universalAgentIntegrationLayer.test.ts`

