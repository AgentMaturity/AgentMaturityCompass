# AMC Python SDK Adapter

Adapter ID: `python-amc-sdk`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

The AMC Python SDK provides direct integration for Python-based agents, offering programmatic evidence capture without CLI wrapping. Use this for custom agents or when you need fine-grained control over evidence logging.

## Prerequisites

- Python 3.11+
- `agent-maturity-compass` Python package
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Installation

```bash
pip install agent-maturity-compass
```

## Quick Start

```python
from amc import AmcClient, log_trace

client = AmcClient(
    agent_id="my-python-agent",
    gateway_url="http://localhost:3210"
)

# Automatic LLM call capture
with client.trace_llm_call(model="gpt-4o", provider="openai"):
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}]
    )

# Manual trace logging
log_trace(
    agent_id="my-python-agent",
    event_type="tool_call",
    data={"tool": "web_search", "query": "agent maturity"}
)
```

## SDK Methods

### `AmcClient`

```python
client = AmcClient(
    agent_id="my-agent",
    gateway_url="http://localhost:3210",
    lease_token=None  # Auto-acquired if not provided
)
```

### `trace_llm_call`

Context manager for automatic LLM call capture:

```python
with client.trace_llm_call(model="gpt-4o", provider="openai"):
    # Your LLM call here
    pass
```

### `log_trace`

Manual event logging:

```python
log_trace(
    agent_id="my-agent",
    event_type="custom_event",
    data={"key": "value"},
    timestamp=None  # Auto-generated if not provided
)
```

### `wrap_fetch`

Wrap HTTP clients for automatic capture:

```python
from amc import wrap_fetch
import httpx

wrapped_client = wrap_fetch(
    httpx.Client(),
    agent_id="my-agent",
    gateway_url="http://localhost:3210"
)
```

## Evidence Captured

- LLM calls (model, tokens, latency, cost)
- Tool invocations
- Custom events and traces
- HTTP requests (when using `wrap_fetch`)
- Error traces and exceptions

## Common Patterns

### Custom Agent

```python
from amc import AmcClient

client = AmcClient(agent_id="custom-agent")

with client.trace_llm_call(model="gpt-4o"):
    # Your agent logic
    result = my_agent.run(task)

client.log_completion(result)
```

### RAG Pipeline

```python
from amc import log_trace

log_trace(agent_id="rag-agent", event_type="retrieval_start")
docs = vector_store.search(query)
log_trace(agent_id="rag-agent", event_type="retrieval_complete", data={"doc_count": len(docs)})

with client.trace_llm_call(model="gpt-4o"):
    response = generate_response(docs, query)
```

## See Also

- [LangChain Python Adapter](langchain-python.md)
- [Generic CLI Adapter](generic-cli.md)
