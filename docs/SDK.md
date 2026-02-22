# AMC SDKs (Node, Python, Go)

AMC SDKs route model calls through Bridge and attach deterministic correlation metadata.
They do **not** allow self-scoring payloads.

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
- `createAMCClientFromEnv()` for env-first setup

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

## Exposed Integrations (Node)

- `instrumentOpenAIClient`
- `instrumentAnthropicClient`
- `instrumentGeminiClient`
- `instrumentOpenAIAgentsSdk`
- `createVercelAIFetchBridge`
- `createLangChainJsBridge`
- `createLangGraphJsBridge`

## Safety Defaults

- Self-scoring keys/content are blocked at SDK boundaries.
- Telemetry is redacted before upload.
- Lease tokens are used only for Bridge auth and should not be logged in cleartext.
