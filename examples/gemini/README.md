# Google Gemini + AMC

A Google Gemini agent with chat and function calling, routed through the AMC Gateway.

## What It Does

- Simple text generation, multi-turn chat, and function calling with Gemini
- All Gemini API calls are routed through the AMC Gateway
- AMC captures evidence of reasoning, tool use, and conversation patterns

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- A Google AI API key (Gemini)

## Install

```bash
cd examples/gemini
pip install -r requirements.txt
```

## Run with AMC

```bash
amc up
amc wrap gemini-cli -- python main.py

# Or standalone
GEMINI_API_KEY=... python main.py
```

## Expected Output

```
[AMC] Routing LLM calls through gateway: http://localhost:3700/v1
=== Gemini Agent ===
Response: The three laws of robotics, formulated by Isaac Asimov...
=== Gemini Chat ===
Turn 1: Machine learning is a subset of AI...
Turn 2: Email spam filters use ML to...
=== Gemini Function Calling ===
Tool response: 100 USD is approximately 92 EUR.
[AMC] All LLM calls captured as evidence via gateway proxy.
```

## How AMC Integrates

AMC's `gemini-cli` adapter sets `GEMINI_BASE_URL`, `GEMINI_API_KEY`, and `GOOGLE_API_KEY` to route through the gateway. The `google-generativeai` client is configured with these credentials.

The adapter definition is in `src/adapters/builtins/geminiCli.ts`.
