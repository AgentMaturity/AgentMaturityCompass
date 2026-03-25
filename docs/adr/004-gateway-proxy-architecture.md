# ADR-004: Transparent Gateway Proxy for Evidence Collection

## Status
Accepted

## Date
2026-02-20

## Context
To score agents based on actual behavior, we need to observe their interactions without modifying the agent's code. Requiring agents to instrument themselves would defeat the purpose of independent verification.

## Decision
AMC uses a transparent gateway proxy:

```
Agent (untrusted) → AMC Gateway → Provider API
                        ↓
                   Evidence Ledger
```

The gateway:
- Intercepts API calls between agents and LLM providers
- Records tool calls, responses, and behavioral signals
- Supports OpenAI, Anthropic, Gemini, Grok, and OpenRouter routes
- Is invisible to the agent — the agent doesn't know it's being observed
- Supports 14 framework adapters for zero-code integration

## Consequences
- **Positive**: Zero code changes required — just point API calls through the proxy
- **Positive**: Evidence is OBSERVED tier (1.0× weight) vs SELF_REPORTED (0.4×)
- **Positive**: Works with any framework via environment variable (`AMC_PROXY_URL`)
- **Negative**: Adds latency (minimal — proxy is local)
- **Negative**: Requires network path through the proxy
- **Mitigation**: `amc wrap <adapter>` handles setup automatically
