# LangChain Python + AMC

A LangChain Python agent that routes all LLM calls through the AMC Gateway for transparent evidence collection.

## What It Does

- Creates a simple LLM chain and an agent with a calculator tool
- All OpenAI API calls are automatically proxied through the AMC Gateway
- AMC collects evidence of tool use, reasoning patterns, and response quality

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed with the checksum-verified GitHub Release installer (npm is not public yet; see the root README)
- An OpenAI API key (or any OpenAI-compatible provider)

## Install

```bash
cd examples/langchain-python
pip install -r requirements.txt
```

## Run with AMC

```bash
# Start AMC Gateway
amc up

# Run the agent through AMC (captures evidence automatically)
amc wrap langchain-python -- python main.py

# Or run standalone (no evidence capture)
OPENAI_API_KEY=sk-... python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== Simple Chain ===
Response: 42 × 17 = 714
=== Agent with Tools ===
Agent result: 123 × 456 = 56,088
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

AMC sets `OPENAI_BASE_URL` and `OPENAI_API_KEY` environment variables to point at the AMC Gateway. The LangChain `ChatOpenAI` client reads these automatically — **zero code changes required**.

The adapter definition is in `src/adapters/builtins/langchainPython.ts`.
