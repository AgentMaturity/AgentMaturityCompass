# AMC Examples

Working examples for all 14 AMC framework adapters. Each example shows how to integrate an AI agent framework with AMC for evidence-based maturity scoring.

## How It Works

AMC uses a **gateway proxy pattern**: it sets environment variables (like `OPENAI_BASE_URL`) to route all LLM API calls through the AMC Gateway. The gateway captures evidence transparently — **zero code changes** required for most frameworks.

```
Your Agent → AMC Gateway (captures evidence) → LLM Provider (OpenAI, Anthropic, etc.)
```

## Framework Examples

| # | Example | Framework | Language | Description |
|---|---------|-----------|----------|-------------|
| 1 | [langchain-node](./langchain-node/) | LangChain | TypeScript | Chain + agent with tools via `ChatOpenAI` |
| 2 | [langchain-python](./langchain-python/) | LangChain | Python | Chain + agent with tools via `ChatOpenAI` |
| 3 | [langgraph-python](./langgraph-python/) | LangGraph | Python | Stateful planner→executor graph |
| 4 | [crewai](./crewai/) | CrewAI | Python | Multi-agent crew (researcher + writer) |
| 5 | [autogen](./autogen/) | AutoGen | Python | Conversational agents (tutor + student) |
| 6 | [openai-agents-sdk](./openai-agents-sdk/) | OpenAI Agents SDK | Python | Agent with function tools |
| 7 | [llamaindex-python](./llamaindex-python/) | LlamaIndex | Python | RAG pipeline with vector index |
| 8 | [semantic-kernel](./semantic-kernel/) | Semantic Kernel | C# (.NET) | Agent with auto function calling |
| 9 | [claude-code](./claude-code/) | Claude Code CLI | Bash | Env var setup for Claude Code sessions |
| 10 | [gemini](./gemini/) | Gemini | Python | Chat + function calling with Gemini |
| 11 | [openclaw](./openclaw/) | OpenClaw | YAML | Agent config with AMC scoring enabled |
| 12 | [openhands](./openhands/) | OpenHands | Bash | Env var setup for OpenHands coding agent |
| 13 | [python-amc-sdk](./python-amc-sdk/) | Python AMC SDK | Python | Direct SDK usage — simplest possible example |
| 14 | [generic-cli](./generic-cli/) | Generic CLI | Bash | Score ANY CLI agent via env var proxy |

## Quick Start

```bash
# Install AMC
npm i -g agent-maturity-compass

# Start the gateway
amc up

# Run any example through AMC
amc wrap langchain-python -- python examples/langchain-python/main.py
amc wrap crewai-cli -- python examples/crewai/main.py
amc wrap generic-cli -- python examples/python-amc-sdk/main.py
```

## Legacy Examples

These older examples demonstrate AMC Python module integration patterns:

- `content_moderation_bot.py` — Shield, Enforce, and Watch integration
- `data_pipeline_bot.py` — Vault, Enforce circuit breaker, and SIEM integration
- `legal_contract_bot.py` — Full-stack integration across all 6 module families
- `hello-agent/` — Minimal agent for basic `amc wrap` demonstration

## Environment Variables

All adapters use `AMC_GATEWAY_URL` as the primary connection point. Each adapter then sets framework-specific variables:

| Variable | Used By |
|----------|---------|
| `OPENAI_BASE_URL` | LangChain, LangGraph, CrewAI, AutoGen, OpenAI Agents SDK, LlamaIndex, OpenClaw, OpenHands |
| `ANTHROPIC_BASE_URL` | Claude Code |
| `GEMINI_BASE_URL` | Gemini |
| `AMC_LLM_BASE_URL` | All adapters (fallback) |
