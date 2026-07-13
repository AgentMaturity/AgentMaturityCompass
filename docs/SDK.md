# AMC SDKs (Node, Python, Go)

AMC SDKs route model calls through Bridge and attach deterministic correlation metadata.
They do **not** allow self-scoring payloads.

## Current SDK Inventory

AMC has repo-visible SDK surfaces beyond raw REST calls:

| Surface | Asset | Current scope |
|---|---|---|
| Node/TypeScript | `src/sdk/index.ts` exported through the root package | `AMCClient`, `createAMCClientFromEnv`, provider bridge methods, OpenAI/Anthropic/Gemini/Vercel/LangChain/LangGraph/OpenAI Agents instrumentation, mobile fetch wrapper, telemetry, redaction, and self-scoring guards |
| Python SDK | `src/sdk/python/` and `amc python-sdk` | `AMCClient`, FastAPI/Flask/LangChain middleware, redaction/hash helpers, typed package marker `py.typed`, and 100% Bridge endpoint coverage via `amc python-sdk --coverage` |
| Go SDK | `src/sdk/go/` | `NewClientFromEnv`, provider bridge methods, telemetry/reporting helpers, response metadata, hashing, redaction, and tests |
| OpenAPI contract | `website/openapi.yaml` | REST/API contract for clients, tools, and generated integrations |

OpenAPI server roots:

- Local development: `http://localhost:3000/api`
- Self-hosted production: `https://{host}/api`

External references checked on 2026-06-16:

- OpenAPI Specification 3.0.3: https://spec.openapis.org/oas/v3.0.3.html
- Python packaging type information / `py.typed`: https://typing.python.org/en/latest/spec/distributing.html

Publication caveat: the repo contains SDK source and generators, but separately published package release status can differ by ecosystem. Treat package publication and registry distribution as release operations, not as proof that every language package has already been published.

## 60-Second Onboarding

1. Start Bridge.
2. Set env vars:
   - `AMC_BRIDGE_URL` (default: `http://127.0.0.1:3212` for Node SDK helper and `http://localhost:3212` for Python/Go)
   - `AMC_TOKEN`
3. Make your first routed call.
4. Capture `x-amc-correlation-id` / `x-amc-receipt` for traceability.

---

## Provider-Neutral Hook Observation

For Claude Code or Gemini CLI, install the project-local observer instead of hand-editing hook configuration:

```bash
amc connect hooks install --provider claude-code --agent my-agent --dry-run
amc connect hooks install --provider claude-code --agent my-agent
amc connect hooks status --provider claude-code
amc connect hooks health --provider claude-code
amc connect hooks lifecycle --agent my-agent --action <action-id>
amc connect hooks remove --provider claude-code

# Or use --provider gemini-cli
```

The installer uses a dedicated `hook:observe` lease with a `/hooks` route allowlist, adds a managed `.gitignore` block for `.amc/hooks/`, keeps the bearer token out of provider config, requires token mode `0600`, signs its ownership manifest, and preserves unrelated settings on install and removal. Its forwarder sends only tool identity, provider surface, event time, and a hashed session correlation. It does not send tool arguments, cwd, transcript paths, or raw session IDs. It observes requested, completed, and failed tool phases; observation does not approve, deny, or steer a provider action.

`amc connect hooks health` and `GET /api/v1/watch/hooks/{provider}/health` return the same read-only projection over signed installation state and existing Watch evidence. `awaiting_first_event` means configuration is intact but runtime delivery is not yet proven. `observed` requires the latest event chain, receipt, sealed session, and encrypted body to verify. Drift, expiry, malformed matching metadata, tamper, or an unavailable locked Vault returns `fail_closed`; run `amc vault unlock`, or set `AMC_VAULT_PASSPHRASE` for non-interactive CLI use. The timestamp and event count are historical context only, not a heartbeat or current-liveness claim.

Codex, Cursor, OpenCode, and other providers are not advertised by this installer until AMC has a pinned and fixture-tested native per-tool hook contract for them.

For an explicit Enforce decision, start the local Studio/Bridge and install control mode:

```bash
amc up
amc connect hooks install --provider claude-code --mode control --agent my-agent
```

Control is loopback-only and adds a dedicated `hook:control` scope. Raw provider input is evaluated in memory and not retained. The exact provider response is bound to a signed `guard_check` receipt. Claude Code supports native `allow`, `deny`, and `ask`; Gemini CLI does not support `ask`, so AMC returns an explicit deny instead. A provider-local ask is not AMC quorum evidence, and multi-user or distinct-user approval policies fail closed.

Agents that already emit a canonical hook envelope can post an AMC-owned observed subset of the AEP `0.1` action lifecycle to:

```text
POST /bridge/hooks/aep/0.1/events
```

Mint a narrow lease instead of reusing a model-routing lease:

```bash
LEASE="$(amc lease issue \
  --agent hook-agent \
  --ttl 30m \
  --scopes hook:observe \
  --routes /hooks \
  --models '*' \
  --rpm 60)"
EVENT_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Then send one action event:

```bash
curl -sS http://127.0.0.1:3212/bridge/hooks/aep/0.1/events \
  -H "authorization: Bearer $LEASE" \
  -H "content-type: application/json" \
  --data @- <<JSON
  {
    "aep_version":"0.1",
    "id":"evt-amc-demo-001",
    "type":"action.requested",
    "time":"${EVENT_TIME}",
    "agent":{"slug":"example-agent"},
    "action":{"type":"tool_call","id":"action-amc-demo-001","input":{"command":"npm test"}},
    "tool":{"type":"native","name":"Shell"}
  }
JSON
```

AMC accepts only `action.requested`, `action.completed`, `action.failed`, and `action.denied`. It hashes and discards the raw body, hashes free-text error messages, stores an encrypted redacted projection, and returns a signed receipt. A byte-identical retry returns `200` with the original receipt and `idempotentReplay: true` only after recalculating prefix metadata hashes and links, verifying every prefix writer signature, authenticating the target payload or its signed retention proof, and verifying the receipt signature/digest, session seal, source pin, and agent/provider binding; a reused source event ID with different bytes returns `409`. Full ledger verification separately authenticates every retained historical payload, archive segment, and pruning proof. Authenticated attempts consume the signed lease request budget atomically before body parsing, including malformed requests. The implementation is pinned to source commit `2583cff9380f8f0a459d52c7112b6105c46496ed` and does not claim AEP conformance; the draft does not yet provide the planned 1.0 reference schema or conformance fixtures.

This endpoint observes. It does not return allow, deny, or approval decisions.

---

## Node/TypeScript

```ts
import { createAMCClientFromEnv, instrumentOpenAIClient } from "agent-maturity-compass";

const amc = createAMCClientFromEnv();
const openai = instrumentOpenAIClient(rawOpenAIClient, amc);

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }]
});
```

### Node ergonomic options

- `createAMCClient({ ... })` for explicit config
- `createAMCClientFromEnv({ ...overrides })` for env-first setup with explicit overrides when needed

### Node error handling

SDK runtime failures throw `AMCSDKError` with stable codes:

- `INVALID_BRIDGE_URL`
- `SELF_SCORING_BLOCKED`
- `NETWORK_ERROR`
- `HTTP_ERROR`
- `INVALID_JSON`

Example:

```ts
import { AMCSDKError } from "agent-maturity-compass";

try {
  await amc.openaiChat({ model: "gpt-4o-mini", messages: [] });
} catch (error) {
  if (error instanceof AMCSDKError) {
    console.error(error.code, error.message, error.details);
  }
}
```

---

## Mobile (React Native / Flutter)

Mobile support uses AMC Bridge over HTTPS. Do not route provider API keys directly from a mobile app; use your backend or a narrowly scoped AMC Bridge token, then send model traffic to `/bridge/<provider>/...`.

Current status:
- React Native: supported through a mobile-safe fetch wrapper with no `node:*` imports.
- Flutter/Dart: supported through direct REST calls to AMC Bridge; a packaged Dart SDK is not shipped yet.
- The root `agent-maturity-compass` npm package remains Node-first because it includes CLI/runtime dependencies. If your React Native package manager cannot install it cleanly, vendor the standalone wrapper from `src/sdk/mobileFetch.ts` or expose the same request shape from your backend.

### React Native fetch wrapper

```ts
import { createReactNativeAMCFetch } from "agent-maturity-compass/sdk/mobile-fetch";

const amcFetch = createReactNativeAMCFetch({
  bridgeUrl: "https://amc.example.com",
  token: mobileBridgeToken,
  agentId: "rn-agent",
});

const response = await amcFetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hello" }],
  }),
});
```

The wrapper rewrites the call to `https://amc.example.com/bridge/openai/v1/chat/completions`, strips provider auth headers by default, attaches `x-amc-agent-id`, `x-amc-correlation-id`, and `x-amc-sdk-name`, and blocks self-scoring fields before the request leaves the app.

### Flutter / Dart REST shape

```dart
final response = await http.post(
  Uri.parse('https://amc.example.com/bridge/openai/v1/chat/completions'),
  headers: {
    'content-type': 'application/json',
    'authorization': 'Bearer $mobileBridgeToken',
    'x-amc-agent-id': 'flutter-agent',
    'x-amc-correlation-id': correlationId,
    'x-amc-sdk-name': 'amc-flutter-rest',
  },
  body: jsonEncode({
    'model': 'gpt-4o-mini',
    'messages': [
      {'role': 'user', 'content': 'hello'}
    ],
  }),
);
```

Use `website/openapi.yaml` as the endpoint contract and capture `x-amc-correlation-id` / `x-amc-receipt` response headers for traceability.

---

## Python

```python
from amc_client import AMCClient

client = AMCClient.from_env()  # reads AMC_BRIDGE_URL / AMC_TOKEN / AMC_WORKSPACE_ID
resp = client.openai_chat({
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "hello"}],
})

print(resp.status, resp.ok)
print(resp.request_id, resp.receipt, resp.correlation_id)
```

---

## Go

```go
client := amc.NewClientFromEnv()

resp, err := client.OpenAIChat(ctx, map[string]any{
    "model": "gpt-4o-mini",
    "messages": []any{map[string]any{"role": "user", "content": "hello"}},
})
if err != nil {
    log.Fatal(err)
}

log.Printf("status=%d request_id=%s correlation_id=%s", resp.Status, resp.RequestID, resp.CorrelationID)
```

---

## Versioning And Deprecation

- Versioning model:
  - Node SDK follows the main `agent-maturity-compass` package version.
  - Python SDK follows `amc-sdk` package SemVer.
  - Go SDK follows `github.com/anthropic/amc-go-sdk` SemVer tags.
- Deprecation policy:
  - Deprecated SDK methods/endpoints receive a `Deprecation: true` response header and warning text.
  - Sunset date is communicated with `Sunset` response header when applicable.
  - AMC provides a minimum 180-day migration window before removal of a deprecated API surface.
  - Breaking removals only happen in the next major SDK/API version.
- Runtime visibility:
  - SDK requests send `x-amc-sdk-name` and `x-amc-sdk-version` for version-aware diagnostics.
  - Response metadata includes deprecation fields (`deprecated`, `warning`, `sunset`) in SDK response wrappers.

## Exposed Integrations (Node)

- `instrumentOpenAIClient`
- `instrumentAnthropicClient`
- `instrumentGeminiClient`
- `instrumentOpenAIAgentsSdk`
- `createVercelAIFetchBridge`
- `createLangChainJsBridge`
- `createLangGraphJsBridge`
- `createAMCMobileFetchBridge`
- `createReactNativeAMCFetch`

Bridge client methods also include `openaiBatches(...)` for OpenAI batch-processing workflows.

## Safety Defaults

- Self-scoring keys/content are blocked at SDK boundaries.
- Telemetry is redacted before upload.
- Lease tokens are used only for Bridge auth and should not be logged in cleartext.
