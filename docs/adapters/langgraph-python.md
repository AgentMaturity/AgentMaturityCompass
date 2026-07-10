# LangGraph (Python) Adapter

Adapter ID: `langgraph-python`  
Runtime: Python 3.11+  
Auto-detected: ✅ Yes  
Status: ✅ Tested

## Overview

LangGraph is LangChain's framework for building stateful, multi-actor applications with cycles and persistence. The AMC adapter captures graph node execution, state transitions, and edge traversals as signed evidence.

## Prerequisites

- Python 3.11+
- `langgraph` package installed
- AMC installed (`curl -fsSL https://agentmaturity.co/install.sh | sh`)

## Quick Start

```bash
amc adapters run --agent my-graph --adapter langgraph-python -- python graph_agent.py
```

## Setup

```bash
amc adapters configure \
  --agent my-graph \
  --adapter langgraph-python \
  --route /openai
```

## SDK Integration

```python
from langgraph.graph import StateGraph
from langchain_openai import ChatOpenAI

# AMC injects OPENAI_BASE_URL and OPENAI_API_KEY automatically
llm = ChatOpenAI(model="gpt-4o")

# Build your graph as normal
graph = StateGraph(...)
graph.add_node("agent", agent_node)
graph.add_edge("agent", "tools")
app = graph.compile()

# Run with evidence capture
result = app.invoke({"messages": [...]})
```

## Evidence Captured

- Graph node execution (start/end, duration)
- State transitions between nodes
- Edge traversals and routing decisions
- LLM calls within nodes
- Tool invocations
- Checkpointing and persistence events

## See Also

- [LangChain Python Adapter](langchain-python.md)
- [LangChain Node.js Adapter](langchain-node.md)
