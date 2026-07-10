# LangChain (Python) Adapter

Adapter ID: `langchain-python`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The LangChain Python adapter wraps LangChain-based agents, capturing all LLM calls, tool invocations, and chain executions as signed AMC evidence. Works with both legacy chains and the modern LCEL (LangChain Expression Language) pipeline.

## Prerequisites

- Python 3.11+
- `langchain` and `langchain-core` installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
# One-liner: wrap any LangChain Python script
amc adapters run --agent my-langchain-agent --adapter langchain-python -- python my_agent.py
```

## Setup

### 1. Auto-detect

```bash
amc adapters detect
# Output: langchain-python -> python3 3.x.x ✓
```

### 2. Configure

```bash
amc adapters configure \
  --agent my-langchain-agent \
  --adapter langchain-python \
  --route /openai \
  --model gpt-4o
```

### 3. Initialize a sample project

```bash
amc adapters init-project --agent my-langchain-agent --adapter langchain-python
```

## Environment Variables Injected

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Lease token (dummy key routed through AMC gateway) |
| `OPENAI_BASE_URL` | AMC gateway URL (e.g. `http://localhost:3210/openai`) |
| `AMC_AGENT_ID` | Your agent identifier |
| `AMC_LEASE_TOKEN` | Short-lived lease for this run |

View all injected vars without starting a lease:

```bash
amc adapters env --agent my-langchain-agent --adapter langchain-python
```

## SDK Integration (Deeper Instrumentation)

For richer evidence beyond CLI wrapping, use the callback-based bridge:

```python
from langchain_openai import ChatOpenAI
from langchain.callbacks import StdOutCallbackHandler

# The AMC gateway intercepts calls via the injected base URL.
# No code changes needed — env vars handle routing.
llm = ChatOpenAI(model="gpt-4o")
response = llm.invoke("What is agent maturity?")
```

For manual trace correlation:

```python
import os

# AMC injects these at runtime
agent_id = os.environ.get("AMC_AGENT_ID")
lease = os.environ.get("AMC_LEASE_TOKEN")
```

## Evidence Captured

- **LLM calls**: model, input/output tokens, latency, response content
- **Tool calls**: tool name, arguments, results
- **Chain execution**: start/end timestamps, intermediate steps
- **Process lifecycle**: `agent_process_started`, `stdout`, `stderr`, `exited`
- **Errors**: exceptions, stack traces, exit codes

## Common Patterns

### RAG Agent

```bash
amc adapters run --agent rag-bot --adapter langchain-python -- \
  python rag_agent.py --index ./my_docs
```

### Multi-chain Pipeline

```bash
amc adapters run --agent pipeline --adapter langchain-python -- \
  python multi_chain.py
```

### With Custom Provider Route

```bash
amc adapters run --agent my-agent --adapter langchain-python \
  --route /anthropic -- python agent.py
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `OPENAI_API_KEY` conflict | AMC overrides this with the lease token. Remove any `.env` overrides. |
| Module not found | Ensure `langchain` is installed in the same Python env: `pip install langchain langchain-openai` |
| Gateway connection refused | Confirm `amc up` is running and the gateway is listening on port 3210 |

## See Also

- [LangChain Node.js Adapter](langchain-node.md)
- [LangGraph Adapter](langgraph-python.md)
- [Adapter Architecture](../ADAPTERS.md)
