# Python AMC SDK — Direct Usage

The simplest possible AMC integration. No framework — just Python and the AMC Gateway.

## What It Does

- Makes LLM calls directly through the AMC Gateway (OpenAI-compatible API)
- Demonstrates the four evidence patterns: **Shield** (input scanning), **Enforce** (policy evaluation), **LLM** (completion), and **Watch** (audit logging)
- Collects structured evidence records ready for AMC scoring

## Prerequisites

- Python ≥ 3.10
- AMC CLI installed (`npm i -g agent-maturity-compass`)
- An OpenAI API key (optional — runs with simulated evidence without one)

## Install

```bash
cd examples/python-amc-sdk
# No pip install needed — uses only Python stdlib
```

## Run with AMC

```bash
amc up
amc wrap python-amc-sdk -- python main.py

# Or standalone
AMC_GATEWAY_URL=http://localhost:3700 OPENAI_API_KEY=sk-... python main.py
```

## Expected Output

```
[AMC] Gateway URL: http://localhost:3700
=== Python AMC SDK — Direct Usage ===

[Shield] Input scan passed: True
[Enforce] Policy decision: ALLOW
[LLM] Calling model via AMC Gateway...
[LLM] Response: The capital of France is Paris.

=== Evidence Collected: 4 records ===
  [shield.input_scan] 2025-01-15T10:30:00+00:00
  [enforce.policy_eval] 2025-01-15T10:30:00+00:00
  [llm.completion] 2025-01-15T10:30:01+00:00
  [watch.audit] 2025-01-15T10:30:01+00:00

[AMC] Evidence ready for scoring. Run `amc score` to evaluate.
```

## How AMC Integrates

This example calls the AMC Gateway's OpenAI-compatible endpoint directly using Python's `urllib`. It demonstrates the core evidence patterns that AMC scores: pre-execution safety, policy enforcement, LLM interaction, and audit logging.

The adapter definition is in `src/adapters/builtins/pythonAmcSdk.ts`.
