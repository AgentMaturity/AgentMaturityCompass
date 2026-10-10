# AMC Bridge

AMC Bridge is the universal compatibility layer for agent/model traffic. It exposes provider-shaped endpoints and routes requests through AMC Gateway with lease auth, policy checks, receipts, and observed evidence logging.

## Endpoints

- `GET /bridge/health`
- `POST /bridge/lease/verify`
- `POST /bridge/evidence`
- `POST /bridge/telemetry`
- `POST /bridge/openai/v1/chat/completions`
- `POST /bridge/openai/v1/responses`
- `POST /bridge/openai/v1/embeddings`
- `POST /bridge/openai/v1/images/generations`
- `POST /bridge/openai/v1/audio/speech`
- `POST /bridge/anthropic/v1/messages`
- `POST /bridge/gemini/v1beta/models/:model:generateContent`
- `POST /bridge/openrouter/v1/chat/completions`
- `POST /bridge/xai/v1/chat/completions`
- `POST /bridge/local/v1/chat/completions`

In host mode, the same routes are available under `/w/:workspaceId/bridge/*`.

Bridge is the public integration surface. Internal Studio control-plane APIs remain under `/api/v1/*`.
See [API_SURFACES.md](./API_SURFACES.md) for the boundary and deprecation mapping.

## Trust and Anti-Cheat

- Lease auth is required for bridge write/provider routes (health is unauthenticated).
- Workspace is taken from lease claim; URL override attempts are audited.
- A `session_id` (`/bridge/evidence`) or `sessionId` (`/bridge/telemetry`) beginning `a4-` is refused (400,
  `A4_SESSION_RESERVED`): that namespace witnesses A4 Forge transitions, and the ledger accepts no writer there but the
  A4 store.
- Model/provider allowlists are enforced from signed bridge config and signed model taxonomy.
- Bridge writes `llm_request` + `llm_response` evidence with receipts and hashes.
- Prompt text is redacted by default; raw secrets/tokens are never persisted.

## Provider Coverage

Bridge supports OpenAI, Anthropic, Gemini, xAI Grok, OpenRouter, and local OpenAI-compatible routes.

Provider/model allowlisting is owner-controlled via signed config:

- `.amc/bridge.yaml` (+ `.sig`)
- `.amc/model-taxonomy.yaml` (+ `.sig`)

Unknown models/providers are denied by default and audited (`BRIDGE_MODEL_DENIED` / `BRIDGE_PROVIDER_DENIED`).
