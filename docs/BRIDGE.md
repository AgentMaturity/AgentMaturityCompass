# AMC Bridge

AMC Bridge is the universal compatibility layer for agent/model traffic. It exposes provider-shaped endpoints and routes requests through AMC Gateway with lease auth, policy checks, receipts, and observed evidence logging.

## Endpoints

- `/w/:workspaceId/bridge/openai/v1/chat/completions`
- `/w/:workspaceId/bridge/openai/v1/responses`
- `/w/:workspaceId/bridge/anthropic/v1/messages`
- `/w/:workspaceId/bridge/gemini/v1beta/models/:model:generateContent`
- `/w/:workspaceId/bridge/openrouter/v1/chat/completions`
- `/w/:workspaceId/bridge/xai/v1/chat/completions`
- `/w/:workspaceId/bridge/local/v1/chat/completions`
- `/w/:workspaceId/bridge/telemetry`

In single-workspace mode, the same endpoints are also reachable at `/bridge/*`.

Bridge is the public integration surface. Internal Studio control-plane APIs remain under `/api/v1/*`.
See [API_SURFACES.md](./API_SURFACES.md) for the boundary and deprecation mapping.

## Trust and Anti-Cheat

- Lease auth is required for all bridge calls.
- Workspace is taken from lease claim; URL override attempts are audited.
- Model/provider allowlists are enforced from signed bridge config and signed model taxonomy.
- Bridge writes `llm_request` + `llm_response` evidence with receipts and hashes.
- Prompt text is redacted by default; raw secrets/tokens are never persisted.

## Provider Coverage

Bridge supports OpenAI, Anthropic, Gemini, xAI Grok, OpenRouter, and local OpenAI-compatible routes.

Provider/model allowlisting is owner-controlled via signed config:

- `.amc/bridge.yaml` (+ `.sig`)
- `.amc/model-taxonomy.yaml` (+ `.sig`)

Unknown models/providers are denied by default and audited (`BRIDGE_MODEL_DENIED` / `BRIDGE_PROVIDER_DENIED`).
