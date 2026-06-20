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
