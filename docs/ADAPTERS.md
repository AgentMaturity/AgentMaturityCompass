# AMC Adapters Guide

Adapters are AMC's one-liner integration system. They wrap any AI agent CLI or SDK, automatically capturing evidence through the AMC gateway.

Adapters are part of AMC's current TypeScript integration path. They are not a separate runtime. For the architecture overview, read `docs/ARCHITECTURE_BRIEF.md`. For core-versus-wrapper clarity across SDKs, extensions, actions, and legacy paths, read `docs/IMPLEMENTATION_REALITY_MAP.md`.

Need an adapter for a framework AMC does not ship yet? Read `docs/CUSTOM_ADAPTER.md` for the declarative plugin adapter schema, SDK wrapper path, evidence contract, and acceptance checklist.

## How Adapters Work

When you run `amc adapters run`:
1. A short-lived **lease** is minted automatically
2. Compatibility **env vars** are injected (base URL + lease token)
3. Model traffic routes through the **AMC gateway**
4. Signed evidence is captured: `agent_process_started`, `stdout`, `stderr`, `exited`
5. Lease tokens are **redacted** from logs

## Setup

```bash
amc adapters init          # create signed adapters.yaml
amc adapters list          # show available adapters
amc adapters detect        # detect installed runtimes
```

## Signed Capability Receipt

Do not infer adapter coverage from its name or from a detected host runtime. Issue a signed receipt for the exact agent and adapter instead:

```bash
amc adapters capabilities \
  --agent my-agent \
  --adapter claude-cli \
  --out adapter-capabilities.json \
  --json
```

The receipt separates:

- **declared** events and controls in the authoritative adapter registry;
- **effective** events and controls for the current signed configuration and hook mode;
- the adapter definition version from the detected runtime version;
- adapter-binary/package probes from weaker host-runtime or shell probes;
- known normalization and redaction lossiness;
- `verified`, `partial`, or `fail_closed` status with machine-readable reasons.

The canonical bytes are SHA-256 hashed and signed by AMC's existing auditor trust path. Receipts exclude prompts, tool arguments, stdout/stderr content, cwd, transcript paths, lease tokens, and secrets. A missing runtime, missing version, invalid adapter-config signature, drifted hook, untrusted signer, metadata-only plugin, or publisher self-attestation cannot produce a green capability result. Plugin receipts stay fail closed until AMC's separate partner-certification lane exists.

The same contract is available from `POST /api/v1/adapters/capability-receipts` and from the TypeScript exports `issueAdapterCapabilityReceipt` and `verifyAdapterCapabilityReceipt`.

## Claude CLI (Anthropic)

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude --model claude-sonnet-4-6
```

The gateway can observe model requests/responses when Claude honors the configured route. Exact tool-request observation and native allow/deny/ask controls require a verified `amc connect hooks` installation. Use the signed capability receipt to see what is effective now.

Configure as default for an agent:

```bash
amc adapters configure --agent my-claude --adapter claude-cli --route /anthropic --model claude-sonnet-4-6
```

## Gemini CLI (Google)

```bash
amc adapters run --agent my-gemini --adapter gemini-cli -- gemini --model gemini-flash
```

The gateway can observe model requests/responses when Gemini honors the configured route. Exact pre-tool observation and native allow/deny controls require a verified `amc connect hooks` installation. Gemini has no native ask outcome in the pinned contract, so AMC records the loss and fails an ask decision closed to deny.

## OpenClaw

```bash
amc adapters run --agent my-openclaw --adapter openclaw-cli -- openclaw run
```

Or configure OpenClaw to route all sessions through the AMC gateway permanently.

## Generic CLI (Any Agent)

For any command-line agent:

```bash
amc adapters run --agent my-bot --adapter generic-cli -- node my-agent.js
amc adapters run --agent my-bot --adapter generic-cli -- python bot.py
amc adapters run --agent my-bot --adapter generic-cli -- ./my-custom-agent
```

## OpenAI SDK (Node.js)

Use `wrapFetch` to intercept all OpenAI API calls:

```typescript
import { wrapFetch } from "agent-maturity-compass";

const fetchWithAmc = wrapFetch(globalThis.fetch, {
  agentId: "my-openai-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
  forceBaseUrl: true,
});

// All OpenAI calls now flow through AMC — evidence captured automatically
const response = await fetchWithAmc("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hello" }],
  }),
});
```

## Mobile Apps (React Native / Flutter)

Mobile apps should use AMC Bridge over HTTPS, not the Node `wrapFetch` runtime:

- React Native: use `createReactNativeAMCFetch` from `agent-maturity-compass/sdk/mobile-fetch` when your package manager can consume the mobile-safe subpath, or vendor `src/sdk/mobileFetch.ts`.
- Flutter: call `https://<bridge-host>/bridge/<provider>/...` directly with `authorization: Bearer <AMC bridge token>`, `x-amc-agent-id`, and `x-amc-correlation-id`.
- Keep provider API keys on your backend or in AMC Bridge; do not embed provider keys in mobile apps.

See `docs/SDK.md#mobile-react-native--flutter` for full examples.

## Custom SDK Integration

For programmatic evidence capture:

```typescript
import { wrapFetch, logTrace } from "agent-maturity-compass";

// Option 1: Wrap fetch for automatic capture
const fetch = wrapFetch(globalThis.fetch, {
  agentId: "my-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
});

// Option 2: Manual trace logging
logTrace({ agentId: "my-agent", type: "tool_call", data: { tool: "read_file" } });
```

## Bridge (Connect Remote Agent)

For agents running on a different machine:

```bash
# On owner machine — create a one-time pairing code
amc pair create --agent-name "remote-agent" --ttl-min 10

# On agent machine — redeem the code
amc pair redeem AMC-XXXX-XXXX --out ./agent.token --bridge-url http://owner-ip:3212

# Connect and verify
amc connect --token-file ./agent.token --bridge-url http://owner-ip:3212

# Wrap and run with evidence capture
amc wrap --agent-token ./agent.token --provider auto -- node agent.js
```

## Legacy Wrap Commands

These still work but `amc adapters run` is preferred:

```bash
amc wrap claude -- <args...>
amc wrap gemini -- <args...>
amc wrap openclaw -- <args...>
amc wrap any -- <cmd...>
```

## Supervised Mode (Gateway Injection)

For agents that need explicit gateway routing:

```bash
amc supervise --agent my-agent --route http://127.0.0.1:3210/openai -- node agent.js
```

## Sandboxed Execution

Run agents in a hardened Docker sandbox:

```bash
amc sandbox run --agent my-agent --route http://127.0.0.1:3210/openai -- node agent.js
```

## Provider Routes

The gateway supports these route prefixes:

| Route | Provider |
|-------|----------|
| `/openai` | OpenAI (GPT-4o, o3, etc.) |
| `/anthropic` | Anthropic (Claude) |
| `/gemini` | Google Gemini |
| `/grok` | xAI Grok |
| `/openrouter` | OpenRouter (multi-model) |
| `/local` | Local models (Ollama, etc.) |

## Adapter Environment Variables

View what env vars an adapter injects (without a lease):

```bash
amc adapters env --agent my-agent --adapter claude-cli
```

## Generate Sample Projects

Create a runnable local sample for library-based frameworks:

```bash
amc adapters init-project --agent my-agent --adapter openai-agents-sdk
```

For a framework not covered by a built-in sample, use `docs/CUSTOM_ADAPTER.md` to choose between a declarative plugin adapter and an SDK wrapper adapter.

## Lease Compatibility

AMC accepts leases via these headers:
- `x-amc-lease`
- `Authorization: Bearer <lease>`
- `x-api-key`
- `x-goog-api-key`
- `api-key`

Real provider API keys never leave the vault. Agents receive dummy keys (`amc_dummy`).
