# LangGraph Python + AMC

A LangGraph stateful agent with a planner→executor graph, routing all LLM calls through the AMC Gateway.

## What It Does

- Builds a two-node graph: **planner** (breaks question into steps) → **executor** (provides final answer)
- Uses LangGraph's `StateGraph` with typed state and conditional edges
- AMC captures all LLM interactions transparently via env var proxy

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed with the checksum-verified GitHub Release installer (npm is not public yet; see the root README)
- An OpenAI API key

## Install

```bash
cd examples/langgraph-python
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap langgraph-python -- python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== LangGraph Stateful Agent ===
Steps taken: 2
Final answer: The sky appears blue because...
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

AMC sets `OPENAI_BASE_URL` to the gateway. LangGraph uses LangChain's `ChatOpenAI` under the hood, which reads env vars automatically. The graph structure, state transitions, and multi-step reasoning are all captured as evidence.

The adapter definition is in `src/adapters/builtins/langgraphPython.ts`.
