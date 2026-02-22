# FIX-6 HANDOFF

## Completed Scope

### 1) Unified SDK default bridge URLs to 3212
- Updated Python SDK default bridge URL to `http://localhost:3212`:
  - `src/sdk/python/amc_client.py`
  - `src/sdk/python/amc_middleware.py` examples
  - `src/sdk/python/test_amc_client.py`
- Updated Go SDK default bridge URL to `http://localhost:3212`:
  - `src/sdk/go/amc_client.go`
  - `src/sdk/go/amc_middleware.go` examples
  - `src/sdk/go/amc_client_test.go`
- Updated SDK doc default note:
  - `docs/SDK.md`

### 2) Fixed Go SDK lease endpoints to live routes
- Repointed lease calls from non-existent bridge lease paths to live Studio lease routes:
  - `RequestLease`: `/leases/issue`
  - `RevokeLease`: `/leases/revoke`
- Updated lease request payload shaping to match runtime expectations (`ttl` + comma-delimited `scopes`).
- Added test coverage for both lease routes:
  - `src/sdk/go/amc_client_test.go`

### 3) Extended OpenAI SDK instrumentation coverage
- Added AMC client methods for:
  - `/bridge/openai/v1/embeddings`
  - `/bridge/openai/v1/images/generations`
  - `/bridge/openai/v1/audio/speech`
  - File: `src/sdk/amcClient.ts`
- Extended OpenAI instrumentation proxy to route:
  - `chat.completions.create`
  - `responses.create`
  - `embeddings.create`
  - `images.generate`
  - `audio.speech.create`
  - File: `src/sdk/integrations/openai.ts`
- Extended OpenAI fetch transport routing for embeddings/images/audio paths.
- Added bridge routing support for those OpenAI paths:
  - `src/bridge/bridgeModelRouter.ts`
- Added/updated unit tests:
  - `tests/amcClientSdk.test.ts`

### 4) Fixed onboarding docs commands
- `docs/INTEGRATIONS.md`
  - Replaced invalid `amc provider add --name ... --key-from-stdin` with valid `amc provider add --agent ...`
  - Replaced invalid `amc python-sdk --out ...` with valid `amc python-sdk`
- `docs/ADAPTERS.md`
  - Fixed `amc adapters configure` example to include required `--route` and `--model`
  - Fixed invalid adapter id/flag in `init-project` example (`openai-agents-sdk`, removed unsupported `--out`)
- `docs/QUICKSTART.md`
  - Clarified bridge runs under `amc up` (no separate `amc bridge start` command)

### 5) Fixed integration scaffolds to live `/bridge/*` endpoints
- Replaced deprecated scaffold endpoint usage:
  - `/api/v1/evidence` -> `/bridge/telemetry`
  - Removed `/api/v1/lease/verify` dependency in scaffold flow
- Updated scaffold defaults to `http://localhost:3212`
- Updated generated contract tests and generated OpenAPI spec to live routes:
  - health: `/healthz`
  - telemetry: `/bridge/telemetry`
  - bridge model paths: `/bridge/openai/v1/...`
- Files:
  - `src/setup/integrationScaffold.ts`
  - `tests/integrationScaffold.test.ts`

### 6) Updated website onboarding copy accuracy
- Removed inaccurate “Install in 10 seconds / Zero config” messaging.
- Updated install section text to reflect setup credentials + vault passphrase requirement.
- File: `website/index.html`

## Test Execution

### Requested command
- Executed: `npm test -- --reporter=verbose 2>&1 | tail -30`
- Result in this environment: command did not complete within interactive polling windows (tail emits only on full suite exit).

### Focused validation run (for changed surface)
- Executed: `npx vitest run tests/amcClientSdk.test.ts tests/integrationScaffold.test.ts --reporter=verbose 2>&1 | tail -30`
- Result: **PASS** (`2` files, `34` tests).

## Notes
- Repository showed an unrelated tracked deletion in `.amc/guard_events.sqlite` during status inspection; this handoff work does not include that file.
