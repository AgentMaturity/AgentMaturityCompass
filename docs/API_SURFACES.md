# API Surfaces

AMC exposes two distinct HTTP API surfaces with different intended audiences.

## Internal Control Plane (`/api/v1/*`)

- Scope: internal Studio control-plane APIs implemented in `src/api/*`.
- Audience: owner/operator workflows inside Studio, not public SDK integrations.
- Auth: RBAC-gated (session/admin auth), same role model as other protected Studio endpoints.
- Stability: internal/operational surface; do not treat as provider-compatibility bridge contract.

## Public Bridge Surface (`/bridge/*`)

- Scope: provider-shaped bridge endpoints for agent/runtime traffic.
- Audience: SDKs, wrappers, and external integrations.
- Auth: lease-scoped bridge auth (`x-amc-lease` or bearer carrier, as configured).
- Live endpoints include:
  - `/bridge/health`
  - `/bridge/evidence`
  - `/bridge/lease/verify`
  - `/bridge/telemetry`
  - `/bridge/openai/*`, `/bridge/anthropic/*`, `/bridge/gemini/*`, `/bridge/openrouter/*`, `/bridge/xai/*`, `/bridge/local/*`

## Legacy Bridge Path Compatibility

Legacy bridge-style paths under `/api/v1/*` are deprecated and redirected to `/bridge/*` with deprecation headers:

- `/api/v1/chat/completions` -> `/bridge/openai/v1/chat/completions`
- `/api/v1/evidence` -> `/bridge/evidence`
- `/api/v1/lease/verify` -> `/bridge/lease/verify`

Use `/bridge/*` directly for all new integrations.

