# OpenAI Agents SDK + AMC

An OpenAI Agents SDK app with tool use, routed through the AMC Gateway.

## What It Does

- Creates a **TravelAdvisor** agent with weather and population tools
- Agent decides which tools to call, then provides a travel recommendation
- AMC captures all LLM calls and tool invocations via the gateway

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key

## Install

```bash
cd examples/openai-agents-sdk
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap openai-agents-sdk -- python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== OpenAI Agents SDK ===
Agent response: I'd recommend Tokyo this weekend — it's sunny and 24°C!
Tool calls made: 3
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

The OpenAI Agents SDK uses the standard OpenAI Python client, which reads `OPENAI_BASE_URL` from the environment. AMC's adapter sets this to the gateway URL — **zero code changes needed**.

The adapter definition is in `src/adapters/builtins/openaiAgentsSdk.ts`.
