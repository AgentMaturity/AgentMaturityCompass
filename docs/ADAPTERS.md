# AMC Adapters Guide

Adapters are AMC's one-liner integration system. They wrap any AI agent CLI or SDK, automatically capturing evidence through the AMC gateway.

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

## Claude CLI (Anthropic)

```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude --model claude-sonnet-4-6
```

Evidence captured: input/output tokens, tool calls, model used, response time, reasoning traces.

Configure as default for an agent:

```bash
amc adapters configure --agent my-claude --adapter claude-cli --route /anthropic --model claude-sonnet-4-6
```

## Gemini CLI (Google)

```bash
amc adapters run --agent my-gemini --adapter gemini-cli -- gemini --model gemini-flash
```

Evidence captured: responses, safety scores, grounding hits.

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

## Lease Compatibility

AMC accepts leases via these headers:
- `x-amc-lease`
- `Authorization: Bearer <lease>`
- `x-api-key`
- `x-goog-api-key`
- `api-key`

Real provider API keys never leave the vault. Agents receive dummy keys (`amc_dummy`).
