# API Surfaces

AMC exposes three HTTP surfaces with different contracts and auth models.

## 1) Lightweight Module API (`/api/v1/*`)

Scope:
- operational helper routes implemented in `src/api/*`
- intended for local/internal use, not internet-facing provider compatibility

Auth and stability:
- this surface is rate-limited and IP-filtered by Studio, but currently not RBAC-gated
- treat as internal; keep Studio network-restricted

Response envelope:
- most `/api/v1` routes return success as `{ "ok": true, "data": ... }`
- most `/api/v1` routes return errors as `{ "ok": false, "error": "..." }`
- exception: `GET /api/v1/health` returns the raw health payload

Implemented routes:
- `GET /api/v1/health`
- `GET /api/v1/score/status`
- `POST /api/v1/score/session`
- `GET /api/v1/score/question/:sessionId`
- `POST /api/v1/score/answer`
- `GET /api/v1/score/result/:sessionId`
- `GET /api/v1/shield/status`
- `POST /api/v1/shield/scan/skill`
- `POST /api/v1/shield/detect/injection`
- `POST /api/v1/shield/sanitize`
- `GET /api/v1/enforce/status`
- `POST /api/v1/enforce/evaluate`
- `GET /api/v1/vault/status`
- `POST /api/v1/vault/redact`
- `POST /api/v1/vault/classify`
- `GET /api/v1/watch/status`
- `POST /api/v1/watch/attest`
- `GET /api/v1/watch/receipts/:agentId?limit=<1..500>`
- `GET /api/v1/product/status`
- `POST /api/v1/product/batch/create`
- `POST /api/v1/product/batch/:id/start`
- `GET /api/v1/product/batch/:id/progress`
- `POST /api/v1/product/portal/submit`
- `GET /api/v1/product/portal/:jobId`
- `GET /api/v1/agents/:id/timeline?maxRuns=<n>&maxEvidenceEvents=<n>`

Required request fields (per route family):

| Route | Required fields | Optional fields |
|---|---|---|
| `POST /api/v1/score/session` | `agentId` | — |
| `POST /api/v1/score/answer` | `sessionId`, `questionId`, `value` | `notes` |
| `POST /api/v1/shield/scan/skill` | `code` | `language` |
| `POST /api/v1/shield/detect/injection` | `input` | — |
| `POST /api/v1/shield/sanitize` | `input` | — |
| `POST /api/v1/enforce/evaluate` | `action` | `tool`, `agentId`, `context` |
| `POST /api/v1/vault/redact` | `text` | `categories` |
| `POST /api/v1/vault/classify` | `content` | — |
| `POST /api/v1/watch/attest` | `output`, `agentId` | `metadata` |
| `GET /api/v1/watch/receipts/:agentId` | path `agentId` | `limit` (1..500) |
| `POST /api/v1/product/batch/create` | `name`, `items` | — |
| `POST /api/v1/product/portal/submit` | `name`, `type`, `submittedBy` | `payload` |
| `GET /api/v1/agents/:id/timeline` | path `id` | `maxRuns` (1..5000), `maxEvidenceEvents` (1..20000) |

Common status codes:
- `200`, `201` success
- `400` invalid payload/params
- `404` missing resources
- `405` method mismatch (some routes)
- `429` rate limit (applied by Studio)
- `500` internal errors

## 2) Studio Control Plane API (`/*`)

Scope:
- primary owner/operator console API implemented in `src/studio/studioServer.ts`
- examples: `/status`, `/assurance/*`, `/audit/*`, `/value/*`, `/passport/*`, `/plugins/*`, `/toolhub/*`

Auth:
- session cookie or admin token
- RBAC enforced for protected actions

This is the largest API surface today and should be treated as internal operational contract.

## 3) Public Bridge Surface (`/bridge/*`)

Scope:
- provider-shaped bridge endpoints for agent/runtime traffic

Auth:
- lease-scoped auth (`x-amc-lease`, bearer header, or configured carrier)

Implemented non-provider endpoints:
- `GET /bridge/health`
- `POST /bridge/lease/verify` (body: `{ "token": "<lease>" }`)
- `POST /bridge/evidence` (body: `{ "event_type": "...", "session_id": "...", "payload": {...} }`)
- `POST /bridge/telemetry` (body: telemetry event object validated by bridge schema)

Implemented provider endpoints:
- `POST /bridge/openai/v1/chat/completions`
- `POST /bridge/openai/v1/responses`
- `POST /bridge/openai/v1/embeddings`
- `POST /bridge/openai/v1/images/generations`
- `POST /bridge/openai/v1/audio/speech`
- `POST /bridge/anthropic/v1/messages`
- `POST /bridge/gemini/v1beta/models/{model}:generateContent`
- `POST /bridge/openrouter/v1/chat/completions`
- `POST /bridge/xai/v1/chat/completions`
- `POST /bridge/local/v1/chat/completions`

Bridge errors use bridge/provider-style payloads (not the `/api/v1` envelope).

Common bridge status codes:
- `200` success
- `400` invalid payload, missing required fields
- `401`/`403` invalid or unauthorized lease carrier
- `404` unknown bridge route
- `405` method not allowed
- `413` payload too large
- `502` upstream/provider bridge forwarding failure
- `503` gateway unavailable or bridge route not configured

## Legacy Bridge Path Compatibility

Legacy bridge-style paths under `/api/v1/*` redirect with `308` + deprecation headers:
- `/api/v1/chat/completions` -> `/bridge/openai/v1/chat/completions`
- `/api/v1/completions` -> `/bridge/openai/v1/completions`
- `/api/v1/embeddings` -> `/bridge/openai/v1/embeddings`

Use `/bridge/*` directly for all new integrations.
Treat legacy paths as deprecated compatibility shims.
