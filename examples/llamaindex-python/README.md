# LlamaIndex Python + AMC

A LlamaIndex RAG pipeline that routes all LLM and embedding calls through the AMC Gateway.

## What It Does

- Creates a vector index from sample documents about AMC
- Queries the index with natural language questions
- AMC captures both LLM completion and embedding API calls

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Install

```bash
cd examples/llamaindex-python
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap llamaindex-python -- python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== LlamaIndex RAG Pipeline ===
Building vector index...
Querying: 'How does AMC score agents?'
Response: AMC scores agents based on observed behavior...
[AMC] All LLM and embedding calls captured as evidence via gateway proxy.
```

## How AMC Integrates

LlamaIndex's `OpenAI` LLM and `OpenAIEmbedding` clients read `OPENAI_BASE_URL` from the environment. AMC's `llamaindex-python` adapter sets this to the gateway — both completion and embedding calls are captured.

The adapter definition is in `src/adapters/builtins/llamaindexPython.ts`.
