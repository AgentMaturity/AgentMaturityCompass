# AMC Provider Integrations

AMC integrates with every major AI provider. All integrations follow the same pattern: route model traffic through the AMC gateway, capture evidence, score the agent.

## Anthropic Claude

**CLI wrapper:**
```bash
amc adapters run --agent my-claude --adapter claude-cli -- claude
```

**SDK integration (Node.js):**
```typescript
import { wrapFetch } from "agent-maturity-compass";
const fetch = wrapFetch(globalThis.fetch, {
  agentId: "my-claude",
  gatewayBaseUrl: "http://localhost:3210/anthropic",
  forceBaseUrl: true,
});
```

**Gateway proxy:** Point `ANTHROPIC_BASE_URL` to `http://localhost:3210/anthropic`.

**Evidence captured:** input/output tokens, tool calls, model used, response time, reasoning traces.

## OpenAI (GPT-4o, o3, etc.)

**SDK integration:**
```typescript
import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "http://localhost:3210/openai",  // AMC gateway
  apiKey: "amc_dummy",                       // real key in vault
});
```

**Evidence captured:** completions, function calls, embeddings, cost.

**Zero-key agents:** AMC holds the API key in the vault. Agents never see it. Configure with:
```bash
amc vault unlock
amc provider add --agent my-openai-agent
```

## Google Gemini

**CLI wrapper:**
```bash
amc adapters run --agent my-gemini --adapter gemini-cli -- gemini
```

**SDK proxy:** Set Gemini base URL to `http://localhost:3210/gemini`.

**Evidence captured:** responses, safety scores, grounding hits.

## xAI Grok

Grok uses the OpenAI-compatible API format:

```bash
amc adapters run --agent my-grok --adapter generic-cli -- grok-cli
```

Or use the OpenAI SDK with the Grok gateway route:
```typescript
const client = new OpenAI({
  baseURL: "http://localhost:3210/grok",
  apiKey: "amc_dummy",
});
```

## OpenRouter (Multi-Model)

```bash
amc adapters run --agent my-router --adapter generic-cli -- node my-router-agent.js
```

Gateway route: `http://localhost:3210/openrouter`

All routes captured regardless of underlying model selection.

## OpenClaw

```bash
amc adapters run --agent my-openclaw --adapter openclaw-cli -- openclaw run
```

Or configure OpenClaw to route all agent sessions through the AMC gateway. AMC scores OpenClaw agent behavior over time across sessions.

## Local Models (Ollama, llama.cpp)

Bind a local route:
```bash
amc gateway bind-agent --agent local-agent --route /local
```

Point Ollama clients to `http://localhost:3210/local`.

## LangChain / LlamaIndex (Node.js)

Use `wrapFetch` to intercept all HTTP calls to AI providers:

```typescript
import { wrapFetch } from "agent-maturity-compass";
globalThis.fetch = wrapFetch(globalThis.fetch, {
  agentId: "langchain-agent",
  gatewayBaseUrl: "http://localhost:3210/openai",
  forceBaseUrl: true,
});
// LangChain/LlamaIndex calls now flow through AMC
```

## Python Agents

Generate the Python SDK bridge:
```bash
amc python-sdk
```

Or use the HTTP bridge API directly from any language.

## Gateway Architecture

```
Your Agent → AMC Gateway (localhost:3210) → Provider API
                  ↓
           Evidence Ledger (signed, append-only)
                  ↓
           AMC Studio (scoring, console, dashboards)
```

The gateway:
- Mints monitor-signed **receipts** for every `llm_request`/`llm_response`
- Injects receipts back to clients via `x-amc-receipt` header
- Strips agent-provided credentials before upstream forwarding
- Enforces **budget limits** and **drift freeze** policies

## Receipts & Correlation

AMC gateway receipts enable deterministic trace correlation:
- Receipt signatures are verified
- `event_hash` existence in ledger is confirmed
- `body_sha256` matches evidence payload hash
- Mismatches trigger `TRACE_*` audits and score caps
