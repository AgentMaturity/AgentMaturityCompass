# Adapter Compatibility Matrix

AMC supports 14 built-in adapters for wrapping and evaluating AI agents across frameworks.

## Compatibility Status

| Adapter | Framework | Status | Runtime | Notes |
|---------|-----------|--------|---------|-------|
| `langchain-python` | LangChain (Python) | ✅ Tested | Python 3.11+ | Auto-detected |
| `langchain-node` | LangChain (Node.js) | ✅ Tested | Node 22+ | Auto-detected |
| `langgraph-python` | LangGraph | ✅ Tested | Python 3.11+ | Auto-detected |
| `crewai-cli` | CrewAI | ✅ Tested | Python 3.11+ | Auto-detected |
| `autogen-cli` | AutoGen | ✅ Tested | Python 3.11+ | Auto-detected |
| `openai-agents-sdk` | OpenAI Agents SDK | ✅ Tested | Node 22+ | Auto-detected |
| `llamaindex-python` | LlamaIndex | ✅ Tested | Python 3.11+ | Auto-detected |
| `semantic-kernel` | Semantic Kernel | ✅ Tested | Node 22+ | Auto-detected |
| `claude-cli` | Claude Code | ✅ Tested | Native binary | Auto-detected |
| `gemini-cli` | Gemini CLI | ✅ Tested | Native binary | Auto-detected |
| `openclaw-cli` | OpenClaw | ✅ Tested | Node 22+ | Auto-detected |
| `openhands-cli` | OpenHands | 🧪 Experimental | Python 3.11+ | Requires manual install |
| `python-amc-sdk` | AMC Python SDK | ✅ Tested | Python 3.11+ | Direct integration |
| `generic-cli` | Any CLI agent | ✅ Tested | sh/bash | Universal fallback |

## Auto-Detection

`amc setup` automatically detects installed frameworks and configures the appropriate adapter:

```bash
amc setup
# Output:
# - detected frameworks: langchain-python -> langchain-python, crewai -> crewai-cli
# - adapter auto-config: my-agent:langchain-python, my-agent:crewai-cli
```

## Using an Adapter

```bash
# Wrap any agent with evidence capture
amc wrap <adapter> -- <your-command>

# Examples
amc wrap claude -- claude "analyze this codebase"
amc wrap langchain-python -- python my_agent.py
amc wrap generic-cli -- ./my-custom-agent.sh

# Run evaluation with a specific adapter
amc adapters run --agent my-agent --adapter langchain-python
```

## Check Available Adapters

```bash
# List all adapters and their detection status
amc doctor

# The doctor output shows which adapters are available:
# [PASS] adapter-langchain-python: python3 3.14.2
# [PASS] adapter-claude-cli: claude 2.1.50
# [WARN] adapter-openhands-cli: missing commands: openhands, oh
```

## Adding Custom Adapters

AMC supports plugin adapters for frameworks not covered by built-ins. See the [adapter development guide](ARCHITECTURE_MAP.md) for details.

## Reporting Issues

If an adapter doesn't work with your framework version, please [open an issue](https://github.com/AgentMaturity/AgentMaturityCompass/issues) with:
- Framework name and version
- AMC version (`amc --version`)
- Error output
- Steps to reproduce
