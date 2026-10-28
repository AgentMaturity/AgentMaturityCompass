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
| 15 | `deepseek-harness` | DeepSeek Harness headless capture (qualification pending) | [deepseek-harness.md](deepseek-harness.md) |

Pi is connected through its `tool_call` hook rather than an adapter id: `amc connect hooks install --provider pi`. See [pi.md](pi.md) for what is enforced, for which Pi versions, and what is not covered.

## Harness support matrix

What AMC claims for Pi, Claude Code, DeepSeek Harness and Codex, hook by hook and version by version, is in the generated [SUPPORT_MATRIX.md](SUPPORT_MATRIX.md), rendered from the adapter claim manifests in [manifests/](manifests/). The draft support policy is [SUPPORT_POLICY.md](SUPPORT_POLICY.md).

| Harness | Status | Guide |
|---|---|---|
| Pi | Supported at the qualified versions: enforced at `tool_call` | [pi.md](pi.md) |
| Claude Code | Supported at the qualified version: enforced at `PreToolUse`, admission at `UserPromptSubmit` | [claude-code-hooks.md](claude-code-hooks.md) |
| DeepSeek Harness | Launch capture observed; no tool-call claim (the plugin gate is not qualified) | [deepseek-harness.md](deepseek-harness.md) |
| Codex | Unsupported: Codex 0.165.0's PreToolUse hook lets a call run when the hook fails | [SUPPORT_MATRIX.md](SUPPORT_MATRIX.md) |

"Supported" means listed in the harness's manifest and backed by its qualification record; the matrix lists the versions.

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
