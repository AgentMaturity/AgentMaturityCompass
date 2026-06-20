# AMC Adapter Guides

Individual setup and integration guides for each supported adapter.

## Supported Adapters

| # | Adapter | Framework | Guide |
|---|---------|-----------|-------|
| 1 | `langchain-python` | LangChain (Python) | [langchain-python.md](langchain-python.md) |
| 2 | `langchain-node` | LangChain (Node.js) | [langchain-node.md](langchain-node.md) |
| 3 | `langgraph-python` | LangGraph | [langgraph-python.md](langgraph-python.md) |
| 4 | `crewai-cli` | CrewAI | [crewai.md](crewai.md) |
| 5 | `autogen-cli` | AutoGen | [autogen.md](autogen.md) |
| 6 | `openai-agents-sdk` | OpenAI Agents SDK | [openai-agents-sdk.md](openai-agents-sdk.md) |
| 7 | `llamaindex-python` | LlamaIndex | [llamaindex.md](llamaindex.md) |
| 8 | `semantic-kernel` | Semantic Kernel | [semantic-kernel.md](semantic-kernel.md) |
| 9 | `claude-cli` | Claude Code | [claude-code.md](claude-code.md) |
| 10 | `gemini-cli` | Gemini CLI | [gemini.md](gemini.md) |
| 11 | `openclaw-cli` | OpenClaw | [openclaw.md](openclaw.md) |
| 12 | `openhands-cli` | OpenHands | [openhands.md](openhands.md) |
| 13 | `python-amc-sdk` | AMC Python SDK | [python-amc-sdk.md](python-amc-sdk.md) |
| 14 | `generic-cli` | Any CLI Agent | [generic-cli.md](generic-cli.md) |

## Quick Start

```bash
# Detect which adapters are available on your system
amc adapters detect

# List all configured adapters
amc adapters list

# Run any agent with evidence capture
amc adapters run --agent <agent-name> --adapter <adapter-id> -- <your-command>
```

## How Adapters Work

1. A short-lived **lease** is minted automatically
2. Compatibility **env vars** are injected (gateway base URL + lease token)
3. Model traffic routes through the **AMC gateway**
4. Signed evidence is captured: `agent_process_started`, `stdout`, `stderr`, `exited`
5. Lease tokens are **redacted** from logs

See [ADAPTERS.md](../ADAPTERS.md) for the full architecture overview.

## Write a Custom Adapter

For unsupported frameworks, see [CUSTOM_ADAPTER.md](../CUSTOM_ADAPTER.md). It covers declarative plugin adapters, SDK wrapper adapters, required schema fields, evidence emitted by adapter runs, and the verification checklist before publishing.
